import { getAddressTxs, getOutspends, getTx, lookupLabels } from "../providers/registry";
import { lightningForTx, lightningHint } from "../providers/lightning";
import { getHistoricalPrices, priceAt } from "../providers/price";
import type { AddressLabel, ProviderContext, TxInfo } from "../providers/types";
import { chainMeta, isChainTxid } from "../chains";
import { propagateFlow, propagateTaint } from "./taint";
import { categoryText, classifyHarmful } from "./risk";
import { groupByFingerprint, walletFingerprint } from "./fingerprint";
import { detectDepositInGraph, depositHint } from "./deposit";
import { crossChainHint, detectSwapService } from "./crosschain";
import {
  activityPattern,
  behaviorLabels,
  collectBehavior,
  detectChange,
  detectPeeling,
  maxEqualOutputs,
  txHints,
} from "./heuristics";
import type {
  AddressNodeData,
  RiskSource,
  TraceCluster,
  TraceDirection,
  TraceEdge,
  TraceNode,
  TraceParams,
  TraceProgress,
  TraceResult,
  TxNodeData,
} from "./types";

/* ---------- Union-Find für Common-Input-Clustering ---------- */
class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (this.parent.get(c) !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  groups(): Map<string, string[]> {
    const g = new Map<string, string[]>();
    for (const k of this.parent.keys()) {
      const r = this.find(k);
      if (!g.has(r)) g.set(r, []);
      g.get(r)!.push(k);
    }
    return g;
  }
}

const aid = (a: string) => `a:${a}`;
/** Stabiler Bezeichner für einen Ausgang ohne Adresse (P2PK, Bare-Multisig) */
const outRef = (txid: string, n: number) => `out:${txid}:${n}`;
const tid = (t: string) => `t:${t}`;

interface AddressQueueItem {
  kind: "address";
  address: string;
  depth: number;
  direction: TraceDirection;
}
interface OutputQueueItem {
  kind: "output";
  txid: string;
  vout: number;
  depth: number;
}
type QueueItem = AddressQueueItem | OutputQueueItem;

export interface RunTraceOptions {
  onProgress?: (p: TraceProgress) => void;
  signal?: AbortSignal;
}

