"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CHAIN_LIST, chainMeta, type ChainId } from "@/lib/chains";
import { shortHash, type Formatters } from "@/lib/format";
import { useFormatters, useLocale, useT } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { translateHint, translateHints } from "@/lib/i18n/hints";
import { categoryText } from "@/lib/trace/risk";
import type { AddressNodeData, TraceNode, TraceResult, TxNodeData } from "@/lib/trace/types";

/* ------------------------------------------------------------------ Typen */

export interface CaseTrace {
  id: string;
  name: string;
  start: string;
  chain: string;
  params: Record<string, unknown>;
  result: TraceResult;
  createdAt: string;
}

export interface CaseLogEntry {
  at: string;
  author: string;
  text: string;
}

export interface CaseData {
  _id: string;
  name: string;
  notes: string;
  chain: string;
  start: string;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
  params: Record<string, unknown>;
  traces?: CaseTrace[];
  /** Alte Fälle haben nur einen einzelnen Snapshot statt eines Trace-Arrays */
  result?: TraceResult;
  merges?: string[][];
  log?: CaseLogEntry[];
}

/* ------------------------------------------------------- Kleine Helfer */

function asChain(v: string | undefined): ChainId {
  return CHAIN_LIST.some((c) => c.id === v) ? (v as ChainId) : "bitcoin";
}

function isTxNode(n: TraceNode): n is TraceNode & { data: TxNodeData } {
  return n.data.type === "tx";
}

function isAddressNode(n: TraceNode): n is TraceNode & { data: AddressNodeData } {
  return n.data.type === "address";
}



function str(v: unknown, fallback = "–"): string {
  if (v === undefined || v === null || v === "") return fallback;
  return String(v);
}

