import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Case, type CaseDoc } from "@/lib/models/Case";
import { errMsg, jsonError } from "@/lib/api";
import { CURRENT_SCHEMA_VERSION, migrateCase } from "@/lib/migrate";

type Ctx = { params: Promise<{ id: string }> };

/** Fall laden und Zugriff prüfen (eigener Fall oder im Team geteilt) */
async function loadCase(id: string, userId: string): Promise<{ doc: mongoose.HydratedDocument<CaseDoc> | null; canWrite: boolean }> {
  const settings = await getUserSettings({ userId, email: "" });
  const or: Record<string, unknown>[] = [{ userId }];
  if (settings.orgId) or.push({ orgId: settings.orgId, shared: true });
  const doc = await Case.findOne({ _id: id, $or: or });
  if (!doc) return { doc: null, canWrite: false };
  const canWrite = String(doc.userId) === userId || (!!settings.orgId && settings.role !== "viewer" && doc.shared);
  return { doc, canWrite };
}

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  try {
    await connectDb();
    const { doc, canWrite } = await loadCase(id, session.userId);
    if (!doc) return jsonError("Fall nicht gefunden", 404);
    // Alte Stände beim Lesen auf das aktuelle Schema heben
    const raw = doc.toObject();
    if (Number(raw.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION) {
      const { data } = migrateCase(raw as Record<string, unknown>);
      if (canWrite) {
        doc.set("schemaVersion", CURRENT_SCHEMA_VERSION);
        if (Array.isArray(data.traces)) doc.set("traces", data.traces);
        if (data.result) doc.set("result", data.result);
        await doc.save().catch(() => {});
      }
      return NextResponse.json({ case: data, canWrite, migrated: true });
    }
    return NextResponse.json({ case: raw, canWrite });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(20000).optional(),
  shared: z.boolean().optional(),
  /** Fall regelmäßig neu rechnen */
  autoRefresh: z.boolean().optional(),
  refreshIntervalHours: z.number().int().min(1).max(720).optional(),
  /** Neuen Trace anhängen */
  addTrace: z
    .object({
      name: z.string().max(200).default(""),
      start: z.string().min(10),
      chain: z.string().default("bitcoin"),
      params: z.record(z.string(), z.unknown()).default({}),
      result: z.unknown(),
    })
    .optional(),
  removeTraceId: z.string().optional(),
  /** Eintrag im Ermittlungsprotokoll */
  addLog: z.string().max(5000).optional(),
  /** Manuell zusammengeführte Adressen */
  merges: z.array(z.array(z.string())).max(200).optional(),
  /** Gespeicherte Graph-Ansicht */
  view: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  try {
    await connectDb();
    const { doc, canWrite } = await loadCase(id, session.userId);
    if (!doc) return jsonError("Fall nicht gefunden", 404);
    if (!canWrite) return jsonError("Keine Schreibrechte für diesen Fall", 403);
    const d = parsed.data;

    if (d.name !== undefined) doc.name = d.name;
    if (d.notes !== undefined) doc.notes = d.notes;
    if (d.shared !== undefined) doc.shared = d.shared;
    if (d.autoRefresh !== undefined) doc.autoRefresh = d.autoRefresh;
    if (d.refreshIntervalHours !== undefined) doc.refreshIntervalHours = d.refreshIntervalHours;
    if (d.merges !== undefined) doc.set("merges", d.merges);
    if (d.view !== undefined) doc.view = d.view;
    if (d.addTrace) {
      doc.traces.push({
        id: randomUUID(),
        name: d.addTrace.name || `Trace ${doc.traces.length + 1}`,
        start: d.addTrace.start,
        chain: d.addTrace.chain,
        params: d.addTrace.params,
        result: d.addTrace.result,
        createdAt: new Date(),
      });
      doc.log.push({ at: new Date(), author: session.email, text: `Trace hinzugefügt: ${d.addTrace.start}` });
    }
    if (d.removeTraceId) {
      doc.set(
        "traces",
        doc.traces.filter((t) => t.id !== d.removeTraceId),
      );
    }
    if (d.addLog) doc.log.push({ at: new Date(), author: session.email, text: d.addLog });

    await doc.save();
    return NextResponse.json({ ok: true, case: doc.toObject() });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  try {
    await connectDb();
    const res = await Case.deleteOne({ _id: id, userId: session.userId });
    if (!res.deletedCount) return jsonError("Nicht gefunden oder keine Berechtigung", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
