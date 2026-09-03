import { lookupLabels } from "../providers/registry";
import type { ProviderContext, TxInfo } from "../providers/types";
import { classifyHarmful, type HarmfulVerdict } from "./risk";

export interface InflowSender {
  address: string;
  amountSat: number;
  txids: string[];
  verdict: HarmfulVerdict;
}

export interface InflowRisk {
  /** Summe der Zuflüsse von als schädlich eingestuften Adressen */
  totalSat: number;
  senders: InflowSender[];
  /** Anzahl geprüfter Gegenparteien */
  checked: number;
  /** Anzahl nicht geprüfter Gegenparteien (Limit erreicht) */
  skipped: number;
}

/**
 * Prüft die direkten Absender der eingehenden Transaktionen einer Adresse gegen
 * die Label- und Sanktionsquellen. Anders als die Trace-Ansicht betrachtet diese
 * Auswertung nur einen Hop, ist dafür aber sofort verfügbar.
 */
export async function analyseInflowRisk(
  ctx: ProviderContext,
  address: string,
  txs: TxInfo[],
  opts: { maxSenders?: number; includeMedium?: boolean } = {},
): Promise<InflowRisk> {
  const maxSenders = opts.maxSenders ?? 25;

  // Eingehende Beträge je Absenderadresse sammeln
  const bySender = new Map<string, { amount: number; txids: Set<string> }>();
  for (const tx of txs) {
    const received = tx.outputs.filter((o) => o.address === address).reduce((s, o) => s + o.valueSat, 0);
    const spent = tx.inputs.filter((i) => i.address === address).reduce((s, i) => s + (i.valueSat || 0), 0);
    if (received <= spent) continue; // kein Nettozufluss
    const net = received - spent;
    const senders = tx.inputs.filter((i) => i.address && i.address !== address && !i.coinbase);
    const totalIn = senders.reduce((s, i) => s + (i.valueSat || 0), 0);
    for (const i of senders) {
      // Zufluss anteilig dem jeweiligen Absender zurechnen
      const share = totalIn > 0 ? ((i.valueSat || 0) / totalIn) * net : net / senders.length;
      const cur = bySender.get(i.address!) ?? { amount: 0, txids: new Set<string>() };
      cur.amount += share;
      cur.txids.add(tx.txid);
      bySender.set(i.address!, cur);
    }
  }

  const ranked = [...bySender.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const toCheck = ranked.slice(0, maxSenders);

  const senders: InflowSender[] = [];
  const BATCH = 6;
  for (let i = 0; i < toCheck.length; i += BATCH) {
    const batch = toCheck.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async ([addr, info]) => {
        try {
          const r = await lookupLabels(ctx, addr);
          const verdict = classifyHarmful(r.labels, opts.includeMedium === true);
          return verdict ? { address: addr, amountSat: Math.round(info.amount), txids: [...info.txids], verdict } : null;
        } catch {
          return null;
        }
      }),
    );
    for (const r of results) if (r) senders.push(r);
  }

  return {
    totalSat: senders.reduce((s, x) => s + x.amountSat, 0),
    senders: senders.sort((a, b) => b.amountSat - a.amountSat),
    checked: toCheck.length,
    skipped: Math.max(0, ranked.length - toCheck.length),
  };
}
