import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { ChainId } from "./chains";

/**
 * Beweissicherung.
 *
 * Für einen Bericht, der an Behörden oder Anwälte geht, genügt das Ergebnis
 * allein nicht: Es muss nachvollziehbar sein, welche Daten wann von welcher
 * Quelle kamen. Diese Datei sammelt zu jeder Abfrage einen Prüfwert über die
 * gelieferten Rohdaten. Damit lässt sich später zeigen, dass der Bericht auf
 * genau diesen Daten beruht.
 *
 * Das ist kein Zeitstempeldienst und keine Signatur, sondern eine
 * nachvollziehbare Aufzeichnung innerhalb der Anwendung.
 */

export type EvidenceKind = "address" | "addressTxs" | "tx" | "outspends" | "labels";

export interface EvidenceEntry {
  kind: EvidenceKind;
  /** Adresse oder Transaktions-ID, auf die sich die Abfrage bezog */
  key: string;
  chain: ChainId;
  provider: string;
  /** Zeitpunkt der Verwendung (Unix-Millisekunden) */
  at: number;
  /** SHA-256 über die Rohdaten in stabiler Schreibweise */
  sha256: string;
}

export interface EvidenceLog {
  entries: EvidenceEntry[];
  /** Prüfwert über alle Einträge, in der Reihenfolge der Aufzeichnung */
  digest: string;
  createdAt: number;
}

const store = new AsyncLocalStorage<EvidenceEntry[]>();

/** JSON mit stabiler Schlüsselreihenfolge, damit der Prüfwert reproduzierbar ist. */
export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = walk(obj[k]);
    return out;
  };
  return JSON.stringify(walk(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** Zeichnet eine Abfrage auf, sofern gerade eine Aufzeichnung läuft. */
export function recordEvidence(
  entry: { kind: EvidenceKind; key: string; chain: ChainId; provider: string },
  payload: unknown,
): void {
  const entries = store.getStore();
  if (!entries) return;
  // Obergrenze, damit ein sehr großer Trace den Speicher nicht sprengt
  if (entries.length >= 5000) return;
  entries.push({ ...entry, at: Date.now(), sha256: sha256(payload) });
}

/** Läuft gerade eine Aufzeichnung? */
export function isRecording(): boolean {
  return store.getStore() !== undefined;
}

function digestOf(entries: EvidenceEntry[]): string {
  const h = createHash("sha256");
  for (const e of entries) h.update(`${e.kind}|${e.chain}|${e.key}|${e.provider}|${e.at}|${e.sha256}\n`);
  return h.digest("hex");
}

/**
 * Führt eine Auswertung aus und zeichnet dabei alle Datenabfragen auf.
 */
export async function withEvidence<T>(fn: () => Promise<T>): Promise<{ result: T; evidence: EvidenceLog }> {
  const entries: EvidenceEntry[] = [];
  const result = await store.run(entries, fn);
  return { result, evidence: { entries, digest: digestOf(entries), createdAt: Date.now() } };
}

/** Prüft, ob ein Nachweis unverändert ist. */
export function verifyEvidence(log: EvidenceLog): boolean {
  return digestOf(log.entries) === log.digest;
}

/** Fasst den Nachweis für die Anzeige zusammen. */
export function summarizeEvidence(log: EvidenceLog): {
  total: number;
  byProvider: Record<string, number>;
  first?: number;
  last?: number;
} {
  const byProvider: Record<string, number> = {};
  for (const e of log.entries) byProvider[e.provider] = (byProvider[e.provider] ?? 0) + 1;
  const times = log.entries.map((e) => e.at);
  return {
    total: log.entries.length,
    byProvider,
    first: times.length ? Math.min(...times) : undefined,
    last: times.length ? Math.max(...times) : undefined,
  };
}
