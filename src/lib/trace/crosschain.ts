import { getAddressTxs } from "../providers/registry";
import { getPriceSeries, priceAt } from "../providers/price";
import type { AddressLabel, ProviderContext } from "../providers/types";
import { chainMeta, type ChainId } from "../chains";
import { contextForChain } from "./context";

/**
 * Cross-Chain-Sprünge.
 *
 * Geht Geld an einen Tausch- oder Brückendienst, endet die Spur auf der
 * Ausgangskette. Die Anwendung kann zwei Dinge tun:
 *
 * 1. Solche Dienste erkennen und den Übergang im Graph kenntlich machen.
 * 2. Auf der Zielkette prüfen, ob bei einer angegebenen Adresse ein passender
 *    Betrag im passenden Zeitfenster eingegangen ist.
 *
 * Eine vollständige Suche über eine fremde Kette ist ohne eigenen Index nicht
 * möglich; deshalb braucht Schritt 2 eine Kandidatenadresse.
 */

export type ServiceKind = "swap" | "bridge";

export interface SwapService {
  name: string;
  kind: ServiceKind;
  /** Textbausteine, die in Labels auf diesen Dienst hindeuten */
  patterns: string[];
  url?: string;
  /** Chains, zwischen denen der Dienst üblicherweise vermittelt */
  chains?: ChainId[];
}

/**
 * Bekannte Tausch- und Brückendienste. Die Erkennung läuft über die Labels der
 * angebundenen Quellen, nicht über fest verdrahtete Adressen: Adressen ändern
 * sich, die Bezeichnungen der Dienste bleiben.
 */
export const SWAP_SERVICES: SwapService[] = [
  { name: "FixedFloat", kind: "swap", patterns: ["fixedfloat", "fixed float"], url: "https://fixedfloat.com" },
  { name: "ChangeNOW", kind: "swap", patterns: ["changenow", "change now"], url: "https://changenow.io" },
  { name: "SideShift", kind: "swap", patterns: ["sideshift"], url: "https://sideshift.ai" },
  { name: "SimpleSwap", kind: "swap", patterns: ["simpleswap", "simple swap"], url: "https://simpleswap.io" },
  { name: "Godex", kind: "swap", patterns: ["godex"], url: "https://godex.io" },
  { name: "Exch", kind: "swap", patterns: ["exch.cx", "exch "], url: "https://exch.cx" },
  { name: "Bisq", kind: "swap", patterns: ["bisq"], url: "https://bisq.network" },
  { name: "ShapeShift", kind: "swap", patterns: ["shapeshift"], url: "https://shapeshift.com" },
  { name: "THORChain", kind: "bridge", patterns: ["thorchain", "thor chain"], url: "https://thorchain.org" },
  { name: "Ren Bridge", kind: "bridge", patterns: ["renbridge", "ren bridge", "renbtc"], url: "https://renproject.io" },
  { name: "WBTC", kind: "bridge", patterns: ["wbtc", "wrapped bitcoin"], url: "https://wbtc.network" },
  { name: "Multichain", kind: "bridge", patterns: ["multichain", "anyswap"], url: "https://multichain.org" },
  { name: "Wormhole", kind: "bridge", patterns: ["wormhole"], url: "https://wormhole.com" },
  { name: "Stargate", kind: "bridge", patterns: ["stargate", "layerzero"], url: "https://stargate.finance" },
  { name: "Allbridge", kind: "bridge", patterns: ["allbridge"], url: "https://allbridge.io" },
  { name: "Binance Bridge", kind: "bridge", patterns: ["binance bridge", "binance-peg"], url: "https://www.binance.com" },
  { name: "Hop Protocol", kind: "bridge", patterns: ["hop protocol", "hop exchange"], url: "https://hop.exchange" },
  { name: "Synapse", kind: "bridge", patterns: ["synapse"], url: "https://synapseprotocol.com" },
];

export interface ServiceMatch {
  service: SwapService;
  /** Label, über das der Dienst erkannt wurde */
  matchedLabel: string;
  source: string;
}

/** Erkennt anhand der Labels einer Adresse einen Tausch- oder Brückendienst. */
export function detectSwapService(labels: AddressLabel[]): ServiceMatch | null {
  for (const l of labels) {
    const haystack = `${l.label} ${l.details ?? ""}`.toLowerCase();
    for (const service of SWAP_SERVICES) {
      if (service.patterns.some((p) => haystack.includes(p))) {
        return { service, matchedLabel: l.label, source: l.source };
      }
    }
  }
  return null;
}

export function crossChainHint(m: ServiceMatch): string {
  const art = m.service.kind === "bridge" ? "Brücke" : "Tauschdienst";
  return (
    `Übergang auf eine andere Chain möglich: ${m.service.name} (${art}, erkannt über ${m.source}). ` +
    `Die Spur endet hier auf dieser Chain; die Fortsetzung ist nur über eine Kandidatenadresse auf der Zielkette prüfbar.`
  );
}

/* ---------------- Korrelation auf der Zielkette ---------------- */

export interface CrossChainOptions {
  fromChain: ChainId;
  /** Betrag in der kleinsten Einheit der Ausgangskette */
  amountSat: number;
  /** Zeitpunkt des Abgangs (Unix-Sekunden) */
  atTime: number;
  toChain: ChainId;
  /** Adresse auf der Zielkette, bei der ein Eingang vermutet wird */
  candidateAddress: string;
  /** Zeitfenster nach dem Abgang, in Minuten */
  windowMinutes?: number;
  /** Erlaubte relative Abweichung des Gegenwerts */
  tolerance?: number;
  maxTxs?: number;
}

