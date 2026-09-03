"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CHAIN_LIST, chainMeta, type ChainId } from "@/lib/chains";
import { formatAmount, formatDate, formatFiat, formatPercent, shortHash } from "@/lib/format";
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

/** ISO-Datum eines Mongoose-Feldes im deutschen Format */
function isoDate(v: string | undefined): string {
  if (!v) return "–";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE");
}

function str(v: unknown, fallback = "–"): string {
  if (v === undefined || v === null || v === "") return fallback;
  return String(v);
}

const DIRECTION_LABEL: Record<string, string> = {
  forward: "vorwärts (Mittelabfluss)",
  backward: "rückwärts (Mittelherkunft)",
  both: "beide Richtungen",
};

const MODE_LABEL: Record<string, string> = {
  address: "Adressbasiert",
  utxo: "UTXO-genau",
};

const TAINT_LABEL: Record<string, string> = {
  none: "keins",
  haircut: "Haircut (anteilig)",
  poison: "Poison (vollständig)",
  fifo: "FIFO (Reihenfolge)",
};

const RISK_LABEL: Record<string, string> = {
  none: "keins",
  low: "niedrig",
  medium: "mittel",
  high: "hoch",
};

/** CSV-Feld für deutsche Excel-Versionen absichern */
function csvCell(v: string | number | undefined): string {
  const s = v === undefined || v === null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/* --------------------------------------------------------- Komponente */

export default function CaseReport({ data, author }: { data: CaseData; author: string }) {
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
    const head = [
      "Trace",
      "Chain",
      "Zeit",
      "TXID",
      "Eingänge",
      "Ausgänge",
      "Volumen",
      "Wert EUR",
      "Gebühr",
      "Hinweise",
    ];
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
            csvCell(formatDate(d.blockTime)),
            csvCell(d.txid),
            csvCell(d.inputCount),
            csvCell(d.outputCount),
            csvCell(formatAmount(d.totalOutSat, chain)),
            csvCell(formatFiat(d.totalOutSat, d.priceEur, chain)),
            csvCell(formatAmount(d.feeSat, chain)),
            csvCell((d.hints ?? []).join(", ")),
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
          ← Zurück zum Fall
        </Link>
        <button className="btn" onClick={() => window.print()}>
          Als PDF drucken
        </button>
        <button className="btn-secondary" onClick={exportCsv} disabled={!traces.length}>
          CSV exportieren
        </button>
      </div>

      {/* Kopf */}
      <header className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h1 className="text-xl font-semibold">Ermittlungsbericht: {data.name}</h1>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-gray-400 print:text-black">Aktenzeichen: </dt>
            <dd className="mono inline text-xs">{data._id}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Chain: </dt>
            <dd className="inline">{chainMeta(caseChain).name}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Angelegt: </dt>
            <dd className="inline">{isoDate(data.createdAt)}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Zuletzt geändert: </dt>
            <dd className="inline">{isoDate(data.updatedAt)}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Verfasser: </dt>
            <dd className="inline">{author || "unbekannt"}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Bericht erstellt: </dt>
            <dd className="inline">{generatedAt.toLocaleString("de-DE")}</dd>
          </div>
        </dl>
      </header>

      {/* Zusammenfassung */}
      <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h2 className="mb-2 text-base font-semibold">Zusammenfassung</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-gray-400 print:text-black">Startpunkt: </dt>
            <dd className="mono inline text-xs">{data.start}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Traces: </dt>
            <dd className="inline">{traces.length}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Adressen gesamt: </dt>
            <dd className="inline">{summary.addresses}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Transaktionen gesamt: </dt>
            <dd className="inline">{summary.txs}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Zeitraum: </dt>
            <dd className="inline">
              {summary.first ? `${formatDate(summary.first)} bis ${formatDate(summary.last)}` : "nicht bestimmbar"}
            </dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Adressen mit hohem Risiko: </dt>
            <dd className="inline">{summary.highRisk}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Cluster: </dt>
            <dd className="inline">{summary.clusters}</dd>
          </div>
        </dl>
      </section>

      {/* Notizen */}
      <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h2 className="mb-2 text-base font-semibold">Notizen</h2>
        {data.notes ? (
          <p className="whitespace-pre-wrap text-sm">{data.notes}</p>
        ) : (
          <p className="text-sm text-gray-500 print:text-black">Keine Notizen hinterlegt.</p>
        )}
      </section>

      {/* Ermittlungsprotokoll */}
      <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h2 className="mb-2 text-base font-semibold">Ermittlungsprotokoll</h2>
        {log.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500 print:text-black">
              <tr>
                <th className="py-1">Zeit</th>
                <th>Verfasser</th>
                <th>Eintrag</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={i} className="border-t border-border align-top print:border-gray-400">
                  <td className="py-1 whitespace-nowrap">{isoDate(l.at)}</td>
                  <td className="py-1">{l.author || "–"}</td>
                  <td className="py-1 whitespace-pre-wrap">{l.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500 print:text-black">Keine Protokolleinträge.</p>
        )}
      </section>

      {/* Traces */}
      {traces.map((t, ti) => (
        <TraceSection key={t.id || ti} trace={t} index={ti + 1} />
      ))}

      {/* Manuelle Zusammenführungen */}
      {merges.length > 0 && (
        <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
          <h2 className="mb-2 text-base font-semibold">Manuell zusammengeführte Adressen</h2>
          <p className="mb-2 text-xs text-gray-500 print:text-black">
            Diese Zuordnungen wurden durch den Ermittler gesetzt und stammen nicht aus einer Heuristik.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {merges.map((group, i) => (
              <li key={i}>
                <span className="text-gray-400 print:text-black">{group.length} Adressen: </span>
                <span className="mono text-xs">{group.join(", ")}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Rechtshinweis */}
      <section className="card print:border-0 print:bg-white print:p-0 print:text-black">
        <h2 className="mb-2 text-base font-semibold">Hinweise</h2>
        <p className="text-sm">
          Alle Heuristiken (Clustering, Wechselgeld-Erkennung, Taint-Analyse) liefern Wahrscheinlichkeitsaussagen und
          keine Beweise. Angaben ohne Gewähr.
        </p>
        <p className="mt-2 text-sm">
          <span className="text-gray-400 print:text-black">Genutzte Datenquellen: </span>
          {summary.sources.length ? summary.sources.join(", ") : "keine erfasst"}
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------- Abschnitt je Trace */

function TraceSection({ trace, index }: { trace: CaseTrace; index: number }) {
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
        Trace {index}: {trace.name || trace.start}
      </h2>

      {/* Parameter */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Parameter</h3>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-gray-400 print:text-black">Startpunkt: </dt>
            <dd className="mono inline text-xs">{str(p?.start ?? trace.start)}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Chain: </dt>
            <dd className="inline">{chainMeta(chain).name}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Richtung: </dt>
            <dd className="inline">{DIRECTION_LABEL[str(p?.direction, "")] ?? str(p?.direction)}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Modus: </dt>
            <dd className="inline">{MODE_LABEL[str(p?.mode, "")] ?? str(p?.mode)}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Taint-Modell: </dt>
            <dd className="inline">{TAINT_LABEL[str(p?.taintModel, "")] ?? str(p?.taintModel)}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Maximale Tiefe: </dt>
            <dd className="inline">{str(p?.maxDepth)}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Durchgeführt: </dt>
            <dd className="inline">{isoDate(trace.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Statistik */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Statistik</h3>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-gray-400 print:text-black">Adressen: </dt>
            <dd className="inline">{r.stats?.addresses ?? 0}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Transaktionen: </dt>
            <dd className="inline">{r.stats?.txs ?? 0}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">API-Aufrufe: </dt>
            <dd className="inline">{r.stats?.apiCalls ?? 0}</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Dauer: </dt>
            <dd className="inline">{Math.round((r.stats?.durationMs ?? 0) / 100) / 10} s</dd>
          </div>
          <div>
            <dt className="inline text-gray-400 print:text-black">Abgeschnitten: </dt>
            <dd className="inline">{r.stats?.truncated ? "ja (Limit erreicht)" : "nein"}</dd>
          </div>
          {r.stats?.taintedOutSat !== undefined && (
            <div>
              <dt className="inline text-gray-400 print:text-black">Verunreinigter Abfluss: </dt>
              <dd className="inline">{formatAmount(r.stats.taintedOutSat, chain)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Datenquellen und Warnungen */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Verwendete Datenquellen</h3>
        <p className="text-sm">
          {providers.length ? providers.map(([n, c]) => `${n} (${c} Abfragen)`).join(", ") : "keine erfasst"}
        </p>
        {(r.warnings ?? []).length > 0 && (
          <>
            <h3 className="mt-2 mb-1 text-sm font-semibold">Warnungen</h3>
            <ul className="list-disc pl-5 text-sm text-yellow-400 print:text-black">
              {r.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Transaktionen */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Transaktionen ({txNodes.length})</h3>
        {txNodes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500 print:text-black">
                <tr>
                  <th className="py-1">Zeit</th>
                  <th>TXID</th>
                  <th>Ein/Aus</th>
                  <th>Volumen</th>
                  <th>Wert (EUR)</th>
                  <th>Hinweise</th>
                </tr>
              </thead>
              <tbody>
                {txNodes.map((n) => (
                  <tr key={n.id} className="border-t border-border align-top print:border-gray-400">
                    <td className="py-1 whitespace-nowrap">{formatDate(n.data.blockTime)}</td>
                    <td className="mono py-1 text-xs" title={n.data.txid}>
                      {shortHash(n.data.txid, 8)}
                    </td>
                    <td className="py-1 whitespace-nowrap">
                      {n.data.inputCount} / {n.data.outputCount}
                    </td>
                    <td className="py-1 whitespace-nowrap">{formatAmount(n.data.totalOutSat, chain)}</td>
                    <td className="py-1 whitespace-nowrap">
                      {n.data.priceEur ? formatFiat(n.data.totalOutSat, n.data.priceEur, chain) : "–"}
                    </td>
                    <td className="py-1 text-xs">{(n.data.hints ?? []).join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 print:text-black">Keine Transaktionen erfasst.</p>
        )}
      </div>

      {/* Herkunft von schädlichen Adressen */}
      {(r.riskSources ?? []).length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">
            Schädliche Adressen und belastete Flüsse ({(r.riskSources ?? []).length})
          </h3>
          <p className="mb-1 text-sm">
            Im Graph stammen {formatAmount(r.stats?.riskInflowSat ?? 0, chain, 5)} bei{" "}
            {r.stats?.riskAffected ?? 0} Adresse(n) aus gemeldeten Quellen.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500 print:text-black">
                <tr>
                  <th className="py-1">Gemeldete Adresse</th>
                  <th>Einstufung</th>
                  <th>Quelle</th>
                  <th className="text-right">weitergegeben</th>
                  <th className="text-right">betroffene Adressen</th>
                </tr>
              </thead>
              <tbody>
                {(r.riskSources ?? []).map((rs) => (
                  <tr key={rs.address} className="border-t border-border print:border-gray-400">
                    <td className="mono py-1 text-xs">{rs.address}</td>
                    <td>
                      {rs.label} ({rs.category ?? "auffällig"})
                    </td>
                    <td className="text-xs">{rs.source}</td>
                    <td className="text-right">{formatAmount(rs.outflowSat, chain, 5)}</td>
                    <td className="text-right">{rs.affectedAddresses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {affectedAddresses.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <h4 className="mb-1 text-sm font-semibold">Adressen mit belastetem Zufluss ({affectedAddresses.length})</h4>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500 print:text-black">
                  <tr>
                    <th className="py-1">Adresse</th>
                    <th className="text-right">belasteter Zufluss</th>
                    <th className="text-right">Anteil</th>
                    <th>Herkunft</th>
                  </tr>
                </thead>
                <tbody>
                  {affectedAddresses.map((n) => (
                    <tr key={n.id} className="border-t border-border print:border-gray-400">
                      <td className="mono py-1 text-xs">{n.data.address}</td>
                      <td className="text-right">{formatAmount(n.data.riskFromSat, chain, 5)}</td>
                      <td className="text-right">{formatPercent(n.data.riskFromRatio ?? 0, 0)}</td>
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
        <h3 className="mb-1 text-sm font-semibold">Auffällige Adressen ({notableAddresses.length})</h3>
        {notableAddresses.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500 print:text-black">
                <tr>
                  <th className="py-1">Adresse</th>
                  <th>Labels</th>
                  <th>Risiko</th>
                  <th>Empfangen</th>
                  <th>Taint-Anteil</th>
                  <th>Cluster</th>
                </tr>
              </thead>
              <tbody>
                {notableAddresses.map((n) => (
                  <tr key={n.id} className="border-t border-border align-top print:border-gray-400">
                    <td className="mono py-1 text-xs" title={n.data.address}>
                      {shortHash(n.data.address, 8)}
                      {n.data.isStart && <span className="ml-1 not-italic text-accent print:text-black">(Start)</span>}
                    </td>
                    <td className="py-1 text-xs">
                      {(n.data.labels ?? []).length
                        ? n.data.labels.map((l) => `${l.source}: ${l.label}`).join("; ")
                        : "–"}
                    </td>
                    <td className="py-1">{RISK_LABEL[n.data.risk] ?? n.data.risk}</td>
                    <td className="py-1 whitespace-nowrap">{formatAmount(n.data.receivedSat, chain)}</td>
                    <td className="py-1 whitespace-nowrap">
                      {n.data.taintRatio !== undefined ? formatPercent(n.data.taintRatio) : "–"}
                    </td>
                    <td className="py-1">{n.data.clusterId !== undefined ? `#${n.data.clusterId}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 print:text-black">Keine auffälligen Adressen.</p>
        )}
      </div>

      {/* Cluster */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Cluster ({(r.clusters ?? []).length})</h3>
        {(r.clusters ?? []).length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500 print:text-black">
              <tr>
                <th className="py-1">Nr.</th>
                <th>Adressen</th>
                <th>Bezeichnung</th>
                <th>Verhalten</th>
                <th>Empfangen</th>
                <th>Herkunft</th>
              </tr>
            </thead>
            <tbody>
              {r.clusters.map((c) => (
                <tr key={c.id} className="border-t border-border align-top print:border-gray-400">
                  <td className="py-1">#{c.id}</td>
                  <td className="py-1">{c.addresses?.length ?? 0}</td>
                  <td className="py-1">{c.label || "–"}</td>
                  <td className="py-1 text-xs">{(c.behavior ?? []).join(", ") || "–"}</td>
                  <td className="py-1 whitespace-nowrap">{formatAmount(c.totalReceivedSat, chain)}</td>
                  <td className="py-1 text-xs">{c.manual ? "manuell zusammengeführt" : "Heuristik"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500 print:text-black">Keine Cluster gebildet.</p>
        )}
      </div>

      {/* Peeling-Ketten */}
      {(r.peeling ?? []).length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Peeling-Ketten ({r.peeling.length})</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500 print:text-black">
              <tr>
                <th className="py-1">Nr.</th>
                <th>Schritte</th>
                <th>Abgezweigt</th>
                <th>Rest</th>
                <th>Erste TXID</th>
              </tr>
            </thead>
            <tbody>
              {r.peeling.map((chainEntry, i) => (
                <tr key={i} className="border-t border-border align-top print:border-gray-400">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{chainEntry.txids?.length ?? 0}</td>
                  <td className="py-1 whitespace-nowrap">{formatAmount(chainEntry.totalPeeledSat, chain)}</td>
                  <td className="py-1 whitespace-nowrap">{formatAmount(chainEntry.remainingSat, chain)}</td>
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
          <h3 className="mb-1 text-sm font-semibold">Aktivitätsmuster</h3>
          <p className="text-sm">
            Ausgewertet wurden {activity.total} Transaktionszeitpunkte. Geschätzte Zeitzone:{" "}
            {activity.guessedUtcOffset !== undefined
              ? `UTC${activity.guessedUtcOffset >= 0 ? "+" : ""}${activity.guessedUtcOffset}`
              : "nicht bestimmbar"}
            {activity.guessedRegion ? ` (${activity.guessedRegion})` : ""}. Erste Aktivität:{" "}
            {formatDate(activity.firstSeen)}, letzte Aktivität: {formatDate(activity.lastSeen)}.
          </p>
        </div>
      )}
    </section>
  );
}