const TXT = {
  en: {
    direction: {
      forward: "forward (outflow of funds)",
      backward: "backward (origin of funds)",
      both: "both directions",
    },
    mode: { address: "Address-based", utxo: "UTXO-exact" },
    taint: {
      none: "none",
      haircut: "haircut (proportional)",
      poison: "poison (in full)",
      fifo: "FIFO (order)",
    },
    risk: { none: "none", low: "low", medium: "medium", high: "high" },
    csvHead: ["Trace", "Chain", "Time", "TXID", "Inputs", "Outputs", "Volume", "Value EUR", "Fee", "Notes"],
    back: "← Back to the case",
    print: "Print as PDF",
    exportCsv: "Export CSV",
    reportTitle: (name: string) => `Investigation report: ${name}`,
    caseRef: "Case reference:",
    chain: "Chain:",
    created: "Created:",
    lastChanged: "Last changed:",
    author: "Author:",
    reportGenerated: "Report generated:",
    unknownAuthor: "unknown",
    summary: "Summary",
    startPoint: "Starting point:",
    traces: "Traces:",
    addressesTotal: "Addresses in total:",
    txsTotal: "Transactions in total:",
    period: "Period:",
    periodRange: (from: string, to: string) => `${from} to ${to}`,
    notDeterminable: "cannot be determined",
    highRiskAddresses: "Addresses with a high risk:",
    clusters: "Clusters:",
    notes: "Notes",
    noNotes: "No notes stored.",
    logTitle: "Investigation log",
    colTime: "Time",
    colAuthor: "Author",
    colEntry: "Entry",
    noLog: "No log entries.",
    mergesTitle: "Manually merged addresses",
    mergesLead: "These assignments were made by the investigator and do not come from a heuristic.",
    mergeCount: (n: number) => `${n} addresses: `,
    hintsTitle: "Notes",
    disclaimer:
      "All heuristics (clustering, change detection, taint analysis) yield statements of probability, not proof. No warranty is given.",
    sourcesUsed: "Data sources used:",
    noneRecorded: "none recorded",
    traceTitle: (index: number, name: string) => `Trace ${index}: ${name}`,
    parameters: "Parameters",
    directionLabel: "Direction:",
    modeLabel: "Mode:",
    taintLabel: "Taint model:",
    maxDepth: "Maximum depth:",
    performed: "Performed:",
    statistics: "Statistics",
    addresses: "Addresses:",
    transactions: "Transactions:",
    apiCalls: "API calls:",
    duration: "Duration:",
    truncated: "Truncated:",
    truncatedYes: "yes (limit reached)",
    truncatedNo: "no",
    taintedOutflow: "Tainted outflow:",
    providersTitle: "Data sources used",
    providerQueries: (name: string, count: number) => `${name} (${count} queries)`,
    warningsTitle: "Warnings",
    txTitle: (n: number) => `Transactions (${n})`,
    colTxid: "TXID",
    colInOut: "In/out",
    colVolume: "Volume",
    colValueEur: "Value (EUR)",
    colNotes: "Notes",
    noTxs: "No transactions recorded.",
    riskTitle: (n: number) => `Harmful addresses and tainted flows (${n})`,
    riskLead: (amount: string, affected: number) =>
      `In the graph, ${amount} at ${affected} address${affected === 1 ? "" : "es"} comes from reported sources.`,
    colReportedAddress: "Reported address",
    colVerdict: "Classification",
    colSource: "Source",
    colPassedOn: "passed on",
    colAffected: "affected addresses",
    affectedTitle: (n: number) => `Addresses with a tainted inflow (${n})`,
    colAddress: "Address",
    colTaintedInflow: "tainted inflow",
    colShare: "share",
    colOrigin: "Origin",
    notableTitle: (n: number) => `Notable addresses (${n})`,
    colLabels: "Labels",
    colRisk: "Risk",
    colReceived: "Received",
    colTaintShare: "Taint share",
    colCluster: "Cluster",
    startMark: "(start)",
    noNotable: "No notable addresses.",
    clusterTitle: (n: number) => `Clusters (${n})`,
    colNo: "No.",
    colName: "Name",
    colBehaviour: "Behaviour",
    manualMerge: "merged manually",
    heuristic: "heuristic",
    noClusters: "No clusters formed.",
    peelingTitle: (n: number) => `Peeling chains (${n})`,
    colSteps: "Steps",
    colPeeled: "Peeled off",
    colRemaining: "Remaining",
    colFirstTxid: "First TXID",
    activityTitle: "Activity pattern",
    activityLead: (total: number, zone: string, first: string, last: string) =>
      `${total} transaction times were evaluated. Estimated time zone: ${zone}. First activity: ${first}, last activity: ${last}.`,
    suspicious: "suspicious",
  },
  de: {
    direction: {
      forward: "vorwärts (Mittelabfluss)",
      backward: "rückwärts (Mittelherkunft)",
      both: "beide Richtungen",
    },
    mode: { address: "Adressbasiert", utxo: "UTXO-genau" },
    taint: {
      none: "keins",
      haircut: "Haircut (anteilig)",
      poison: "Poison (vollständig)",
      fifo: "FIFO (Reihenfolge)",
    },
    risk: { none: "keins", low: "niedrig", medium: "mittel", high: "hoch" },
    csvHead: ["Trace", "Chain", "Zeit", "TXID", "Eingänge", "Ausgänge", "Volumen", "Wert EUR", "Gebühr", "Hinweise"],
    back: "← Zurück zum Fall",
    print: "Als PDF drucken",
    exportCsv: "CSV exportieren",
    reportTitle: (name: string) => `Ermittlungsbericht: ${name}`,
    caseRef: "Aktenzeichen:",
    chain: "Chain:",
    created: "Angelegt:",
    lastChanged: "Zuletzt geändert:",
    author: "Verfasser:",
    reportGenerated: "Bericht erstellt:",
    unknownAuthor: "unbekannt",
    summary: "Zusammenfassung",
    startPoint: "Startpunkt:",
    traces: "Traces:",
    addressesTotal: "Adressen gesamt:",
    txsTotal: "Transaktionen gesamt:",
    period: "Zeitraum:",
    periodRange: (from: string, to: string) => `${from} bis ${to}`,
    notDeterminable: "nicht bestimmbar",
    highRiskAddresses: "Adressen mit hohem Risiko:",
    clusters: "Cluster:",
    notes: "Notizen",
    noNotes: "Keine Notizen hinterlegt.",
    logTitle: "Ermittlungsprotokoll",
    colTime: "Zeit",
    colAuthor: "Verfasser",
    colEntry: "Eintrag",
    noLog: "Keine Protokolleinträge.",
    mergesTitle: "Manuell zusammengeführte Adressen",
    mergesLead: "Diese Zuordnungen wurden durch den Ermittler gesetzt und stammen nicht aus einer Heuristik.",
    mergeCount: (n: number) => `${n} Adressen: `,
    hintsTitle: "Hinweise",
    disclaimer:
      "Alle Heuristiken (Clustering, Wechselgeld-Erkennung, Taint-Analyse) liefern Wahrscheinlichkeitsaussagen und keine Beweise. Angaben ohne Gewähr.",
    sourcesUsed: "Genutzte Datenquellen:",
    noneRecorded: "keine erfasst",
    traceTitle: (index: number, name: string) => `Trace ${index}: ${name}`,
    parameters: "Parameter",
    directionLabel: "Richtung:",
    modeLabel: "Modus:",
    taintLabel: "Taint-Modell:",
    maxDepth: "Maximale Tiefe:",
    performed: "Durchgeführt:",
    statistics: "Statistik",
    addresses: "Adressen:",
    transactions: "Transaktionen:",
    apiCalls: "API-Aufrufe:",
    duration: "Dauer:",
    truncated: "Abgeschnitten:",
    truncatedYes: "ja (Limit erreicht)",
    truncatedNo: "nein",
    taintedOutflow: "Verunreinigter Abfluss:",
    providersTitle: "Verwendete Datenquellen",
    providerQueries: (name: string, count: number) => `${name} (${count} Abfragen)`,
    warningsTitle: "Warnungen",
    txTitle: (n: number) => `Transaktionen (${n})`,
    colTxid: "TXID",
    colInOut: "Ein/Aus",
    colVolume: "Volumen",
    colValueEur: "Wert (EUR)",
    colNotes: "Hinweise",
    noTxs: "Keine Transaktionen erfasst.",
    riskTitle: (n: number) => `Schädliche Adressen und belastete Flüsse (${n})`,
    riskLead: (amount: string, affected: number) =>
      `Im Graph stammen ${amount} bei ${affected} Adresse(n) aus gemeldeten Quellen.`,
    colReportedAddress: "Gemeldete Adresse",
    colVerdict: "Einstufung",
    colSource: "Quelle",
    colPassedOn: "weitergegeben",
    colAffected: "betroffene Adressen",
    affectedTitle: (n: number) => `Adressen mit belastetem Zufluss (${n})`,
    colAddress: "Adresse",
    colTaintedInflow: "belasteter Zufluss",
    colShare: "Anteil",
    colOrigin: "Herkunft",
    notableTitle: (n: number) => `Auffällige Adressen (${n})`,
    colLabels: "Labels",
    colRisk: "Risiko",
    colReceived: "Empfangen",
    colTaintShare: "Taint-Anteil",
    colCluster: "Cluster",
    startMark: "(Start)",
    noNotable: "Keine auffälligen Adressen.",
    clusterTitle: (n: number) => `Cluster (${n})`,
    colNo: "Nr.",
    colName: "Bezeichnung",
    colBehaviour: "Verhalten",
    manualMerge: "manuell zusammengeführt",
    heuristic: "Heuristik",
    noClusters: "Keine Cluster gebildet.",
    peelingTitle: (n: number) => `Peeling-Ketten (${n})`,
    colSteps: "Schritte",
    colPeeled: "Abgezweigt",
    colRemaining: "Rest",
    colFirstTxid: "Erste TXID",
    activityTitle: "Aktivitätsmuster",
    activityLead: (total: number, zone: string, first: string, last: string) =>
      `Ausgewertet wurden ${total} Transaktionszeitpunkte. Geschätzte Zeitzone: ${zone}. Erste Aktivität: ${first}, letzte Aktivität: ${last}.`,
    suspicious: "auffällig",
  },
};

