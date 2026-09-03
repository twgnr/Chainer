import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { getTx } from "@/lib/providers/registry";
import { lightningForTx } from "@/lib/providers/lightning";
import { isChainTxid } from "@/lib/chains";
import { errMsg, jsonError } from "@/lib/api";
import { guard } from "@/lib/ratelimit";

export async function GET(req: Request, { params }: { params: Promise<{ txid: string }> }) {
  const limited = guard(req, "tx");
  if (limited) return limited;
  const { txid } = await params;
  const { ctx } = await getRequestContext({ req });
  if (!isChainTxid(txid, ctx.chain)) return jsonError("Keine gültige Transaktions-ID");
  const prefer = new URL(req.url).searchParams.get("provider") || undefined;
  try {
    const [r, lightning] = await Promise.all([getTx(ctx, txid, prefer), lightningForTx(txid, ctx.chain)]);
    return NextResponse.json({ chain: ctx.chain, tx: r.data, lightning, attempts: r.attempts });
  } catch (e) {
    return jsonError(errMsg(e), 502);
  }
}
