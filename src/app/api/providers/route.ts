import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { providerStatus } from "@/lib/providers/registry";
import { CHAIN_LIST } from "@/lib/chains";
import { cacheStats } from "@/lib/cache";
import { guard } from "@/lib/ratelimit";

export const maxDuration = 120;

export async function GET(req: Request) {
  const ping = new URL(req.url).searchParams.get("ping") === "1";
  // Nur die aktive Erreichbarkeitsprüfung ist teuer
  if (ping) {
    const limited = guard(req, "ping");
    if (limited) return limited;
  }
  const { ctx } = await getRequestContext({ req });
  const [providers, cache] = await Promise.all([providerStatus(ctx, ping), cacheStats()]);
  return NextResponse.json({
    chain: ctx.chain,
    chains: CHAIN_LIST.map((c) => ({ id: c.id, name: c.name, symbol: c.symbol, kind: c.kind })),
    providers,
    cache,
  });
}
