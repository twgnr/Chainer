import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { getAddress, getAddressTxs, lookupLabels } from "@/lib/providers/registry";
import { isChainAddress } from "@/lib/chains";
import { analyseInflowRisk } from "@/lib/trace/inflow";
import { classifyHarmful } from "@/lib/trace/risk";
import { errMsg, jsonError } from "@/lib/api";
import { guard } from "@/lib/ratelimit";

export async function GET(req: Request, { params }: { params: Promise<{ addr: string }> }) {
  const limited = guard(req, "address");
  if (limited) return limited;
  const { addr } = await params;
  const url = new URL(req.url);
  const { ctx } = await getRequestContext({ req });
  if (!isChainAddress(addr, ctx.chain)) return jsonError(`Keine gültige ${ctx.chain}-Adresse`);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
  const prefer = url.searchParams.get("provider") || undefined;
  try {
    const [info, txs, labels] = await Promise.all([
      getAddress(ctx, addr, prefer),
      getAddressTxs(ctx, addr, limit, prefer),
      lookupLabels(ctx, addr),
    ]);
    const inflowRisk = await analyseInflowRisk(ctx, addr, txs.data).catch(() => null);
    return NextResponse.json({
      chain: ctx.chain,
      info: info.data,
      txs: txs.data,
      labels: labels.labels,
      labelErrors: labels.errors,
      /** Einstufung der Adresse selbst, falls sie gemeldet ist */
      harmful: classifyHarmful(labels.labels, true),
      /** Zuflüsse von gemeldeten Adressen (nur direkte Absender) */
      inflowRisk,
      attempts: [...info.attempts, ...txs.attempts],
    });
  } catch (e) {
    return jsonError(errMsg(e), 502);
  }
}
