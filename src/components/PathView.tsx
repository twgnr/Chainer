"use client";

import Link from "next/link";
import { useState } from "react";
import TraceGraph, { EMPTY_VIEW, type GraphOptions } from "./TraceGraph";
import LabelBadges from "./LabelBadges";
import { shortHash } from "@/lib/format";
import { CHAIN_LIST, chainMeta, type ChainId } from "@/lib/chains";
import { categoryText } from "@/lib/trace/risk";
import type { AddressNodeData, TraceNode, TraceResult } from "@/lib/trace/types";
import { useFormatters, useLocale, useT } from "@/lib/i18n/provider";
import { COMMON } from "@/lib/i18n/labels";
import { translateHint, translateHints } from "@/lib/i18n/hints";

const TXT = {
  en: {
    caseName: (from: string, to: string) => `Connection ${from} → ${to}`,
    savedAsCase: "Saved as a case.",
    from: "From (start address)",
    to: "To (destination address)",
    chain: "Chain",
    swapTitle: "Swap the direction",
    swap: "⇅ swap",
    depthPerSide: "Depth per side",
    txPerAddress: "Tx / address",
    addrPerTx: "Addr. / tx",
    minUnit: (unit: string) => `Min. ${unit}`,
    maxQueries: "Max. queries",
    maxPaths: "Max. paths",
    searching: "Search running…",
    search: "Find a connection",
    directedTitle: "Only paths where the money actually flows from A to B",
    directed: "in the direction of flow only",
    skipHubsTitle: "Do not follow exchanges and other hubs",
    skipHubs: "skip hubs",
    loadLabels: "load labels",
    mayTakeMinutes: "Depending on depth and rate limits the search can take a few minutes.",
    foundCount: (paths: number, shortest: number) =>
      `${paths} connection${paths === 1 ? "" : "s"} found · shortest path: ${shortest} step${shortest === 1 ? "" : "s"}`,
    notFound: "No connection found within the given limits",
    stats: (calls: number, addresses: number, seconds: string) =>
      `${calls} queries · ${addresses} addresses checked · ${seconds} s`,
    hubsSkipped: (n: number) => ` · ${n} hubs skipped`,
    exhausted: "Query budget used up – raise the limit for a deeper search",
    exportJson: "Export JSON",
    saveAsCase: "Save as a case",
    notFoundLead: "That does not mean there is no connection. Possible reasons:",
    reasonLonger: (steps: number) => `The connection is longer than ${steps} steps.`,
    reasonHub: "The path runs through an exchange; with “skip hubs” it is not followed.",
    reasonDirection: "The money flowed the other way. Search again with “⇅ swap”, or without “in the direction of flow only”.",
    reasonBudget: "The query budget was too small. Raise the depth or the maximum number of queries.",
    reasonMinValue: "Small amounts were filtered out. Lower the minimum amount.",
    warningsTitle: "Notes during the search",
    riskOnPaths: (n: number) => `${n} address${n === 1 ? "" : "es"} classified as harmful on the paths found:`,
    pathTitle: (index: number, steps: number) => `Path ${index}: ${steps} step${steps === 1 ? "" : "s"}`,
    bottleneck: "Bottleneck",
    harmful: "harmful",
    followFromStart: "Follow on from the start",
    hideGraph: "Hide the graph",
    showGraph: "Show as a graph",
  },
  de: {
    caseName: (from: string, to: string) => `Verbindung ${from} → ${to}`,
    savedAsCase: "Als Fall gespeichert.",
    from: "Von (Startadresse)",
    to: "Nach (Zieladresse)",
    chain: "Chain",
    swapTitle: "Richtung tauschen",
    swap: "⇅ tauschen",
    depthPerSide: "Tiefe je Seite",
    txPerAddress: "Tx / Adresse",
    addrPerTx: "Adr. / Tx",
    minUnit: (unit: string) => `Min. ${unit}`,
    maxQueries: "Max. Abfragen",
    maxPaths: "Max. Wege",
    searching: "Suche läuft…",
    search: "Verbindung suchen",
    directedTitle: "Nur Wege, bei denen das Geld tatsächlich von A nach B fließt",
    directed: "nur in Flussrichtung",
    skipHubsTitle: "Börsen und andere Umschlagplätze nicht weiterverfolgen",
    skipHubs: "Umschlagplätze überspringen",
    loadLabels: "Labels laden",
    mayTakeMinutes: "Je nach Tiefe und Rate-Limits kann die Suche einige Minuten dauern.",
    foundCount: (paths: number, shortest: number) =>
      `${paths} Verbindung(en) gefunden · kürzester Weg: ${shortest} Schritt(e)`,
    notFound: "Keine Verbindung im gesuchten Rahmen gefunden",
    stats: (calls: number, addresses: number, seconds: string) =>
      `${calls} Abfragen · ${addresses} Adressen geprüft · ${seconds} s`,
    hubsSkipped: (n: number) => ` · ${n} Umschlagplätze übersprungen`,
    exhausted: "Abfragebudget aufgebraucht – Grenze erhöhen für eine tiefere Suche",
    exportJson: "Export JSON",
    saveAsCase: "Als Fall speichern",
    notFoundLead: "Das bedeutet nicht, dass es keine Verbindung gibt. Mögliche Gründe:",
    reasonLonger: (steps: number) => `Die Verbindung ist länger als ${steps} Schritte.`,
    reasonHub: "Der Weg führt über eine Börse; mit „Umschlagplätze überspringen“ wird er nicht verfolgt.",
    reasonDirection:
      "Das Geld floss in die andere Richtung. Mit „⇅ tauschen“ oder ohne „nur in Flussrichtung“ erneut suchen.",
    reasonBudget: "Das Abfragebudget war zu knapp. Tiefe oder maximale Abfragen erhöhen.",
    reasonMinValue: "Kleine Beträge wurden ausgefiltert. Mindestbetrag senken.",
    warningsTitle: "Hinweise während der Suche",
    riskOnPaths: (n: number) => `${n} als schädlich eingestufte Adresse(n) auf den gefundenen Wegen:`,
    pathTitle: (index: number, steps: number) => `Weg ${index}: ${steps} Schritt(e)`,
    bottleneck: "Engstelle",
    harmful: "schädlich",
    followFromStart: "Vom Start weiterverfolgen",
    hideGraph: "Graph ausblenden",
    showGraph: "Als Graph anzeigen",
  },
};

