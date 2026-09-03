import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Org } from "@/lib/models/Org";
import { errMsg, jsonError } from "@/lib/api";

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Bestätigt die E-Mail-Adresse über den zugeschickten Link. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return jsonError("Token fehlt");
  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI)", 503);
    const verifyTokenHash = createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ verifyTokenHash });
    if (!user) return jsonError("Der Bestätigungslink ist ungültig oder wurde bereits benutzt.", 400);

    user.emailVerified = true;
    user.verifyTokenHash = "";
    // Offene Team-Einladungen werden erst jetzt eingelöst (siehe Registrierung)
    const invited = await Org.find({ "invites.email": user.email });
    for (const org of invited) {
      const invite = org.invites.find((i) => i.email === user.email);
      if (!invite) continue;
      org.set(
        "invites",
        org.invites.filter((i) => i.email !== user.email),
      );
      org.members.push({ userId: user._id, email: user.email, role: invite.role, addedAt: new Date() });
      await org.save();
      if (!user.orgId) user.orgId = org._id;
    }
    await user.save();

    return NextResponse.redirect(`${appUrl()}/settings?verified=1`);
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
