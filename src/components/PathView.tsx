"use client";

import Link from "next/link";
import { useState } from "react";
import TraceGraph, { EMPTY_VIEW, type GraphOptions } from "./TraceGraph";
import LabelBadges from "./LabelBadges";
import { formatAmount, formatDate, formatFiat, shortHash } from "@/lib/format";
import { CHAIN_LIST, chainMeta, type ChainId } from "@/lib/chains";
import { categoryText } from "@/lib/trace/risk";
import type { AddressNodeData, TraceNode, TraceResult } from "@/lib/trace/types";

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
      setError(err instanceof Error ? err.message : String(err));
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
        name: `Verbindung ${shortHash(params.from, 5)} → ${shortHash(params.to, 5)}`,
        start: params.from,
        chain: params.chain,
        params: { ...params, mode: "path" },
        result: result.graph,
      }),
    });
    const json = await res.json();
    setSaveMsg(res.ok ? "Als Fall gespeichert." : json.error || "Fehler");
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
          <label className="label">Von (Startadresse)</label>
          <input
            className="input mono"
            value={params.from}
            onChange={(e) => setParams({ ...params, from: e.target.value })}
            spellCheck={false}
            required
          />
        </div>
        <div className="col-span-2 md:col-span-4 lg:col-span-3">
          <label className="label">Nach (Zieladresse)</label>
          <input
            className="input mono"
            value={params.to}
            onChange={(e) => setParams({ ...params, to: e.target.value })}
            spellCheck={false}
            required
          />
        </div>
        <div>
          <label className="label">Chain</label>
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
          <button type="button" className="btn-secondary w-full justify-center" onClick={swap} title="Richtung tauschen">
            ⇅ tauschen
          </button>
        </div>
        <div>
          <label className="label">Tiefe je Seite</label>
          <input className="input" type="number" min={1} max={5} value={params.maxDepth} onChange={num("maxDepth")} />
        </div>
        <div>
          <label className="label">Tx / Adresse</label>
          <input className="input" type="number" min={1} max={30} value={params.maxTxPerAddress} onChange={num("maxTxPerAddress")} />
        </div>
        <div>
          <label className="label">Adr. / Tx</label>
          <input className="input" type="number" min={1} max={30} value={params.maxAddrPerTx} onChange={num("maxAddrPerTx")} />
        </div>
        <div>
          <label className="label">Min. {meta.unit}</label>
          <input className="input" type="number" min={0} value={params.minValueSat} onChange={num("minValueSat")} />
        </div>
        <div>
          <label className="label">Max. Abfragen</label>
          <input className="input" type="number" min={10} max={500} value={params.maxApiCalls} onChange={num("maxApiCalls")} />
        </div>
        <div>
          <label className="label">Max. Wege</label>
          <input className="input" type="number" min={1} max={20} value={params.maxPaths} onChange={num("maxPaths")} />
        </div>
        <div className="col-span-2 flex flex-wrap items-end gap-3 text-sm md:col-span-4 lg:col-span-8">
          <button className="btn" disabled={loading || !params.from || !params.to}>
            {loading ? "Suche läuft…" : "Verbindung suchen"}
          </button>
          <label className="flex items-center gap-1" title="Nur Wege, bei denen das Geld tatsächlich von A nach B fließt">
            <input type="checkbox" checked={params.directed} onChange={(e) => setParams({ ...params, directed: e.target.checked })} />
            nur in Flussrichtung
          </label>
          <label className="flex items-center gap-1" title="Börsen und andere Umschlagplätze nicht weiterverfolgen">
            <input type="checkbox" checked={params.skipHubs} onChange={(e) => setParams({ ...params, skipHubs: e.target.checked })} />
            Umschlagplätze überspringen
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={params.enrich} onChange={(e) => setParams({ ...params, enrich: e.target.checked })} />
            Labels laden
          </label>
          {loading && (
            <span className="text-xs text-gray-400">
              Je nach Tiefe und Rate-Limits kann die Suche einige Minuten dauern.
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
                {result.paths.length} Verbindung(en) gefunden · kürzester Weg: {result.paths[0].hops.length} Schritt(e)
              </span>
            ) : (
              <span className="font-semibold text-yellow-400">Keine Verbindung im gesuchten Rahmen gefunden</span>
            )}
            <span className="text-gray-400">
              {result.stats.apiCalls} Abfragen · {result.stats.addressesExpanded} Adressen geprüft ·{" "}
              {(result.stats.durationMs / 1000).toFixed(1)} s
              {result.stats.hubsSkipped > 0 && ` · ${result.stats.hubsSkipped} Umschlagplätze übersprungen`}
            </span>
            {result.stats.exhausted && (
              <span className="text-yellow-400">Abfragebudget aufgebraucht – Grenze erhöhen für eine tiefere Suche</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button className="btn-secondary" type="button" onClick={exportJson}>
                Export JSON
              </button>
              {loggedIn && result.found && (
                <>
                  <button className="btn-secondary" type="button" onClick={saveAsCase}>
                    Als Fall speichern
                  </button>
                  {saveMsg && <span className="text-xs text-gray-400">{saveMsg}</span>}
                </>
              )}
            </span>
          </div>

          {!result.found && (
            <div className="card text-sm text-gray-300">
              <p className="mb-2">Das bedeutet nicht, dass es keine Verbindung gibt. Mögliche Gründe:</p>
              <ul className="list-disc space-y-1 pl-5 text-gray-400">
                <li>Die Verbindung ist länger als {params.maxDepth * 2} Schritte.</li>
                <li>Der Weg führt über eine Börse; mit &bdquo;Umschlagplätze überspringen&ldquo; wird er nicht verfolgt.</li>
                <li>
                  Das Geld floss in die andere Richtung. Mit &bdquo;⇅ tauschen&ldquo; oder ohne &bdquo;nur in Flussrichtung&ldquo; erneut suchen.
                </li>
                <li>Das Abfragebudget war zu knapp. Tiefe oder maximale Abfragen erhöhen.</li>
                <li>Kleine Beträge wurden ausgefiltert. Mindestbetrag senken.</li>
              </ul>
              {result.warnings.length > 0 && (
                <div className="mt-3">
                  <div className="font-medium text-yellow-400">Hinweise während der Suche</div>
                  <ul className="list-disc pl-5 text-xs text-gray-400">
                    {result.warnings.slice(0, 5).map((w, i) => (
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
                    &#9888; {result.graph.riskSources.length} als schädlich eingestufte Adresse(n) auf den gefundenen Wegen:
                  </span>{" "}
                  {result.graph.riskSources.map((r) => `${r.label} (${categoryText(r.category)})`).join(", ")}
                </div>
              )}

              <div className="space-y-3">
                {result.paths.map((p, i) => (
                  <div key={i} className="card">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold">
                        Weg {i + 1}: {p.hops.length} Schritt(e)
                      </h3>
                      <span className="text-sm text-gray-400">
                        Engstelle {formatAmount(p.bottleneckSat, params.chain, 5)}
                        {result.graph.priceEur !== undefined &&
                          ` (${formatFiat(p.bottleneckSat, result.graph.priceEur, params.chain)})`}
                      </span>
                      {p.firstSeen && (
                        <span className="text-sm text-gray-400">
                          {formatDate(p.firstSeen)} → {formatDate(p.lastSeen)}
                        </span>
                      )}
                    </div>
                    <ol className="space-y-2">
                      {p.hops.map((h, k) => {
                        const fromNode = addrNode(h.from);
                        const toNode = addrNode(h.to);
                        return (
                          <li key={k} className="flex flex-wrap items-center gap-2 border-l-2 border-border pl-3 text-sm">
                            <span className="text-xs text-gray-500">{k + 1}.</span>
                            <Link href={`/address/${h.from}?chain=${params.chain}`} className="mono text-xs hover:text-accent" title={h.from}>
                              {shortHash(h.from, 6)}
                            </Link>
                            {fromNode?.isRiskSource && (
                              <span className="rounded bg-red-700 px-1 text-[9px] text-white">&#9888; schädlich</span>
                            )}
                            {fromNode && fromNode.labels.length > 0 && <LabelBadges labels={fromNode.labels.slice(0, 1)} compact />}
                            <span className="text-gray-500">→</span>
                            <Link href={`/tx/${h.txid}?chain=${params.chain}`} className="mono text-xs text-gray-400 hover:text-accent" title={h.txid}>
                              tx {shortHash(h.txid, 5)}
                            </Link>
                            <span className="text-gray-500">→</span>
                            <Link href={`/address/${h.to}?chain=${params.chain}`} className="mono text-xs hover:text-accent" title={h.to}>
                              {shortHash(h.to, 6)}
                            </Link>
                            {toNode?.isRiskSource && (
                              <span className="rounded bg-red-700 px-1 text-[9px] text-white">&#9888; schädlich</span>
                            )}
                            {toNode && toNode.labels.length > 0 && <LabelBadges labels={toNode.labels.slice(0, 1)} compact />}
                            <span className="ml-auto whitespace-nowrap">
                              {formatAmount(h.valueSat, params.chain, 5)}
                              <span className="ml-2 text-xs text-gray-500">{formatDate(h.blockTime)}</span>
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
                        Vom Start weiterverfolgen
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button className="btn-secondary" onClick={() => setShowGraph(!showGraph)}>
                  {showGraph ? "Graph ausblenden" : "Als Graph anzeigen"}
                </button>
                {selected?.data.type === "address" && (
                  <span className="mono text-xs text-gray-400">{selected.data.address}</span>
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