type Texts = (typeof TXT)[Locale];

/** CSV-Feld für deutsche Excel-Versionen absichern */
function csvCell(v: string | number | undefined): string {
  const s = v === undefined || v === null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/* --------------------------------------------------------- Komponente */

export default function CaseReport({ data, author }: { data: CaseData; author: string }) {
  const t = useT(TXT);
  const fmt = useFormatters();
  const locale = useLocale();
  const [generatedAt] = useState(() => new Date());

  /** Traces normalisieren: alte Fälle besitzen nur `result` */
  const traces = useMemo<CaseTrace[]>(() => {
    const list = Array.isArray(data.traces) ? data.traces.filter((t) => t && t.result) : [];
    if (list.length) return list;
    if (data.result) {
      return [
        {
          id: "legacy",
          name: data.name,
          start: data.start,
          chain: data.chain,
          params: data.params ?? {},
          result: data.result,
          createdAt: data.createdAt,
        },
      ];
    }
    return [];
  }, [data]);

  const merges = useMemo(() => (Array.isArray(data.merges) ? data.merges.filter((m) => m && m.length) : []), [data.merges]);
  const log = useMemo(() => (Array.isArray(data.log) ? data.log : []), [data.log]);

  /** Kennzahlen über alle Traces */
  const summary = useMemo(() => {
    let addresses = 0;
    let txs = 0;
    let clusters = 0;
    let highRisk = 0;
    let first: number | undefined;
    let last: number | undefined;
    const sources = new Set<string>();
    for (const t of traces) {
      const r = t.result;
      addresses += r.stats?.addresses ?? 0;
      txs += r.stats?.txs ?? 0;
      clusters += r.clusters?.length ?? 0;
      for (const n of r.nodes ?? []) {
        if (isAddressNode(n) && n.data.risk === "high") highRisk += 1;
        if (isTxNode(n) && n.data.blockTime) {
          if (first === undefined || n.data.blockTime < first) first = n.data.blockTime;
          if (last === undefined || n.data.blockTime > last) last = n.data.blockTime;
        }
      }
      for (const p of Object.keys(r.providersUsed ?? {})) sources.add(p);
    }
    return { addresses, txs, clusters, highRisk, first, last, sources: [...sources].sort() };
  }, [traces]);

  /** Transaktionstabelle aller Traces als CSV herunterladen */
  function exportCsv() {
    const head = t.csvHead;
    const rows: string[] = [head.map(csvCell).join(";")];
    for (const t of traces) {
      const chain = asChain(t.chain || t.result.params?.chain);
      const txNodes = (t.result.nodes ?? [])
        .filter(isTxNode)
        .sort((a, b) => (a.data.blockTime ?? 0) - (b.data.blockTime ?? 0));
      for (const n of txNodes) {
        const d = n.data;
        rows.push(
          [
            csvCell(t.name || t.id),
            csvCell(chainMeta(chain).name),
            csvCell(fmt.date(d.blockTime)),
            csvCell(d.txid),
            csvCell(d.inputCount),
            csvCell(d.outputCount),
            csvCell(fmt.amount(d.totalOutSat, chain)),
            csvCell(fmt.fiat(d.totalOutSat, d.priceEur, chain)),
            csvCell(fmt.amount(d.feeSat, chain)),
            csvCell(translateHints(d.hints, locale).join(", ")),
          ].join(";"),
        );
      }
    }
    // UTF-8-BOM, damit Excel Umlaute korrekt anzeigt
    const blob = new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bericht-${data._id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const caseChain = asChain(data.chain);

  return (
    <div className="report space-y-6 print:bg-white print:text-black">
      <style>{`
        @media print {
          @page { margin: 15mm; }
          body { background: #fff !important; color: #000 !important; }
          .no-print { display: none !important; }
          .report a { color: #000 !important; text-decoration: none; }
          .report table { border-collapse: collapse; width: 100%; }
          .report th, .report td { border: 1px solid #999 !important; padding: 3px 5px; }
          .report section { break-inside: avoid; }
        }
      `}</style>

      {/* Bedienleiste – erscheint nicht im Druck */}
      <div className="no-print flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/cases/${data._id}`} className="btn-secondary">
          {t.back}
        </Link>
        <button className="btn" onClick={() => window.print()}>
          {t.print}
        </button>
        <button className="btn-secondary" onClick={exportCsv} disabled={!traces.length}>
          {t.exportCsv}
        </button>
      </div>

      {/* Kopf */}
      <header className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h1 className="text-xl font-semibold">{t.reportTitle(data.name)}</h1>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted print:text-black">{t.caseRef} </dt>
            <dd className="mono inline text-xs">{data._id}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.chain} </dt>
            <dd className="inline">{chainMeta(caseChain).name}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.created} </dt>
            <dd className="inline">{fmt.timestamp(data.createdAt)}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.lastChanged} </dt>
            <dd className="inline">{fmt.timestamp(data.updatedAt)}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.author} </dt>
            <dd className="inline">{author || t.unknownAuthor}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.reportGenerated} </dt>
            <dd className="inline">{generatedAt.toLocaleString(fmt.intlLocale)}</dd>
          </div>
        </dl>
      </header>

      {/* Zusammenfassung */}
      <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h2 className="mb-2 text-base font-semibold">{t.summary}</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted print:text-black">{t.startPoint} </dt>
            <dd className="mono inline text-xs">{data.start}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.traces} </dt>
            <dd className="inline">{traces.length}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.addressesTotal} </dt>
            <dd className="inline">{summary.addresses}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.txsTotal} </dt>
            <dd className="inline">{summary.txs}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.period} </dt>
            <dd className="inline">
              {summary.first ? t.periodRange(fmt.date(summary.first), fmt.date(summary.last)) : t.notDeterminable}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.highRiskAddresses} </dt>
            <dd className="inline">{summary.highRisk}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.clusters} </dt>
            <dd className="inline">{summary.clusters}</dd>
          </div>
        </dl>
      </section>

      {/* Notizen */}
      <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h2 className="mb-2 text-base font-semibold">{t.notes}</h2>
        {data.notes ? (
          <p className="whitespace-pre-wrap text-sm">{data.notes}</p>
        ) : (
          <p className="text-sm text-subtle print:text-black">{t.noNotes}</p>
        )}
      </section>

      {/* Ermittlungsprotokoll */}
      <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h2 className="mb-2 text-base font-semibold">{t.logTitle}</h2>
        {log.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-subtle print:text-black">
              <tr>
                <th className="py-1">{t.colTime}</th>
                <th>{t.colAuthor}</th>
                <th>{t.colEntry}</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={i} className="border-t border-border align-top print:border-muted">
                  <td className="py-1 whitespace-nowrap">{fmt.timestamp(l.at)}</td>
                  <td className="py-1">{l.author || "–"}</td>
                  <td className="py-1 whitespace-pre-wrap">{l.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-subtle print:text-black">{t.noLog}</p>
        )}
      </section>

      {/* Traces */}
      {traces.map((tr, ti) => (
        <TraceSection key={tr.id || ti} trace={tr} index={ti + 1} t={t} fmt={fmt} locale={locale} />
      ))}

      {/* Manuelle Zusammenführungen */}
      {merges.length > 0 && (
        <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
          <h2 className="mb-2 text-base font-semibold">{t.mergesTitle}</h2>
          <p className="mb-2 text-xs text-subtle print:text-black">{t.mergesLead}</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {merges.map((group, i) => (
              <li key={i}>
                <span className="text-muted print:text-black">{t.mergeCount(group.length)}</span>
                <span className="mono text-xs">{group.join(", ")}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Rechtshinweis */}
      <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h2 className="mb-2 text-base font-semibold">{t.hintsTitle}</h2>
        <p className="text-sm">{t.disclaimer}</p>
        <p className="mt-2 text-sm">
          <span className="text-muted print:text-black">{t.sourcesUsed} </span>
          {summary.sources.length ? summary.sources.join(", ") : t.noneRecorded}
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------- Abschnitt je Trace */

function TraceSection({
  trace,
  index,
  t,
  fmt,
  locale,
}: {
  trace: CaseTrace;
  index: number;
  t: Texts;
  fmt: Formatters;
  locale: Locale;
}) {
  const r = trace.result;
  const chain = asChain(trace.chain || r.params?.chain);
  const p = r.params;

  const txNodes = useMemo(
    () =>
      (r.nodes ?? []).filter(isTxNode).sort((a, b) => (a.data.blockTime ?? 0) - (b.data.blockTime ?? 0)),
    [r.nodes],
  );

  /** Auffällig: hohes/mittleres Risiko, vorhandene Labels oder Startadresse */
  const notableAddresses = useMemo(
    () =>
      (r.nodes ?? [])
        .filter(isAddressNode)
        .filter((n) => n.data.risk === "high" || n.data.risk === "medium" || (n.data.labels ?? []).length > 0 || n.data.isStart)
        .sort((a, b) => (b.data.receivedSat ?? 0) - (a.data.receivedSat ?? 0)),
    [r.nodes],
  );

  /** Adressen, die Geld von gemeldeten Adressen erhalten haben */
  const affectedAddresses = useMemo(
    () =>
      (r.nodes ?? [])
        .filter(isAddressNode)
        .filter((n) => !n.data.isRiskSource && (n.data.riskFromSat ?? 0) > 0)
        .sort((a, b) => (b.data.riskFromSat ?? 0) - (a.data.riskFromSat ?? 0)),
    [r.nodes],
  );

  const providers = Object.entries(r.providersUsed ?? {});
  const activity = r.activity;

  return (
    <section className="card space-y-4 print:border-0 print:bg-white print:p-0 print:text-black">
      <h2 className="text-base font-semibold">
        {t.traceTitle(index, trace.name || trace.start)}
      </h2>

      {/* Parameter */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">{t.parameters}</h3>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted print:text-black">{t.startPoint} </dt>
            <dd className="mono inline text-xs">{str(p?.start ?? trace.start)}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.chain} </dt>
            <dd className="inline">{chainMeta(chain).name}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.directionLabel} </dt>
            <dd className="inline">
              {t.direction[str(p?.direction, "") as keyof Texts["direction"]] ?? str(p?.direction)}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.modeLabel} </dt>
            <dd className="inline">{t.mode[str(p?.mode, "") as keyof Texts["mode"]] ?? str(p?.mode)}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.taintLabel} </dt>
            <dd className="inline">
              {t.taint[str(p?.taintModel, "") as keyof Texts["taint"]] ?? str(p?.taintModel)}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.maxDepth} </dt>
            <dd className="inline">{str(p?.maxDepth)}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.performed} </dt>
            <dd className="inline">{fmt.timestamp(trace.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Statistik */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">{t.statistics}</h3>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted print:text-black">{t.addresses} </dt>
            <dd className="inline">{r.stats?.addresses ?? 0}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.transactions} </dt>
            <dd className="inline">{r.stats?.txs ?? 0}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.apiCalls} </dt>
            <dd className="inline">{r.stats?.apiCalls ?? 0}</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.duration} </dt>
            <dd className="inline">{fmt.number((r.stats?.durationMs ?? 0) / 1000, 1)} s</dd>
          </div>
          <div>
            <dt className="inline text-muted print:text-black">{t.truncated} </dt>
            <dd className="inline">{r.stats?.truncated ? t.truncatedYes : t.truncatedNo}</dd>
          </div>
          {r.stats?.taintedOutSat !== undefined && (
            <div>
              <dt className="inline text-muted print:text-black">{t.taintedOutflow} </dt>
              <dd className="inline">{fmt.amount(r.stats.taintedOutSat, chain)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Datenquellen und Warnungen */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">{t.providersTitle}</h3>
        <p className="text-sm">
          {providers.length
            ? providers.map(([n, count]) => t.providerQueries(n, count)).join(", ")
            : t.noneRecorded}
        </p>
        {(r.warnings ?? []).length > 0 && (
          <>
            <h3 className="mt-2 mb-1 text-sm font-semibold">{t.warningsTitle}</h3>
            <ul className="list-disc pl-5 text-sm text-yellow-400 print:text-black">
              {translateHints(r.warnings, locale).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Transaktionen */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">{t.txTitle(txNodes.length)}</h3>
        {txNodes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-subtle print:text-black">
                <tr>
                  <th className="py-1">{t.colTime}</th>
                  <th>{t.colTxid}</th>
                  <th>{t.colInOut}</th>
                  <th>{t.colVolume}</th>
                  <th>{t.colValueEur}</th>
                  <th>{t.colNotes}</th>
                </tr>
              </thead>
              <tbody>
                {txNodes.map((n) => (
                  <tr key={n.id} className="border-t border-border align-top print:border-muted">
                    <td className="py-1 whitespace-nowrap">{fmt.date(n.data.blockTime)}</td>
                    <td className="mono py-1 text-xs" title={n.data.txid}>
                      {shortHash(n.data.txid, 8)}
                    </td>
                    <td className="py-1 whitespace-nowrap">
                      {n.data.inputCount} / {n.data.outputCount}
                    </td>
                    <td className="py-1 whitespace-nowrap">{fmt.amount(n.data.totalOutSat, chain)}</td>
                    <td className="py-1 whitespace-nowrap">
                      {n.data.priceEur ? fmt.fiat(n.data.totalOutSat, n.data.priceEur, chain) : "–"}
                    </td>
                    <td className="py-1 text-xs">{translateHints(n.data.hints, locale).join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-subtle print:text-black">{t.noTxs}</p>
        )}
      </div>

      {/* Herkunft von schädlichen Adressen */}
      {(r.riskSources ?? []).length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t.riskTitle((r.riskSources ?? []).length)}</h3>
          <p className="mb-1 text-sm">
            {t.riskLead(fmt.amount(r.stats?.riskInflowSat ?? 0, chain, 5), r.stats?.riskAffected ?? 0)}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-subtle print:text-black">
                <tr>
                  <th className="py-1">{t.colReportedAddress}</th>
                  <th>{t.colVerdict}</th>
                  <th>{t.colSource}</th>
                  <th className="text-right">{t.colPassedOn}</th>
                  <th className="text-right">{t.colAffected}</th>
                </tr>
              </thead>
              <tbody>
                {(r.riskSources ?? []).map((rs) => (
                  <tr key={rs.address} className="border-t border-border print:border-muted">
                    <td className="mono py-1 text-xs">{rs.address}</td>
                    <td>
                      {translateHint(rs.label, locale)} ({rs.category ? categoryText(rs.category, locale) : t.suspicious})
                    </td>
                    <td className="text-xs">{rs.source}</td>
                    <td className="text-right">{fmt.amount(rs.outflowSat, chain, 5)}</td>
                    <td className="text-right">{rs.affectedAddresses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {affectedAddresses.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <h4 className="mb-1 text-sm font-semibold">{t.affectedTitle(affectedAddresses.length)}</h4>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-subtle print:text-black">
                  <tr>
                    <th className="py-1">{t.colAddress}</th>
                    <th className="text-right">{t.colTaintedInflow}</th>
                    <th className="text-right">{t.colShare}</th>
                    <th>{t.colOrigin}</th>
                  </tr>
                </thead>
                <tbody>
                  {affectedAddresses.map((n) => (
                    <tr key={n.id} className="border-t border-border print:border-muted">
                      <td className="mono py-1 text-xs">{n.data.address}</td>
                      <td className="text-right">{fmt.amount(n.data.riskFromSat, chain, 5)}</td>
                      <td className="text-right">{fmt.percent(n.data.riskFromRatio ?? 0, 0)}</td>
                      <td className="mono text-xs">{(n.data.riskSources ?? []).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Auffällige Adressen */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">{t.notableTitle(notableAddresses.length)}</h3>
        {notableAddresses.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-subtle print:text-black">
                <tr>
                  <th className="py-1">{t.colAddress}</th>
                  <th>{t.colLabels}</th>
                  <th>{t.colRisk}</th>
                  <th>{t.colReceived}</th>
                  <th>{t.colTaintShare}</th>
                  <th>{t.colCluster}</th>
                </tr>
              </thead>
              <tbody>
                {notableAddresses.map((n) => (
                  <tr key={n.id} className="border-t border-border align-top print:border-muted">
                    <td className="mono py-1 text-xs" title={n.data.address}>
                      {shortHash(n.data.address, 8)}
                      {n.data.isStart && (
                        <span className="ml-1 not-italic text-brand print:text-black">{t.startMark}</span>
                      )}
                    </td>
                    <td className="py-1 text-xs">
                      {(n.data.labels ?? []).length
                        ? n.data.labels.map((l) => `${l.source}: ${translateHint(l.label, locale)}`).join("; ")
                        : "–"}
                    </td>
                    <td className="py-1">{t.risk[n.data.risk] ?? n.data.risk}</td>
                    <td className="py-1 whitespace-nowrap">{fmt.amount(n.data.receivedSat, chain)}</td>
                    <td className="py-1 whitespace-nowrap">
                      {n.data.taintRatio !== undefined ? fmt.percent(n.data.taintRatio) : "–"}
                    </td>
                    <td className="py-1">{n.data.clusterId !== undefined ? `#${n.data.clusterId}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-subtle print:text-black">{t.noNotable}</p>
        )}
      </div>

      {/* Cluster */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">{t.clusterTitle((r.clusters ?? []).length)}</h3>
        {(r.clusters ?? []).length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-subtle print:text-black">
              <tr>
                <th className="py-1">{t.colNo}</th>
                <th>{t.colAddress}</th>
                <th>{t.colName}</th>
                <th>{t.colBehaviour}</th>
                <th>{t.colReceived}</th>
                <th>{t.colOrigin}</th>
              </tr>
            </thead>
            <tbody>
              {r.clusters.map((c) => (
                <tr key={c.id} className="border-t border-border align-top print:border-muted">
                  <td className="py-1">#{c.id}</td>
                  <td className="py-1">{c.addresses?.length ?? 0}</td>
                  <td className="py-1">{c.label || "–"}</td>
                  <td className="py-1 text-xs">{translateHints(c.behavior, locale).join(", ") || "–"}</td>
                  <td className="py-1 whitespace-nowrap">{fmt.amount(c.totalReceivedSat, chain)}</td>
                  <td className="py-1 text-xs">{c.manual ? t.manualMerge : t.heuristic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-subtle print:text-black">{t.noClusters}</p>
        )}
      </div>

      {/* Peeling-Ketten */}
      {(r.peeling ?? []).length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t.peelingTitle(r.peeling.length)}</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-subtle print:text-black">
              <tr>
                <th className="py-1">{t.colNo}</th>
                <th>{t.colSteps}</th>
                <th>{t.colPeeled}</th>
                <th>{t.colRemaining}</th>
                <th>{t.colFirstTxid}</th>
              </tr>
            </thead>
            <tbody>
              {r.peeling.map((chainEntry, i) => (
                <tr key={i} className="border-t border-border align-top print:border-muted">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{chainEntry.txids?.length ?? 0}</td>
                  <td className="py-1 whitespace-nowrap">{fmt.amount(chainEntry.totalPeeledSat, chain)}</td>
                  <td className="py-1 whitespace-nowrap">{fmt.amount(chainEntry.remainingSat, chain)}</td>
                  <td className="mono py-1 text-xs">{chainEntry.txids?.[0] ? shortHash(chainEntry.txids[0], 8) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Aktivitätsmuster */}
      {activity && (activity.total ?? 0) > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t.activityTitle}</h3>
          <p className="text-sm">
            {t.activityLead(
              activity.total,
              (activity.guessedUtcOffset !== undefined
                ? `UTC${activity.guessedUtcOffset >= 0 ? "+" : ""}${activity.guessedUtcOffset}`
                : t.notDeterminable) +
                (activity.guessedRegion ? ` (${translateHint(activity.guessedRegion, locale)})` : ""),
              fmt.date(activity.firstSeen),
              fmt.date(activity.lastSeen),
            )}
          </p>
        </div>
      )}
    </section>
  );
}