interface PathHop {
  txid: string;
  blockTime?: number;
  from: string;
  to: string;
  valueSat: number;
}

interface FoundPath {
  hops: PathHop[];
  bottleneckSat: number;
  firstSeen?: number;
  lastSeen?: number;
}

interface PathResponse {
  found: boolean;
  paths: FoundPath[];
  graph: TraceResult;
  stats: { apiCalls: number; addressesExpanded: number; durationMs: number; exhausted: boolean; hubsSkipped: number };
  warnings: string[];
  providersUsed: Record<string, number>;
}

interface Params {
  from: string;
  to: string;
  chain: ChainId;
  maxDepth: number;
  maxTxPerAddress: number;
  maxAddrPerTx: number;
  minValueSat: number;
  maxApiCalls: number;
  maxPaths: number;
  directed: boolean;
  skipHubs: boolean;
  enrich: boolean;
}

export default function PathView({
  initialFrom,
  initialTo,
  initialChain,
  loggedIn,
}: {
  initialFrom: string;
  initialTo: string;
  initialChain: ChainId;
  loggedIn: boolean;
}) {
  const [params, setParams] = useState<Params>({
    from: initialFrom,
    to: initialTo,
    chain: initialChain,
    maxDepth: 3,
    maxTxPerAddress: 8,
    maxAddrPerTx: 6,
    minValueSat: 1000,
    maxApiCalls: 120,
    maxPaths: 5,
    directed: true,
    skipHubs: true,
    enrich: true,
  });
  const [result, setResult] = useState<PathResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TraceNode | null>(null);
  const [showGraph, setShowGraph] = useState(true);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const t = useT(TXT);
  const c = useT(COMMON);
  const locale = useLocale();
  const fmt = useFormatters();
  const meta = chainMeta(params.chain);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(null);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setResult(json);
    } catch (err) {
      setError(translateHint(err instanceof Error ? err.message : String(err), locale));
    } finally {
      setLoading(false);
    }
  }

  function swap() {
    setParams({ ...params, from: params.to, to: params.from });
  }

  async function saveAsCase() {
    if (!result) return;
    setSaveMsg(null);
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: t.caseName(shortHash(params.from, 5), shortHash(params.to, 5)),
        start: params.from,
        chain: params.chain,
        params: { ...params, mode: "path" },
        result: result.graph,
      }),
    });
    const json = await res.json();
    setSaveMsg(res.ok ? t.savedAsCase : json.error || c.error);
  }

  function exportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chainer-verbindung-${shortHash(params.from, 5)}-${shortHash(params.to, 5)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const graphOpts: GraphOptions = {
    rankdir: "LR",
    colorByCluster: false,
    hideChange: false,
    showFiat: true,
    showTaint: false,
    showRisk: true,
    onlyRisk: false,
    priceEur: result?.graph.priceEur,
  };

  const num = (k: keyof Params) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setParams({ ...params, [k]: Number(e.target.value) });

  const addrNode = (address: string): AddressNodeData | undefined => {
    const n = result?.graph.nodes.find((x) => x.id === `a:${address}`);
    return n?.data.type === "address" ? n.data : undefined;
  };

  return (
    <div className="space-y-4">
      <form className="card grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8" onSubmit={run}>
        <div className="col-span-2 md:col-span-4 lg:col-span-3">
          <label className="label">{t.from}</label>
          <input
            className="input mono"
            value={params.from}
            onChange={(e) => setParams({ ...params, from: e.target.value })}
            spellCheck={false}
            required
          />
        </div>
        <div className="col-span-2 md:col-span-4 lg:col-span-3">
          <label className="label">{t.to}</label>
          <input
            className="input mono"
            value={params.to}
            onChange={(e) => setParams({ ...params, to: e.target.value })}
            spellCheck={false}
            required
          />
        </div>
        <div>
          <label className="label">{t.chain}</label>
          <select
            className="input"
            value={params.chain}
            onChange={(e) => setParams({ ...params, chain: e.target.value as ChainId })}
          >
            {CHAIN_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.symbol}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" className="btn-secondary w-full justify-center" onClick={swap} title={t.swapTitle}>
            {t.swap}
          </button>
        </div>
        <div>
          <label className="label">{t.depthPerSide}</label>
          <input className="input" type="number" min={1} max={5} value={params.maxDepth} onChange={num("maxDepth")} />
        </div>
        <div>
          <label className="label">{t.txPerAddress}</label>
          <input className="input" type="number" min={1} max={30} value={params.maxTxPerAddress} onChange={num("maxTxPerAddress")} />
        </div>
        <div>
          <label className="label">{t.addrPerTx}</label>
          <input className="input" type="number" min={1} max={30} value={params.maxAddrPerTx} onChange={num("maxAddrPerTx")} />
        </div>
        <div>
          <label className="label">{t.minUnit(meta.unit)}</label>
          <input className="input" type="number" min={0} value={params.minValueSat} onChange={num("minValueSat")} />
        </div>
        <div>
          <label className="label">{t.maxQueries}</label>
          <input className="input" type="number" min={10} max={500} value={params.maxApiCalls} onChange={num("maxApiCalls")} />
        </div>
        <div>
          <label className="label">{t.maxPaths}</label>
          <input className="input" type="number" min={1} max={20} value={params.maxPaths} onChange={num("maxPaths")} />
        </div>
        <div className="col-span-2 flex flex-wrap items-end gap-3 text-sm md:col-span-4 lg:col-span-8">
          <button className="btn" disabled={loading || !params.from || !params.to}>
            {loading ? t.searching : t.search}
          </button>
          <label className="flex items-center gap-1" title={t.directedTitle}>
            <input type="checkbox" checked={params.directed} onChange={(e) => setParams({ ...params, directed: e.target.checked })} />
            {t.directed}
          </label>
          <label className="flex items-center gap-1" title={t.skipHubsTitle}>
            <input type="checkbox" checked={params.skipHubs} onChange={(e) => setParams({ ...params, skipHubs: e.target.checked })} />
            {t.skipHubs}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={params.enrich} onChange={(e) => setParams({ ...params, enrich: e.target.checked })} />
            {t.loadLabels}
          </label>
          {loading && (
            <span className="text-xs text-muted">
              {t.mayTakeMinutes}
            </span>
          )}
        </div>
      </form>

      {error && <div className="card border-red-500 text-red-300">{error}</div>}

      {result && (
        <>
          <div
            className={`card flex flex-wrap items-center gap-x-6 gap-y-2 text-sm ${
              result.found ? "border-green-600/60" : "border-yellow-600/60"
            }`}
          >
            {result.found ? (
              <span className="font-semibold text-green-400">
                {t.foundCount(result.paths.length, result.paths[0].hops.length)}
              </span>
            ) : (
              <span className="font-semibold text-yellow-400">{t.notFound}</span>
            )}
            <span className="text-muted">
              {t.stats(
                result.stats.apiCalls,
                result.stats.addressesExpanded,
                fmt.number(result.stats.durationMs / 1000, 1),
              )}
              {result.stats.hubsSkipped > 0 && t.hubsSkipped(result.stats.hubsSkipped)}
            </span>
            {result.stats.exhausted && (
              <span className="text-yellow-400">{t.exhausted}</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button className="btn-secondary" type="button" onClick={exportJson}>
                {t.exportJson}
              </button>
              {loggedIn && result.found && (
                <>
                  <button className="btn-secondary" type="button" onClick={saveAsCase}>
                    {t.saveAsCase}
                  </button>
                  {saveMsg && <span className="text-xs text-muted">{saveMsg}</span>}
                </>
              )}
            </span>
          </div>

          {!result.found && (
            <div className="card text-sm text-fg-2">
              <p className="mb-2">{t.notFoundLead}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li>{t.reasonLonger(params.maxDepth * 2)}</li>
                <li>{t.reasonHub}</li>
                <li>{t.reasonDirection}</li>
                <li>{t.reasonBudget}</li>
                <li>{t.reasonMinValue}</li>
              </ul>
              {result.warnings.length > 0 && (
                <div className="mt-3">
                  <div className="font-medium text-yellow-400">{t.warningsTitle}</div>
                  <ul className="list-disc pl-5 text-xs text-muted">
                    {translateHints(result.warnings.slice(0, 5), locale).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {result.found && (
            <>
              {result.graph.riskSources.length > 0 && (
                <div className="rounded-lg border border-red-500/70 bg-red-950/40 p-3 text-sm">
                  <span className="font-semibold text-red-300">
                    &#9888; {t.riskOnPaths(result.graph.riskSources.length)}
                  </span>{" "}
                  {result.graph.riskSources
                    .map((r) => `${translateHint(r.label, locale)} (${categoryText(r.category, locale)})`)
                    .join(", ")}
                </div>
              )}

              <div className="space-y-3">
                {result.paths.map((p, i) => (
                  <div key={i} className="card">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold">
                        {t.pathTitle(i + 1, p.hops.length)}
                      </h3>
                      <span className="text-sm text-muted">
                        {t.bottleneck} {fmt.amount(p.bottleneckSat, params.chain, 5)}
                        {result.graph.priceEur !== undefined &&
                          ` (${fmt.fiat(p.bottleneckSat, result.graph.priceEur, params.chain)})`}
                      </span>
                      {p.firstSeen && (
                        <span className="text-sm text-muted">
                          {fmt.date(p.firstSeen)} → {fmt.date(p.lastSeen)}
                        </span>
                      )}
                    </div>
                    <ol className="space-y-2">
                      {p.hops.map((h, k) => {
                        const fromNode = addrNode(h.from);
                        const toNode = addrNode(h.to);
                        return (
                          <li key={k} className="flex flex-wrap items-center gap-2 border-l-2 border-border pl-3 text-sm">
                            <span className="text-xs text-subtle">{k + 1}.</span>
                            <Link href={`/address/${h.from}?chain=${params.chain}`} className="mono text-xs hover:text-brand" title={h.from}>
                              {shortHash(h.from, 6)}
                            </Link>
                            {fromNode?.isRiskSource && (
                              <span className="rounded bg-red-700 px-1 text-[9px] text-white">&#9888; {t.harmful}</span>
                            )}
                            {fromNode && fromNode.labels.length > 0 && <LabelBadges labels={fromNode.labels.slice(0, 1)} compact />}
                            <span className="text-subtle">→</span>
                            <Link href={`/tx/${h.txid}?chain=${params.chain}`} className="mono text-xs text-muted hover:text-brand" title={h.txid}>
                              tx {shortHash(h.txid, 5)}
                            </Link>
                            <span className="text-subtle">→</span>
                            <Link href={`/address/${h.to}?chain=${params.chain}`} className="mono text-xs hover:text-brand" title={h.to}>
                              {shortHash(h.to, 6)}
                            </Link>
                            {toNode?.isRiskSource && (
                              <span className="rounded bg-red-700 px-1 text-[9px] text-white">&#9888; {t.harmful}</span>
                            )}
                            {toNode && toNode.labels.length > 0 && <LabelBadges labels={toNode.labels.slice(0, 1)} compact />}
                            <span className="ml-auto whitespace-nowrap">
                              {fmt.amount(h.valueSat, params.chain, 5)}
                              <span className="ml-2 text-xs text-subtle">{fmt.date(h.blockTime)}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="mt-2 flex gap-2">
                      <Link
                        className="btn-secondary"
                        href={`/trace?start=${p.hops[0].from}&chain=${params.chain}&direction=forward`}
                      >
                        {t.followFromStart}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button className="btn-secondary" onClick={() => setShowGraph(!showGraph)}>
                  {showGraph ? t.hideGraph : t.showGraph}
                </button>
                {selected?.data.type === "address" && (
                  <span className="mono text-xs text-muted">{selected.data.address}</span>
                )}
              </div>

              {showGraph && (
                <TraceGraph
                  result={result.graph}
                  opts={graphOpts}
                  view={EMPTY_VIEW}
                  selectedId={selected?.id ?? null}
                  onSelect={(n) => setSelected(n)}
                  height="60vh"
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
