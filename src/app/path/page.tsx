import PathView from "@/components/PathView";
import { getSession } from "@/lib/auth";
import { isChainId, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TXT = {
  en: {
    title: "Find a connection",
    lead: "Looks for money paths between two addresses. The search runs from both ends at once: forward from the starting point along the payments and backward from the destination. Where the two sides meet, a connection has been found.",
  },
  de: {
    title: "Verbindung suchen",
    lead: "Sucht Geldwege zwischen zwei Adressen. Die Suche läuft gleichzeitig von beiden Seiten: vorwärts vom Startpunkt entlang der Zahlungen und rückwärts vom Ziel. Treffen sich beide Seiten, ist eine Verbindung gefunden.",
  },
};

export default async function PathPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; chain?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  const t = await getT(TXT);
  const chain: ChainId = isChainId(sp.chain) ? sp.chain : DEFAULT_CHAIN;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="text-sm text-muted">{t.lead}</p>
      </div>
      <PathView initialFrom={sp.from || ""} initialTo={sp.to || ""} initialChain={chain} loggedIn={!!session} />
    </div>
  );
}
