import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, getUserSettings } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db";
import { enqueueJob, listJobs } from "@/lib/jobs";
import { errMsg, jsonError } from "@/lib/api";
import { guard } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Liste der eigenen Hintergrund-Aufträge (ohne die großen Ergebnisse). */
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI fehlt)", 503);
  try {
    return NextResponse.json({ jobs: await listJobs(session.userId) });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const schema = z.object({
  type: z.enum(["trace", "path"]),
  name: z.string().trim().max(200).optional(),
  params: z.record(z.string(), z.unknown()),
});

/** Stellt einen neuen Auftrag in die Warteschlange. */
export async function POST(req: Request) {
  const limited = guard(req, "trace");
  if (limited) return limited;

  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI fehlt)", 503);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe: " + parsed.error.issues.map((i) => i.message).join(", "));

  try {
    const settings = await getUserSettings(session);
    const d = parsed.data;
    const fallback =
      d.type === "trace"
        ? `Trace ${String(d.params.start ?? "")}`.trim()
        : `Verbindung ${String(d.params.from ?? "")} → ${String(d.params.to ?? "")}`.trim();
    const id = await enqueueJob({
      userId: session.userId,
      orgId: settings.orgId ?? null,
      type: d.type,
      name: d.name || fallback || "Auftrag",
      params: d.params,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
