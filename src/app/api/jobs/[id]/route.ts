import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb, isDbConfigured } from "@/lib/db";
import { Job } from "@/lib/models/Job";
import { cancelJob, getJob } from "@/lib/jobs";
import { errMsg, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Einzelner Auftrag samt vollständigem Ergebnis – nur eigene Aufträge. */
export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI fehlt)", 503);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  try {
    const job = await getJob(session.userId, id);
    if (!job) return jsonError("Auftrag nicht gefunden", 404);
    return NextResponse.json({ job });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

/**
 * Bricht einen laufenden oder wartenden Auftrag ab. Ist er bereits
 * abgeschlossen, wird er endgültig gelöscht.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB ist nicht konfiguriert (MONGODB_URI fehlt)", 503);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  try {
    const cancelled = await cancelJob(session.userId, id);
    if (cancelled) return NextResponse.json({ ok: true, cancelled: true, deleted: false });
    await connectDb();
    const res = await Job.deleteOne({ _id: id, userId: session.userId });
    if (!res.deletedCount) return jsonError("Auftrag nicht gefunden", 404);
    return NextResponse.json({ ok: true, cancelled: false, deleted: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
