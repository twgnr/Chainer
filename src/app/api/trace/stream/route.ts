import { getRequestContext } from "@/lib/auth";
import { withEvidence } from "@/lib/evidence";
import { runTrace } from "@/lib/trace/engine";
import { traceParamsSchema } from "@/lib/trace/params";
import { classifyChainInput } from "@/lib/chains";
import { errMsg, jsonError } from "@/lib/api";
import { guard } from "@/lib/ratelimit";
import type { TraceProgress } from "@/lib/trace/types";

export const maxDuration = 300;

/**
 * Streaming-Trace: sendet zeilenweise JSON (NDJSON) mit Zwischenständen und am
 * Ende das vollständige Ergebnis. Der Client kann den Graph so live aufbauen.
 */
export async function POST(req: Request) {
  const limited = guard(req, "trace");
  if (limited) return limited;
  const parsed = traceParamsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Parameter: " + parsed.error.issues.map((i) => i.message).join(", "));
  const params = parsed.data;
  if (classifyChainInput(params.start, params.chain) === "unknown")
    return jsonError(`„${params.start}“ ist keine gültige Adresse oder Transaktions-ID für ${params.chain}`);
  const { ctx } = await getRequestContext({ chain: params.chain });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* Verbindung bereits geschlossen */
        }
      };
      const onProgress = (p: TraceProgress) => send(p);
      try {
        const run = () => runTrace(ctx, params, { onProgress, signal: req.signal });
        const result = params.evidence
          ? await withEvidence(run).then((r) => ({ ...r.result, evidence: r.evidence }))
          : await run();
        send({ phase: "done", message: "fertig", nodes: result.nodes.length, edges: result.edges.length, apiCalls: result.stats.apiCalls, result });
      } catch (e) {
        send({ phase: "error", message: errMsg(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
