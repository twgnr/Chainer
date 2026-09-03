import type { TxInfo } from "../providers/types";
import type { ActivityPattern, AddressNodeData, PeelingChain, TraceEdge, TraceNode, TxNodeData } from "./types";

/* ---------------- Adress- und Betragsmerkmale ---------------- */

export function addressType(a: string): string {
  if (a.startsWith("0x")) return "evm";
  if (a.startsWith("bc1p") || a.startsWith("ltc1p")) return "p2tr";
  if (a.startsWith("bc1q") || a.startsWith("ltc1q")) return a.length > 50 ? "p2wsh" : "p2wpkh";
  if (a.startsWith("3") || a.startsWith("M")) return "p2sh";
  if (a.startsWith("1") || a.startsWith("L") || a.startsWith("D")) return "p2pkh";
  return "other";
}

/** Anzahl abschließender Nullen – runde Beträge sind eher Zahlungen als Wechselgeld */
export function roundness(sat: number): number {
  let n = sat;
  let zeros = 0;
  while (n > 0 && n % 10 === 0) {
    n /= 10;
    zeros++;
  }
  return zeros;
}

/* ---------------- Wechselgeld-Erkennung ---------------- */

export interface ChangeResult {
  index: number;
  reason: string;
}

/**
 * Bestimmt den vermutlichen Wechselgeld-Ausgang einer Transaktion mit genau zwei
 * Empfängern. Reihenfolge der Kriterien nach Verlässlichkeit.
 */
export function detectChange(
  spendable: { n: number; address: string; valueSat: number }[],
  uniqueIn: string[],
): ChangeResult | null {
  if (spendable.length !== 2 || uniqueIn.length === 0) return null;
  const inSet = new Set(uniqueIn);
  const back = spendable.findIndex((o) => inSet.has(o.address));
  if (back >= 0) return { index: back, reason: "Adresse wird wiederverwendet" };

  const inTypes = new Set(uniqueIn.map(addressType));
  const typeMatch = spendable.map((o) => inTypes.has(addressType(o.address)));
  if (typeMatch[0] !== typeMatch[1]) return { index: typeMatch[0] ? 0 : 1, reason: "gleicher Skript-Typ wie Eingänge" };

  const r0 = roundness(spendable[0].valueSat);
  const r1 = roundness(spendable[1].valueSat);
  if (r0 !== r1) return { index: r0 < r1 ? 0 : 1, reason: "unrunder Betrag" };

  return null;
}

/* ---------------- Transaktionsmuster ---------------- */

export function txHints(tx: TxInfo, uniqueIn: string[], spendableCount: number, equalOutputs: number): string[] {
  const hints: string[] = [];
  if (tx.inputs.some((i) => i.coinbase)) hints.push("Coinbase-Transaktion (Mining-Belohnung)");
  if (uniqueIn.length > 1)
    hints.push(`Common-Input-Ownership: ${uniqueIn.length} Eingangsadressen vermutlich gleicher Besitzer`);
  if (uniqueIn.length >= 5 && spendableCount === 1) hints.push("Konsolidierung (viele Inputs → ein Output)");
  if (equalOutputs >= 3 && uniqueIn.length >= 3)
    hints.push(`Möglicher CoinJoin (${equalOutputs} gleich große Outputs)`);
  if (spendableCount > 20) hints.push(`Batch-Auszahlung (${spendableCount} Outputs, typisch für Börsen)`);
  if (tx.failed) hints.push("Transaktion fehlgeschlagen (Gas verbraucht, kein Transfer)");
  return hints;
}

/** Zählt die größte Gruppe betragsgleicher Ausgänge (CoinJoin-Indiz) */
export function maxEqualOutputs(values: number[]): number {
  if (!values.length) return 0;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return Math.max(...counts.values());
}

/* ---------------- Peeling-Ketten ---------------- */

/**
 * Peeling-Kette: eine Folge von Transaktionen, bei denen jeweils ein kleiner
 * Betrag abgezweigt und der große Rest an eine neue Adresse weitergereicht wird.
 * Typisch beim schrittweisen Auscashen größerer Beträge.
 */
export function detectPeeling(nodes: Map<string, TraceNode>, edges: TraceEdge[]): PeelingChain[] {
  const outByTx = new Map<string, TraceEdge[]>();
  const txByAddrIn = new Map<string, TraceEdge[]>();
  for (const e of edges) {
    if (e.source.startsWith("t:")) (outByTx.get(e.source) ?? outByTx.set(e.source, []).get(e.source)!).push(e);
    else (txByAddrIn.get(e.source) ?? txByAddrIn.set(e.source, []).get(e.source)!).push(e);
  }

  /** Ein Peeling-Schritt: 2 Ausgänge, einer davon mindestens 4× größer */
  const step = (txId: string): { next: string; big: number; small: number } | null => {
    const outs = outByTx.get(txId) || [];
    if (outs.length !== 2) return null;
    const [a, b] = outs;
    const big = a.valueSat >= b.valueSat ? a : b;
    const small = a.valueSat >= b.valueSat ? b : a;
    if (small.valueSat <= 0 || big.valueSat < small.valueSat * 4) return null;
    return { next: big.target, big: big.valueSat, small: small.valueSat };
  };

  const chains: PeelingChain[] = [];
  const used = new Set<string>();
  for (const n of nodes.values()) {
    if (n.data.type !== "tx" || used.has(n.id)) continue;
    const txids: string[] = [];
    const peeled: number[] = [];
    let cur: string | null = n.id;
    let remaining = 0;
    while (cur && !used.has(cur)) {
      const s = step(cur);
      if (!s) break;
      used.add(cur);
      txids.push((nodes.get(cur)!.data as TxNodeData).txid);
      peeled.push(s.small);
      remaining = s.big;
      // Vom Empfänger des großen Rests zur nächsten Transaktion
      const nextTx = (txByAddrIn.get(s.next) || [])[0];
      cur = nextTx ? nextTx.target : null;
    }
    if (txids.length >= 3) {
      chains.push({
        txids,
        peeledSat: peeled,
        totalPeeledSat: peeled.reduce((a, b) => a + b, 0),
        remainingSat: remaining,
      });
    } else {
      for (const t of txids) used.delete(t);
    }
  }
  return chains.sort((a, b) => b.txids.length - a.txids.length).slice(0, 10);
}

