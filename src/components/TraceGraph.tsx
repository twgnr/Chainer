"use client";

import { createContext, useCallback, useContext, useId, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { AddressNodeData, TraceNode, TraceResult, TxNodeData } from "@/lib/trace/types";
import { formatAmount, formatDateShort, formatFiat, formatPercent, shortHash } from "@/lib/format";
import type { ChainId } from "@/lib/chains";

/* ---------------- Ansichtszustand (im Fall speicherbar) ---------------- */

export interface GraphViewState {
  hidden: string[];
  collapsedClusters: number[];
  positions: Record<string, { x: number; y: number }>;
  comments: Record<string, string>;
}

export const EMPTY_VIEW: GraphViewState = { hidden: [], collapsedClusters: [], positions: {}, comments: {} };

export interface GraphOptions {
  rankdir: "LR" | "TB" | "TIME";
  colorByCluster: boolean;
  hideChange: boolean;
  showFiat: boolean;
  showTaint: boolean;
  /** Belastete Flüsse (Herkunft von schädlichen Adressen) hervorheben */
  showRisk: boolean;
  /** Nur Knoten und Kanten mit belastetem Geld zeigen */
  onlyRisk: boolean;
  priceEur?: number;
  /**
   * Kantenbeschriftungen auch dann zeichnen, wenn die Schwelle überschritten ist.
   * Ohne Angabe entscheidet der eingebaute Schalter im Graph.
   */
  forceEdgeLabels?: boolean;
  /** Ab wie vielen sichtbaren Kanten Beschriftungen wegfallen (Vorgabe 150) */
  edgeLabelLimit?: number;
  /** Ab wie vielen Knoten nur der sichtbare Bereich gezeichnet wird (Vorgabe 200) */
  virtualizeFrom?: number;
}

/** Vorgaben, damit aufrufende Ansichten die neuen Felder nicht setzen müssen */
const DEFAULT_EDGE_LABEL_LIMIT = 150;
const DEFAULT_VIRTUALIZE_FROM = 200;

/* ---------------- Darstellung über Kontext statt über Knotendaten ----------------
 * Farbe, Auswahl und Kommentare werden nicht in die Knotenobjekte geschrieben.
 * So verändert eine Umschaltung der Darstellung weder das Layout noch die
 * Knotenliste — React Flow muss nichts neu einmessen. */

interface Appearance {
  opts: GraphOptions;
  selectedId: string | null;
  /** Der ausgewählte Knoten und seine direkten Nachbarn */
  neighbors: ReadonlySet<string>;
  comments: Record<string, string>;
}

const FALLBACK_OPTS: GraphOptions = {
  rankdir: "LR",
  colorByCluster: false,
  hideChange: false,
  showFiat: false,
  showTaint: false,
  showRisk: true,
  onlyRisk: false,
};

const AppearanceCtx = createContext<Appearance>({
  opts: FALLBACK_OPTS,
  selectedId: null,
  neighbors: new Set<string>(),
  comments: {},
});

type AddrNode = Node<AddressNodeData & Record<string, unknown>, "address">;
type TxNode = Node<TxNodeData & Record<string, unknown>, "tx">;
interface ClusterData {
  type: "cluster";
  chain: ChainId;
  clusterId: number;
  label?: string;
  count: number;
  receivedSat: number;
  risk: AddressNodeData["risk"];
  taintSat: number;
  riskFromSat: number;
  hasRiskSource: boolean;
}
type ClusterNode = Node<ClusterData & Record<string, unknown>, "cluster">;
type AnyNode = AddrNode | TxNode | ClusterNode;

/**
 * Risiko wird nicht allein über Farbe vermittelt: jede Stufe hat zusätzlich eine
 * eigene Rahmenstärke und Rahmenart sowie ein eigenes Zeichen und ein Kürzel.
 * Damit bleiben die Stufen auch in Graustufen unterscheidbar.
 */
const riskBorder: Record<AddressNodeData["risk"], string> = {
  none: "border-2 border-solid border-gray-400",
  low: "border-2 border-dotted border-blue-300",
  medium: "border-[3px] border-dashed border-yellow-300",
  high: "border-4 border-double border-red-400",
};
const riskGlyph: Record<AddressNodeData["risk"], string> = {
  none: "○",
  low: "◇",
  medium: "◆",
  high: "▲",
};
const riskText: Record<AddressNodeData["risk"], string> = {
  none: "",
  low: "BEKANNT",
  medium: "MITTEL",
  high: "HOCH",
};
const riskWord: Record<AddressNodeData["risk"], string> = {
  none: "kein besonderes Risiko",
  low: "bekannter Dienst",
  medium: "mittleres Risiko",
  high: "hohes Risiko",
};

export const CLUSTER_COLORS = [
  "#f97316",
  "#22d3ee",
  "#a3e635",
  "#e879f9",
  "#facc15",
  "#60a5fa",
  "#fb7185",
  "#34d399",
  "#c084fc",
  "#fbbf24",
];
export const clusterColor = (id?: number) => (id ? CLUSTER_COLORS[(id - 1) % CLUSTER_COLORS.length] : undefined);

/** Farbverlauf für den Taint-Anteil: je röter, desto mehr stammt aus der Quelle */
function taintColor(ratio: number | undefined): string | undefined {
  if (ratio === undefined || ratio <= 0.001) return undefined;
  if (ratio > 0.66) return "#ef4444";
  if (ratio > 0.33) return "#f97316";
  return "#fbbf24";
}

/** Rotstufen für den Anteil, der von schädlichen Adressen stammt */
function riskColor(ratio: number | undefined): string | undefined {
  if (ratio === undefined || ratio <= 0.001) return undefined;
  if (ratio > 0.5) return "#dc2626";
  if (ratio > 0.15) return "#ea580c";
  return "#d97706";
}

/** Rahmen für Auswahl (durchgezogen) — der Fokusrahmen kommt aus globals.css */
const selectedRing = "outline outline-2 outline-offset-2 outline-white";

function CommentBadge({ comment }: { comment?: string }) {
  if (!comment) return null;
  return (
    <div className="mt-0.5 truncate rounded bg-yellow-500/20 px-1 text-[9px] text-yellow-100" title={comment}>
      ✎ {comment}
    </div>
  );
}

function AddressNodeView({ id, data }: NodeProps<AddrNode>) {
  const { opts, selectedId, neighbors, comments } = useContext(AppearanceCtx);
  const dim = selectedId !== null && !neighbors.has(id);
  const selected = selectedId === id;
  const main = data.labels.find(
    (l) => l.own || (l.category !== "wallet" && l.category !== "other" && l.source !== "chainer"),
  );
  const extra = data.labels.length - (main ? 1 : 0);
  const cc = opts.colorByCluster ? clusterColor(data.clusterId) : undefined;
  const tc = opts.showTaint ? taintColor(data.taintRatio) : undefined;
  return (
    <div
      className={`rounded-md bg-panel px-2 py-1 shadow ${riskBorder[data.risk]} ${
        data.isStart ? "ring-2 ring-accent ring-offset-2 ring-offset-black" : ""
      } ${selected ? selectedRing : ""} ${dim ? "opacity-30" : ""}`}
      style={{ minWidth: 195, borderLeftWidth: cc ? 6 : undefined, borderLeftColor: cc }}
      title={data.address}
    >
      <Handle type="target" position={opts.rankdir === "TB" ? Position.Top : Position.Left} />
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-[11px]">
          <span aria-hidden="true">{riskGlyph[data.risk]} </span>
          {data.address === "coinbase" ? "⛏ Coinbase" : shortHash(data.address, 7)}
        </span>
        {data.risk !== "none" && (
          <span
            className={`rounded px-1 text-[9px] font-semibold ${
              data.risk === "high"
                ? "bg-red-600 text-white"
                : data.risk === "medium"
                  ? "bg-yellow-500 text-black"
                  : "bg-blue-500 text-white"
            }`}
          >
            {riskText[data.risk]}
          </span>
        )}
      </div>
      {data.isStart && <div className="text-[9px] font-semibold text-accent">★ STARTKNOTEN</div>}
      {main && (
        <div className={`truncate text-[10px] font-medium ${main.own ? "text-green-200" : "text-accent"}`}>
          {main.own ? "✎ " : ""}
          {main.label}
        </div>
      )}
      {data.isRiskSource && (
        <div className="truncate rounded bg-red-700 px-1 text-[9px] font-semibold text-white">
          ⚠ schädliche Adresse
        </div>
      )}
      {data.deposit && (
        <div
          className="truncate rounded bg-emerald-700 px-1 text-[9px] font-semibold text-white"
          title={`Leitet ${Math.round(data.deposit.ratio * 100)} % an ${data.deposit.forwardsTo} weiter`}
        >
          &#8659; Einzahlungsadresse{data.deposit.service ? ` (${data.deposit.service})` : ""}
        </div>
      )}
      {data.swapService && (
        <div className="truncate rounded bg-teal-700 px-1 text-[9px] font-semibold text-white">
          &#8644; {data.swapService.kind === "bridge" ? "Brücke" : "Tauschdienst"}: {data.swapService.name}
        </div>
      )}
      {opts.showRisk && !data.isRiskSource && (data.riskFromRatio ?? 0) > 0.001 && (
        <div
          className="truncate rounded px-1 text-[9px] font-semibold text-white"
          style={{ background: riskColor(data.riskFromRatio) }}
          title={
            data.riskSources?.length
              ? `Zufluss von: ${data.riskSources.join(", ")}`
              : "Zufluss von einer als schädlich eingestuften Adresse"
          }
        >
          ⚠ {formatPercent(data.riskFromRatio || 0, 0)} von schädlicher Herkunft
        </div>
      )}
      <div className="flex justify-between gap-2 text-[9px] text-gray-300">
        <span>↓ {formatAmount(data.receivedSat, data.chain, 4)}</span>
        <span>↑ {formatAmount(data.sentSat, data.chain, 4)}</span>
      </div>
      {opts.showFiat && opts.priceEur !== undefined && (
        <div className="text-[9px] text-gray-300">≈ {formatFiat(data.receivedSat, opts.priceEur, data.chain)}</div>
      )}
      {tc && (
        <div className="mt-0.5 h-1 w-full rounded bg-gray-700">
          <div className="h-1 rounded" style={{ width: `${Math.round((data.taintRatio || 0) * 100)}%`, background: tc }} />
        </div>
      )}
      {opts.showTaint && (data.taintRatio ?? 0) > 0.001 && (
        <div className="text-[9px]" style={{ color: tc }}>
          {formatPercent(data.taintRatio || 0, 0)} aus der Quelle
        </div>
      )}
      <div className="flex flex-wrap gap-1 text-[9px] text-gray-300">
        <span>Tiefe {data.depth}</span>
        {data.clusterId && <span style={{ color: cc }}>· Cluster #{data.clusterId}</span>}
        {extra > 0 && <span>· {extra} Label</span>}
        {data.behavior?.length ? <span className="text-cyan-200">· {data.behavior.length} Muster</span> : null}
        {data.truncated && <span className="text-gray-300">· nicht weiter verfolgt</span>}
      </div>
      <CommentBadge comment={comments[id]} />
      <Handle type="source" position={opts.rankdir === "TB" ? Position.Bottom : Position.Right} />
    </div>
  );
}

function TxNodeView({ id, data }: NodeProps<TxNode>) {
  const { opts, selectedId, neighbors, comments } = useContext(AppearanceCtx);
  const dim = selectedId !== null && !neighbors.has(id);
  const selected = selectedId === id;
  const has = (s: string) => data.hints.some((h) => h.includes(s));
  const isCoinJoin = has("CoinJoin");
  return (
    <div
      className={`rounded-lg bg-black/70 px-2 py-1 ${
        data.carriesRisk && opts.showRisk
          ? "border-[3px] border-dashed border-red-400"
          : isCoinJoin
            ? "border-2 border-dotted border-purple-300"
            : data.failed
              ? "border-[3px] border-double border-red-400"
              : "border border-dashed border-gray-400"
      } ${data.isStart ? "ring-2 ring-accent ring-offset-2 ring-offset-black" : ""} ${
        selected ? selectedRing : ""
      } ${dim ? "opacity-30" : ""}`}
      style={{ minWidth: 150 }}
      title={data.txid}
    >
      <Handle type="target" position={opts.rankdir === "TB" ? Position.Top : Position.Left} />
      <div className="flex justify-between gap-2">
        <span className="mono text-[10px]">
          <span aria-hidden="true">▭ </span>tx {shortHash(data.txid, 5)}
        </span>
        <span className="text-[9px] text-gray-300">{formatDateShort(data.blockTime)}</span>
      </div>
      {data.isStart && <div className="text-[9px] font-semibold text-accent">★ STARTKNOTEN</div>}
      <div className="text-[9px] text-gray-200">
        {data.inputCount} in → {data.outputCount} out · {formatAmount(data.totalOutSat, data.chain, 4)}
      </div>
      <div className="text-[9px] text-gray-300">
        Gebühr {formatAmount(data.feeSat, data.chain, 6)} {data.blockHeight ? `· #${data.blockHeight}` : "· Mempool"}
      </div>
      {opts.showFiat && data.priceEur !== undefined && (
        <div className="text-[9px] text-gray-300">damals {formatFiat(data.totalOutSat, data.priceEur, data.chain)}</div>
      )}
      {data.carriesRisk && opts.showRisk && (
        <div className="truncate text-[9px] font-semibold text-red-300">⚠ belastetes Geld</div>
      )}
      {data.crossChain && (
        <div className="truncate text-[9px] font-semibold text-teal-200" title={data.crossChain.address}>
          &#8644; an {data.crossChain.service}
        </div>
      )}
      {data.hints.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[9px]">
          {has("Wechselgeld") && <span className="text-yellow-200">⟲ Wechselgeld</span>}
          {isCoinJoin && <span className="text-purple-200">⚑ CoinJoin</span>}
          {has("Common-Input") && <span className="text-cyan-200">⚑ Cluster</span>}
          {has("Batch") && <span className="text-blue-200">⚑ Batch</span>}
          {has("Konsolidierung") && <span className="text-green-200">⚑ Konsolid.</span>}
          {has("Lightning") && <span className="text-sky-200">⚡ Lightning</span>}
          {data.peelingIndex && <span className="text-orange-200">⚑ Peeling {data.peelingIndex}</span>}
        </div>
      )}
      <CommentBadge comment={comments[id]} />
      <Handle type="source" position={opts.rankdir === "TB" ? Position.Bottom : Position.Right} />
    </div>
  );
}

function ClusterNodeView({ id, data }: NodeProps<ClusterNode>) {
  const { opts, selectedId, neighbors, comments } = useContext(AppearanceCtx);
  const dim = selectedId !== null && !neighbors.has(id);
  const selected = selectedId === id;
  const cc = clusterColor(data.clusterId);
  return (
    <div
      className={`rounded-md bg-panel px-2 py-1 shadow ${riskBorder[data.risk]} ${
        selected ? selectedRing : ""
      } ${dim ? "opacity-30" : ""}`}
      style={{ minWidth: 195, borderLeftWidth: 8, borderLeftColor: cc }}
    >
      <Handle type="target" position={opts.rankdir === "TB" ? Position.Top : Position.Left} />
      <div className="text-[11px] font-semibold" style={{ color: cc }}>
        ▣ Cluster #{data.clusterId}
        {data.risk !== "none" && <span className="ml-1 text-gray-200">({riskText[data.risk]})</span>}
      </div>
      {data.label && <div className="truncate text-[10px] text-accent">{data.label}</div>}
      <div className="text-[9px] text-gray-300">
        {data.count} Adressen · ↓ {formatAmount(data.receivedSat, data.chain, 4)}
      </div>
      {data.hasRiskSource && (
        <div className="truncate rounded bg-red-700 px-1 text-[9px] font-semibold text-white">
          &#9888; enthält schädliche Adresse
        </div>
      )}
      {opts.showRisk && !data.hasRiskSource && data.riskFromSat > 0 && (
        <div className="text-[9px] font-semibold text-red-300">
          &#9888; {formatAmount(data.riskFromSat, data.chain, 4)} von schädlicher Herkunft
        </div>
      )}
      {opts.showTaint && data.taintSat > 0 && (
        <div className="text-[9px] text-orange-200">{formatAmount(data.taintSat, data.chain, 4)} aus der Quelle</div>
      )}
      <CommentBadge comment={comments[id]} />
      <Handle type="source" position={opts.rankdir === "TB" ? Position.Bottom : Position.Right} />
    </div>
  );
}

const nodeTypes = { address: AddressNodeView, tx: TxNodeView, cluster: ClusterNodeView };

/* ---------------- Beschriftungen für Screenreader ---------------- */

function addressAria(d: AddressNodeData): string {
  const parts = [`Adresse ${d.address === "coinbase" ? "Coinbase" : shortHash(d.address, 7)}`, riskWord[d.risk]];
  if (d.isStart) parts.push("Startknoten");
  if (d.isRiskSource) parts.push("als schädlich eingestufte Adresse");
  const main = d.labels.find((l) => l.own || (l.category !== "wallet" && l.category !== "other"));
  if (main) parts.push(`Label ${main.label}`);
  parts.push(`empfangen ${formatAmount(d.receivedSat, d.chain, 4)}`);
  parts.push(`gesendet ${formatAmount(d.sentSat, d.chain, 4)}`);
  if ((d.riskFromRatio ?? 0) > 0.001) parts.push(`${formatPercent(d.riskFromRatio || 0, 0)} von schädlicher Herkunft`);
  if ((d.taintRatio ?? 0) > 0.001) parts.push(`${formatPercent(d.taintRatio || 0, 0)} aus der Quelle`);
  if (d.clusterId) parts.push(`Cluster ${d.clusterId}`);
  parts.push(`Tiefe ${d.depth}`);
  return parts.join(", ");
}

function txAria(d: TxNodeData): string {
  const parts = [`Transaktion ${shortHash(d.txid, 5)}`];
  if (d.isStart) parts.push("Startknoten");
  parts.push(`${d.inputCount} Eingänge, ${d.outputCount} Ausgänge`);
  parts.push(`Betrag ${formatAmount(d.totalOutSat, d.chain, 4)}`);
  if (d.blockTime) parts.push(`vom ${formatDateShort(d.blockTime)}`);
  if (d.carriesRisk) parts.push("bewegt belastetes Geld");
  if (d.failed) parts.push("fehlgeschlagen");
  if (d.hints.length) parts.push(`Hinweise: ${d.hints.join("; ")}`);
  parts.push(`Tiefe ${d.depth}`);
  return parts.join(", ");
}

function clusterAria(d: ClusterData): string {
  const parts = [`Cluster ${d.clusterId}`, riskWord[d.risk]];
  if (d.label) parts.push(`Label ${d.label}`);
  parts.push(`${d.count} Adressen`);
  parts.push(`empfangen ${formatAmount(d.receivedSat, d.chain, 4)}`);
  if (d.hasRiskSource) parts.push("enthält eine als schädlich eingestufte Adresse");
  return parts.join(", ");
}

/**
 * Zeitachsen-Layout: die waagerechte Achse ist die Zeit, die senkrechte nur eine
 * Spur zur Vermeidung von Überdeckungen. Bei langen Ketten deutlich lesbarer als
 * das Stufenlayout, weil Abstände echten Zeiträumen entsprechen.
 */
function computeTimeLayout(
  result: TraceResult,
  visible: Set<string>,
  edges: { source: string; target: string }[],
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const times = new Map<string, number>();

  for (const n of result.nodes) {
    if (n.data.type === "tx" && n.data.blockTime) times.set(n.id, n.data.blockTime);
  }
  // Adressen erben den Mittelwert der Zeitpunkte ihrer Transaktionen
  const near = new Map<string, number[]>();
  for (const e of edges) {
    const st = times.get(e.source);
    const tt = times.get(e.target);
    if (tt !== undefined) (near.get(e.source) ?? near.set(e.source, []).get(e.source)!).push(tt);
    if (st !== undefined) (near.get(e.target) ?? near.set(e.target, []).get(e.target)!).push(st);
  }
  for (const n of result.nodes) {
    if (n.data.type !== "address") continue;
    const list = near.get(n.id);
    if (list?.length) times.set(n.id, list.reduce((a, b) => a + b, 0) / list.length);
  }

  const values = [...times.values()];
  if (values.length < 2) return out;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const width = Math.max(1400, Math.min(12000, values.length * 130));

  // Nach Zeit sortieren und Spuren vergeben, damit sich nichts überdeckt
  const ordered = [...visible]
    .filter((id) => times.has(id))
    .sort((a, b) => (times.get(a) ?? 0) - (times.get(b) ?? 0));
  const laneEndX: number[] = [];
  const GAP = 220;
  const LANE_HEIGHT = 100;

  for (const id of ordered) {
    const x = ((times.get(id)! - min) / span) * width;
    let lane = laneEndX.findIndex((end) => x > end);
    if (lane === -1) {
      lane = laneEndX.length;
      laneEndX.push(0);
    }
    laneEndX[lane] = x + GAP;
    out.set(id, { x, y: lane * LANE_HEIGHT });
  }

  // Knoten ohne Zeitangabe unterhalb ablegen
  let extra = 0;
  const baseY = laneEndX.length * LANE_HEIGHT + 60;
  for (const id of visible) {
    if (out.has(id)) continue;
    out.set(id, { x: (extra % 8) * 230, y: baseY + Math.floor(extra / 8) * LANE_HEIGHT });
    extra++;
  }
  return out;
}

/* ---------------- Aufbau der Struktur (teuer, selten) ---------------- */

interface BuiltEdge {
  id: string;
  source: string;
  target: string;
  valueSat: number;
  taintSat: number;
  riskSat: number;
  toRisk?: boolean;
  change?: boolean;
  coinbase?: boolean;
  token?: string;
}

interface GraphStructure {
  /** Knoten ohne Positions- und Darstellungsanteile */
  nodes: { id: string; type: "address" | "tx" | "cluster"; data: AnyNode["data"]; ariaLabel: string }[];
  edges: BuiltEdge[];
  layout: Map<string, { x: number; y: number }>;
  /** Nachbarschaft für die Hervorhebung bei Auswahl */
  adjacency: Map<string, Set<string>>;
  maxValueSat: number;
  layoutMs: number;
}

/**
 * Baut Knotenmenge, Kantenmenge und Layout auf. Hängt bewusst NUR an den
 * Angaben, die die Struktur verändern (Daten, Richtung, Filter, Ausblendungen,
 * gefaltete Cluster) — nicht an Auswahl, Farbgebung oder Kommentaren.
 */
function buildStructure(
  result: TraceResult,
  rankdir: GraphOptions["rankdir"],
  hideChange: boolean,
  onlyRisk: boolean,
  hiddenIds: string[],
  collapsedIds: number[],
): GraphStructure {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const chain = result.params.chain;
  const hidden = new Set(hiddenIds);
  const collapsed = new Set(collapsedIds);

  // Adressen eingeklappter Cluster auf einen Sammelknoten abbilden
  const clusterOf = new Map<string, number>();
  for (const c of result.clusters) {
    if (!collapsed.has(c.id)) continue;
    for (const a of c.addresses) clusterOf.set(`a:${a}`, c.id);
  }
  const remap = (id: string) => {
    const c = clusterOf.get(id);
    return c ? `c:${c}` : id;
  };

  const nodeById = new Map(result.nodes.map((n) => [n.id, n]));

  const clusterNodes = new Map<string, ClusterData>();
  for (const c of result.clusters) {
    if (!collapsed.has(c.id)) continue;
    let risk: AddressNodeData["risk"] = "none";
    let taintSat = 0;
    let riskFromSat = 0;
    let hasRiskSource = false;
    for (const a of c.addresses) {
      const n = nodeById.get(`a:${a}`);
      if (!n || n.data.type !== "address") continue;
      taintSat += n.data.taintSat ?? 0;
      riskFromSat += n.data.riskFromSat ?? 0;
      if (n.data.isRiskSource) hasRiskSource = true;
      const order = { none: 0, low: 1, medium: 2, high: 3 } as const;
      if (order[n.data.risk] > order[risk]) risk = n.data.risk;
    }
    clusterNodes.set(`c:${c.id}`, {
      type: "cluster",
      chain,
      clusterId: c.id,
      label: c.label,
      count: c.addresses.length,
      receivedSat: c.totalReceivedSat,
      risk,
      taintSat,
      riskFromSat,
      hasRiskSource,
    });
  }

  // Filter: nur Knoten, die belastetes Geld tragen oder selbst schädlich sind
  const riskyNodeIds = new Set<string>();
  if (onlyRisk) {
    for (const n of result.nodes) {
      if (n.data.type === "address" && (n.data.isRiskSource || (n.data.riskFromSat ?? 0) > 0)) riskyNodeIds.add(n.id);
      if (n.data.type === "tx" && n.data.carriesRisk) riskyNodeIds.add(n.id);
    }
    // Direkte Nachbarn der belasteten Knoten ebenfalls behalten
    for (const e of result.edges) {
      if (riskyNodeIds.has(e.source)) riskyNodeIds.add(e.target);
      if (riskyNodeIds.has(e.target) && (e.riskSat ?? 0) > 0) riskyNodeIds.add(e.source);
    }
  }
  const passesRisk = (id: string) => !onlyRisk || riskyNodeIds.has(id);

  const visibleNodeIds = new Set<string>();
  for (const n of result.nodes) {
    if (hidden.has(n.id) || !passesRisk(n.id)) continue;
    visibleNodeIds.add(remap(n.id));
  }
  for (const id of clusterNodes.keys()) visibleNodeIds.add(id);

  // Kanten zusammenfassen (Cluster-Faltung kann mehrere Kanten vereinen)
  const edgeMap = new Map<string, BuiltEdge>();
  for (const e of result.edges) {
    if (hideChange && e.change) continue;
    if (hidden.has(e.source) || hidden.has(e.target)) continue;
    if (!passesRisk(e.source) || !passesRisk(e.target)) continue;
    const s = remap(e.source);
    const t = remap(e.target);
    if (s === t) continue;
    if (!visibleNodeIds.has(s) || !visibleNodeIds.has(t)) continue;
    const key = `${s}>${t}`;
    const cur = edgeMap.get(key);
    if (cur) {
      cur.valueSat += e.valueSat;
      cur.taintSat += e.taintSat ?? 0;
      cur.riskSat += e.riskSat ?? 0;
      cur.toRisk = cur.toRisk || e.toRisk;
      cur.change = cur.change || e.change;
    } else {
      edgeMap.set(key, {
        id: key,
        source: s,
        target: t,
        valueSat: e.valueSat,
        taintSat: e.taintSat ?? 0,
        riskSat: e.riskSat ?? 0,
        toRisk: e.toRisk,
        change: e.change,
        coinbase: e.coinbase,
        token: e.token,
      });
    }
  }
  const visibleEdges = [...edgeMap.values()];

  /* --- Layout --- */
  const timeLayout = rankdir === "TIME" ? computeTimeLayout(result, visibleNodeIds, visibleEdges) : null;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: rankdir === "TB" ? "TB" : "LR",
    nodesep: 30,
    ranksep: rankdir === "TB" ? 75 : 115,
  });
  for (const id of visibleNodeIds) g.setNode(id, { width: id.startsWith("t:") ? 155 : 205, height: 74 });
  for (const e of visibleEdges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const layout = new Map<string, { x: number; y: number }>();
  for (const id of visibleNodeIds) {
    const t = timeLayout?.get(id);
    if (t) {
      layout.set(id, t);
      continue;
    }
    const p = g.node(id);
    layout.set(id, p ? { x: p.x - p.width / 2, y: p.y - p.height / 2 } : { x: 0, y: 0 });
  }

  // Nachbarschaft einmalig ablegen, damit die Auswahl später ohne Neuaufbau wirkt
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const s = adjacency.get(a) ?? adjacency.set(a, new Set([a])).get(a)!;
    s.add(b);
  };
  for (const e of visibleEdges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }

  const nodes: GraphStructure["nodes"] = [];
  for (const n of result.nodes) {
    if (hidden.has(n.id) || clusterOf.has(n.id) || !passesRisk(n.id)) continue;
    if (n.data.type === "address") {
      nodes.push({ id: n.id, type: "address", data: n.data as AddrNode["data"], ariaLabel: addressAria(n.data) });
    } else {
      nodes.push({ id: n.id, type: "tx", data: n.data as TxNode["data"], ariaLabel: txAria(n.data) });
    }
  }
  for (const [id, data] of clusterNodes) {
    nodes.push({ id, type: "cluster", data: data as ClusterNode["data"], ariaLabel: clusterAria(data) });
  }

  const maxValueSat = Math.max(1, ...visibleEdges.map((e) => e.valueSat));
  const layoutMs = (typeof performance !== "undefined" ? performance.now() : 0) - t0;
  return { nodes, edges: visibleEdges, layout, adjacency, maxValueSat, layoutMs };
}

