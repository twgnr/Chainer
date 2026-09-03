import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Org } from "@/lib/models/Org";
import { createSession, hashPassword, sessionMetaFromRequest } from "@/lib/auth";
import { notify, notifyChannelsAvailable } from "@/lib/notify";
import { errMsg, jsonError } from "@/lib/api";
import { getLocale } from "@/lib/i18n/server";
import { AUTH_MAIL } from "@/lib/i18n/notify";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().max(120).optional(),
});

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function POST(req: Request) {
  if (process.env.ALLOW_REGISTRATION === "false") return jsonError("Registrierung deaktiviert", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("E-Mail oder Passwort ungültig (mind. 8 Zeichen)");
  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI)", 503);
    const email = parsed.data.email.toLowerCase();
    if (await User.findOne({ email })) return jsonError("E-Mail bereits registriert", 409);

    const mailKonfiguriert = notifyChannelsAvailable().email;
    const verifyToken = randomBytes(16).toString("hex");
    // Die Sprache der Anmeldung gilt fortan auch für Benachrichtigungen, die
    // später im Hintergrund entstehen.
    const locale = await getLocale();
    const user = await User.create({
      email,
      name: parsed.data.name || "",
      passwordHash: await hashPassword(parsed.data.password),
      verifyTokenHash: createHash("sha256").update(verifyToken).digest("hex"),
      emailVerified: false,
      locale,
    });

    // Bestätigungslink verschicken; die Anmeldung wird davon nicht blockiert
    if (mailKonfiguriert) {
      const mail = AUTH_MAIL[locale];
      await notify(
        { email: user.email },
        {
          subject: mail.verifySubject,
          text: mail.verifyText,
          url: `${appUrl()}/api/auth/verify?token=${verifyToken}`,
        },
      ).catch(() => []);
    }

    /*
     * Offene Team-Einladungen nur einlösen, wenn die E-Mail bestätigt ist –
     * sonst könnte sich jemand mit einer fremden Adresse registrieren und so in
     * ein fremdes Team gelangen. Ist gar kein E-Mail-Versand eingerichtet, gäbe
     * es keinen Weg zur Bestätigung; dann wird wie bisher sofort eingelöst.
     * Bei eingerichtetem Versand holt die Verify-Route das Einlösen nach.
     */
    let joinedTeams = 0;
    if (!mailKonfiguriert) {
      const invited = await Org.find({ "invites.email": email });
      for (const org of invited) {
        const invite = org.invites.find((i) => i.email === email);
        if (!invite) continue;
        org.set(
          "invites",
          org.invites.filter((i) => i.email !== email),
        );
        org.members.push({ userId: user._id, email, role: invite.role, addedAt: new Date() });
        await org.save();
        if (!user.orgId) user.orgId = org._id;
      }
      joinedTeams = invited.length;
      if (user.isModified()) await user.save();
    }

    await createSession({ userId: user._id.toString(), email: user.email }, sessionMetaFromRequest(req));
    return NextResponse.json({
      ok: true,
      email: user.email,
      joinedTeams,
      emailVerified: false,
      mailConfigured: mailKonfiguriert,
      hinweis: mailKonfiguriert
        ? "Wir haben dir einen Bestätigungslink geschickt. Offene Team-Einladungen werden nach der Bestätigung eingelöst."
        : "E-Mail-Versand ist nicht eingerichtet – die Bestätigung entfällt.",
    });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
