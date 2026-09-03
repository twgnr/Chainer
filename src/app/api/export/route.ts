import { NextResponse } from "next/server";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Case } from "@/lib/models/Case";
import { Annotation } from "@/lib/models/Annotation";
import { Watch } from "@/lib/models/Watch";
import { Org } from "@/lib/models/Org";
import { maskKey } from "@/lib/crypto";
import { CURRENT_SCHEMA_VERSION, migrateCase } from "@/lib/migrate";
import { guard } from "@/lib/ratelimit";
import { log } from "@/lib/logger";
import { errMsg, jsonError } from "@/lib/api";

export const maxDuration = 120;

/**
 * Gesamt-Export aller Daten eines Nutzers: Fälle samt Ergebnissen, eigene
 * Labels, Watchlist, Team-Zugehörigkeit und Einstellungen.
 *
 * Zugangsdaten werden bewusst NICHT im Klartext ausgegeben, sondern nur
 * maskiert. Ein Export soll weitergegeben werden können, ohne Schlüssel
 * preiszugeben.
 *
 * `?cases=0` lässt die großen Trace-Ergebnisse weg, wenn nur die Stammdaten
 * gebraucht werden.
 */
export async function GET(req: Request) {
  const limited = guard(req, "export", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const sp = new URL(req.url).searchParams;
  const withResults = sp.get("cases") !== "0";

  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB nicht konfiguriert", 503);

    const settings = await getUserSettings(session);
    const [user, cases, annotations, watches, orgs] = await Promise.all([
      User.findById(session.userId).lean(),
      Case.find({ userId: session.userId }).lean(),
      Annotation.find({ userId: session.userId }).lean(),
      Watch.find({ userId: session.userId }).lean(),
      Org.find({ "members.userId": session.userId }).lean(),
    ]);

    const exportedCases = cases.map((c) => {
      const { data } = migrateCase(JSON.parse(JSON.stringify(c)) as Record<string, unknown>);
      if (withResults) return data;
      // Ohne Ergebnisse nur die Stammdaten behalten
      const slim = { ...data };
      delete slim.result;
      if (Array.isArray(slim.traces)) {
        slim.traces = (slim.traces as Record<string, unknown>[]).map((t) => {
          const copy = { ...t };
          delete copy.result;
          return copy;
        }) as typeof slim.traces;
      }
      return slim;
    });

    const payload = {
      exportVersion: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      hinweis:
        "Zugangsdaten sind nur maskiert enthalten und müssen nach einem Wiederherstellen neu eingegeben werden.",
      user: {
        email: user?.email,
        name: user?.name,
        emailVerified: user?.emailVerified ?? false,
        notify: user?.notify,
        privacyMode: user?.privacyMode ?? false,
        createdAt: user?.createdAt,
      },
      // Nur maskiert, damit der Export gefahrlos weitergegeben werden kann
      apiKeys: Object.fromEntries(Object.entries(settings.userKeys).map(([k, v]) => [k, maskKey(v)])),
      providerConfig: Object.fromEntries(
        Object.entries(settings.config).map(([provider, fields]) => [
          provider,
          Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, maskKey(v)])),
        ]),
      ),
      teams: orgs.map((o) => ({
        name: o.name,
        rolle: o.members.find((m) => String(m.userId) === session.userId)?.role,
        mitglieder: o.members.length,
      })),
      cases: exportedCases,
      annotations,
      watchlist: watches.map((w) => ({ ...w, events: (w.events ?? []).slice(0, 20) })),
      counts: {
        cases: cases.length,
        annotations: annotations.length,
        watches: watches.length,
        teams: orgs.length,
      },
    };

    log.info("Gesamt-Export erstellt", { userId: session.userId, cases: cases.length, withResults });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="chainer-export-${stamp}.json"`,
      },
    });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
