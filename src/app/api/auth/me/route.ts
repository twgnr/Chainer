import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectDb, isDbConfigured } from "@/lib/db";
import { User } from "@/lib/models/User";
import { notifyChannelsAvailable } from "@/lib/notify";

export async function GET() {
  const session = await getSession();
  const mailConfigured = notifyChannelsAvailable().email;

  let emailVerified = false;
  if (session) {
    try {
      const db = await connectDb();
      if (db) {
        const user = await User.findById(session.userId).select("emailVerified").lean();
        emailVerified = !!user?.emailVerified;
      }
    } catch {
      /* Zustand ist nur zur Anzeige – bei Störung bleibt er unbestätigt */
    }
  }

  return NextResponse.json({
    dbConfigured: isDbConfigured() && !!process.env.AUTH_SECRET,
    user: session ? { email: session.email, emailVerified } : null,
    emailVerified,
    mailConfigured,
  });
}
