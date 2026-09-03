import mongoose from "mongoose";
import { connectDb } from "./db";
import { Job, type JobDoc } from "./models/Job";

/** Höchstzahl an Versuchen, bevor ein hängengebliebener Auftrag als Fehler gilt */
const MAX_ATTEMPTS = 3;

export interface EnqueueInput {
  userId: string;
  orgId?: string | null;
  type: "trace" | "path";
  name: string;
  params: Record<string, unknown>;
}

/** Legt einen neuen Auftrag in der Warteschlange an und liefert dessen ID. */
export async function enqueueJob(input: EnqueueInput): Promise<string> {
  await connectDb();
  const job = await Job.create({
    userId: input.userId,
    orgId: input.orgId ?? null,
    type: input.type,
    name: input.name,
    params: input.params,
    status: "pending",
    progress: { phase: "", message: "Wartet auf Bearbeitung", nodes: 0, edges: 0, apiCalls: 0 },
  });
  return job._id.toString();
}

/** Aufträge eines Nutzers, ohne das große Ergebnis-Feld. */
export async function listJobs(userId: string, limit = 50) {
  await connectDb();
  return Job.find({ userId }).select("-result").sort({ createdAt: -1 }).limit(limit).lean();
}

/** Einzelner Auftrag samt Ergebnis – nur eigene Aufträge. */
export async function getJob(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  await connectDb();
  return Job.findOne({ _id: id, userId }).lean();
}

/** Bricht einen Auftrag ab, sofern er noch nicht abgeschlossen ist. */
export async function cancelJob(userId: string, id: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(id)) return false;
  await connectDb();
  const res = await Job.updateOne(
    { _id: id, userId, status: { $in: ["pending", "running"] } },
    { $set: { status: "cancelled", finishedAt: new Date() } },
  );
  return res.modifiedCount > 0;
}

/**
 * Holt atomar den ältesten wartenden Auftrag und markiert ihn als laufend.
 * Dadurch greifen sich mehrere Worker-Instanzen nicht denselben Auftrag.
 */
export async function claimNextJob(): Promise<mongoose.HydratedDocument<JobDoc> | null> {
  await connectDb();
  return Job.findOneAndUpdate(
    { status: "pending" },
    { $set: { status: "running", startedAt: new Date(), heartbeatAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true },
  );
}

/**
 * Gibt Aufträge frei, die als „running" gelten, deren Worker sich aber lange
 * nicht mehr gemeldet hat (etwa nach einem Serverneustart). Nach zu vielen
 * Versuchen werden sie endgültig als Fehler abgelegt.
 */
export async function releaseStaleJobs(maxAgeMs = 15 * 60_000): Promise<number> {
  await connectDb();
  const cutoff = new Date(Date.now() - maxAgeMs);
  const filter = {
    status: "running" as const,
    $or: [{ heartbeatAt: { $lt: cutoff } }, { heartbeatAt: null }, { heartbeatAt: { $exists: false } }],
  };

  const failed = await Job.updateMany(
    { ...filter, attempts: { $gte: MAX_ATTEMPTS } },
    {
      $set: {
        status: "error",
        error: `Auftrag nach ${MAX_ATTEMPTS} Versuchen abgebrochen: Der Worker hat sich nicht mehr gemeldet.`,
        finishedAt: new Date(),
      },
    },
  );
  const released = await Job.updateMany({ ...filter, attempts: { $lt: MAX_ATTEMPTS } }, { $set: { status: "pending" } });
  return failed.modifiedCount + released.modifiedCount;
}
