import { getAddressTxs } from "../providers/registry";
import type { ProviderContext, TxInfo } from "../providers/types";
import type { ChainId } from "../chains";

/**
 * Korrelation von Mixer-Ausgängen.
 *
 * Bei Diensten mit festen Stückelungen (CoinJoin-artige Mixer, klassische
 * Tumbler) lässt sich ein Eingang nicht direkt einem Ausgang zuordnen. Man kann
 * aber die Ausgänge einsammeln, die betrags- und zeitnah zum eigenen Eingang
 * passen, und sie als Kandidaten bewerten.
 *
 * Das Ergebnis ist ausdrücklich eine Kandidatenliste und keine Zuordnung.
 */

export interface MixerCandidate {
  txid: string;
  address: string;
  valueSat: number;
  blockTime?: number;
  /** Abweichung vom gesuchten Betrag */
  deltaSat: number;
  /** Abstand in Stunden nach dem Eingang */
  deltaHours: number;
  /** 0..1, höher ist besser */
  score: number;
}

export interface MixerCorrelation {
  mixerAddress: string;
  amountSat: number;
  afterTime: number;
  windowHours: number;
  tolerance: number;
  candidates: MixerCandidate[];
  /** Anzahl geprüfter Ausgänge */
  examined: number;
  warnings: string[];
}

export interface MixerOptions {
  mixerAddress: string;
  /** Eingezahlter Betrag, nach dem gesucht wird */
  amountSat: number;
  /** Zeitpunkt der Einzahlung (Unix-Sekunden) */
  afterTime: number;
  /** Zeitfenster nach der Einzahlung */
  windowHours?: number;
  /** Erlaubte relative Abweichung des Betrags, z. B. 0.05 für 5 Prozent */
  tolerance?: number;
  /** Wie viele Transaktionen des Mixers geladen werden */
  maxTxs?: number;
  limit?: number;
}

export async function correlateMixerOutputs(
  ctx: ProviderContext,
  opts: MixerOptions,
): Promise<MixerCorrelation> {
  const windowHours = opts.windowHours ?? 72;
  const tolerance = opts.tolerance ?? 0.05;
  const maxTxs = opts.maxTxs ?? 100;
  const limit = opts.limit ?? 25;
  const warnings: string[] = [];

  let txs: TxInfo[] = [];
  try {
    const r = await getAddressTxs(ctx, opts.mixerAddress, maxTxs);
    txs = r.data;
  } catch (e) {
    warnings.push(`Transaktionen des Dienstes nicht abrufbar: ${e instanceof Error ? e.message : String(e)}`);
    return {
      mixerAddress: opts.mixerAddress,
      amountSat: opts.amountSat,
      afterTime: opts.afterTime,
      windowHours,
      tolerance,
      candidates: [],
      examined: 0,
      warnings,
    };
  }

  const windowSeconds = windowHours * 3600;
  const minValue = opts.amountSat * (1 - tolerance);
  const maxValue = opts.amountSat * (1 + tolerance);

  const candidates: MixerCandidate[] = [];
  let examined = 0;

  for (const tx of txs) {
    const t = tx.blockTime ?? 0;
    // Nur Auszahlungen nach der Einzahlung und innerhalb des Fensters
    if (!t || t < opts.afterTime || t > opts.afterTime + windowSeconds) continue;
    const isSender = tx.inputs.some((i) => i.address === opts.mixerAddress);
    if (!isSender) continue;

    for (const o of tx.outputs) {
      if (!o.address || o.address === opts.mixerAddress) continue;
      examined++;
      if (o.valueSat < minValue || o.valueSat > maxValue) continue;
      const deltaSat = Math.abs(o.valueSat - opts.amountSat);
      const deltaHours = (t - opts.afterTime) / 3600;
      // Näher am Betrag und zeitlich näher = besser; beide Anteile gleich gewichtet
      const valueScore = 1 - deltaSat / Math.max(1, opts.amountSat * tolerance);
      const timeScore = 1 - deltaHours / windowHours;
      candidates.push({
        txid: tx.txid,
        address: o.address,
        valueSat: o.valueSat,
        blockTime: t,
        deltaSat,
        deltaHours,
        score: Math.max(0, Math.min(1, 0.5 * valueScore + 0.5 * timeScore)),
      });
    }
  }

  if (txs.length >= maxTxs)
    warnings.push(
      `Nur die neuesten ${maxTxs} Transaktionen des Dienstes wurden geprüft; ältere Auszahlungen fehlen möglicherweise.`,
    );
  if (!candidates.length && examined > 0)
    warnings.push("Kein Ausgang passt zu Betrag und Zeitfenster. Toleranz oder Fenster vergrößern.");

  return {
    mixerAddress: opts.mixerAddress,
    amountSat: opts.amountSat,
    afterTime: opts.afterTime,
    windowHours,
    tolerance,
    candidates: candidates.sort((a, b) => b.score - a.score).slice(0, limit),
    examined,
    warnings,
  };
}

/** Chains, für die eine Korrelation sinnvoll ist (Konto-Modelle haben keine Stückelung) */
export function mixerCorrelationSupported(chain: ChainId): boolean {
  return chain !== "ethereum" && chain !== "tron";
}
