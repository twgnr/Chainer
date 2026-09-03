import { NextResponse } from "next/server";
import { clearSession, getSession, revokeSession } from "@/lib/auth";

export async function POST() {
  // Die Sitzung zusätzlich aus dem Verzeichnis entfernen, damit ein
  // abgegriffenes Cookie danach nicht mehr gilt.
  const session = await getSession();
  if (session?.sid) await revokeSession(session.userId, session.sid).catch(() => false);
  await clearSession();
  return NextResponse.json({ ok: true });
}
