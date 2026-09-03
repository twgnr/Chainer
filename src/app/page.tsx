import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import ProviderStatusList from "@/components/ProviderStatusList";
import { getBtcPrice } from "@/lib/providers/price";
import { CHAIN_LIST } from "@/lib/chains";

export const dynamic = "force-dynamic";

export default async function Home() {
  const price = await getBtcPrice().catch(() => null);
  return (
    <div className="space-y-8">
      <section className="mx-auto max-w-3xl space-y-4 pt-8 text-center">
        <h1 className="text-3xl font-bold">
          Kryptowährungen <span className="text-accent">zurückverfolgen</span>
        </h1>
        <p className="text-gray-400">
          Adressen und Transaktionen über mehrere kostenlose Datenquellen analysieren, Geldflüsse als Graph verfolgen,
          Wallet-Cluster erkennen, den Anteil aus einer Quelle berechnen und Adressen gegen Scam-, Mixer-, Ransomware-
          und Sanktionslisten prüfen.
        </p>
        <SearchBox large />
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          <Link href="/trace" className="text-accent hover:underline">
            Zum Trace-Graph →
          </Link>
          <Link href="/watchlist" className="text-accent hover:underline">
            Adressen beobachten →
          </Link>
        </div>
        <p className="text-xs text-gray-500">
          Unterstützt: {CHAIN_LIST.map((c) => c.symbol).join(" · ")}
          {price && (
            <>
              {" · "}BTC {price.eur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} ({price.source})
            </>
          )}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Feature title="1 · Suchen" text="Adresse oder Transaktion eingeben: Saldo, Verlauf, Labels und Werte zum damaligen Kurs." />
        <Feature
          title="2 · Verfolgen"
          text="Adressbasiert oder UTXO-genau, vorwärts und rückwärts über mehrere Hops, live im Graph."
        />
        <Feature
          title="3 · Bewerten"
          text="Clustering, Wechselgeld, CoinJoin, Peeling-Ketten, Zeitmuster, Taint-Anteil und Risiko-Labels."
        />
        <Feature title="4 · Dokumentieren" text="Fälle mit mehreren Traces, Protokoll, eigenen Labels und druckbarem Bericht." />
      </section>

      <ProviderStatusList showCache={false} />
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="card">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}
