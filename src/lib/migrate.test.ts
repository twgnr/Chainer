import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrateCase, migrateTraceResult, schemaNote } from "./migrate";

/** Ein Ergebnis, wie es die erste Fassung gespeichert hat */
const altesErgebnis = {
  params: { start: "1abc", chain: "bitcoin" },
  nodes: [{ id: "a:1abc", data: { type: "address", address: "1abc" } }],
  edges: [{ id: "e1", source: "a:1abc", target: "t:x", valueSat: 100 }],
  clusters: [],
  stats: { addresses: 1, txs: 1, apiCalls: 2, durationMs: 5, truncated: false },
  warnings: ["Hinweis"],
  providersUsed: { mempool: 2 },
};

describe("Migration eines Trace-Ergebnisses", () => {
  it("ergänzt die später hinzugekommenen Felder", () => {
    const m = migrateTraceResult(altesErgebnis);
    expect(m).not.toBeNull();
    expect(m!.riskSources).toEqual([]);
    expect(m!.fingerprints).toEqual([]);
    expect(m!.deposits).toEqual([]);
    expect(m!.crossChain).toEqual([]);
    expect(m!.peeling).toEqual([]);
    expect(m!.activity.matrix).toHaveLength(7);
    expect(m!.activity.matrix[0]).toHaveLength(24);
    expect(m!.activity.total).toBe(0);
  });

  it("lässt vorhandene Werte unangetastet", () => {
    const m = migrateTraceResult(altesErgebnis);
    expect(m!.warnings).toEqual(["Hinweis"]);
    expect(m!.providersUsed).toEqual({ mempool: 2 });
    expect(m!.stats.apiCalls).toBe(2);
    expect(m!.nodes).toHaveLength(1);
  });

  it("verwirft Eingaben, die kein Ergebnis sind", () => {
    expect(migrateTraceResult(null)).toBeNull();
    expect(migrateTraceResult("text")).toBeNull();
    expect(migrateTraceResult({})).toBeNull();
    expect(migrateTraceResult({ nodes: [] })).toBeNull();
  });

  it("verträgt fehlende Statistikfelder", () => {
    const m = migrateTraceResult({ ...altesErgebnis, stats: undefined });
    expect(m!.stats.addresses).toBe(0);
    expect(m!.stats.truncated).toBe(false);
  });
});

describe("Migration eines Falls", () => {
  it("hebt die Version und migriert alle Traces", () => {
    const fall = {
      name: "Testfall",
      schemaVersion: 1,
      result: altesErgebnis,
      traces: [{ id: "t1", result: altesErgebnis }, { id: "t2", result: altesErgebnis }],
    };
    const { data, changed } = migrateCase(fall);
    expect(changed).toBe(true);
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    for (const t of data.traces!) {
      expect((t.result as unknown as { riskSources: unknown[] }).riskSources).toEqual([]);
    }
    expect((data.result as unknown as { deposits: unknown[] }).deposits).toEqual([]);
  });

  it("lässt aktuelle Fälle unverändert", () => {
    const fall = { name: "Neu", schemaVersion: CURRENT_SCHEMA_VERSION, traces: [] };
    const { data, changed } = migrateCase(fall);
    expect(changed).toBe(false);
    expect(data).toBe(fall);
  });

  it("verträgt Fälle ohne Ergebnis", () => {
    const { data, changed } = migrateCase({ name: "Leer" } as { name: string; schemaVersion?: number });
    expect(changed).toBe(true);
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("behält den Namen und andere Felder bei", () => {
    const { data } = migrateCase({ name: "Testfall", notes: "Notiz", schemaVersion: 1 } as {
      name: string;
      notes: string;
      schemaVersion: number;
    });
    expect(data.name).toBe("Testfall");
    expect(data.notes).toBe("Notiz");
  });
});

describe("Hinweis zur Schemaversion", () => {
  it("meldet nur bei alten Ständen", () => {
    expect(schemaNote(CURRENT_SCHEMA_VERSION)).toBeNull();
    expect(schemaNote(1)).toContain("Schemaversion 1");
    expect(schemaNote(undefined)).toContain("Schemaversion 1");
  });
});
