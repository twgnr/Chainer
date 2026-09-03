import type { TxInfo } from "../providers/types";
import type { AddressNodeData, TraceEdge, TraceNode } from "./types";

/**
 * Erkennung von Einzahlungsadressen bei Börsen und Zahlungsdiensten.
 *
 * Solche Adressen haben ein sehr markantes Muster: Sie nehmen Geld entgegen und
 * leiten praktisch den vollen Betrag an immer dieselbe Sammeladresse weiter.
 * Für eine Ermittlung ist dieser Punkt besonders wichtig, weil sich hier eine
 * Auskunft beim Betreiber anfragen lässt: Er weiß, wem die Einzahlungsadresse
 * zugeteilt war.
 */

export interface DepositVerdict {
  /** Adresse, an die weitergeleitet wird (die Sammeladresse des Dienstes) */
  forwardsTo: string;
  receivedSat: number;
  forwardedSat: number;
  /** Anteil des Empfangenen, der weitergeleitet wurde */
  ratio: number;
  /** Anzahl der Weiterleitungen */
  forwardCount: number;
  reason: string;
}

/** Mindestanteil, der weitergeleitet sein muss (der Rest sind Gebühren) */
const MIN_FORWARD_RATIO = 0.9;

/**
 * Prüft anhand der Transaktionen einer Adresse, ob es sich um eine
 * Einzahlungsadresse handelt.
 */
export function detectDepositFromTxs(address: string, txs: TxInfo[]): DepositVerdict | null {
  let receivedSat = 0;
  let forwardedSat = 0;
  let forwardCount = 0;
  const targets = new Map<string, number>();

  for (const tx of txs) {
    const got = tx.outputs.filter((o) => o.address === address).reduce((s, o) => s + o.valueSat, 0);
    const spent = tx.inputs.filter((i) => i.address === address).reduce((s, i) => s + (i.valueSat || 0), 0);
    if (got > 0 && spent === 0) {
      receivedSat += got;
      continue;
    }
    if (spent > 0) {
      forwardCount++;
      // Empfänger dieser Weiterleitung erfassen
      for (const o of tx.outputs) {
        if (!o.address || o.address === address) continue;
        targets.set(o.address, (targets.get(o.address) ?? 0) + o.valueSat);
        forwardedSat += o.valueSat;
      }
    }
  }

  if (!receivedSat || !forwardCount || targets.size === 0) return null;
  // Kennzeichnend ist genau ein Empfänger über alle Weiterleitungen hinweg
  if (targets.size > 1) return null;

  const [forwardsTo, amount] = [...targets.entries()][0];
  const ratio = receivedSat > 0 ? amount / receivedSat : 0;
  if (ratio < MIN_FORWARD_RATIO) return null;

  return {
    forwardsTo,
    receivedSat,
    forwardedSat,
    ratio: Math.min(1, ratio),
    forwardCount,
    reason:
      forwardCount === 1
        ? "Einmalig empfangen und vollständig an eine einzige Adresse weitergeleitet"
        : `${forwardCount} Weiterleitungen, alle an dieselbe Adresse`,
  };
}

/**
 * Dieselbe Prüfung auf Basis des aufgebauten Graphen. Sie ist gröber als die
 * Variante über die Transaktionsliste, kostet dafür keine zusätzlichen Abfragen.
 */
export function detectDepositInGraph(
  address: string,
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
): DepositVerdict | null {
  const id = `a:${address}`;
  const data = nodes.get(id)?.data;
  if (!data || data.type !== "address") return null;
  const d = data as AddressNodeData;

  const outgoing = edges.filter((e) => e.source === id);
  if (!outgoing.length || !d.receivedSat) return null;

  // Empfänger hinter den Transaktionen, in die diese Adresse gezahlt hat
  const targets = new Map<string, number>();
  for (const e of outgoing) {
    for (const out of edges.filter((x) => x.source === e.target && x.target !== id)) {
      const addr = out.target.slice(2);
      targets.set(addr, (targets.get(addr) ?? 0) + out.valueSat);
    }
  }
  if (targets.size !== 1) return null;

  const [forwardsTo, amount] = [...targets.entries()][0];
  const ratio = amount / d.receivedSat;
  if (ratio < MIN_FORWARD_RATIO) return null;

  return {
    forwardsTo,
    receivedSat: d.receivedSat,
    forwardedSat: amount,
    ratio: Math.min(1, ratio),
    forwardCount: outgoing.length,
    reason: "Empfangenes Geld wurde vollständig an eine einzige Adresse weitergereicht",
  };
}

/**
 * Formuliert den Hinweis für die Anzeige, abhängig davon, ob die Sammeladresse
 * einem bekannten Dienst zugeordnet werden kann.
 */
export function depositHint(v: DepositVerdict, serviceLabel?: string): string {
  const wo = serviceLabel ? ` von ${serviceLabel}` : "";
  return (
    `Vermutlich Einzahlungsadresse${wo}: ${v.reason.toLowerCase()}. ` +
    `Der Betreiber der Sammeladresse kann Auskunft geben, wem sie zugeteilt war.`
  );
}