/* ---------------- Komponente ---------------- */

export default function TraceGraph({
  result,
  opts,
  view,
  selectedId,
  onSelect,
  onMoveNode,
  height = "72vh",
}: {
  result: TraceResult;
  opts: GraphOptions;
  view: GraphViewState;
  selectedId: string | null;
  onSelect: (node: TraceNode | null, clusterId?: number) => void;
  onMoveNode?: (id: string, position: { x: number; y: number }) => void;
  height?: string;
}) {
  const chain = result.params.chain;
  const descId = useId();

  // Die aufrufenden Ansichten bauen `opts` bei jedem Rendern neu. Deshalb hängt
  // das teure Layout an einzelnen Werten, nicht am Objekt.
  const hiddenKey = view.hidden.join(" ");
  const collapsedKey = view.collapsedClusters.join(",");
  const structure = useMemo(
    () =>
      buildStructure(
        result,
        opts.rankdir,
        opts.hideChange,
        opts.onlyRisk,
        hiddenKey ? hiddenKey.split(" ") : [],
        collapsedKey ? collapsedKey.split(",").map(Number) : [],
      ),
    [result, opts.rankdir, opts.hideChange, opts.onlyRisk, hiddenKey, collapsedKey],
  );

  // Knotenobjekte: nur Struktur und Position. Darstellung läuft über den Kontext,
  // damit ein Umschalten von Farbe oder Auswahl die Liste nicht ersetzt.
  const positions = view.positions;
  const baseNodes = useMemo(
    () =>
      structure.nodes.map(
        (n) =>
          ({
            id: n.id,
            type: n.type,
            data: n.data,
            position: positions[n.id] ?? structure.layout.get(n.id) ?? { x: 0, y: 0 },
            ariaLabel: n.ariaLabel,
            focusable: true,
            ariaRole: "button",
          }) as AnyNode,
      ),
    [structure, positions],
  );

  // Eigener Zustand fürs Ziehen; wird beim Rendern an die Vorlage angeglichen.
  const [nodes, setNodes] = useState<AnyNode[]>(baseNodes);
  const [nodesRef, setNodesRef] = useState(baseNodes);
  if (nodesRef !== baseNodes) {
    setNodesRef(baseNodes);
    setNodes(baseNodes);
  }

  // Kantenbeschriftungen: ab der Schwelle aus, per Schalter erzwingbar.
  const labelLimit = opts.edgeLabelLimit ?? DEFAULT_EDGE_LABEL_LIMIT;
  const wanted = opts.forceEdgeLabels ?? false;
  const [forceLabels, setForceLabels] = useState(wanted);
  const [forceRef, setForceRef] = useState(wanted);
  if (forceRef !== wanted) {
    setForceRef(wanted);
    setForceLabels(wanted);
  }
  const overLimit = structure.edges.length > labelLimit;
  const showLabels = !overLimit || forceLabels;

  const neighbors = useMemo<ReadonlySet<string>>(
    () => (selectedId ? (structure.adjacency.get(selectedId) ?? new Set([selectedId])) : new Set<string>()),
    [structure, selectedId],
  );

  const appearance = useMemo<Appearance>(
    () => ({ opts, selectedId, neighbors, comments: view.comments }),
    // Bewusst nur die Darstellungswerte: eine neue `opts`-Kennung allein soll
    // nicht alle Knoten neu zeichnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      opts.rankdir,
      opts.colorByCluster,
      opts.showFiat,
      opts.showTaint,
      opts.showRisk,
      opts.priceEur,
      selectedId,
      neighbors,
      view.comments,
    ],
  );

  const edges = useMemo<Edge[]>(() => {
    const maxVal = structure.maxValueSat;
    return structure.edges.map((e) => {
      const hot = !!selectedId && (e.source === selectedId || e.target === selectedId);
      const dim = !!selectedId && !hot;
      const fiat =
        opts.showFiat && opts.priceEur !== undefined ? ` (${formatFiat(e.valueSat, opts.priceEur, chain)})` : "";
      const ratio = e.valueSat > 0 ? e.taintSat / e.valueSat : 0;
      const riskRatio = e.valueSat > 0 ? e.riskSat / e.valueSat : 0;
      const tc = opts.showTaint ? taintColor(ratio) : undefined;
      const rc = opts.showRisk ? riskColor(riskRatio) : undefined;
      // Warnung, wenn der Fluss belastetes Geld traegt oder auf eine schaedliche Adresse zeigt
      const warn = opts.showRisk && (riskRatio > 0.001 || !!e.toRisk);
      // Strichmuster statt reiner Farbe: jede Art von Fluss ist auch in
      // Graustufen unterscheidbar.
      const dash = e.change ? "2 3" : e.toRisk ? "6 3" : e.token ? "4 2" : warn ? "10 4" : undefined;
      const text = `${warn ? "⚠ " : ""}${e.token ? `${e.token} ` : ""}${formatAmount(e.valueSat, chain, 5)}${fiat}${
        e.change ? " ⟲" : ""
      }`;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: showLabels ? text : undefined,
        ariaLabel: `Fluss von ${e.source} nach ${e.target}, ${text}`,
        labelStyle: {
          fill: dim ? "#94a3b8" : warn ? "#fca5a5" : e.change ? "#fbbf24" : "#e2e8f0",
          fontSize: 9,
          fontWeight: warn ? 600 : 400,
        },
        labelBgStyle: { fill: "#0b0f17", fillOpacity: 0.85 },
        animated: (e.change || warn) && !dim,
        style: {
          stroke: hot ? "#ffffff" : rc || tc || (e.change ? "#fbbf24" : e.coinbase ? "#22c55e" : "#94a3b8"),
          strokeWidth: (hot ? 2 : 1) + (warn ? 1 : 0) + 4 * Math.sqrt(e.valueSat / maxVal),
          opacity: dim ? 0.25 : 1,
          strokeDasharray: dash,
        },
      };
    });
  }, [structure, selectedId, showLabels, chain, opts.showFiat, opts.showTaint, opts.showRisk, opts.priceEur]);

  const byId = useMemo(() => new Map(result.nodes.map((n) => [n.id, n])), [result]);

  const select = useCallback(
    (id: string) => {
      if (id.startsWith("c:")) onSelect(null, Number(id.slice(2)));
      else onSelect(byId.get(id) || null);
    },
    [byId, onSelect],
  );

  const nodeCount = structure.nodes.length;
  const edgeCount = structure.edges.length;

  return (
    <div
      className="relative min-h-[340px] w-full rounded-lg border border-border bg-black/30"
      style={{ height }}
      role="application"
      aria-label="Graph der Geldflüsse"
      aria-describedby={descId}
    >
      <p id={descId} className="sr-only">
        Darstellung von Geldflüssen zwischen Adressen und Transaktionen. Mit der Tabulatortaste wandern Sie von Knoten
        zu Knoten, mit der Eingabe- oder Leertaste wählen Sie den Knoten aus und laden seine Einzelheiten in die
        Seitenleiste. Mit den Pfeiltasten verschieben Sie einen ausgewählten Knoten, mit der Escape-Taste heben Sie die
        Auswahl auf. Risiko wird zusätzlich zur Farbe über Rahmenart, ein Zeichen und ein Kürzel im Text vermittelt;
        Wechselgeld und belastete Flüsse haben eigene Strichmuster.
      </p>

      <div
        className="pointer-events-none absolute right-2 top-2 z-10 rounded border border-border bg-panel/90 px-2 py-1 text-[10px] text-gray-300"
        aria-hidden="true"
      >
        {nodeCount} Knoten · {edgeCount} Kanten · Layout {structure.layoutMs.toFixed(1)} ms
      </div>

      {overLimit && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-2 rounded border border-border bg-panel/90 px-2 py-1 text-[10px] text-gray-300">
          <span>
            {showLabels
              ? `Beschriftungen erzwungen (${edgeCount} Kanten)`
              : `Beschriftungen ab ${labelLimit} Kanten ausgeblendet`}
          </span>
          <button
            type="button"
            className="rounded border border-border px-1 py-0.5 text-gray-100 hover:bg-white/10"
            onClick={() => setForceLabels((v) => !v)}
            aria-pressed={showLabels}
          >
            {showLabels ? "ausblenden" : "trotzdem zeigen"}
          </button>
        </div>
      )}

      <AppearanceCtx.Provider value={appearance}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) =>
            setNodes((ns) => {
              const moved = new Map<string, { x: number; y: number }>();
              for (const c of changes) {
                if (c.type !== "position" || !c.position) continue;
                moved.set(c.id, c.position);
                if (c.dragging === false && onMoveNode) onMoveNode(c.id, c.position);
              }
              if (moved.size === 0) return ns;
              return ns.map((n) => {
                const p = moved.get(n.id);
                return p ? ({ ...n, position: p } as AnyNode) : n;
              });
            })
          }
          onNodeClick={(_, n) => select(n.id)}
          // Auswahl per Tastatur (Eingabe-/Leertaste) meldet React Flow hierüber
          onSelectionChange={({ nodes: sel }) => {
            if (sel.length > 0 && sel[0].id !== selectedId) select(sel[0].id);
          }}
          onPaneClick={() => onSelect(null)}
          nodesFocusable
          elementsSelectable
          onlyRenderVisibleElements={nodeCount > (opts.virtualizeFrom ?? DEFAULT_VIRTUALIZE_FROM)}
          fitView
          minZoom={0.03}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              if (n.type === "tx") return "#334155";
              if (n.type === "cluster") return clusterColor(Number(n.id.slice(2))) || "#f7931a";
              const d = n.data as unknown as AddressNodeData;
              if (d.isRiskSource) return "#dc2626";
              if (opts.showRisk && (d.riskFromSat ?? 0) > 0) return "#ea580c";
              return (opts.colorByCluster && clusterColor(d.clusterId)) || (d.risk === "high" ? "#ef4444" : "#f7931a");
            }}
          />
        </ReactFlow>
      </AppearanceCtx.Provider>
    </div>
  );
}
