import { NextResponse } from "next/server";
import { clearSession, getSession, listSessions, revokeAllSessions, revokeSession } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db";
import { errMsg, jsonError } from "@/lib/api";

/** Angemeldete Geräte verwalten. Nur mit Sitzungs-Cookie, nicht mit Zugriffstoken. */
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI)", 503);
  try {
    const eintraege = await listSessions(session.userId);
    return NextResponse.json({
      sessions: eintraege.map((s) => ({
        id: s.id,
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
        lastSeenAt: s.lastSeenAt ? new Date(s.lastSeenAt).toISOString() : null,
        userAgent: s.userAgent || "",
        ip: s.ip || "",
        current: !!session.sid && s.id === session.sid,
      })),
    });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

/**
 * Mit `?id=` wird eine einzelne Sitzung beendet, ohne `id` werden alle Geräte
 * abgemeldet (der Widerruf-Zähler des Nutzers wird erhöht).
 */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI)", 503);
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const ok = await revokeSession(session.userId, id);
      if (!ok) return jsonError("Sitzung nicht gefunden", 404);
      // Die eigene Sitzung beendet man zugleich im Browser
      if (session.sid === id) await clearSession();
      return NextResponse.json({ ok: true, beendet: 1, selbst: session.sid === id });
    }
    const anzahl = await revokeAllSessions(session.userId);
    await clearSession();
    return NextResponse.json({ ok: true, beendet: anzahl, selbst: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
