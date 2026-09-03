"use client";

import Link from "next/link";
import { shortHash } from "@/lib/format";
import { categoryText } from "@/lib/trace/risk";
import type { InflowRisk } from "@/lib/trace/inflow";
import type { ChainId } from "@/lib/chains";
import { useFormatters, useLocale, useT } from "@/lib/i18n/provider";

const TXT = {
  en: {
    clean: (checked: number) => `None of the ${checked} direct senders checked is reported as harmful.`,
    skipped: (n: number) => ` ${n} further counterparties were not checked.`,
    traceOrigin: "Trace the origin over several hops →",
    warning: (n: number) => `Inflows from ${n} address${n === 1 ? "" : "es"} classified as harmful`,
    received: "Received directly:",
    checkedLargest: (checked: number) => `. The ${checked} largest direct senders were checked.`,
    colSender: "Sender",
    colVerdict: "Classification",
    colSource: "Source",
    colAmount: "Amount",
    colTxs: "Transactions",
    footnoteBefore: "Only the direct sender is checked. For the origin over several steps use the ",
    backwardTrace: "backward trace",
    footnoteAfter: ". An inflow is no proof that the recipient was involved.",
  },
  de: {
    clean: (checked: number) => `Keiner der ${checked} geprüften direkten Absender ist als schädlich gemeldet.`,
    skipped: (n: number) => ` ${n} weitere Gegenparteien wurden nicht geprüft.`,
    traceOrigin: "Herkunft über mehrere Hops verfolgen →",
    warning: (n: number) => `Zuflüsse von ${n} als schädlich eingestuften Adresse(n)`,
    received: "Direkt erhalten:",
    checkedLargest: (checked: number) => `. Geprüft wurden die ${checked} größten direkten Absender.`,
    colSender: "Absender",
    colVerdict: "Einstufung",
    colSource: "Quelle",
    colAmount: "Betrag",
    colTxs: "Transaktionen",
    footnoteBefore: "Geprüft wird nur der direkte Absender. Für die Herkunft über mehrere Schritte den ",
    backwardTrace: "Rückwärts-Trace",
    footnoteAfter: " nutzen. Ein Zufluss beweist keine Beteiligung des Empfängers.",
  },
};

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
  const t = useT(TXT);
  const locale = useLocale();
  const fmt = useFormatters();
  const backwardHref = `/trace?start=${address}&chain=${chain}&direction=backward`;

  if (!risk.senders.length) {
    return (
      <div className="card text-sm text-muted">
        {t.clean(risk.checked)}
        {risk.skipped > 0 && t.skipped(risk.skipped)}{" "}
        <Link href={backwardHref} className="text-brand">
          {t.traceOrigin}
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-500/70 bg-red-950/40 p-3">
      <h2 className="font-semibold text-red-300">
        &#9888; {t.warning(risk.senders.length)}
      </h2>
      <p className="mt-1 text-sm text-fg-2">
        {t.received} {fmt.amount(risk.totalSat, chain)}
        {priceEur !== undefined && ` (${fmt.fiat(risk.totalSat, priceEur, chain)})`}
        {t.checkedLargest(risk.checked)}
      </p>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted">
          <tr>
            <th className="py-1">{t.colSender}</th>
            <th>{t.colVerdict}</th>
            <th>{t.colSource}</th>
            <th className="text-right">{t.colAmount}</th>
            <th>{t.colTxs}</th>
          </tr>
        </thead>
        <tbody>
          {risk.senders.map((s) => (
            <tr key={s.address} className="border-t border-red-500/30">
              <td className="py-1.5">
                <Link
                  href={`/address/${s.address}?chain=${chain}`}
                  className="mono text-xs hover:text-brand"
                  title={s.address}
                >
                  {shortHash(s.address, 8)}
                </Link>
              </td>
              <td>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${s.verdict.severity === "high" ? "bg-red-700 text-white" : "bg-orange-600 text-white"}`}
                >
                  {s.verdict.label}
                </span>
                <span className="ml-1 text-xs text-muted">{categoryText(s.verdict.category, locale)}</span>
              </td>
              <td className="text-xs text-muted">{s.verdict.source}</td>
              <td className="text-right">{fmt.amount(s.amountSat, chain, 5)}</td>
              <td className="mono text-xs">
                {s.txids.slice(0, 2).map((tx) => (
                  <Link key={tx} href={`/tx/${tx}?chain=${chain}`} className="block hover:text-brand">
                    {shortHash(tx, 5)}
                  </Link>
                ))}
                {s.txids.length > 2 && <span className="text-subtle">+{s.txids.length - 2}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        {t.footnoteBefore}
        <Link href={backwardHref} className="text-brand">
          {t.backwardTrace}
        </Link>
        {t.footnoteAfter}
      </p>
    </div>
  );
}
