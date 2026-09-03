import type { ActivityPattern, TraceResult } from "./trace/types";

/**
 * Schemaversionierung gespeicherter Fälle.
 *
 * Ergebnisse, die vor einer Erweiterung entstanden sind, enthalten neue Felder
 * nicht. Statt überall mit optionalen Zugriffen zu arbeiten, werden alte Stände
 * beim Lesen einmalig auf den aktuellen Stand gehoben.
 *
 * Versionen:
 *  1 – erster Stand: nodes, edges, clusters, stats, warnings
 *  2 – ergänzt activity, peeling, riskSources, fingerprints, deposits, crossChain, evidence
 */
export const CURRENT_SCHEMA_VERSION = 2;

const EMPTY_ACTIVITY: ActivityPattern = {
  matrix: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
  total: 0,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Ergänzt fehlende Felder eines gespeicherten Trace-Ergebnisses. Vorhandene
 * Werte bleiben unangetastet.
 */
export function migrateTraceResult(input: unknown): TraceResult | null {
  if (!isRecord(input)) return null;
  const r = input as Partial<TraceResult> & Record<string, unknown>;
  if (!Array.isArray(r.nodes) || !Array.isArray(r.edges)) return null;

  const stats: Record<string, unknown> = isRecord(r.stats) ? r.stats : {};
  return {
    params: (r.params ?? {}) as TraceResult["params"],
    nodes: r.nodes,
    edges: r.edges,
    clusters: Array.isArray(r.clusters) ? r.clusters : [],
    activity: isRecord(r.activity) && Array.isArray((r.activity as ActivityPattern).matrix)
      ? (r.activity as ActivityPattern)
      : EMPTY_ACTIVITY,
    peeling: Array.isArray(r.peeling) ? r.peeling : [],
    riskSources: Array.isArray(r.riskSources) ? r.riskSources : [],
    fingerprints: Array.isArray(r.fingerprints) ? r.fingerprints : [],
    deposits: Array.isArray(r.deposits) ? r.deposits : [],
    crossChain: Array.isArray(r.crossChain) ? r.crossChain : [],
    evidence: r.evidence,
    stats: {
      addresses: Number(stats.addresses ?? 0),
      txs: Number(stats.txs ?? 0),
      apiCalls: Number(stats.apiCalls ?? 0),
      durationMs: Number(stats.durationMs ?? 0),
      truncated: Boolean(stats.truncated ?? false),
      taintedOutSat: stats.taintedOutSat as number | undefined,
      riskInflowSat: stats.riskInflowSat as number | undefined,
      riskAffected: stats.riskAffected as number | undefined,
    },
    warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
    providersUsed: isRecord(r.providersUsed) ? (r.providersUsed as Record<string, number>) : {},
    priceEur: typeof r.priceEur === "number" ? r.priceEur : undefined,
  };
}

export interface MigratableCase {
  schemaVersion?: number;
  result?: unknown;
  traces?: { result?: unknown }[];
  [key: string]: unknown;
}

/**
 * Hebt einen Fall auf den aktuellen Stand. Liefert zusätzlich zurück, ob dabei
 * etwas geändert wurde, damit der Aufrufer nur bei Bedarf speichert.
 */
export function migrateCase<T extends MigratableCase>(doc: T): { data: T; changed: boolean } {
  const version = Number(doc.schemaVersion ?? 1);
  if (version >= CURRENT_SCHEMA_VERSION) return { data: doc, changed: false };

  const out = { ...doc } as T;

  if (out.result) {
    const migrated = migrateTraceResult(out.result);
    if (migrated) out.result = migrated;
  }
  if (Array.isArray(out.traces)) {
    out.traces = out.traces.map((t) => {
      const migrated = migrateTraceResult(t?.result);
      return migrated ? { ...t, result: migrated } : t;
    }) as T["traces"];
  }
  // Allein die angehobene Version ist eine Änderung, die gespeichert werden sollte
  out.schemaVersion = CURRENT_SCHEMA_VERSION;
  return { data: out, changed: true };
}

/** Kurzbeschreibung für die Anzeige, wenn ein Fall aus einer alten Version stammt. */
export function schemaNote(version: number | undefined): string | null {
  const v = Number(version ?? 1);
  if (v >= CURRENT_SCHEMA_VERSION) return null;
  return `Dieser Fall wurde mit Schemaversion ${v} gespeichert und beim Öffnen auf Version ${CURRENT_SCHEMA_VERSION} gehoben. Fehlende Auswertungen erscheinen leer; ein neuer Trace füllt sie.`;
}
