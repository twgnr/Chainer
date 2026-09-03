import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { withEvidence } from "@/lib/evidence";
import { runTrace } from "@/lib/trace/engine";
import { traceParamsSchema } from "@/lib/trace/params";
import { classifyChainInput } from "@/lib/chains";
import { errMsg, jsonError } from "@/lib/api";
import { withLogging, log } from "@/lib/logger";
import { guard } from "@/lib/ratelimit";

export const maxDuration = 300;

async function handler(req: Request) {
  const limited = guard(req, "trace");
  if (limited) return limited;
  const parsed = traceParamsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Parameter: " + parsed.error.issues.map((i) => i.message).join(", "));
  const params = parsed.data;
  if (classifyChainInput(params.start, params.chain) === "unknown")
    return jsonError(`„${params.start}“ ist keine gültige Adresse oder Transaktions-ID für ${params.chain}`);
  const { ctx } = await getRequestContext({ chain: params.chain });
  log.info("Trace gestartet", { chain: params.chain, mode: params.mode, tiefe: params.maxDepth });
  try {
    if (!params.evidence) return NextResponse.json(await runTrace(ctx, params));
    // Nachweis der verwendeten Rohdaten mitschreiben
    const { result, evidence } = await withEvidence(() => runTrace(ctx, params));
    return NextResponse.json({ ...result, evidence });
  } catch (e) {
    return jsonError(errMsg(e), 502);
  }
}

export const POST = withLogging("/api/trace", handler);
