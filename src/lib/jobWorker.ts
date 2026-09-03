import { z } from "zod";
import { contextForUser } from "./auth";
import { isChainId, type ChainId } from "./chains";
import { Job } from "./models/Job";
import { claimNextJob, releaseStaleJobs } from "./jobs";
import { runTrace } from "./trace/engine";
import { traceParamsSchema } from "./trace/params";
import { findPaths, DEFAULT_PATH_PARAMS } from "./trace/path";
import { errMsg } from "./api";

/** Mindestabstand zwischen zwei Fortschritts-Schreibvorgängen in der Datenbank */
const PROGRESS_INTERVAL_MS = 2000;

/** Chain-Kennung, gegen die Liste aller unterstützten Chains geprüft */
const chainSchema = z
  .custom<ChainId>((v) => isChainId(v), { message: "Unbekannte Chain" })
  .default(DEFAULT_PATH_PARAMS.chain);

/** Schema für Aufträge vom Typ „path", an DEFAULT_PATH_PARAMS orientiert */
const pathParamsSchema = z.object({
  from: z.string().trim().min(10),
  to: z.string().trim().min(10),
  chain: chainSchema,
  maxDepth: z.number().int().min(1).max(5).default(DEFAULT_PATH_PARAMS.maxDepth),
  maxTxPerAddress: z.number().int().min(1).max(30).default(DEFAULT_PATH_PARAMS.maxTxPerAddress),
  maxAddrPerTx: z.number().int().min(1).max(30).default(DEFAULT_PATH_PARAMS.maxAddrPerTx),
  minValueSat: z.number().int().min(0).default(DEFAULT_PATH_PARAMS.minValueSat),
  maxApiCalls: z.number().int().min(10).max(2000).default(DEFAULT_PATH_PARAMS.maxApiCalls),
  maxPaths: z.number().int().min(1).max(20).default(DEFAULT_PATH_PARAMS.maxPaths),
  directed: z.boolean().default(DEFAULT_PATH_PARAMS.directed),
  skipHubs: z.boolean().default(DEFAULT_PATH_PARAMS.skipHubs),
  enrich: z.boolean().default(DEFAULT_PATH_PARAMS.enrich),
});

/** Schemata je Auftragsart, damit Fehleingaben nicht erst im Lauf auffallen */
export const jobParamsSchemas = { trace: traceParamsSchema, path: pathParamsSchema };

let running = false;
let started = false;

function chainOf(params: unknown): ChainId {
  const c = (params as { chain?: unknown } | null)?.chain;
  return isChainId(c) ? c : "bitcoin";
}

/**
 * Arbeitet höchstens einen wartenden Auftrag ab.
 *
 * Liefert true, wenn ein Auftrag bearbeitet wurde – der Aufrufer kann dann
 * sofort erneut nachsehen, statt auf den nächsten Takt zu warten.
 */
export async function runNextJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  const id = job._id;
  const raw = (job.params ?? {}) as Record<string, unknown>;
  const controller = new AbortController();
  let cancelled = false;
  let lastWrite = 0;

  /** Fortschritt speichern und dabei prüfen, ob der Auftrag abgebrochen wurde */
  const persistProgress = async (p: {
    phase: string;
    message: string;
    nodes: number;
    edges: number;
    apiCalls: number;
  }) => {
    const now = Date.now();
    if (now - lastWrite < PROGRESS_INTERVAL_MS) return;
    lastWrite = now;
    try {
      const current = await Job.findOneAndUpdate(
        { _id: id, status: "running" },
        {
          $set: {
            heartbeatAt: new Date(),
            progress: {
              phase: p.phase,
              message: p.message,
              nodes: p.nodes,
              edges: p.edges,
              apiCalls: p.apiCalls,
            },
          },
        },
        { new: true },
      ).select("status");
      // Kein Treffer bedeutet: Status ist nicht mehr "running" (etwa abgebrochen)
      if (!current) {
        cancelled = true;
        controller.abort();
      }
    } catch {
      /* Fortschritt ist nur Beiwerk – Fehler dabei brechen den Auftrag nicht ab */
    }
  };

  try {
    if (job.type === "trace") {
      const parsed = traceParamsSchema.safeParse(raw);
      if (!parsed.success)
        throw new Error("Ungültige Parameter: " + parsed.error.issues.map((i) => i.message).join(", "));
      const ctx = await contextForUser(String(job.userId), chainOf(parsed.data));
      const result = await runTrace(ctx, parsed.data, {
        signal: controller.signal,
        onProgress: (p) => {
          void persistProgress(p);
        },
      });
      if (cancelled) return true;
      await Job.updateOne(
        { _id: id, status: "running" },
        {
          $set: {
            status: "done",
            result,
            error: "",
            finishedAt: new Date(),
            heartbeatAt: new Date(),
            progress: {
              phase: "done",
              message: "Fertig",
              nodes: result.nodes.length,
              edges: result.edges.length,
              apiCalls: result.stats?.apiCalls ?? 0,
            },
          },
        },
      );
    } else {
      const parsed = pathParamsSchema.safeParse(raw);
      if (!parsed.success)
        throw new Error("Ungültige Parameter: " + parsed.error.issues.map((i) => i.message).join(", "));
      const ctx = await contextForUser(String(job.userId), chainOf(parsed.data));
      const result = await findPaths(ctx, parsed.data);
      if (cancelled) return true;
      await Job.updateOne(
        { _id: id, status: "running" },
        {
          $set: {
            status: "done",
            result,
            error: "",
            finishedAt: new Date(),
            heartbeatAt: new Date(),
            progress: {
              phase: "done",
              message: result.found ? `${result.paths.length} Verbindung(en) gefunden` : "Keine Verbindung gefunden",
              nodes: result.graph.nodes.length,
              edges: result.graph.edges.length,
              apiCalls: result.stats.apiCalls,
            },
          },
        },
      );
    }
  } catch (e) {
    // Ein Abbruch durch den Nutzer ist kein Fehler
    if (cancelled) return true;
    await Job.updateOne(
      { _id: id, status: "running" },
      { $set: { status: "error", error: errMsg(e), finishedAt: new Date(), heartbeatAt: new Date() } },
    ).catch(() => undefined);
  }
  return true;
}

/**
 * Startet den Hintergrund-Worker: ein Zeitgeber, der immer nur EINEN Auftrag
 * gleichzeitig abarbeitet. Ohne MONGODB_URI passiert nichts.
 *
 * Wird von src/instrumentation.ts beim Serverstart aufgerufen.
 */
export function startJobWorker(intervalMs = 5000): void {
  if (started) return;
  if (!process.env.MONGODB_URI) return;
  started = true;

  // Aufträge eines abgestürzten Vorgängers wieder freigeben
  void releaseStaleJobs().catch((e) => {
    console.error("[chainer] Freigabe hängender Aufträge fehlgeschlagen:", errMsg(e));
  });

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runNextJob();
    } catch (e) {
      console.error("[chainer] Auftragsbearbeitung fehlgeschlagen:", errMsg(e));
    } finally {
      running = false;
    }
  };

  setInterval(tick, Math.max(1000, intervalMs)).unref?.();
  console.log(`[chainer] Auftrags-Worker aktiv, Takt ${Math.max(1000, intervalMs)} ms`);
}
