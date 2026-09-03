import type { AddressNodeData, TaintModel, TraceEdge, TraceNode, TxNodeData } from "./types";

/**
 * Flussverfolgung im Graph: verteilt Beträge von Quellknoten über die
 * Transaktionen weiter. Wird für zwei Zwecke genutzt:
 *
 * 1. Taint-Analyse ab dem Startpunkt der Untersuchung.
 * 2. Herkunfts-Warnung ab allen als schädlich erkannten Adressen.
 *
 * Modelle:
 * - haircut: jede Ausgabe erbt den Anteil der gesamten Transaktion.
 *   Konservativ und weit verbreitet, verwässert aber über viele Hops.
 * - poison: sobald eine Transaktion belastetes Geld enthält, gelten alle
 *   Ausgaben als vollständig belastet. Sehr streng.
 * - fifo: „first in, first out“ – Eingänge werden der Reihe nach den Ausgängen
 *   zugeordnet. Entspricht der Rechtsprechung in mehreren Ländern (Clayton's Case).
 */

export interface FlowResult {
  /** Belasteter Anteil je Kante (Kanten-ID -> Betrag) */
  edgeAmount: Map<string, number>;
  /** Belasteter Zufluss je Adressknoten (Knoten-ID -> Betrag) */
  nodeAmount: Map<string, number>;
  /** Quellen, aus denen der Betrag stammt (Knoten-ID -> Quelladressen) */
  nodeSources: Map<string, Set<string>>;
  /** Belasteter Betrag, der an Endpunkten im Graph liegen bleibt */
  totalOut: number;
}

const MAX_SOURCES = 8;

function mergeSources(target: Set<string>, from: Set<string>) {
  for (const s of from) {
    if (target.size >= MAX_SOURCES) return;
    target.add(s);
  }
}

/**
 * @param seeds Quellknoten mit ihrem belasteten Ausgangsbetrag
 * @param trackSources Herkunft je Knoten mitführen (für die Warnungsanzeige)
 */
