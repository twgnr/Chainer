import TraceView from "@/components/TraceView";
import { getSession } from "@/lib/auth";
import { isChainId, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";
import type { TraceDirection } from "@/lib/trace/types";

export const dynamic = "force-dynamic";

export default async function TracePage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; direction?: string; chain?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  const dir = ["forward", "backward", "both"].includes(sp.direction || "")
    ? (sp.direction as TraceDirection)
    : undefined;
  const chain: ChainId = isChainId(sp.chain) ? sp.chain : DEFAULT_CHAIN;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Trace</h1>
      <TraceView
        key={`${sp.start}-${dir}-${chain}`}
        initialStart={sp.start || ""}
        initialChain={chain}
        initialDirection={dir}
        loggedIn={!!session}
        autoRun={!!sp.start}
      />
    </div>
  );
}
