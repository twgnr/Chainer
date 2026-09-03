import Link from "next/link";
import { formatAmount, formatFiat, shortHash } from "@/lib/format";
import { categoryText } from "@/lib/trace/risk";
import type { InflowRisk } from "@/lib/trace/inflow";
import type { ChainId } from "@/lib/chains";

/**
 * Warnung auf der Adressseite: direkte Zuflüsse von Adressen, die in einer der
 * Label-, Sanktions- oder Missbrauchsdatenbanken geführt werden.
 */
export default function InflowRiskBanner({
  risk,
  chain,
  priceEur,
  address,
}: {
  risk: InflowRisk;
  chain: ChainId;
  priceEur?: number;
  address: string;
}) {
  if (!risk.senders.length) {
    return (
      <div className="card text-sm text-gray-400">
        Keiner der {risk.checked} geprüften direkten Absender ist als schädlich gemeldet.
        {risk.skipped > 0 && ` ${risk.skipped} weitere Gegenparteien wurden nicht geprüft.`}{" "}
        <Link href={`/trace?start=${address}&chain=${chain}&direction=backward`} className="text-accent">
          Herkunft über mehrere Hops verfolgen →
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-500/70 bg-red-950/40 p-3">
      <h2 className="font-semibold text-red-300">
        &#9888; Zuflüsse von {risk.senders.length} als schädlich eingestuften Adresse(n)
      </h2>
      <p className="mt-1 text-sm text-gray-300">
        Direkt erhalten: {formatAmount(risk.totalSat, chain)}
        {priceEur !== undefined && ` (${formatFiat(risk.totalSat, priceEur, chain)})`}. Geprüft wurden die{" "}
        {risk.checked} größten direkten Absender.
      </p>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="py-1">Absender</th>
            <th>Einstufung</th>
            <th>Quelle</th>
            <th className="text-right">Betrag</th>
            <th>Transaktionen</th>
          </tr>
        </thead>
        <tbody>
          {risk.senders.map((s) => (
            <tr key={s.address} className="border-t border-red-500/30">
              <td className="py-1.5">
                <Link href={`/address/${s.address}?chain=${chain}`} className="mono text-xs hover:text-accent" title={s.address}>
                  {shortHash(s.address, 8)}
                </Link>
              </td>
              <td>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${s.verdict.severity === "high" ? "bg-red-700 text-white" : "bg-orange-600 text-white"}`}
                >
                  {s.verdict.label}
                </span>
                <span className="ml-1 text-xs text-gray-400">{categoryText(s.verdict.category)}</span>
              </td>
              <td className="text-xs text-gray-400">{s.verdict.source}</td>
              <td className="text-right">{formatAmount(s.amountSat, chain, 5)}</td>
              <td className="mono text-xs">
                {s.txids.slice(0, 2).map((t) => (
                  <Link key={t} href={`/tx/${t}?chain=${chain}`} className="block hover:text-accent">
                    {shortHash(t, 5)}
                  </Link>
                ))}
                {s.txids.length > 2 && <span className="text-gray-500">+{s.txids.length - 2}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-400">
        Geprüft wird nur der direkte Absender. Für die Herkunft über mehrere Schritte den{" "}
        <Link href={`/trace?start=${address}&chain=${chain}&direction=backward`} className="text-accent">
          Rückwärts-Trace
        </Link>{" "}
        nutzen. Ein Zufluss beweist keine Beteiligung des Empfängers.
      </p>
    </div>
  );
}