export function propagateFlow(
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  seeds: Map<string, number>,
  model: Exclude<TaintModel, "none">,
  trackSources = false,
): FlowResult {
  const edgeAmount = new Map<string, number>();
  const nodeAmount = new Map<string, number>();
  const nodeSources = new Map<string, Set<string>>();
  const result: FlowResult = { edgeAmount, nodeAmount, nodeSources, totalOut: 0 };
  if (!seeds.size) return result;

  const inEdges = new Map<string, TraceEdge[]>();
  const outEdges = new Map<string, TraceEdge[]>();
  for (const e of edges) {
    (outEdges.get(e.source) ?? outEdges.set(e.source, []).get(e.source)!).push(e);
    (inEdges.get(e.target) ?? inEdges.set(e.target, []).get(e.target)!).push(e);
    edgeAmount.set(e.id, 0);
  }

  /** Noch nicht weitergegebener belasteter Betrag je Knoten */
  const available = new Map<string, number>(seeds);
  /** Herkunft des verfügbaren Betrags je Knoten */
  const availableSources = new Map<string, Set<string>>();
  if (trackSources) {
    for (const id of seeds.keys()) availableSources.set(id, new Set([id]));
  }

  // Transaktionen chronologisch abarbeiten; ohne Zeitstempel nach Tiefe
  const txNodes = [...nodes.values()]
    .filter((n): n is TraceNode & { data: TxNodeData } => n.data.type === "tx")
    .sort((a, b) => (a.data.blockTime ?? Infinity) - (b.data.blockTime ?? Infinity) || a.data.depth - b.data.depth);

  const seedTxIds = new Set([...seeds.keys()].filter((id) => id.startsWith("t:")));

  for (const tx of txNodes) {
    const ins = inEdges.get(tx.id) || [];
    const outs = (outEdges.get(tx.id) || []).slice().sort((a, b) => a.id.localeCompare(b.id));
    if (!outs.length) continue;

    // Ist die Transaktion selbst Quelle, gelten alle ihre Ausgänge als belastet
    if (seedTxIds.has(tx.id)) {
      for (const e of outs) {
        edgeAmount.set(e.id, e.valueSat);
        available.set(e.target, (available.get(e.target) ?? 0) + e.valueSat);
        if (trackSources) {
          const set = availableSources.get(e.target) ?? new Set<string>();
          set.add(tx.id);
          availableSources.set(e.target, set);
        }
      }
      continue;
    }

    // Belasteten Anteil aus den Eingängen einsammeln
    const txSources = new Set<string>();
    for (const e of ins) {
      const avail = available.get(e.source) ?? 0;
      if (avail <= 0) continue;
      const take = Math.min(avail, e.valueSat);
      edgeAmount.set(e.id, (edgeAmount.get(e.id) ?? 0) + take);
      available.set(e.source, avail - take);
      if (trackSources) {
        const from = availableSources.get(e.source);
        if (from) mergeSources(txSources, from);
      }
    }
    const amountIn = ins.reduce((s, e) => s + (edgeAmount.get(e.id) ?? 0), 0);
    if (amountIn <= 0) continue;
    const totalIn = ins.reduce((s, e) => s + e.valueSat, 0) || amountIn;
    const totalOut = outs.reduce((s, e) => s + e.valueSat, 0);
    if (totalOut <= 0) continue;

    if (model === "poison") {
      for (const e of outs) edgeAmount.set(e.id, e.valueSat);
    } else if (model === "haircut") {
      const ratio = Math.min(1, amountIn / totalIn);
      for (const e of outs) edgeAmount.set(e.id, Math.round(e.valueSat * ratio));
    } else {
      // FIFO: Eingänge in Reihenfolge auf Ausgänge abbilden
      const flat: { loaded: boolean; left: number }[] = [];
      for (const e of ins) {
        const t = edgeAmount.get(e.id) ?? 0;
        if (t > 0) flat.push({ loaded: true, left: t });
        if (e.valueSat - t > 0) flat.push({ loaded: false, left: e.valueSat - t });
      }
      let idx = 0;
      for (const e of outs) {
        let need = e.valueSat;
        let loaded = 0;
        while (need > 0 && idx < flat.length) {
          const chunk = Math.min(need, flat[idx].left);
          if (flat[idx].loaded) loaded += chunk;
          flat[idx].left -= chunk;
          need -= chunk;
          if (flat[idx].left <= 0) idx++;
        }
        edgeAmount.set(e.id, loaded);
      }
    }

    for (const e of outs) {
      const amount = edgeAmount.get(e.id) ?? 0;
      if (amount <= 0) continue;
      available.set(e.target, (available.get(e.target) ?? 0) + amount);
      if (trackSources && txSources.size) {
        const set = availableSources.get(e.target) ?? new Set<string>();
        mergeSources(set, txSources);
        availableSources.set(e.target, set);
      }
    }
  }

  // Ergebnis je Adressknoten zusammenfassen
  for (const n of nodes.values()) {
    if (n.data.type !== "address") continue;
    const incoming = (inEdges.get(n.id) || []).reduce((s, e) => s + (edgeAmount.get(e.id) ?? 0), 0);
    nodeAmount.set(n.id, incoming);
    if (trackSources) {
      const set = availableSources.get(n.id);
      // Der Quellknoten selbst wird nicht als eigene Herkunft geführt
      if (set) nodeSources.set(n.id, new Set([...set].filter((s) => s !== n.id)));
    }
    const spentOn = (outEdges.get(n.id) || []).reduce((s, e) => s + (edgeAmount.get(e.id) ?? 0), 0);
    if (!seeds.has(n.id)) result.totalOut += Math.max(0, incoming - spentOn);
  }
  return result;
}

/**
 * Taint-Analyse ab dem Startpunkt. Schreibt das Ergebnis direkt in die Knoten
 * und Kanten des Graphen.
 */
export function propagateTaint(
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  startIds: string[],
  model: TaintModel,
): { taintedOutSat: number } {
  if (model === "none") return { taintedOutSat: 0 };

  const seeds = new Map<string, number>();
  const outSum = new Map<string, number>();
  for (const e of edges) outSum.set(e.source, (outSum.get(e.source) ?? 0) + e.valueSat);
  for (const id of startIds) {
    const n = nodes.get(id);
    if (!n) continue;
    const out = outSum.get(id) ?? 0;
    const own = n.data.type === "address" ? Math.max(n.data.sentSat, out) : n.data.totalOutSat;
    seeds.set(id, Math.max(out, own));
  }

  const flow = propagateFlow(nodes, edges, seeds, model);
  for (const e of edges) e.taintSat = flow.edgeAmount.get(e.id) ?? 0;
  for (const n of nodes.values()) {
    if (n.data.type !== "address") continue;
    const d = n.data as AddressNodeData;
    const incoming = flow.nodeAmount.get(n.id) ?? 0;
    const isStart = startIds.includes(n.id);
    d.taintSat = isStart ? Math.max(d.sentSat, d.receivedSat) : incoming;
    d.taintRatio = d.receivedSat > 0 ? Math.min(1, incoming / d.receivedSat) : isStart ? 1 : 0;
  }
  return { taintedOutSat: flow.totalOut };
}
