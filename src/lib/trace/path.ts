import { getAddressTxs, lookupLabels } from "../providers/registry";
import type { ProviderContext, TxInfo } from "../providers/types";
import { getBtcPrice } from "../providers/price";
import type { ChainId } from "../chains";
import { activityPattern } from "./heuristics";
import { classifyHarmful } from "./risk";
import { riskFromLabels } from "./engine";
import type { AddressNodeData, RiskSource, TraceEdge, TraceNode, TraceResult, TxNodeData } from "./types";

/**
 * Verbindungssuche zwischen zwei Adressen.
 *
 * Es wird gleichzeitig von beiden Seiten gesucht (bidirektionale Breitensuche):
 * vorwärts vom Startpunkt entlang der Geldflüsse und rückwärts vom Ziel entgegen
 * der Geldflüsse. Treffen sich beide Suchfronten, ist eine Verbindung gefunden.
 * Das ist deutlich sparsamer als eine einseitige Suche, weil beide Seiten nur
 * die halbe Tiefe abdecken müssen.
 */

export interface PathHop {
  txid: string;
  blockTime?: number;
  from: string;
  to: string;
  valueSat: number;
}

export interface FoundPath {
  hops: PathHop[];
  /** Engstelle: kleinster Betrag entlang des Weges */
  bottleneckSat: number;
  /** Zeitspanne zwischen erstem und letztem Schritt */
  firstSeen?: number;
  lastSeen?: number;
}

export interface PathParams {
  from: string;
  to: string;
  chain: ChainId;
  /** Maximale Anzahl Schritte je Suchrichtung */
  maxDepth: number;
  maxTxPerAddress: number;
  maxAddrPerTx: number;
  minValueSat: number;
  /** Obergrenze für Abfragen an die Datenquellen */
  maxApiCalls: number;
  maxPaths: number;
  /** true: nur Wege in Flussrichtung von A nach B; false: beliebige Verbindung */
  directed: boolean;
  /** Sehr aktive Adressen (Börsen) nicht weiterverfolgen */
  skipHubs: boolean;
  enrich: boolean;
}

export interface PathStats {
  apiCalls: number;
  addressesExpanded: number;
  durationMs: number;
  exhausted: boolean;
  hubsSkipped: number;
}

export interface PathResult {
  params: PathParams;
  found: boolean;
  paths: FoundPath[];
  /** Graphdarstellung der gefundenen Wege, kompatibel zur Trace-Ansicht */
  graph: TraceResult;
  stats: PathStats;
  warnings: string[];
  providersUsed: Record<string, number>;
}

export const DEFAULT_PATH_PARAMS: Omit<PathParams, "from" | "to"> = {
  chain: "bitcoin",
  maxDepth: 3,
  maxTxPerAddress: 8,
  maxAddrPerTx: 6,
  minValueSat: 1000,
  maxApiCalls: 120,
  maxPaths: 5,
  directed: true,
  skipHubs: true,
  enrich: true,
};

/** Schwelle, ab der eine Adresse als Umschlagplatz (Börse) gilt */
const HUB_TX_COUNT = 25;

interface Step {
  txid: string;
  blockTime?: number;
  /** Gegenadresse, von der aus dieser Schritt erreicht wurde */
  via: string;
  valueSat: number;
}

interface Side {
  /** Adresse -> Schritt, über den sie erreicht wurde */
  parent: Map<string, Step | null>;
  frontier: string[];
  depth: number;
}