/* ---------------- Zeitliche Muster ---------------- */

const REGIONS: { offset: number; name: string }[] = [
  { offset: -8, name: "Nordamerika (Westküste)" },
  { offset: -5, name: "Nordamerika (Ostküste)" },
  { offset: -3, name: "Südamerika" },
  { offset: 0, name: "Westeuropa / Britische Inseln" },
  { offset: 1, name: "Mitteleuropa" },
  { offset: 3, name: "Osteuropa / Russland" },
  { offset: 5, name: "Südasien" },
  { offset: 7, name: "Südostasien" },
  { offset: 8, name: "Ostasien (China)" },
  { offset: 9, name: "Ostasien (Japan/Korea)" },
  { offset: 11, name: "Ozeanien" },
];

/**
 * Aktivitätsverteilung über Wochentage und Stunden. Die Zeitzone wird über das
 * ruhigste Sechs-Stunden-Fenster geschätzt (angenommene Nachtruhe 1–7 Uhr lokal).
 */
export function activityPattern(times: number[]): ActivityPattern {
  const matrix = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const valid = times.filter((t) => Number.isFinite(t) && t > 0);
  for (const t of valid) {
    const d = new Date(t * 1000);
    matrix[d.getUTCDay()][d.getUTCHours()]++;
  }
  const perHour = Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) for (let d = 0; d < 7; d++) perHour[h] += matrix[d][h];

  let guessedUtcOffset: number | undefined;
  let guessedRegion: string | undefined;
  if (valid.length >= 12) {
    let bestStart = 0;
    let bestSum = Infinity;
    for (let s = 0; s < 24; s++) {
      let sum = 0;
      for (let k = 0; k < 6; k++) sum += perHour[(s + k) % 24];
      if (sum < bestSum) {
        bestSum = sum;
        bestStart = s;
      }
    }
    // Ruhefenster entspricht lokal etwa 1:00–7:00 Uhr
    let offset = ((1 - bestStart) % 24 + 24) % 24;
    if (offset > 12) offset -= 24;
    guessedUtcOffset = offset;
    guessedRegion = REGIONS.reduce((best, r) =>
      Math.abs(r.offset - offset) < Math.abs(best.offset - offset) ? r : best,
    ).name;
  }
  return {
    matrix,
    total: valid.length,
    guessedUtcOffset,
    guessedRegion,
    firstSeen: valid.length ? Math.min(...valid) : undefined,
    lastSeen: valid.length ? Math.max(...valid) : undefined,
  };
}

/* ---------------- Verhaltensbasierte Diensterkennung ---------------- */

export interface BehaviorInput {
  txCount: number;
  batchTxCount: number;
  consolidationCount: number;
  reuseCount: number;
  distinctCounterparties: number;
  receivedSat: number;
  sentSat: number;
}

/**
 * Schätzt anhand des Verhaltens ein, ob hinter einer Adresse ein Dienst steckt –
 * unabhängig davon, ob sie in einer Label-Datenbank steht.
 */
export function behaviorLabels(b: BehaviorInput): string[] {
  const out: string[] = [];
  if (b.batchTxCount >= 2) out.push("Batch-Auszahlungen (Börsen-typisch)");
  if (b.txCount >= 50 && b.distinctCounterparties >= 25) out.push("Sehr viele Gegenparteien (Dienst/Börse)");
  if (b.consolidationCount >= 2) out.push("Sammeladresse (Konsolidierung)");
  if (b.reuseCount >= 5) out.push("Adresse mehrfach wiederverwendet");
  if (b.receivedSat > 0 && b.sentSat === 0 && b.txCount >= 3) out.push("Nur Eingänge (Sparadresse / Cold Wallet)");
  return out;
}

/** Fasst pro Adresse die Kennzahlen aus dem Graphen zusammen */
export function collectBehavior(
  address: string,
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
): BehaviorInput {
  const id = `a:${address}`;
  const outgoing = edges.filter((e) => e.source === id);
  const incoming = edges.filter((e) => e.target === id);
  const txIds = new Set([...outgoing.map((e) => e.target), ...incoming.map((e) => e.source)]);
  let batchTxCount = 0;
  let consolidationCount = 0;
  const counterparties = new Set<string>();
  for (const t of txIds) {
    const n = nodes.get(t);
    if (!n || n.data.type !== "tx") continue;
    if (n.data.outputCount > 20) batchTxCount++;
    if (n.data.inputCount >= 5 && n.data.outputCount <= 2) consolidationCount++;
    for (const e of edges) {
      if (e.source === t && e.target !== id) counterparties.add(e.target);
      if (e.target === t && e.source !== id) counterparties.add(e.source);
    }
  }
  const d = nodes.get(id)?.data as AddressNodeData | undefined;
  return {
    txCount: txIds.size,
    batchTxCount,
    consolidationCount,
    reuseCount: outgoing.length + incoming.length,
    distinctCounterparties: counterparties.size,
    receivedSat: d?.receivedSat ?? 0,
    sentSat: d?.sentSat ?? 0,
  };
}
