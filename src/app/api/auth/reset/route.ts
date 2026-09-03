import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models/User";
import { PasswordReset, RESET_TTL_MS } from "@/lib/models/PasswordReset";
import { notify, notifyChannelsAvailable } from "@/lib/notify";
import { guard } from "@/lib/ratelimit";
import { errMsg, jsonError } from "@/lib/api";
import { getLocale } from "@/lib/i18n/server";
import { AUTH_MAIL } from "@/lib/i18n/notify";

const schema = z.object({ email: z.string().email() });

/** Immer dieselbe Antwort, damit sich keine Konten aufzählen lassen. */
const ANTWORT = "Falls ein Konto zu dieser E-Mail besteht, wurde ein Link zum Zurücksetzen verschickt.";

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function POST(req: Request) {
  const limited = guard(req, "reset", { limit: 5, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige E-Mail-Adresse");

  const mailKonfiguriert = notifyChannelsAvailable().email;
  const hinweis = mailKonfiguriert
    ? undefined
    : "Achtung: Der E-Mail-Versand ist auf diesem Server nicht eingerichtet (SMTP_HOST/SMTP_FROM fehlen). Es kann keine Nachricht zugestellt werden.";

  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI)", 503);
    const email = parsed.data.email.toLowerCase();
    const user = await User.findOne({ email }).select("_id email notify");
    if (user) {
      const token = randomBytes(16).toString("hex"); // 32 Hex-Zeichen
      await PasswordReset.create({
        userId: user._id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
      await notify(
        { email: user.email, telegramChatId: user.notify?.telegramChatId || undefined },
        {
          subject: AUTH_MAIL[await getLocale()].resetSubject,
          text: "Mit diesem Link kannst du ein neues Passwort setzen. Er gilt eine Stunde und nur einmal. Warst du das nicht, ignoriere diese Nachricht.",
          url: `${appUrl()}/reset/${token}`,
        },
      ).catch(() => []);
    }
    // Antwort ist bewusst unabhängig davon, ob es das Konto gibt
    return NextResponse.json({ ok: true, message: ANTWORT, mailConfigured: mailKonfiguriert, hinweis });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
