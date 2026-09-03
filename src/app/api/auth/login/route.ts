import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models/User";
import { createSession, sessionMetaFromRequest, verifyPassword } from "@/lib/auth";
import { guard } from "@/lib/ratelimit";
import { errMsg, jsonError } from "@/lib/api";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

/** Ab so vielen Fehlversuchen wird gesperrt */
const MAX_FEHLVERSUCHE = 5;
/** Grundsperre und Obergrenze */
const SPERRE_MS = 15 * 60_000;
const SPERRE_MAX_MS = 60 * 60_000;

/** Immer dieselbe Meldung – sie darf nicht verraten, ob es die E-Mail gibt. */
const FALSCH = "E-Mail oder Passwort falsch";

export async function POST(req: Request) {
  const limited = guard(req, "login", { limit: 10, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI)", 503);
    const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
    if (!user) return jsonError(FALSCH, 401);

    // Gesperrte Konten gar nicht erst prüfen
    const gesperrtBis = user.lockedUntil ? new Date(user.lockedUntil).getTime() : 0;
    if (gesperrtBis > Date.now()) {
      const minuten = Math.max(1, Math.ceil((gesperrtBis - Date.now()) / 60_000));
      return jsonError(
        `Zu viele Fehlversuche. Das Konto ist noch ${minuten} Minute${minuten === 1 ? "" : "n"} gesperrt.`,
        429,
      );
    }

    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      const versuche = (user.failedLogins ?? 0) + 1;
      user.failedLogins = versuche;
      if (versuche >= MAX_FEHLVERSUCHE) {
        // Jeder weitere Fehlversuch verlängert die Sperre, gedeckelt auf eine Stunde
        const dauer = Math.min(SPERRE_MS * (versuche - MAX_FEHLVERSUCHE + 1), SPERRE_MAX_MS);
        user.lockedUntil = new Date(Date.now() + dauer);
      }
      await user.save();
      return jsonError(FALSCH, 401);
    }

    user.failedLogins = 0;
    user.lockedUntil = null;
    await user.save();

    await createSession({ userId: user._id.toString(), email: user.email }, sessionMetaFromRequest(req));
    return NextResponse.json({ ok: true, email: user.email, emailVerified: !!user.emailVerified });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
