import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models/User";
import { PasswordReset } from "@/lib/models/PasswordReset";
import { createSession, forgetSessionCache, hashPassword, sessionMetaFromRequest } from "@/lib/auth";
import { guard } from "@/lib/ratelimit";
import { errMsg, jsonError } from "@/lib/api";

const schema = z.object({
  token: z.string().min(8).max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const limited = guard(req, "reset", { limit: 5, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Token fehlt oder Passwort zu kurz (mind. 8 Zeichen)");

  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI)", 503);
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const eintrag = await PasswordReset.findOne({ tokenHash });
    if (!eintrag || eintrag.usedAt || eintrag.expiresAt.getTime() < Date.now())
      return jsonError("Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.", 400);

    const user = await User.findById(eintrag.userId);
    if (!user) return jsonError("Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.", 400);

    user.passwordHash = await hashPassword(parsed.data.password);
    user.failedLogins = 0;
    user.lockedUntil = null;
    // Alle alten Sitzungen werden ungültig – das Passwort könnte fremdbekannt sein
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.set("sessions", []);
    await user.save();
    forgetSessionCache();

    eintrag.usedAt = new Date();
    await eintrag.save();

    // Nutzer gleich wieder anmelden
    await createSession({ userId: user._id.toString(), email: user.email }, sessionMetaFromRequest(req));
    return NextResponse.json({ ok: true, email: user.email });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