export async function runTrace(
  ctx: ProviderContext,
  params: TraceParams,
  opts: RunTraceOptions = {},
): Promise<TraceResult> {
  const t0 = Date.now();
  const nodes = new Map<string, TraceNode>();
  const edges = new Map<string, TraceEdge>();
  const txSeen = new Map<string, TxInfo>();
  const addrVisited = new Set<string>();
  const uf = new UnionFind();
  const warnings: string[] = [];
  const providersUsed: Record<string, number> = {};
  const startIds: string[] = [];
  const chain = params.chain;
  const isEvm = chainMeta(chain).kind === "account";
  let apiCalls = 0;
  let truncated = false;
  const queue: QueueItem[] = [];

  const noteProvider = (p: string) => {
    apiCalls++;
    providersUsed[p] = (providersUsed[p] || 0) + 1;
  };

  let lastEmit = 0;
  const emit = (phase: TraceProgress["phase"], message: string, force = false) => {
    if (!opts.onProgress) return;
    const now = Date.now();
    if (!force && now - lastEmit < 250) return;
    lastEmit = now;
    opts.onProgress({ phase, message, nodes: nodes.size, edges: edges.size, apiCalls });
  };
  const aborted = () => opts.signal?.aborted === true;

  function ensureAddress(address: string, depth: number, isStart = false): AddressNodeData {
    const id = aid(address);
    let n = nodes.get(id);
    if (!n) {
      n = {
        id,
        data: {
          type: "address",
          address,
          chain,
          depth,
          labels: [],
          risk: "none",
          receivedSat: 0,
          sentSat: 0,
          isStart,
        },
      };
      nodes.set(id, n);
    } else if (depth < n.data.depth) n.data.depth = depth;
    if (isStart) (n.data as AddressNodeData).isStart = true;
    return n.data as AddressNodeData;
  }

  function addEdge(e: TraceEdge) {
    const existing = edges.get(e.id);
    if (existing) existing.valueSat = Math.max(existing.valueSat, e.valueSat);
    else edges.set(e.id, e);
  }

  /** Fügt eine Transaktion mit Kanten in den Graphen ein und liefert Nachbarn. */
  function addTx(tx: TxInfo, depth: number, isStart = false): { inputs: string[]; outputs: string[] } {
    const id = tid(tx.txid);
    txSeen.set(tx.txid, tx);
    const inAddrs = tx.inputs.filter((i) => i.address && !i.coinbase).map((i) => i.address!);
    const uniqueIn = [...new Set(inAddrs)];
    const isCoinbase = tx.inputs.some((i) => i.coinbase);
    const totalIn = tx.inputs.reduce((s, i) => s + (i.valueSat || 0), 0);
    const totalOut = tx.outputs.reduce((s, o) => s + o.valueSat, 0);
    // Alte P2PK- und Bare-Multisig-Ausgänge haben keine Adresse, nur ein Skript.
    // Sie bekommen einen Platzhalter, damit die Kette nicht abreißt.
    const placeholder = (o: { n: number }) => outRef(tx.txid, o.n);
    const hasNoAddressButValue = (o: { address?: string; valueSat: number; scriptType?: string }) =>
      !o.address && o.valueSat > 0 && o.scriptType !== "op_return" && o.scriptType !== "nulldata";
    const spendable = tx.outputs
      .filter((o) => (o.address && (o.valueSat > 0 || o.token)) || hasNoAddressButValue(o))
      .map((o) => ({
        n: o.n,
        address: o.address ?? placeholder(o),
        valueSat: o.valueSat,
        token: o.token,
        internal: o.internal,
        synthetic: !o.address,
        scriptType: o.scriptType,
      }));

    // Common-Input-Ownership gilt nur für UTXO-Chains
    if (!isEvm && uniqueIn.length > 1) for (let i = 1; i < uniqueIn.length; i++) uf.union(uniqueIn[0], uniqueIn[i]);

    const equal = maxEqualOutputs(spendable.filter((o) => !o.token).map((o) => o.valueSat));
    const hints = isEvm
      ? tx.failed
        ? ["Transaktion fehlgeschlagen (Gas verbraucht, kein Transfer)"]
        : []
      : txHints(tx, uniqueIn, spendable.length, equal);

    // Wechselgeld-Heuristik (nur UTXO)
    let changeIdx = -1;
    if (!isEvm && !isCoinbase) {
      const plain = spendable.filter((o) => !o.token && !o.synthetic);
      const res = detectChange(plain, uniqueIn);
      if (res) {
        changeIdx = plain[res.index].n;
        hints.push(`Output #${changeIdx} vermutlich Wechselgeld (${res.reason})`);
        uf.union(uniqueIn[0], plain[res.index].address);
      }
    }

    const data: TxNodeData = {
      type: "tx",
      txid: tx.txid,
      chain,
      depth,
      blockTime: tx.blockTime,
      blockHeight: tx.blockHeight,
      feeSat: tx.feeSat,
      inputCount: tx.inputs.length,
      outputCount: tx.outputs.length,
      totalInSat: totalIn,
      totalOutSat: totalOut,
      hints,
      isStart,
      failed: tx.failed,
    };
    const prev = nodes.get(id);
    if (prev && prev.data.type === "tx" && prev.data.depth < depth) data.depth = prev.data.depth;
    nodes.set(id, { id, data });

    // Eingangskanten (pro Adresse aggregiert)
    const inAgg = new Map<string, number>();
    for (const i of tx.inputs) {
      if (i.coinbase) {
        const cb = ensureAddress("coinbase", depth);
        cb.labels = [{ source: "chainer", label: "Neu geschürfte Coins", category: "mining" }];
        addEdge({ id: `cb>${tx.txid}`, source: aid("coinbase"), target: id, valueSat: totalOut, coinbase: true });
        continue;
      }
      // Eingang, dessen Vorgänger-Ausgang keine Adresse hat (P2PK): denselben
      // Platzhalter verwenden wie beim Anlegen des Ausgangs.
      const key = i.address ?? (i.txid && i.vout !== undefined ? outRef(i.txid, i.vout) : undefined);
      if (!key) continue;
      inAgg.set(key, (inAgg.get(key) || 0) + (i.valueSat || 0));
    }
    for (const [a, v] of inAgg) {
      const nd = ensureAddress(a, depth);
      nd.sentSat += v;
      addEdge({ id: `${a}>${tx.txid}`, source: aid(a), target: id, valueSat: v });
    }

    // Ausgangskanten
    const outAgg = new Map<
      string,
      { v: number; change: boolean; token?: string; synthetic?: boolean; scriptType?: string }
    >();
    for (const o of spendable) {
      if (!o.token && o.valueSat < params.minValueSat) continue;
      const prevOut = outAgg.get(o.address) || { v: 0, change: false, token: undefined as string | undefined };
      prevOut.v += o.valueSat;
      if (o.n === changeIdx) prevOut.change = true;
      if (o.token) prevOut.token = o.token.symbol;
      if (o.synthetic) {
        prevOut.synthetic = true;
        prevOut.scriptType = o.scriptType;
      }
      outAgg.set(o.address, prevOut);
    }
    for (const [a, info] of outAgg) {
      const nd = ensureAddress(a, depth);
      nd.receivedSat += info.v;
      if (info.synthetic && !nd.labels.length) {
        nd.labels.push({
          source: "chainer",
          label: `Ausgang ohne Adresse (${info.scriptType || "Skript"})`,
          category: "other",
        });
      }
      addEdge({
        id: `${tx.txid}>${a}`,
        source: id,
        target: aid(a),
        valueSat: info.v,
        change: info.change || undefined,
        token: info.token,
      });
    }

    const outputs = [...outAgg.entries()]
      .sort((x, y) => y[1].v - x[1].v)
      .slice(0, params.maxAddrPerTx)
      .map(([a]) => a);
    const inputs = [...inAgg.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, params.maxAddrPerTx)
      .map(([a]) => a);
    return { inputs, outputs };
  }

  function enqueueAddresses(addresses: string[], depth: number, direction: TraceDirection) {
    for (const a of addresses) {
      if (addrVisited.has(a) || a === "coinbase") continue;
      queue.push({ kind: "address", address: a, depth, direction });
    }
  }

  async function loadTx(txid: string): Promise<TxInfo | null> {
    const cached = txSeen.get(txid);
    if (cached) return cached;
    try {
      const r = await getTx(ctx, txid);
      noteProvider(r.provider);
      return r.data;
    } catch (e) {
      warnings.push(`Transaktion ${txid.slice(0, 12)}…: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /* ---------- Start (ein oder mehrere Startpunkte) ---------- */
  const allStarts = [params.start, ...(params.starts ?? [])]
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i);
  emit("traversal", `${allStarts.length} Startpunkt(e) werden geladen`, true);

  for (const start of allStarts) {
    if (isChainTxid(start, chain)) {
      const tx = await loadTx(start);
      if (!tx) {
        warnings.push(`Startpunkt ${start.slice(0, 12)}… konnte nicht geladen werden.`);
        continue;
      }
      const { inputs, outputs } = addTx(tx, 0, true);
      startIds.push(tid(tx.txid));
      if (params.mode === "utxo") {
        // Nur die konkreten Ausgänge weiterverfolgen
        for (const o of tx.outputs) {
          if (o.valueSat >= params.minValueSat) queue.push({ kind: "output", txid: tx.txid, vout: o.n, depth: 0 });
        }
        if (params.direction !== "forward") enqueueAddresses(inputs, 0, "backward");
      } else {
        if (params.direction !== "backward") enqueueAddresses(outputs, 0, "forward");
        if (params.direction !== "forward") enqueueAddresses(inputs, 0, "backward");
      }
    } else {
      ensureAddress(start, 0, true);
      startIds.push(aid(start));
      queue.push({ kind: "address", address: start, depth: 0, direction: params.direction });
    }
  }
  if (!startIds.length) throw new Error(`Kein Startpunkt konnte geladen werden. ${warnings[warnings.length - 1] ?? ""}`);

  /* ---------- Durchlauf ---------- */
  while (queue.length) {
    if (aborted()) {
      warnings.push("Abgebrochen.");
      truncated = true;
      break;
    }
    if (nodes.size >= params.maxNodes) {
      truncated = true;
      warnings.push(`Knotenlimit (${params.maxNodes}) erreicht – Graph unvollständig.`);
      break;
    }
    const item = queue.shift()!;

    /* --- UTXO-genaue Verfolgung eines einzelnen Ausgangs --- */
    if (item.kind === "output") {
      if (item.depth >= params.maxDepth) {
        truncated = true;
        continue;
      }
      const tx = txSeen.get(item.txid) ?? (await loadTx(item.txid));
      if (!tx) continue;
      const out = tx.outputs.find((o) => o.n === item.vout);
      if (!out) continue;
      // Auch Ausgänge ohne Adresse (P2PK) werden weiterverfolgt
      const outKey = out.address ?? outRef(tx.txid, out.n);
      let spendTxid = out.spentTxid;
      if (!spendTxid && out.spent !== false) {
        try {
          const r = await getOutspends(ctx, item.txid);
          noteProvider(r.provider);
          const s = r.data[item.vout];
          spendTxid = s?.txid;
          if (s && !s.spent) {
            const nd = ensureAddress(outKey, item.depth);
            nd.labels.push({ source: "chainer", label: "noch nicht ausgegeben", category: "other" });
          }
        } catch (e) {
          warnings.push(`Outspends ${item.txid.slice(0, 10)}…: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!spendTxid) {
        ensureAddress(outKey, item.depth).truncated = true;
        continue;
      }
      const next = await loadTx(spendTxid);
      if (!next) continue;
      const { outputs: nextOuts } = addTx(next, item.depth + 1);
      void nextOuts;
      for (const o of next.outputs) {
        if (o.valueSat >= params.minValueSat && o.address !== outKey) {
          queue.push({ kind: "output", txid: next.txid, vout: o.n, depth: item.depth + 1 });
        }
      }
      emit("traversal", `Coins verfolgt: ${txSeen.size} Transaktionen`);
      continue;
    }

    /* --- Adressbasierte Verfolgung --- */
    if (addrVisited.has(item.address)) continue;
    addrVisited.add(item.address);
    const nd = ensureAddress(item.address, item.depth);
    if (item.depth >= params.maxDepth) {
      nd.truncated = true;
      continue;
    }
    let txs: TxInfo[];
    try {
      const r = await getAddressTxs(ctx, item.address, Math.max(params.maxTxPerAddress * 2, 25));
      noteProvider(r.provider);
      txs = r.data;
    } catch (e) {
      warnings.push(`${item.address}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (txs.length >= 25 && item.depth > 0) {
      // Sehr aktive Adresse (Börse/Dienst) – nicht tiefer verfolgen
      nd.truncated = true;
      nd.labels.push({ source: "chainer", label: "Sehr aktive Adresse (nur Auszug)", category: "other" });
    }
    const relevant = txs.filter((tx) => {
      const asInput = tx.inputs.some((i) => i.address === item.address);
      const asOutput = tx.outputs.some((o) => o.address === item.address);
      if (item.direction === "forward") return asInput;
      if (item.direction === "backward") return asOutput;
      return asInput || asOutput;
    });
    const picked = relevant.slice(0, params.maxTxPerAddress);
    if (relevant.length > picked.length) nd.truncated = true;
    for (const tx of picked) {
      if (txSeen.has(tx.txid)) continue;
      const { inputs, outputs } = addTx(tx, item.depth + 1);
      const asInput = tx.inputs.some((i) => i.address === item.address);
      if (item.direction === "both") {
        enqueueAddresses(outputs, item.depth + 1, "both");
        enqueueAddresses(inputs, item.depth + 1, "both");
      } else if (item.direction === "forward" && asInput) {
        enqueueAddresses(outputs, item.depth + 1, "forward");
      } else if (item.direction === "backward" && !asInput) {
        enqueueAddresses(inputs, item.depth + 1, "backward");
      }
    }
    emit("traversal", `${addrVisited.size} Adressen, ${txSeen.size} Transaktionen`);
  }
  if (queue.length) truncated = true;

  const edgeList = [...edges.values()];
  const addrNodes = [...nodes.values()].filter(
    (n): n is TraceNode & { data: AddressNodeData } => n.data.type === "address" && n.data.address !== "coinbase",
  );

  /* ---------- Taint ---------- */
  emit("taint", "Taint-Analyse", true);
  const { taintedOutSat } = propagateTaint(nodes, edgeList, startIds, params.taintModel);

  /* ---------- Cluster (inkl. manueller Zusammenführungen) ---------- */
  emit("cluster", "Cluster werden gebildet", true);
  for (const group of params.merges || []) {
    for (let i = 1; i < group.length; i++) if (group[0] && group[i]) uf.union(group[0], group[i]);
  }
  const manualSet = new Set((params.merges || []).flat());
  const clusters: TraceCluster[] = [];
  let cid = 1;
  for (const members of uf.groups().values()) {
    const inGraph = members.filter((m) => nodes.has(aid(m)));
    if (inGraph.length < 2) continue;
    const c: TraceCluster = {
      id: cid++,
      addresses: inGraph,
      manual: inGraph.some((m) => manualSet.has(m)) || undefined,
      totalReceivedSat: 0,
    };
    for (const m of inGraph) {
      const d = nodes.get(aid(m))!.data as AddressNodeData;
      d.clusterId = c.id;
      c.totalReceivedSat += d.receivedSat;
    }
    clusters.push(c);
  }

  /* ---------- Muster: Peeling, Aktivität, Verhalten ---------- */
  emit("heuristics", "Muster werden erkannt", true);
  const peeling = detectPeeling(nodes, edgeList);
  peeling.forEach((chain2) =>
    chain2.txids.forEach((t, i) => {
      const n = nodes.get(tid(t));
      if (n && n.data.type === "tx") {
        n.data.peelingIndex = i + 1;
        if (i === 0) n.data.hints.push(`Beginn einer Peeling-Kette über ${chain2.txids.length} Schritte`);
      }
    }),
  );
  const times = [...txSeen.values()].map((t) => t.blockTime ?? 0).filter(Boolean);
  const activity = activityPattern(times);

  for (const n of addrNodes) {
    const b = behaviorLabels(collectBehavior(n.data.address, nodes, edgeList));
    if (b.length) n.data.behavior = b;
  }

  /* ---------- Historische Kurse ---------- */
  let priceEur: number | undefined;
  if (params.historicPrices !== false) {
    const { series, current } = await getHistoricalPrices(chain, times);
    priceEur = current;
    if (series.length) {
      for (const n of nodes.values()) {
        if (n.data.type === "tx") n.data.priceEur = priceAt(series, n.data.blockTime);
      }
    }
  }

  /* ---------- Anreicherung: Labels und Lightning ---------- */
  if (params.enrich && !aborted()) {
    emit("enrich", "Labels werden abgefragt", true);
    const toEnrich = [...addrNodes]
      .sort((x, y) => y.data.receivedSat + y.data.sentSat - (x.data.receivedSat + x.data.sentSat))
      .slice(0, 40);
    const BATCH = 6;
    for (let i = 0; i < toEnrich.length; i += BATCH) {
      if (aborted()) break;
      await Promise.all(
        toEnrich.slice(i, i + BATCH).map(async (n) => {
          try {
            const r = await lookupLabels(ctx, n.data.address);
            n.data.labels.push(...r.labels);
          } catch {
            /* ignorieren */
          }
        }),
      );
      emit("enrich", `Labels: ${Math.min(i + BATCH, toEnrich.length)}/${toEnrich.length}`);
    }
  }
  for (const n of addrNodes) n.data.risk = riskFromLabels(n.data.labels);

  if (params.lightning !== false && chain === "bitcoin" && !aborted()) {
    emit("enrich", "Lightning-Kanäle werden geprüft", true);
    const txNodes = [...nodes.values()].filter(
      (n): n is TraceNode & { data: TxNodeData } => n.data.type === "tx",
    );
    // Nur Transaktionen mit genau einem Ausgang prüfen (Kanal-Fundings sind so aufgebaut)
    const candidates = txNodes.filter((n) => n.data.outputCount <= 3).slice(0, 25);
    const BATCH = 5;
    for (let i = 0; i < candidates.length; i += BATCH) {
      if (aborted()) break;
      await Promise.all(
        candidates.slice(i, i + BATCH).map(async (n) => {
          const ch = await lightningForTx(n.data.txid, chain);
          const hint = lightningHint(ch);
          if (hint) n.data.hints.push(hint);
        }),
      );
    }
  }

  /* ---------- Herkunfts-Warnung: Geld von schädlichen Adressen ---------- */
  emit("heuristics", "Herkunft wird bewertet", true);
  const riskSources: RiskSource[] = [];
  const riskSeeds = new Map<string, number>();
  const outSum = new Map<string, number>();
  for (const e of edgeList) outSum.set(e.source, (outSum.get(e.source) ?? 0) + e.valueSat);

  for (const n of addrNodes) {
    const verdict = classifyHarmful(n.data.labels, params.includeMediumRisk === true);
    if (!verdict) continue;
    n.data.isRiskSource = true;
    const outflow = outSum.get(n.id) ?? 0;
    riskSources.push({
      address: n.data.address,
      label: verdict.label,
      category: verdict.category,
      source: verdict.source,
      severity: verdict.severity,
      outflowSat: outflow,
      affectedAddresses: 0,
    });
    if (outflow > 0) riskSeeds.set(n.id, outflow);
  }

  let riskInflowSat = 0;
  let riskAffected = 0;
  if (riskSeeds.size) {
    const model = params.taintModel === "none" ? "haircut" : params.taintModel;
    const flow = propagateFlow(nodes, edgeList, riskSeeds, model, true);
    for (const e of edgeList) {
      const v = flow.edgeAmount.get(e.id) ?? 0;
      if (v > 0) e.riskSat = v;
    }
    const affectedPerSource = new Map<string, number>();
    for (const n of addrNodes) {
      const amount = flow.nodeAmount.get(n.id) ?? 0;
      if (amount <= 0) continue;
      n.data.riskFromSat = amount;
      n.data.riskFromRatio = n.data.receivedSat > 0 ? Math.min(1, amount / n.data.receivedSat) : 1;
      const src = flow.nodeSources.get(n.id);
      if (src?.size) {
        n.data.riskSources = [...src].map((id) => id.slice(2));
        for (const id of src) affectedPerSource.set(id, (affectedPerSource.get(id) ?? 0) + 1);
      }
      if (!n.data.isRiskSource) riskAffected++;
    }
    // Summe der Betraege, die an den Endpunkten der belasteten Wege liegen.
    // Ein Betrag, der ueber mehrere Adressen weitergereicht wurde, zaehlt einmal.
    riskInflowSat = flow.totalOut;
    for (const r of riskSources) r.affectedAddresses = affectedPerSource.get(aid(r.address)) ?? 0;

    // Transaktionen kennzeichnen, die belastetes Geld bewegen
    const labelOf = new Map(riskSources.map((r) => [r.address, r]));
    for (const n of nodes.values()) {
      if (n.data.type !== "tx") continue;
      const incoming = edgeList.filter((e) => e.target === n.id);
      const carried = incoming.reduce((sum, e) => sum + (e.riskSat ?? 0), 0);
      if (carried <= 0) continue;
      n.data.carriesRisk = true;
      // Quelle benennen: entweder ist der direkte Absender gemeldet, oder die
      // Herkunft steht bereits am Absenderknoten (mehrere Hops entfernt).
      const from = new Map<string, RiskSource>();
      for (const e of incoming) {
        if ((e.riskSat ?? 0) <= 0) continue;
        const direct = labelOf.get(e.source.slice(2));
        if (direct) {
          from.set(direct.address, direct);
          continue;
        }
        const nd = nodes.get(e.source)?.data;
        if (nd?.type === "address") {
          for (const a of nd.riskSources ?? []) {
            const r = labelOf.get(a);
            if (r) from.set(r.address, r);
          }
        }
      }
      const via = from.size
        ? [...from.values()].map((r) => `${r.label} (${categoryText(r.category)})`).join(", ")
        : "einer als schädlich eingestuften Adresse";
      n.data.hints.push(`Bewegt Geld von ${via}`);
    }
  }

  // Direkte Zahlungen an schädliche Adressen kennzeichnen
  const riskAddressIds = new Set(riskSources.map((r) => aid(r.address)));
  for (const e of edgeList) if (riskAddressIds.has(e.target)) e.toRisk = true;
  for (const n of nodes.values()) {
    if (n.data.type !== "tx") continue;
    const paidToRisk = edgeList
      .filter((e) => e.source === n.id && e.toRisk)
      .reduce((s, e) => s + e.valueSat, 0);
    if (paidToRisk <= 0) continue;
    n.data.hints.push(`Zahlung an eine als schädlich eingestufte Adresse`);
    // Anteilig den direkt beitragenden Eingangsadressen zuschreiben
    for (const e of edgeList.filter((x) => x.target === n.id)) {
      const nd = nodes.get(e.source)?.data;
      if (nd?.type !== "address") continue;
      nd.sentToRiskSat = (nd.sentToRiskSat ?? 0) + Math.min(e.valueSat, paidToRisk);
    }
  }

  /* ---------- Einzahlungsadressen, Fingerabdruck, Cross-Chain ---------- */
  emit("heuristics", "Dienste und Wallet-Merkmale werden erkannt", true);

  // Tausch- und Brückendienste anhand der Labels erkennen
  const serviceByAddress = new Map<string, { name: string; kind: "swap" | "bridge"; source: string }>();
  for (const n of addrNodes) {
    const match = detectSwapService(n.data.labels);
    if (!match) continue;
    const info = { name: match.service.name, kind: match.service.kind, source: match.source };
    n.data.swapService = info;
    serviceByAddress.set(n.data.address, info);
  }

  const crossChain: TraceResult["crossChain"] = [];
  for (const n of nodes.values()) {
    if (n.data.type !== "tx") continue;
    const targets = edgeList.filter((e) => e.source === n.id);
    for (const e of targets) {
      const addr = e.target.slice(2);
      const svc = serviceByAddress.get(addr);
      if (!svc) continue;
      n.data.crossChain = { service: svc.name, kind: svc.kind, address: addr };
      n.data.hints.push(crossChainHint({ service: { name: svc.name, kind: svc.kind, patterns: [] }, matchedLabel: svc.name, source: svc.source }));
      crossChain.push({ txid: n.data.txid, address: addr, service: svc.name, kind: svc.kind });
      break;
    }
  }

  // Einzahlungsadressen: leiten praktisch alles an eine einzige Adresse weiter
  const deposits: TraceResult["deposits"] = [];
  for (const n of addrNodes) {
    const v = detectDepositInGraph(n.data.address, nodes, edgeList);
    if (!v) continue;
    const targetNode = nodes.get(aid(v.forwardsTo))?.data;
    const service =
      targetNode?.type === "address"
        ? targetNode.labels.find((l) => l.category === "exchange" || l.category === "service")?.label
        : undefined;
    n.data.deposit = { ...v, service };
    n.data.behavior = [...(n.data.behavior ?? []), depositHint(v, service)];
    deposits.push({
      address: n.data.address,
      forwardsTo: v.forwardsTo,
      ratio: v.ratio,
      forwardCount: v.forwardCount,
      service,
    });
  }

  // Wallet-Fingerabdruck je Transaktion und Gruppen gleichen Bauverhaltens
  for (const n of nodes.values()) {
    if (n.data.type !== "tx") continue;
    const tx = txSeen.get(n.data.txid);
    if (!tx) continue;
    const fp = walletFingerprint(tx);
    if (fp) n.data.fingerprint = fp.signature;
  }
  const fingerprints = groupByFingerprint([...txSeen.values()]);

  /* ---------- Cluster-Beschriftung ---------- */
  for (const c of clusters) {
    const behaviors = new Set<string>();
    for (const m of c.addresses) {
      const d = nodes.get(aid(m))?.data as AddressNodeData | undefined;
      if (!d) continue;
      const named = d.labels.find((l) => l.source !== "chainer" && l.category !== "wallet" && l.category !== "other");
      if (named && !c.label) c.label = named.label;
      for (const b of d.behavior || []) behaviors.add(b);
    }
    if (behaviors.size) c.behavior = [...behaviors];
  }

  const result: TraceResult = {
    params,
    nodes: [...nodes.values()],
    edges: edgeList,
    clusters: clusters.sort((a, b) => b.addresses.length - a.addresses.length),
    activity,
    peeling,
    riskSources: riskSources.sort((a, b) => b.outflowSat - a.outflowSat),
    fingerprints,
    deposits: deposits.sort((a, b) => b.ratio - a.ratio),
    crossChain,
    stats: {
      addresses: addrNodes.length,
      txs: txSeen.size,
      apiCalls,
      durationMs: Date.now() - t0,
      truncated,
      taintedOutSat: params.taintModel === "none" ? undefined : taintedOutSat,
      riskInflowSat: riskSources.length ? riskInflowSat : undefined,
      riskAffected: riskSources.length ? riskAffected : undefined,
    },
    warnings,
    providersUsed,
    priceEur,
  };
  emit("done", "fertig", true);
  return result;
}

export function riskFromLabels(labels: AddressLabel[]): AddressNodeData["risk"] {
  if (labels.some((l) => l.risk === "high")) return "high";
  if (labels.some((l) => l.risk === "medium")) return "medium";
  if (labels.some((l) => l.risk === "low")) return "low";
  return "none";
}
