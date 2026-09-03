import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import ProviderStatusList from "@/components/ProviderStatusList";
import { getBtcPrice } from "@/lib/providers/price";
import { CHAIN_LIST } from "@/lib/chains";
import { getFormatters, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TXT = {
  en: {
    titleBefore: "Trace ",
    titleAccent: "cryptocurrencies",
    lead: "Analyse addresses and transactions across several free data sources, follow the flow of funds as a graph, spot wallet clusters, work out the share coming from one source and check addresses against scam, mixer, ransomware and sanctions lists.",
    toGraph: "To the trace graph →",
    watchAddresses: "Watch addresses →",
    supported: "Supported:",
    features: [
      { title: "1 · Search", text: "Enter an address or transaction: balance, history, labels and values at the rate of the day." },
      { title: "2 · Follow", text: "Address-based or UTXO-exact, forwards and backwards over several hops, live in the graph." },
      { title: "3 · Assess", text: "Clustering, change detection, CoinJoin, peeling chains, timing patterns, taint share and risk labels." },
      { title: "4 · Document", text: "Cases with several traces, an audit log, your own labels and a printable report." },
    ],
  },
  de: {
    titleBefore: "Kryptowährungen ",
    titleAccent: "zurückverfolgen",
    lead: "Adressen und Transaktionen über mehrere kostenlose Datenquellen analysieren, Geldflüsse als Graph verfolgen, Wallet-Cluster erkennen, den Anteil aus einer Quelle berechnen und Adressen gegen Scam-, Mixer-, Ransomware- und Sanktionslisten prüfen.",
    toGraph: "Zum Trace-Graph →",
    watchAddresses: "Adressen beobachten →",
    supported: "Unterstützt:",
    features: [
      { title: "1 · Suchen", text: "Adresse oder Transaktion eingeben: Saldo, Verlauf, Labels und Werte zum damaligen Kurs." },
      { title: "2 · Verfolgen", text: "Adressbasiert oder UTXO-genau, vorwärts und rückwärts über mehrere Hops, live im Graph." },
      { title: "3 · Bewerten", text: "Clustering, Wechselgeld, CoinJoin, Peeling-Ketten, Zeitmuster, Taint-Anteil und Risiko-Labels." },
      { title: "4 · Dokumentieren", text: "Fälle mit mehreren Traces, Protokoll, eigenen Labels und druckbarem Bericht." },
    ],
  },
};

export default async function Home() {
  const price = await getBtcPrice().catch(() => null);
  const t = await getT(TXT);
  const fmt = await getFormatters();
  return (
    <div className="space-y-8">
      <section className="mx-auto max-w-3xl space-y-4 pt-8 text-center">
        <h1 className="text-3xl font-bold">
          {t.titleBefore}
          <span className="text-brand">{t.titleAccent}</span>
        </h1>
        <p className="text-muted">{t.lead}</p>
        <SearchBox large />
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          <Link href="/trace" className="text-brand hover:underline">
            {t.toGraph}
          </Link>
          <Link href="/watchlist" className="text-brand hover:underline">
            {t.watchAddresses}
          </Link>
        </div>
        <p className="text-xs text-subtle">
          {t.supported} {CHAIN_LIST.map((c) => c.symbol).join(" · ")}
          {price && (
            <>
              {" · "}BTC {fmt.fiat(100_000_000, price.eur)} ({price.source})
            </>
          )}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {t.features.map((f) => (
          <Feature key={f.title} title={f.title} text={f.text} />
        ))}
      </section>

      <ProviderStatusList showCache={false} />
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="card">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
