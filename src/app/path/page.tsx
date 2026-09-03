import PathView from "@/components/PathView";
import { getSession } from "@/lib/auth";
import { isChainId, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";

export const dynamic = "force-dynamic";

export default async function PathPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; chain?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  const chain: ChainId = isChainId(sp.chain) ? sp.chain : DEFAULT_CHAIN;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Verbindung suchen</h1>
        <p className="text-sm text-gray-400">
          Sucht Geldwege zwischen zwei Adressen. Die Suche läuft gleichzeitig von beiden Seiten: vorwärts vom
          Startpunkt entlang der Zahlungen und rückwärts vom Ziel. Treffen sich beide Seiten, ist eine Verbindung
          gefunden.
        </p>
      </div>
      <PathView initialFrom={sp.from || ""} initialTo={sp.to || ""} initialChain={chain} loggedIn={!!session} />
    </div>
  );
}