export interface CrossChainMatch {
  txid: string;
  blockTime?: number;
  receivedSat: number;
  /** Erwarteter Betrag auf der Zielkette nach Kursumrechnung */
  expectedSat: number;
  deltaPercent: number;
  deltaMinutes: number;
  score: number;
  token?: string;
}

export interface CrossChainResult {
  options: Required<Omit<CrossChainOptions, "candidateAddress">> & { candidateAddress: string };
  /** Gegenwert des Abgangs in Euro zum Zeitpunkt des Abgangs */
  valueEur?: number;
  expectedSat?: number;
  matches: CrossChainMatch[];
  examined: number;
  warnings: string[];
}

/**
 * Prüft, ob bei einer Kandidatenadresse auf der Zielkette ein Eingang liegt, der
 * dem abgeflossenen Betrag entspricht. Die Umrechnung läuft über den Kurs beider
 * Chains zum Zeitpunkt des Abgangs.
 */
export async function correlateCrossChain(
  ctx: ProviderContext,
  opts: CrossChainOptions,
): Promise<CrossChainResult> {
  const windowMinutes = opts.windowMinutes ?? 120;
  const tolerance = opts.tolerance ?? 0.05;
  const maxTxs = opts.maxTxs ?? 50;
  const warnings: string[] = [];
  const base = {
    options: {
      fromChain: opts.fromChain,
      amountSat: opts.amountSat,
      atTime: opts.atTime,
      toChain: opts.toChain,
      candidateAddress: opts.candidateAddress,
      windowMinutes,
      tolerance,
      maxTxs,
    },
    matches: [] as CrossChainMatch[],
    examined: 0,
    warnings,
  };

  /* --- Kurse zum Zeitpunkt des Abgangs --- */
  let valueEur: number | undefined;
  let expectedSat: number | undefined;
  try {
    const [fromSeries, toSeries] = await Promise.all([
      getPriceSeries(opts.fromChain, opts.atTime, opts.atTime),
      getPriceSeries(opts.toChain, opts.atTime, opts.atTime),
    ]);
    const fromPrice = priceAt(fromSeries, opts.atTime);
    const toPrice = priceAt(toSeries, opts.atTime);
    if (fromPrice && toPrice) {
      const fromUnits = opts.amountSat / 10 ** chainMeta(opts.fromChain).decimals;
      valueEur = fromUnits * fromPrice;
      expectedSat = Math.round((valueEur / toPrice) * 10 ** chainMeta(opts.toChain).decimals);
    } else {
      warnings.push("Kurs zum Zeitpunkt des Abgangs nicht verfügbar; der Abgleich erfolgt ohne Umrechnung.");
    }
  } catch (e) {
    warnings.push(`Kursabfrage fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
  }

  /* --- Eingänge der Kandidatenadresse prüfen --- */
  const targetCtx = contextForChain(ctx, opts.toChain);
  let txs;
  try {
    txs = (await getAddressTxs(targetCtx, opts.candidateAddress, maxTxs)).data;
  } catch (e) {
    warnings.push(`Zielkette nicht abrufbar: ${e instanceof Error ? e.message : String(e)}`);
    return { ...base, valueEur, expectedSat };
  }

  const windowSeconds = windowMinutes * 60;
  const matches: CrossChainMatch[] = [];
  let examined = 0;

  for (const tx of txs) {
    const t = tx.blockTime ?? 0;
    if (!t || t < opts.atTime || t > opts.atTime + windowSeconds) continue;
    const received = tx.outputs
      .filter((o) => o.address === opts.candidateAddress)
      .reduce((s, o) => s + o.valueSat, 0);
    const token = tx.outputs.find((o) => o.address === opts.candidateAddress && o.token)?.token?.symbol;
    if (received <= 0 && !token) continue;
    examined++;
    if (expectedSat === undefined) {
      // Ohne Kurs nur zeitlich einordnen
      matches.push({
        txid: tx.txid,
        blockTime: t,
        receivedSat: received,
        expectedSat: 0,
        deltaPercent: 0,
        deltaMinutes: (t - opts.atTime) / 60,
        score: 1 - (t - opts.atTime) / windowSeconds,
        token,
      });
      continue;
    }
    const deltaPercent = Math.abs(received - expectedSat) / Math.max(1, expectedSat);
    if (deltaPercent > tolerance) continue;
    const deltaMinutes = (t - opts.atTime) / 60;
    const valueScore = 1 - deltaPercent / tolerance;
    const timeScore = 1 - deltaMinutes / windowMinutes;
    matches.push({
      txid: tx.txid,
      blockTime: t,
      receivedSat: received,
      expectedSat,
      deltaPercent,
      deltaMinutes,
      score: Math.max(0, Math.min(1, 0.6 * valueScore + 0.4 * timeScore)),
      token,
    });
  }

  if (!matches.length && examined > 0)
    warnings.push("Kein Eingang passt zu Betrag und Zeitfenster. Toleranz oder Fenster vergrößern.");
  if (!examined)
    warnings.push("Bei der Kandidatenadresse liegt im gewählten Zeitfenster kein Eingang.");

  return {
    ...base,
    valueEur,
    expectedSat,
    matches: matches.sort((a, b) => b.score - a.score),
    examined,
  };
}