export async function findPaths(ctx: ProviderContext, params: PathParams): Promise<PathResult> {
  const t0 = Date.now();
  const warnings: string[] = [];
  const providersUsed: Record<string, number> = {};
  let apiCalls = 0;
  let addressesExpanded = 0;
  let hubsSkipped = 0;

  const from = params.from.trim();
  const to = params.to.trim();

  const fwd: Side = { parent: new Map([[from, null]]), frontier: [from], depth: 0 };
  const bwd: Side = { parent: new Map([[to, null]]), frontier: [to], depth: 0 };

  /** Alle geladenen Transaktionen, für den Aufbau des Ergebnisgraphen */
  const txCache = new Map<string, TxInfo>();
  const meetings: string[] = [];

  const note = (p: string) => {
    apiCalls++;
    providersUsed[p] = (providersUsed[p] || 0) + 1;
  };

  async function loadTxs(address: string): Promise<TxInfo[] | null> {
    try {
      const r = await getAddressTxs(ctx, address, Math.max(params.maxTxPerAddress * 2, 25));
      note(r.provider);
      for (const t of r.data) txCache.set(t.txid, t);
      return r.data;
    } catch (e) {
      warnings.push(`${address}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /**
   * Erweitert eine Suchfront um eine Ebene.
   * `forward` = true folgt dem Geldfluss, false sucht die Herkunft.
   */
  async function expand(side: Side, forward: boolean, other: Side): Promise<void> {
    const next: string[] = [];
    // Adressen mit wenigen Transaktionen zuerst: sie führen eher zu aussagekräftigen Wegen
    for (const address of side.frontier) {
      if (apiCalls >= params.maxApiCalls) break;
      const txs = await loadTxs(address);
      if (!txs) continue;
      addressesExpanded++;

      if (params.skipHubs && txs.length >= HUB_TX_COUNT && side.depth > 0) {
        hubsSkipped++;
        continue;
      }

      const relevant = txs
        .filter((tx) => {
          const isSender = tx.inputs.some((i) => i.address === address);
          const isReceiver = tx.outputs.some((o) => o.address === address);
          if (!params.directed) return isSender || isReceiver;
          return forward ? isSender : isReceiver;
        })
        .slice(0, params.maxTxPerAddress);

      for (const tx of relevant) {
        // Gegenparteien dieser Transaktion bestimmen
        const counterparts: { address: string; valueSat: number }[] = [];

        // Vorwärts folgen wir dem Geld zu den Empfängern, rückwärts zu den
        // Absendern. Ohne Richtungsbindung werden beide Seiten genommen.
        const takeOutputs = !params.directed || forward;
        const takeInputs = !params.directed || !forward;

        if (takeOutputs) {
          // Weiter in Flussrichtung: Empfänger der Transaktion
          for (const o of tx.outputs) {
            if (!o.address || o.address === address) continue;
            if (o.valueSat < params.minValueSat) continue;
            counterparts.push({ address: o.address, valueSat: o.valueSat });
          }
        }
        if (takeInputs) {
          // Gegen die Flussrichtung: Absender der Transaktion
          for (const i of tx.inputs) {
            if (!i.address || i.address === address || i.coinbase) continue;
            if ((i.valueSat ?? 0) < params.minValueSat) continue;
            counterparts.push({ address: i.address, valueSat: i.valueSat ?? 0 });
          }
        }

        // Gegenparteien, die bereits von der anderen Suchseite erreicht wurden,
        // ergeben sofort eine Verbindung. Sie werden immer berücksichtigt, damit
        // ein Treffer nicht an der Begrenzung auf die größten Beträge scheitert.
        counterparts.sort((a, b) => b.valueSat - a.valueSat);
        const hits = counterparts.filter((c) => other.parent.has(c.address));
        const rest = counterparts.filter((c) => !other.parent.has(c.address)).slice(0, params.maxAddrPerTx);
        for (const c of [...hits, ...rest]) {
          if (side.parent.has(c.address)) continue;
          side.parent.set(c.address, {
            txid: tx.txid,
            blockTime: tx.blockTime,
            via: address,
            valueSat: c.valueSat,
          });
          next.push(c.address);
          if (other.parent.has(c.address) && !meetings.includes(c.address)) meetings.push(c.address);
        }
      }
      if (meetings.length >= params.maxPaths) break;
    }
    side.frontier = next;
    side.depth++;
  }

  // Direkter Treffer: Start und Ziel sind identisch
  if (from === to) {
    warnings.push("Start- und Zieladresse sind identisch.");
  }

  while (
    meetings.length < params.maxPaths &&
    apiCalls < params.maxApiCalls &&
    (fwd.depth < params.maxDepth || bwd.depth < params.maxDepth) &&
    (fwd.frontier.length > 0 || bwd.frontier.length > 0)
  ) {
    // Immer die kleinere Front erweitern – das hält die Anzahl der Abfragen niedrig
    const expandForward =
      bwd.frontier.length === 0 ||
      bwd.depth >= params.maxDepth ||
      (fwd.frontier.length <= bwd.frontier.length && fwd.depth < params.maxDepth && fwd.frontier.length > 0);
    if (expandForward) {
      if (fwd.depth >= params.maxDepth || !fwd.frontier.length) break;
      await expand(fwd, true, bwd);
    } else {
      if (bwd.depth >= params.maxDepth || !bwd.frontier.length) break;
      await expand(bwd, false, fwd);
    }
  }

  /* ---------------- Wege rekonstruieren ---------------- */
  const paths: FoundPath[] = [];
  for (const meet of meetings.slice(0, params.maxPaths)) {
    const head: PathHop[] = [];
    let cur: string | undefined = meet;
    while (cur) {
      const step: Step | null | undefined = fwd.parent.get(cur);
      if (!step) break;
      head.unshift({ txid: step.txid, blockTime: step.blockTime, from: step.via, to: cur, valueSat: step.valueSat });
      cur = step.via;
    }
    const tail: PathHop[] = [];
    cur = meet;
    while (cur) {
      const step: Step | null | undefined = bwd.parent.get(cur);
      if (!step) break;
      // Rückwärtsseite: der Schritt führt von `cur` zur Adresse `step.via`
      tail.push({ txid: step.txid, blockTime: step.blockTime, from: cur, to: step.via, valueSat: step.valueSat });
      cur = step.via;
    }
    const hops = [...head, ...tail];
    if (!hops.length) continue;
    const times = hops.map((h) => h.blockTime ?? 0).filter(Boolean);
    paths.push({
      hops,
      bottleneckSat: Math.min(...hops.map((h) => h.valueSat)),
      firstSeen: times.length ? Math.min(...times) : undefined,
      lastSeen: times.length ? Math.max(...times) : undefined,
    });
  }
  paths.sort((a, b) => a.hops.length - b.hops.length || b.bottleneckSat - a.bottleneckSat);

  /* ---------------- Graph für die Darstellung aufbauen ---------------- */
  const nodes = new Map<string, TraceNode>();
  const edges = new Map<string, TraceEdge>();
  const onPath = new Set<string>();

  const ensureAddress = (address: string, depth: number, isStart = false): AddressNodeData => {
    const id = `a:${address}`;
    let n = nodes.get(id);
    if (!n) {
      n = {
        id,
        data: {
          type: "address",
          address,
          chain: params.chain,
          depth,
          labels: [],
          risk: "none",
          receivedSat: 0,
          sentSat: 0,
          isStart,
        },
      };
      nodes.set(id, n);
    }
    return n.data as AddressNodeData;
  };

  for (const p of paths) {
    p.hops.forEach((h, i) => {
      onPath.add(h.from);
      onPath.add(h.to);
      const src = ensureAddress(h.from, i, h.from === from);
      const dst = ensureAddress(h.to, i + 1, h.to === to);
      src.sentSat += h.valueSat;
      dst.receivedSat += h.valueSat;

      const txId = `t:${h.txid}`;
      const tx = txCache.get(h.txid);
      if (!nodes.has(txId)) {
        const data: TxNodeData = {
          type: "tx",
          txid: h.txid,
          chain: params.chain,
          depth: i,
          blockTime: h.blockTime ?? tx?.blockTime,
          blockHeight: tx?.blockHeight,
          feeSat: tx?.feeSat,
          inputCount: tx?.inputs.length ?? 0,
          outputCount: tx?.outputs.length ?? 0,
          totalInSat: tx?.inputs.reduce((s, x) => s + (x.valueSat || 0), 0) ?? 0,
          totalOutSat: tx?.outputs.reduce((s, x) => s + x.valueSat, 0) ?? h.valueSat,
          hints: [],
        };
        nodes.set(txId, { id: txId, data });
      }
      const inId = `${h.from}>${h.txid}`;
      if (!edges.has(inId)) edges.set(inId, { id: inId, source: `a:${h.from}`, target: txId, valueSat: h.valueSat });
      const outId = `${h.txid}>${h.to}`;
      if (!edges.has(outId)) edges.set(outId, { id: outId, source: txId, target: `a:${h.to}`, valueSat: h.valueSat });
    });
  }
  ensureAddress(from, 0, true).isStart = true;
  if (nodes.has(`a:${to}`)) (nodes.get(`a:${to}`)!.data as AddressNodeData).isStart = true;

  /* ---------------- Labels und Risiko ---------------- */
  const riskSources: RiskSource[] = [];
  if (params.enrich && onPath.size) {
    const list = [...onPath].slice(0, 40);
    const BATCH = 6;
    for (let i = 0; i < list.length; i += BATCH) {
      await Promise.all(
        list.slice(i, i + BATCH).map(async (address) => {
          try {
            const r = await lookupLabels(ctx, address);
            const d = ensureAddress(address, 0);
            d.labels.push(...r.labels);
          } catch {
            /* Label-Quelle nicht erreichbar */
          }
        }),
      );
    }
    for (const n of nodes.values()) {
      if (n.data.type !== "address") continue;
      n.data.risk = riskFromLabels(n.data.labels);
      const verdict = classifyHarmful(n.data.labels, false);
      if (!verdict) continue;
      n.data.isRiskSource = true;
      riskSources.push({
        address: n.data.address,
        label: verdict.label,
        category: verdict.category,
        source: verdict.source,
        severity: verdict.severity,
        outflowSat: n.data.sentSat,
        affectedAddresses: 0,
      });
    }
  }

  const times = [...nodes.values()]
    .filter((n): n is TraceNode & { data: TxNodeData } => n.data.type === "tx")
    .map((n) => n.data.blockTime ?? 0)
    .filter(Boolean);

  let priceEur: number | undefined;
  try {
    priceEur = (await getBtcPrice(params.chain)).eur;
  } catch {
    priceEur = undefined;
  }

  const graph: TraceResult = {
    params: {
      start: from,
      chain: params.chain,
      mode: "address",
      direction: params.directed ? "forward" : "both",
      taintModel: "none",
      maxDepth: params.maxDepth,
      maxTxPerAddress: params.maxTxPerAddress,
      maxAddrPerTx: params.maxAddrPerTx,
      minValueSat: params.minValueSat,
      maxNodes: 1000,
      enrich: params.enrich,
    },
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    clusters: [],
    activity: activityPattern(times),
    peeling: [],
    riskSources,
    // Für die Verbindungssuche nicht ausgewertet
    fingerprints: [],
    deposits: [],
    crossChain: [],
    stats: {
      addresses: [...nodes.values()].filter((n) => n.data.type === "address").length,
      txs: [...nodes.values()].filter((n) => n.data.type === "tx").length,
      apiCalls,
      durationMs: Date.now() - t0,
      truncated: false,
    },
    warnings,
    providersUsed,
    priceEur,
  };

  return {
    params,
    found: paths.length > 0,
    paths,
    graph,
    stats: {
      apiCalls,
      addressesExpanded,
      durationMs: Date.now() - t0,
      exhausted: apiCalls >= params.maxApiCalls,
      hubsSkipped,
    },
    warnings,
    providersUsed,
  };
}
