"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import TraceGraph, { EMPTY_VIEW, clusterColor, type GraphOptions, type GraphViewState } from "./TraceGraph";
import TraceTimeline from "./TraceTimeline";
import ActivityHeatmap from "./ActivityHeatmap";
import LabelBadges from "./LabelBadges";
import { DEFAULT_PARAMS, type TraceNode, type TraceParams, type TraceProgress, type TraceResult } from "@/lib/trace/types";
import { formatAmount, formatDate, formatFiat, formatPercent, shortHash } from "@/lib/format";
import { CHAIN_LIST, chainMeta, type ChainId } from "@/lib/chains";
import { categoryText } from "@/lib/trace/risk";

interface Props {
  initialStart?: string;
  initialChain?: ChainId;
  initialDirection?: TraceParams["direction"];
  initialResult?: TraceResult | null;
  initialView?: GraphViewState;
  initialMerges?: string[][];
  loggedIn: boolean;
  autoRun?: boolean;
  /** Wenn gesetzt, wird in diesen Fall gespeichert statt einen neuen anzulegen */
  caseId?: string;
  canWrite?: boolean;
}

type Tab = "graph" | "timeline" | "patterns" | "risk" | "forensics";

export default function TraceView({
  initialStart = "",
  initialChain,
  initialDirection,
  initialResult = null,
  initialView,
  initialMerges,
  loggedIn,
  autoRun,
  caseId,
  canWrite = true,
}: Props) {
  const [params, setParams] = useState<TraceParams>({
    ...DEFAULT_PARAMS,
    start: initialStart,
    chain: initialChain || DEFAULT_PARAMS.chain,
    direction: initialDirection || DEFAULT_PARAMS.direction,
    ...(initialResult?.params || {}),
    merges: initialMerges || initialResult?.params?.merges,
  });
  const [result, setResult] = useState<TraceResult | null>(initialResult);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<TraceProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TraceNode | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("graph");
  const [view, setView] = useState<GraphViewState>(initialView || EMPTY_VIEW);
  const [opts, setOpts] = useState<GraphOptions>({
    rankdir: "LR",
    colorByCluster: true,
    hideChange: false,
    showFiat: true,
    showTaint: true,
    showRisk: true,
    onlyRisk: false,
  });
  const [moreStarts, setMoreStarts] = useState((initialResult?.params?.starts ?? []).join("\n"));
  const [saveName, setSaveName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ---------------- Trace ausführen (Streaming) ---------------- */
  const run = useCallback(async (p: TraceParams) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setSelected(null);
    setSelectedCluster(null);
    setProgress(null);
    try {
      const res = await fetch("/api/trace/stream", {
        method: "POST",
        body: JSON.stringify(p),
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error || "Anfrage fehlgeschlagen");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as Omit<TraceProgress, "phase"> & { phase: TraceProgress["phase"] | "error"; result?: TraceResult };
          if (evt.phase === "error") throw new Error(evt.message);
          setProgress(evt as TraceProgress);
          if (evt.result) {
            setResult(evt.result);
            setParams(p);
            // Ansicht auf neue Knoten zurücksetzen, Kommentare behalten
            setView((v) => ({ ...v, hidden: [], collapsedClusters: [], positions: {} }));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!autoRun || !initialStart || initialResult) return;
    const t = setTimeout(() => run({ ...params, start: initialStart }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ---------------- Speichern ---------------- */
  async function save() {
    if (!result) return;
    setMsg(null);
    const body = caseId
      ? { addTrace: { name: saveName || `Trace ${shortHash(params.start, 6)}`, start: params.start, chain: params.chain, params, result } }
      : { name: saveName || `Trace ${shortHash(params.start, 6)}`, start: params.start, chain: params.chain, params, result };
    const res = await fetch(caseId ? `/api/cases/${caseId}` : "/api/cases", {
      method: caseId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMsg(res.ok ? (caseId ? "Zum Fall hinzugefügt." : "Als neuer Fall gespeichert.") : json.error || "Fehler");
  }

  async function saveView(next: GraphViewState, merges?: string[][]) {
    if (!caseId || !canWrite) return;
    await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ view: next, ...(merges ? { merges } : {}) }),
    }).catch(() => {});
  }

  function exportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chainer-trace-${shortHash(params.start, 6)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------------- Graph-Bearbeitung ---------------- */
  const updateView = (fn: (v: GraphViewState) => GraphViewState) => {
    setView((v) => {
      const next = fn(v);
      void saveView(next);
      return next;
    });
  };
  const hideNode = (id: string) => {
    updateView((v) => ({ ...v, hidden: [...new Set([...v.hidden, id])] }));
    setSelected(null);
  };
  const toggleCluster = (id: number) =>
    updateView((v) => ({
      ...v,
      collapsedClusters: v.collapsedClusters.includes(id)
        ? v.collapsedClusters.filter((c) => c !== id)
        : [...v.collapsedClusters, id],
    }));
  const setComment = (id: string, text: string) =>
    updateView((v) => {
      const comments = { ...v.comments };
      if (text.trim()) comments[id] = text.trim();
      else delete comments[id];
      return { ...v, comments };
    });
  const moveNode = (id: string, position: { x: number; y: number }) =>
    setView((v) => {
      const next = { ...v, positions: { ...v.positions, [id]: position } };
      void saveView(next);
      return next;
    });

  /** Zwei Adressen manuell demselben Cluster zuordnen und neu berechnen */
  async function mergeAddresses(addresses: string[]) {
    const merges = [...(params.merges || []), addresses];
    const next = { ...params, merges };
    setParams(next);
    if (caseId && canWrite) await saveView(view, merges);
    await run(next);
  }

  const num = (k: keyof TraceParams) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setParams({ ...params, [k]: Number(e.target.value) });
  const selectedId = selected?.id ?? (selectedCluster ? `c:${selectedCluster}` : null);
  const connected = selected && result ? result.edges.filter((e) => e.source === selected.id || e.target === selected.id) : [];
  const graphOpts: GraphOptions = { ...opts, priceEur: result?.priceEur };
  const chain = result?.params.chain ?? params.chain;
  const meta = chainMeta(chain);
  const showTaint = (result?.params.taintModel ?? params.taintModel) !== "none";
  const cluster = selectedCluster ? result?.clusters.find((c) => c.id === selectedCluster) : null;

  return (
    <div className="space-y-4">
      {/* ------------- Parameter ------------- */}
      <form
        className="card grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8"
        onSubmit={(e) => {
          e.preventDefault();
          const extra = moreStarts
            .split(/[\n,;]/)
            .map((x) => x.trim())
            .filter(Boolean);
          run({ ...params, starts: extra.length ? extra : undefined });
        }}
      >
        <div className="col-span-2 md:col-span-4 lg:col-span-3">
          <label className="label">Start (Adresse oder Transaktions-ID)</label>
          <input
            className="input mono"
            value={params.start}
            onChange={(e) => setParams({ ...params, start: e.target.value })}
            spellCheck={false}
          />
        </div>
        <div className="col-span-2 md:col-span-4 lg:col-span-3">
          <label className="label">
            Weitere Startpunkte (eine je Zeile, optional)
          </label>
          <textarea
            className="input mono"
            rows={2}
            value={moreStarts}
            onChange={(e) => setMoreStarts(e.target.value)}
            placeholder="z. B. weitere Opferadressen"
            spellCheck={false}
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
                {c.name} ({c.symbol})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Modus</label>
          <select
            className="input"
            value={params.mode}
            onChange={(e) => setParams({ ...params, mode: e.target.value as TraceParams["mode"] })}
            title="Adressbasiert verfolgt alle Transaktionen einer Adresse. UTXO-genau folgt nur den konkreten Coins."
          >
            <option value="address">adressbasiert</option>
            <option value="utxo">UTXO-genau</option>
          </select>
        </div>
        <div>
          <label className="label">Richtung</label>
          <select
            className="input"
            value={params.direction}
            onChange={(e) => setParams({ ...params, direction: e.target.value as TraceParams["direction"] })}
          >
            <option value="forward">Vorwärts (wohin?)</option>
            <option value="backward">Rückwärts (woher?)</option>
            <option value="both">Beide</option>
          </select>
        </div>
        <div>
          <label className="label">Taint-Modell</label>
          <select
            className="input"
            value={params.taintModel}
            onChange={(e) => setParams({ ...params, taintModel: e.target.value as TraceParams["taintModel"] })}
            title="Haircut: anteilig. Poison: alles verunreinigt. FIFO: Reihenfolge-basiert."
          >
            <option value="haircut">Haircut (anteilig)</option>
            <option value="fifo">FIFO (Reihenfolge)</option>
            <option value="poison">Poison (streng)</option>
            <option value="none">keine</option>
          </select>
        </div>
        <div>
          <label className="label">Tiefe</label>
          <input className="input" type="number" min={1} max={8} value={params.maxDepth} onChange={num("maxDepth")} />
        </div>
        <div>
          <label className="label">Tx / Adresse</label>
          <input className="input" type="number" min={1} max={50} value={params.maxTxPerAddress} onChange={num("maxTxPerAddress")} />
        </div>
        <div>
          <label className="label">Adr. / Tx</label>
          <input className="input" type="number" min={1} max={50} value={params.maxAddrPerTx} onChange={num("maxAddrPerTx")} />
        </div>
        <div>
          <label className="label">Min. {meta.unit}</label>
          <input className="input" type="number" min={0} value={params.minValueSat} onChange={num("minValueSat")} />
        </div>
        <div>
          <label className="label">Max. Knoten</label>
          <input className="input" type="number" min={10} max={2000} value={params.maxNodes} onChange={num("maxNodes")} />
        </div>
        <div className="col-span-2 flex flex-wrap items-end gap-3 text-sm md:col-span-4 lg:col-span-8">
          <button className="btn" disabled={loading || !params.start}>
            {loading ? "Verfolge…" : "Trace starten"}
          </button>
          {loading && (
            <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>
              Abbrechen
            </button>
          )}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={params.enrich} onChange={(e) => setParams({ ...params, enrich: e.target.checked })} />
            Labels
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={params.historicPrices !== false}
              onChange={(e) => setParams({ ...params, historicPrices: e.target.checked })}
            />
            historische Kurse
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={params.lightning !== false}
              onChange={(e) => setParams({ ...params, lightning: e.target.checked })}
              disabled={params.chain !== "bitcoin"}
            />
            Lightning
          </label>
          <label
            className="flex items-center gap-1"
            title="Zusätzlich Mixer und Adressen mit mittlerem Risiko als schädliche Herkunft werten"
          >
            <input
              type="checkbox"
              checked={params.includeMediumRisk === true}
              onChange={(e) => setParams({ ...params, includeMediumRisk: e.target.checked })}
            />
            mittleres Risiko einbeziehen
          </label>
          {params.merges?.length ? (
            <span className="text-xs text-gray-400">
              {params.merges.length} manuelle Zusammenführung(en)
              <button
                type="button"
                className="ml-2 underline hover:text-accent"
                onClick={() => setParams({ ...params, merges: [] })}
              >
                zurücksetzen
              </button>
            </span>
          ) : null}
        </div>
        {progress && (
          <div className="col-span-2 md:col-span-4 lg:col-span-8">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              <span className="capitalize">{progress.phase}</span>
              <span>{progress.message}</span>
              <span className="ml-auto">
                {progress.nodes} Knoten · {progress.edges} Kanten · {progress.apiCalls} API-Calls
              </span>
            </div>
          </div>
        )}
      </form>

      {error && <div className="card border-red-500 text-red-300">{error}</div>}

      {result && (
        <>
          {/* ------------- Statistik ------------- */}
          <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <b>{result.stats.addresses}</b> Adressen
            </span>
            <span>
              <b>{result.stats.txs}</b> Transaktionen
            </span>
            <span>
              <b>{result.clusters.length}</b> Cluster
            </span>
            <span>
              <b>{result.nodes.filter((n) => n.data.type === "address" && n.data.risk === "high").length}</b> Risiko-Adressen
            </span>
            {result.riskSources?.length > 0 && (
              <span className="font-semibold text-red-400" title="Geld, das im Graph von schädlichen Adressen stammt">
                &#9888; {formatAmount(result.stats.riskInflowSat ?? 0, chain, 4)} von {result.riskSources.length}{" "}
                schädlichen Adresse(n)
              </span>
            )}
            {showTaint && result.stats.taintedOutSat !== undefined && (
              <span className="text-orange-300" title="Betrag aus der Startquelle, der an Endpunkten im Graph liegt">
                {formatAmount(result.stats.taintedOutSat, chain, 4)} verfolgt
              </span>
            )}
            <span className="text-gray-400">
              {result.stats.apiCalls} API-Calls · {(result.stats.durationMs / 1000).toFixed(1)} s ·{" "}
              {Object.entries(result.providersUsed).map(([p, n]) => `${p} ×${n}`).join(", ")}
            </span>
            {result.stats.truncated && <span className="text-yellow-400">durch Limits beschnitten</span>}
            <span className="ml-auto flex items-center gap-2">
              <button className="btn-secondary" type="button" onClick={exportJson}>
                Export JSON
              </button>
              {loggedIn ? (
                <>
                  <input className="input w-40" placeholder="Name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                  <button className="btn-secondary" onClick={save} type="button">
                    {caseId ? "Zum Fall hinzufügen" : "Als Fall speichern"}
                  </button>
                  {msg && <span className="text-xs text-gray-400">{msg}</span>}
                </>
              ) : (
                <span className="text-xs text-gray-500">Zum Speichern einloggen</span>
              )}
            </span>
          </div>

          {result.riskSources?.length > 0 && (
            <div className="rounded-lg border border-red-500/70 bg-red-950/40 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-red-300">
                  &#9888; {result.riskSources.length} als schädlich eingestufte Adresse(n) im Graph
                </span>
                <span className="text-sm text-gray-300">
                  {result.stats.riskAffected ?? 0} nachgelagerte Adresse(n) haben davon Geld erhalten, zusammen{" "}
                  {formatAmount(result.stats.riskInflowSat ?? 0, chain, 5)}
                  {result.priceEur !== undefined && ` (${formatFiat(result.stats.riskInflowSat ?? 0, result.priceEur, chain)})`}
                  .
                </span>
                <button type="button" className="btn-secondary ml-auto" onClick={() => setTab("risk")}>
                  Warnungen ansehen
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.riskSources.slice(0, 6).map((r) => (
                  <span
                    key={r.address}
                    className={`rounded px-1.5 py-0.5 text-xs ${r.severity === "high" ? "bg-red-700 text-white" : "bg-orange-600 text-white"}`}
                    title={`${r.address} · Quelle: ${r.source}`}
                  >
                    {r.label} ({categoryText(r.category)})
                  </span>
                ))}
                {result.riskSources.length > 6 && (
                  <span className="text-xs text-gray-400">+{result.riskSources.length - 6} weitere</span>
                )}
              </div>
            </div>
          )}

          {/* ------------- Ansichtssteuerung ------------- */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex overflow-hidden rounded-md border border-border">
              {(
                [
                  ["graph", "Graph"],
                  ["timeline", "Verlauf"],
                  ["patterns", "Muster"],
                  ["risk", result.riskSources?.length ? `Warnungen (${result.riskSources.length})` : "Warnungen"],
                  ["forensics", "Forensik"],
                ] as [Tab, string][]
              ).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  className={`px-3 py-1 ${
                    tab === id ? "bg-accent text-black" : id === "risk" && result.riskSources?.length ? "text-red-400" : ""
                  }`}
                  onClick={() => setTab(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            {tab === "risk" && <RiskPanel result={result} onSelect={setSelected} onFocus={() => setTab("graph")} />}

          {tab === "forensics" && <ForensicsPanel result={result} />}

          {tab === "graph" && (
              <>
                <label className="flex items-center gap-1">
                  Layout
                  <select
                    className="input w-auto py-1"
                    value={opts.rankdir}
                    onChange={(e) => setOpts({ ...opts, rankdir: e.target.value as "LR" | "TB" | "TIME" })}
                  >
                    <option value="LR">links → rechts</option>
                    <option value="TB">oben → unten</option>
                    <option value="TIME">Zeitachse</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={opts.colorByCluster}
                    onChange={(e) => setOpts({ ...opts, colorByCluster: e.target.checked })}
                  />
                  Cluster einfärben
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={opts.hideChange} onChange={(e) => setOpts({ ...opts, hideChange: e.target.checked })} />
                  Wechselgeld ausblenden
                </label>
                {showTaint && (
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={opts.showTaint} onChange={(e) => setOpts({ ...opts, showTaint: e.target.checked })} />
                    Taint einfärben
                  </label>
                )}
                {result.riskSources?.length > 0 && (
                  <>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={opts.showRisk}
                        onChange={(e) => setOpts({ ...opts, showRisk: e.target.checked })}
                      />
                      Herkunft hervorheben
                    </label>
                    <label className="flex items-center gap-1 text-red-300">
                      <input
                        type="checkbox"
                        checked={opts.onlyRisk}
                        onChange={(e) => setOpts({ ...opts, onlyRisk: e.target.checked })}
                      />
                      nur belastete Flüsse
                    </label>
                  </>
                )}
                {(view.hidden.length > 0 || view.collapsedClusters.length > 0 || Object.keys(view.positions).length > 0) && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => updateView(() => ({ ...EMPTY_VIEW, comments: view.comments }))}
                  >
                    Ansicht zurücksetzen ({view.hidden.length} ausgeblendet)
                  </button>
                )}
              </>
            )}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={opts.showFiat} onChange={(e) => setOpts({ ...opts, showFiat: e.target.checked })} />
              EUR anzeigen
            </label>
            <div className="ml-auto flex flex-wrap gap-3 text-xs text-gray-400">
              <span>
                <span className="inline-block h-3 w-3 rounded border-2 border-red-500 align-middle" /> hohes Risiko
              </span>
              <span>
                <span className="inline-block h-3 w-3 rounded border-2 border-blue-400 align-middle" /> bekannter Dienst
              </span>
              <span>
                <span className="inline-block h-3 w-3 rounded ring-2 ring-accent align-middle" /> Start
              </span>
              <span className="text-yellow-400">⟲ Wechselgeld</span>
              <span className="text-green-400">grün = Coinbase</span>
              <span className="text-red-400">&#9888; rot = Geld von schädlicher Adresse</span>
            </div>
          </div>

          {/* ------------- Inhalte ------------- */}
          {tab === "timeline" && (
            <TraceTimeline result={result} showFiat={opts.showFiat} selectedId={selected?.id ?? null} onSelect={setSelected} />
          )}

          {tab === "patterns" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card space-y-2">
                <h3 className="font-semibold">Aktivitätsmuster</h3>
                <ActivityHeatmap activity={result.activity} />
              </div>
              <div className="card space-y-3">
                <h3 className="font-semibold">Peeling-Ketten</h3>
                {!result.peeling.length && (
                  <p className="text-sm text-gray-500">
                    Keine Peeling-Kette erkannt. Solche Ketten zweigen schrittweise kleine Beträge ab und reichen den Rest
                    weiter – typisch beim Auscashen.
                  </p>
                )}
                {result.peeling.map((p, i) => (
                  <div key={i} className="rounded border border-border p-2 text-sm">
                    <div className="font-medium text-orange-300">
                      Kette über {p.txids.length} Schritte · abgezweigt {formatAmount(p.totalPeeledSat, chain, 5)}
                    </div>
                    <div className="text-xs text-gray-400">Rest am Ende: {formatAmount(p.remainingSat, chain, 5)}</div>
                    <ol className="mono mt-1 max-h-32 list-decimal overflow-y-auto pl-5 text-[11px]">
                      {p.txids.map((t, k) => (
                        <li key={t}>
                          <Link href={`/tx/${t}?chain=${chain}`} className="hover:text-accent">
                            {shortHash(t, 8)}
                          </Link>
                          <span className="ml-2 text-gray-500">−{formatAmount(p.peeledSat[k], chain, 5)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
              <div className="card lg:col-span-2">
                <h3 className="mb-2 font-semibold">Verhaltensauffällige Adressen</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {result.nodes
                    .filter((n) => n.data.type === "address" && n.data.behavior?.length)
                    .slice(0, 20)
                    .map((n) => {
                      const d = n.data as Extract<typeof n.data, { type: "address" }>;
                      return (
                        <div key={n.id} className="rounded border border-border p-2 text-xs">
                          <Link href={`/address/${d.address}?chain=${chain}`} className="mono hover:text-accent">
                            {shortHash(d.address, 8)}
                          </Link>
                          <ul className="mt-1 list-disc pl-4 text-cyan-300">
                            {d.behavior!.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  {!result.nodes.some((n) => n.data.type === "address" && n.data.behavior?.length) && (
                    <p className="text-sm text-gray-500">Keine auffälligen Verhaltensmuster erkannt.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "risk" && <RiskPanel result={result} onSelect={setSelected} onFocus={() => setTab("graph")} />}

          {tab === "graph" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
              <TraceGraph
                result={result}
                opts={graphOpts}
                view={view}
                selectedId={selectedId}
                onSelect={(n, c) => {
                  setSelected(n);
                  setSelectedCluster(c ?? null);
                }}
                onMoveNode={moveNode}
              />
              <aside className="card h-[72vh] overflow-y-auto text-sm">
                {cluster ? (
                  <ClusterPanel
                    cluster={cluster}
                    chain={chain}
                    comment={view.comments[`c:${cluster.id}`]}
                    onComment={(t) => setComment(`c:${cluster.id}`, t)}
                    onExpand={() => toggleCluster(cluster.id)}
                  />
                ) : !selected ? (
                  <OverviewPanel
                    result={result}
                    view={view}
                    onToggleCluster={toggleCluster}
                    onUnhide={(id) => updateView((v) => ({ ...v, hidden: v.hidden.filter((h) => h !== id) }))}
                  />
                ) : selected.data.type === "address" ? (
                  <AddressPanel
                    data={selected.data}
                    chain={chain}
                    showTaint={showTaint}
                    priceEur={result.priceEur}
                    connected={connected}
                    comment={view.comments[selected.id]}
                    loggedIn={loggedIn}
                    onComment={(t) => setComment(selected.id, t)}
                    onHide={() => hideNode(selected.id)}
                    onTraceFrom={() => run({ ...params, start: (selected.data as { address: string }).address })}
                    onMerge={(other) => mergeAddresses([(selected.data as { address: string }).address, other])}
                  />
                ) : (
                  <TxPanel
                    data={selected.data}
                    chain={chain}
                    priceEur={result.priceEur}
                    connected={connected}
                    comment={view.comments[selected.id]}
                    onComment={(t) => setComment(selected.id, t)}
                    onHide={() => hideNode(selected.id)}
                  />
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- Seitenleisten ---------------- */

function CommentBox({ value, onChange }: { value?: string; onChange: (t: string) => void }) {
  const [text, setText] = useState(value ?? "");
  // Abgeleiteter Zustand: wechselt der ausgewählte Knoten, den Text übernehmen
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value ?? "");
  }
  return (
    <div className="pt-2">
      <label className="label">Kommentar (wird im Fall gespeichert)</label>
      <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(text)} />
    </div>
  );
}

function OverviewPanel({
  result,
  view,
  onToggleCluster,
  onUnhide,
}: {
  result: TraceResult;
  view: GraphViewState;
  onToggleCluster: (id: number) => void;
  onUnhide: (id: string) => void;
}) {
  const chain = result.params.chain;
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Cluster</h3>
      {!result.clusters.length && <p className="text-gray-500">Keine Cluster erkannt.</p>}
      {result.clusters.map((c) => (
        <div key={c.id} className="rounded border border-border p-2" style={{ borderLeftWidth: 4, borderLeftColor: clusterColor(c.id) }}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">
              Cluster #{c.id} {c.label && <span className="text-accent">· {c.label}</span>}
              {c.manual && <span className="ml-1 text-[10px] text-green-300">manuell</span>}
            </div>
            <button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => onToggleCluster(c.id)}>
              {view.collapsedClusters.includes(c.id) ? "aufklappen" : "falten"}
            </button>
          </div>
          <div className="text-xs text-gray-400">
            {c.addresses.length} Adressen · {formatAmount(c.totalReceivedSat, chain, 4)} empfangen
          </div>
          {c.behavior?.length ? <div className="text-[11px] text-cyan-300">{c.behavior.join(" · ")}</div> : null}
          <ul className="mono mt-1 max-h-24 overflow-y-auto text-[11px]">
            {c.addresses.map((a) => (
              <li key={a}>
                <Link className="hover:text-accent" href={`/address/${a}?chain=${chain}`}>
                  {a}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {view.hidden.length > 0 && (
        <div>
          <h3 className="font-semibold">Ausgeblendet ({view.hidden.length})</h3>
          <ul className="space-y-1 text-xs">
            {view.hidden.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2">
                <span className="mono truncate">{id.slice(2, 18)}…</span>
                <button className="underline hover:text-accent" onClick={() => onUnhide(id)}>
                  einblenden
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div>
          <h3 className="font-semibold text-yellow-400">Hinweise</h3>
          <ul className="list-disc pl-4 text-xs text-gray-400">
            {result.warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-gray-500">
        Knoten anklicken für Details, verbundene Pfade werden hervorgehoben. Knoten lassen sich verschieben, ausblenden und
        kommentieren; die Ansicht wird im Fall gespeichert.
      </p>
    </div>
  );
}

function ClusterPanel({
  cluster,
  chain,
  comment,
  onComment,
  onExpand,
}: {
  cluster: NonNullable<TraceResult["clusters"][number]>;
  chain: ChainId;
  comment?: string;
  onComment: (t: string) => void;
  onExpand: () => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold" style={{ color: clusterColor(cluster.id) }}>
        Cluster #{cluster.id}
      </h3>
      {cluster.label && <div className="text-accent">{cluster.label}</div>}
      <div>{cluster.addresses.length} Adressen</div>
      <div>Empfangen: {formatAmount(cluster.totalReceivedSat, chain)}</div>
      {cluster.behavior?.length ? (
        <ul className="list-disc pl-4 text-xs text-cyan-300">
          {cluster.behavior.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      <button className="btn-secondary" onClick={onExpand}>
        Cluster aufklappen
      </button>
      <ul className="mono max-h-64 overflow-y-auto text-[11px]">
        {cluster.addresses.map((a) => (
          <li key={a}>
            <Link className="hover:text-accent" href={`/address/${a}?chain=${chain}`}>
              {a}
            </Link>
          </li>
        ))}
      </ul>
      <CommentBox value={comment} onChange={onComment} />
    </div>
  );
}

function AddressPanel({
  data,
  chain,
  showTaint,
  priceEur,
  connected,
  comment,
  loggedIn,
  onComment,
  onHide,
  onTraceFrom,
  onMerge,
}: {
  data: Extract<TraceNode["data"], { type: "address" }>;
  chain: ChainId;
  showTaint: boolean;
  priceEur?: number;
  connected: TraceResult["edges"];
  comment?: string;
  loggedIn: boolean;
  onComment: (t: string) => void;
  onHide: () => void;
  onTraceFrom: () => void;
  onMerge: (other: string) => void;
}) {
  const [mergeWith, setMergeWith] = useState("");
  const [watchMsg, setWatchMsg] = useState<string | null>(null);

  async function watch() {
    const res = await fetch("/api/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain, address: data.address, label: "" }),
    });
    const j = await res.json();
    setWatchMsg(res.ok ? "Zur Watchlist hinzugefügt." : j.error);
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Adresse</h3>
      <div className="mono break-all text-xs">{data.address}</div>
      <LabelBadges labels={data.labels} />
      <div>
        Risiko: <b className={data.risk === "high" ? "text-red-400" : ""}>{data.risk}</b>
      </div>
      <div>Tiefe: {data.depth}</div>
      {data.clusterId && <div style={{ color: clusterColor(data.clusterId) }}>Cluster #{data.clusterId}</div>}
      <div>
        Empfangen: {formatAmount(data.receivedSat, chain)}{" "}
        {priceEur !== undefined && <span className="text-gray-500">({formatFiat(data.receivedSat, priceEur, chain)})</span>}
      </div>
      <div>
        Gesendet: {formatAmount(data.sentSat, chain)}{" "}
        {priceEur !== undefined && <span className="text-gray-500">({formatFiat(data.sentSat, priceEur, chain)})</span>}
      </div>
      {showTaint && data.taintSat !== undefined && (
        <div className="text-orange-300">
          Aus der Quelle: {formatAmount(data.taintSat, chain)} ({formatPercent(data.taintRatio || 0)})
        </div>
      )}
      {data.isRiskSource && (
        <div className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white">
          &#9888; Diese Adresse ist als schädlich gemeldet
        </div>
      )}
      {!data.isRiskSource && (data.riskFromSat ?? 0) > 0 && (
        <div className="space-y-1 rounded border border-red-500/60 bg-red-950/40 p-2 text-xs">
          <div className="font-semibold text-red-300">&#9888; Belasteter Zufluss</div>
          <div>
            {formatAmount(data.riskFromSat, chain)} ({formatPercent(data.riskFromRatio || 0)} des Zuflusses) stammen von
            als schädlich eingestuften Adressen.
          </div>
          {data.riskSources?.length ? (
            <ul className="mono space-y-0.5">
              {data.riskSources.map((a) => (
                <li key={a}>
                  <Link href={`/address/${a}?chain=${chain}`} className="hover:text-accent">
                    {shortHash(a, 8)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {(data.sentToRiskSat ?? 0) > 0 && (
        <div className="rounded border border-orange-500/60 bg-orange-950/30 p-2 text-xs text-orange-200">
          &#9888; {formatAmount(data.sentToRiskSat, chain)} gingen direkt an eine als schädlich eingestufte Adresse.
        </div>
      )}
      {data.behavior?.length ? (
        <ul className="list-disc pl-4 text-xs text-cyan-300">
          {data.behavior.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}

      <h4 className="pt-2 font-medium">Verbindungen ({connected.length})</h4>
      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
        {connected.map((e) => (
          <li key={e.id} className="flex justify-between gap-2">
            <span className="mono">
              {e.source === `a:${data.address}` ? "→ tx " : "← tx "}
              {shortHash((e.source === `a:${data.address}` ? e.target : e.source).slice(2), 5)}
            </span>
            <span>
              {formatAmount(e.valueSat, chain, 5)}
              {e.change ? " ⟲" : ""}
            </span>
          </li>
        ))}
      </ul>

      {data.address !== "coinbase" && (
        <>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link className="btn-secondary" href={`/address/${data.address}?chain=${chain}`}>
              Details
            </Link>
            <button className="btn-secondary" type="button" onClick={onTraceFrom}>
              Trace von hier
            </button>
            <button className="btn-secondary" type="button" onClick={onHide}>
              Ausblenden
            </button>
            {loggedIn && (
              <button className="btn-secondary" type="button" onClick={watch}>
                Beobachten
              </button>
            )}
          </div>
          {watchMsg && <p className="text-xs text-gray-400">{watchMsg}</p>}
          <div className="pt-2">
            <label className="label">Mit anderer Adresse zusammenführen</label>
            <div className="flex gap-2">
              <input
                className="input mono text-xs"
                placeholder="Adresse"
                value={mergeWith}
                onChange={(e) => setMergeWith(e.target.value)}
              />
              <button
                className="btn-secondary"
                type="button"
                disabled={!mergeWith.trim()}
                onClick={() => {
                  onMerge(mergeWith.trim());
                  setMergeWith("");
                }}
              >
                Vereinen
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Korrigiert die automatische Cluster-Erkennung. Der Trace wird danach neu berechnet.
            </p>
          </div>
        </>
      )}
      <CommentBox value={comment} onChange={onComment} />
    </div>
  );
}

function TxPanel({
  data,
  chain,
  priceEur,
  connected,
  comment,
  onComment,
  onHide,
}: {
  data: Extract<TraceNode["data"], { type: "tx" }>;
  chain: ChainId;
  priceEur?: number;
  connected: TraceResult["edges"];
  comment?: string;
  onComment: (t: string) => void;
  onHide: () => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Transaktion</h3>
      <div className="mono break-all text-xs">{data.txid}</div>
      <div>
        {formatDate(data.blockTime)} {data.blockHeight ? `· Block ${data.blockHeight}` : ""}
      </div>
      <div>
        {data.inputCount} Eingänge → {data.outputCount} Ausgänge
      </div>
      <div>
        Volumen: {formatAmount(data.totalOutSat, chain)}{" "}
        {priceEur !== undefined && <span className="text-gray-500">(heute {formatFiat(data.totalOutSat, priceEur, chain)})</span>}
      </div>
      {data.priceEur !== undefined && (
        <div className="text-gray-400">
          Wert damals: {formatFiat(data.totalOutSat, data.priceEur, chain)} (Kurs{" "}
          {data.priceEur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })})
        </div>
      )}
      <div>Gebühr: {formatAmount(data.feeSat, chain)}</div>
      {data.carriesRisk && (
        <div className="rounded border border-red-500/60 bg-red-950/40 p-2 text-xs font-semibold text-red-300">
          &#9888; Diese Transaktion bewegt Geld, das von einer als schädlich eingestuften Adresse stammt.
        </div>
      )}
      {data.hints.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-yellow-300">
          {data.hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      <h4 className="pt-2 font-medium">Geldfluss</h4>
      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
        {connected.map((e) => (
          <li key={e.id} className="flex justify-between gap-2">
            <span className="mono">
              {e.target === `t:${data.txid}` ? "von " : "nach "}
              {shortHash((e.target === `t:${data.txid}` ? e.source : e.target).slice(2), 6)}
            </span>
            <span>
              {formatAmount(e.valueSat, chain, 5)}
              {e.change ? " ⟲" : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 pt-2">
        <Link className="btn-secondary" href={`/tx/${data.txid}?chain=${chain}`}>
          Details
        </Link>
        <button className="btn-secondary" type="button" onClick={onHide}>
          Ausblenden
        </button>
      </div>
      <CommentBox value={comment} onChange={onComment} />
    </div>
  );
}


/* ---------------- Warnungen: Geld von schädlichen Adressen ---------------- */

function RiskPanel({
  result,
  onSelect,
  onFocus,
}: {
  result: TraceResult;
  onSelect: (n: TraceNode | null) => void;
  onFocus: () => void;
}) {
  const chain = result.params.chain;
  const sources = result.riskSources ?? [];
  const byAddress = new Map(result.nodes.filter((n) => n.data.type === "address").map((n) => [n.id, n]));

  const affected = result.nodes
    .filter(
      (n): n is TraceNode & { data: Extract<TraceNode["data"], { type: "address" }> } =>
        n.data.type === "address" && !n.data.isRiskSource && (n.data.riskFromSat ?? 0) > 0,
    )
    .sort((a, b) => (b.data.riskFromSat ?? 0) - (a.data.riskFromSat ?? 0));

  const outflow = result.nodes
    .filter(
      (n): n is TraceNode & { data: Extract<TraceNode["data"], { type: "address" }> } =>
        n.data.type === "address" && (n.data.sentToRiskSat ?? 0) > 0 && !n.data.isRiskSource,
    )
    .sort((a, b) => (b.data.sentToRiskSat ?? 0) - (a.data.sentToRiskSat ?? 0));

  if (!sources.length) {
    return (
      <div className="card text-sm text-gray-400">
        Keine der geprüften Adressen ist als schädlich gemeldet. Geprüft wird gegen die OFAC-Sanktionsliste,
        Ransomwhere, die GraphSense-TagPacks, CryptoScamDB, Chainabuse, Bitcoin Who&apos;s Who und eigene Labels.
        Mit der Option „mittleres Risiko einbeziehen“ werden zusätzlich Mixer gewertet.
      </div>
    );
  }

  const jump = (id: string) => {
    const n = byAddress.get(id);
    if (n) {
      onSelect(n);
      onFocus();
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h3 className="font-semibold text-red-300">Schädliche Adressen im Graph ({sources.length})</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-1">Adresse</th>
              <th>Einstufung</th>
              <th>Quelle</th>
              <th className="text-right">weitergegeben</th>
              <th className="text-right">betroffen</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((r) => (
              <tr key={r.address} className="border-t border-border">
                <td className="py-1.5">
                  <button className="mono text-xs hover:text-accent" onClick={() => jump(`a:${r.address}`)} title={r.address}>
                    {shortHash(r.address, 8)}
                  </button>
                </td>
                <td>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${r.severity === "high" ? "bg-red-700 text-white" : "bg-orange-600 text-white"}`}
                  >
                    {r.label}
                  </span>
                  <span className="ml-1 text-xs text-gray-400">{categoryText(r.category)}</span>
                </td>
                <td className="text-xs text-gray-400">{r.source}</td>
                <td className="text-right">{formatAmount(r.outflowSat, chain, 5)}</td>
                <td className="text-right text-gray-400">{r.affectedAddresses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Adressen mit belastetem Zufluss ({affected.length})</h3>
        {!affected.length && <p className="text-sm text-gray-500">Kein Geld dieser Adressen ist im Graph weitergeflossen.</p>}
        {affected.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-1">Adresse</th>
                <th className="text-right">belasteter Zufluss</th>
                <th className="text-right">Anteil</th>
                <th>Herkunft</th>
                <th>Labels</th>
              </tr>
            </thead>
            <tbody>
              {affected.map((n) => (
                <tr key={n.id} className="border-t border-border">
                  <td className="py-1.5">
                    <button className="mono text-xs hover:text-accent" onClick={() => jump(n.id)} title={n.data.address}>
                      {shortHash(n.data.address, 8)}
                    </button>
                  </td>
                  <td className="text-right text-red-300">
                    {formatAmount(n.data.riskFromSat, chain, 5)}
                    {result.priceEur !== undefined && (
                      <div className="text-[10px] text-gray-500">{formatFiat(n.data.riskFromSat, result.priceEur, chain)}</div>
                    )}
                  </td>
                  <td className="text-right">{formatPercent(n.data.riskFromRatio || 0, 0)}</td>
                  <td className="mono text-[11px] text-gray-400">
                    {(n.data.riskSources || []).slice(0, 2).map((a) => (
                      <div key={a}>{shortHash(a, 5)}</div>
                    ))}
                    {(n.data.riskSources || []).length > 2 && <div>+{(n.data.riskSources || []).length - 2}</div>}
                  </td>
                  <td>
                    <LabelBadges labels={n.data.labels} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {outflow.length > 0 && (
        <div className="card space-y-3">
          <h3 className="font-semibold">Zahlungen an schädliche Adressen ({outflow.length})</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-1">Adresse</th>
                <th className="text-right">an schädliche Adresse</th>
              </tr>
            </thead>
            <tbody>
              {outflow.map((n) => (
                <tr key={n.id} className="border-t border-border">
                  <td className="py-1.5">
                    <button className="mono text-xs hover:text-accent" onClick={() => jump(n.id)} title={n.data.address}>
                      {shortHash(n.data.address, 8)}
                    </button>
                  </td>
                  <td className="text-right text-orange-300">{formatAmount(n.data.sentToRiskSat, chain, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Die Zuordnung folgt dem gewählten Modell ({result.params.taintModel === "none" ? "haircut" : result.params.taintModel}).
        Sie ist eine Wahrscheinlichkeitsaussage: dass Geld über mehrere Schritte von einer gemeldeten Adresse stammt,
        beweist keine Beteiligung des Empfängers.
      </p>
    </div>
  );
}


/* ---------------- Forensik: Dienste, Wallet-Merkmale, Nachweis ---------------- */

function ForensicsPanel({ result }: { result: TraceResult }) {
  const chain = result.params.chain;
  const deposits = result.deposits ?? [];
  const fingerprints = result.fingerprints ?? [];
  const crossChain = result.crossChain ?? [];
  const evidence = result.evidence;

  return (
    <div className="space-y-4">
      {/* Einzahlungsadressen */}
      <div className="card space-y-2">
        <h3 className="font-semibold">Einzahlungsadressen von Diensten ({deposits.length})</h3>
        <p className="text-sm text-gray-400">
          Diese Adressen nehmen Geld entgegen und leiten praktisch alles an eine einzige Sammeladresse weiter. Der
          Betreiber dieser Sammeladresse weiß, wem die Einzahlungsadresse zugeteilt war, und ist damit der
          erfolgversprechendste Ansprechpartner für eine Auskunft.
        </p>
        {!deposits.length && <p className="text-sm text-gray-500">Keine erkannt.</p>}
        {deposits.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-1">Einzahlungsadresse</th>
                  <th>Dienst</th>
                  <th>leitet weiter an</th>
                  <th className="text-right">Anteil</th>
                  <th className="text-right">Vorgänge</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.address} className="border-t border-border">
                    <td className="py-1.5">
                      <Link href={`/address/${d.address}?chain=${chain}`} className="mono text-xs hover:text-accent" title={d.address}>
                        {shortHash(d.address, 8)}
                      </Link>
                    </td>
                    <td className="text-accent">{d.service ?? "unbekannt"}</td>
                    <td>
                      <Link href={`/address/${d.forwardsTo}?chain=${chain}`} className="mono text-xs hover:text-accent" title={d.forwardsTo}>
                        {shortHash(d.forwardsTo, 8)}
                      </Link>
                    </td>
                    <td className="text-right">{formatPercent(d.ratio, 0)}</td>
                    <td className="text-right text-gray-400">{d.forwardCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Übergänge auf andere Chains */}
      <div className="card space-y-2">
        <h3 className="font-semibold">Übergänge auf andere Chains ({crossChain.length})</h3>
        <p className="text-sm text-gray-400">
          Geht Geld an einen Tausch- oder Brückendienst, endet die Spur auf dieser Chain. Über die
          Transaktionsseite lässt sich prüfen, ob bei einer Kandidatenadresse auf der Zielkette ein passender
          Betrag eingegangen ist.
        </p>
        {!crossChain.length && <p className="text-sm text-gray-500">Keine erkannt.</p>}
        {crossChain.map((c) => (
          <div key={c.txid} className="flex flex-wrap items-center gap-2 rounded border border-border p-2 text-sm">
            <span className="rounded bg-teal-700 px-1.5 py-0.5 text-xs text-white">
              {c.kind === "bridge" ? "Brücke" : "Tauschdienst"}: {c.service}
            </span>
            <Link href={`/tx/${c.txid}?chain=${chain}`} className="mono text-xs hover:text-accent">
              tx {shortHash(c.txid, 8)}
            </Link>
            <span className="text-gray-500">→</span>
            <Link href={`/address/${c.address}?chain=${chain}`} className="mono text-xs hover:text-accent">
              {shortHash(c.address, 8)}
            </Link>
            <Link className="btn-secondary ml-auto" href={`/tx/${c.txid}?chain=${chain}`}>
              Zielkette prüfen
            </Link>
          </div>
        ))}
      </div>

      {/* Wallet-Fingerabdruck */}
      <div className="card space-y-2">
        <h3 className="font-semibold">Wallet-Fingerabdruck ({fingerprints.length} Gruppen)</h3>
        <p className="text-sm text-gray-400">
          Transaktionen mit identischem Bauverhalten stammen wahrscheinlich aus derselben Wallet-Software. Das
          verknüpft Transaktionen auch dann, wenn sie keine gemeinsamen Eingänge haben. Es ist ein Indiz, kein Beweis.
        </p>
        {!fingerprints.length && (
          <p className="text-sm text-gray-500">
            Keine Gruppe mit mindestens zwei Transaktionen. Die Merkmale liefert derzeit nur die Esplora-Schnittstelle
            (mempool.space, Blockstream, litecoinspace).
          </p>
        )}
        {fingerprints.map((g) => (
          <div key={g.signature} className="rounded border border-border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono text-xs text-accent">{g.signature}</span>
              <span className="text-gray-400">{g.txids.length} Transaktionen</span>
            </div>
            <div className="text-xs text-gray-400">{g.traits.join(" · ")}</div>
            {g.candidates.length > 0 && (
              <div className="text-xs text-cyan-300">Passt zu: {g.candidates.join(", ")}</div>
            )}
            <ul className="mono mt-1 flex max-h-24 flex-wrap gap-2 overflow-y-auto text-[11px]">
              {g.txids.slice(0, 20).map((t) => (
                <li key={t}>
                  <Link href={`/tx/${t}?chain=${chain}`} className="hover:text-accent">
                    {shortHash(t, 5)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Beweissicherung */}
      <div className="card space-y-2">
        <h3 className="font-semibold">Nachweis der Rohdaten</h3>
        {!evidence ? (
          <p className="text-sm text-gray-500">
            Für diesen Trace wurde kein Nachweis mitgeschrieben. Er entsteht automatisch bei jedem neuen Trace.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-400">
              Zu jeder Abfrage wurde festgehalten, welche Quelle wann welche Daten geliefert hat, mit einem Prüfwert
              über die Rohdaten. Damit lässt sich später zeigen, dass der Bericht auf genau diesen Daten beruht.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                <b>{evidence.entries.length}</b> Abfragen
              </span>
              <span>
                Erstellt: {new Date(evidence.createdAt).toLocaleString("de-DE")}
              </span>
              <span className="mono break-all text-xs text-gray-400">Prüfwert: {evidence.digest}</span>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-accent">Einzelne Abfragen anzeigen</summary>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-left uppercase text-gray-500">
                    <tr>
                      <th className="py-1">Art</th>
                      <th>Bezug</th>
                      <th>Quelle</th>
                      <th>Zeit</th>
                      <th>SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.entries.slice(0, 300).map((e, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1">{e.kind}</td>
                        <td className="mono">{shortHash(e.key, 6)}</td>
                        <td>{e.provider}</td>
                        <td className="text-gray-400">{new Date(e.at).toLocaleTimeString("de-DE")}</td>
                        <td className="mono text-gray-500">{e.sha256.slice(0, 16)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
