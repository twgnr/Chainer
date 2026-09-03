import { NextResponse } from "next/server";
import { getBtcPrice, getPriceSeries } from "@/lib/providers/price";
import { isChainId, DEFAULT_CHAIN } from "@/lib/chains";
import { errMsg, jsonError } from "@/lib/api";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const c = sp.get("chain");
  const chain = isChainId(c) ? c : DEFAULT_CHAIN;
  const from = Number(sp.get("from"));
  const to = Number(sp.get("to"));
  try {
    if (Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from) {
      return NextResponse.json({ chain, series: await getPriceSeries(chain, from, to) });
    }
    return NextResponse.json({ chain, ...(await getBtcPrice(chain)) });
  } catch (e) {
    return jsonError(errMsg(e), 502);
  }
}
