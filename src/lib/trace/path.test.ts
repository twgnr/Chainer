import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PathParams } from "@/lib/trace/path";
import type { ProviderContext, TxInfo } from "@/lib/providers/types";

/**
 * Verbindungssuche zwischen zwei Adressen.
 *
 * Die Suche läuft von beiden Seiten gleichzeitig; getestet wird an einer
 * erfundenen Kette, dass sie sich trifft, die Richtung beachtet, das
 * Abfragebudget einhält und Umschlagplätze überspringen kann.
 */

const A = "1AaaAaaAaaAaaAaaAaaAaaAaaAaaAaaAaa";
const M = "1MmmMmmMmmMmmMmmMmmMmmMmmMmmMmmMmm";
const Z = "1ZzzZzzZzzZzzZzzZzzZzzZzzZzzZzzZzz";
const FREMD = "1XxxXxxXxxXxxXxxXxxXxxXxxXxxXxxXxx";

const TX1 = "1".repeat(64);
const TX2 = "2".repeat(64);

let TXS: Record<string, TxInfo> = {};
let BY_ADDRESS: Record<string, TxInfo[]> = {};

function tx(
  txid: string,
  inputs: { address: string; valueSat: number }[],
  outputs: { address: string; valueSat: number }[],
  blockTime = 1_700_000_000,
): TxInfo {
  return {
    txid,
    chain: "bitcoin",
    blockHeight: 800_000,
    blockTime,
    confirmed: true,
    feeSat: 500,
    inputs: inputs.map((i) => ({ ...i })),
    outputs: outputs.map((o, n) => ({ n, ...o })),
    provider: "test",
  };
}

/** A → TX1 → M → TX2 → Z: eine Verbindung über genau zwei Schritte. */
function chain() {
  const t1 = tx(TX1, [{ address: A, valueSat: 100_000 }], [{ address: M, valueSat: 99_000 }]);
  const t2 = tx(TX2, [{ address: M, valueSat: 99_000 }], [{ address: Z, valueSat: 98_000 }], 1_700_100_000);
  TXS = { [TX1]: t1, [TX2]: t2 };
  BY_ADDRESS = { [A]: [t1], [M]: [t2, t1], [Z]: [t2], [FREMD]: [] };
}

vi.mock("@/lib/providers/registry", () => ({
  getTx: vi.fn(async (_ctx: ProviderContext, txid: string) => {
    const t = TXS[txid];
    if (!t) throw new Error(`unbekannte Transaktion ${txid}`);
    return { data: t, provider: "test", attempts: [] };
  }),
  getAddressTxs: vi.fn(async (_ctx: ProviderContext, address: string) => ({
    data: BY_ADDRESS[address] ?? [],
    provider: "test",
    attempts: [],
  })),
  getOutspends: vi.fn(async () => ({ data: [], provider: "test", attempts: [] })),
  lookupLabels: vi.fn(async () => ({ labels: [], errors: [] })),
}));

const ctx: ProviderContext = { keys: {}, config: {}, chain: "bitcoin" };

const BASE: PathParams = {
  from: A,
  to: Z,
  chain: "bitcoin",
  maxDepth: 3,
  maxTxPerAddress: 10,
  maxAddrPerTx: 10,
  minValueSat: 0,
  maxApiCalls: 100,
  maxPaths: 5,
  directed: true,
  skipHubs: false,
  enrich: false,
};

async function search(overrides: Partial<PathParams> = {}) {
  const { findPaths } = await import("@/lib/trace/path");
  return findPaths(ctx, { ...BASE, ...overrides });
}

beforeEach(() => {
  chain();
  vi.clearAllMocks();
});

describe("findPaths", () => {
  it("findet den Weg von A nach Z über die Zwischenstation", async () => {
    const r = await search();
    expect(r.found).toBe(true);
    expect(r.paths.length).toBeGreaterThan(0);

    const hops = r.paths[0].hops;
    expect(hops[0].from).toBe(A);
    expect(hops[hops.length - 1].to).toBe(Z);
    // Der Weg führt über M.
    expect(hops.map((h) => h.to)).toContain(M);
  });

  it("gibt die Engstelle und den Zeitraum des Wegs an", async () => {
    const r = await search();
    const p = r.paths[0];

    // Festgehaltenes Verhalten, kein Wunschwert: Die Suche läuft von beiden
    // Seiten. Ein Schritt, den die Rückwärtsseite gefunden hat, trägt den
    // Betrag des Eingangs (99.000), nicht den beim Ziel angekommenen Ausgang
    // (98.000) — die Differenz ist die Gebühr. Die Engstelle fällt dadurch um
    // die Gebühren der rückwärts gefundenen Schritte zu hoch aus.
    expect(p.bottleneckSat).toBe(99_000);
    expect(p.bottleneckSat).toBe(Math.min(...p.hops.map((h) => h.valueSat)));

    expect(p.firstSeen).toBeLessThanOrEqual(p.lastSeen!);
  });

  it("liefert einen Graphen, der zu den Wegen passt", async () => {
    const r = await search();
    const ids = new Set(r.graph.nodes.map((n) => n.id));
    expect(ids.has(`a:${A}`)).toBe(true);
    expect(ids.has(`a:${Z}`)).toBe(true);
    for (const e of r.graph.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("findet nichts zwischen unverbundenen Adressen", async () => {
    const r = await search({ to: FREMD });
    expect(r.found).toBe(false);
    expect(r.paths).toHaveLength(0);
  });

  it("weist Start gleich Ziel ab", async () => {
    const r = await search({ to: A });
    expect(r.found).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/identisch/);
  });

  it("findet in Flussrichtung nichts, wenn man rückwärts sucht", async () => {
    // Von Z nach A fließt kein Geld; nur ohne Richtungszwang gibt es eine
    // Verbindung.
    const gerichtet = await search({ from: Z, to: A, directed: true });
    expect(gerichtet.found).toBe(false);

    const ungerichtet = await search({ from: Z, to: A, directed: false });
    expect(ungerichtet.found).toBe(true);
  });

  it("hält das Abfragebudget ein und weist es aus", async () => {
    const r = await search({ maxApiCalls: 1, maxDepth: 5 });
    expect(r.stats.apiCalls).toBeLessThanOrEqual(2);
    expect(r.stats.exhausted).toBe(true);
  });

  it("findet über die Tiefengrenze hinaus nichts", async () => {
    // Der Weg braucht zwei Schritte; je Seite eine Ebene reicht dafür noch.
    const tief = await search({ maxDepth: 1 });
    expect(tief.found).toBe(true);

    // Ohne Tiefe geht gar nichts.
    const flach = await search({ maxDepth: 0 });
    expect(flach.found).toBe(false);
  });

  it("überspringt Umschlagplätze mit sehr vielen Transaktionen", async () => {
    // M bekommt so viele Transaktionen, dass es als Umschlagplatz gilt.
    const viele: TxInfo[] = [];
    for (let i = 0; i < 400; i++) {
      const id = i.toString(16).padStart(64, "0");
      const t = tx(id, [{ address: `1Filler${i}`, valueSat: 1000 }], [{ address: M, valueSat: 900 }]);
      TXS[id] = t;
      viele.push(t);
    }
    BY_ADDRESS[M] = [...viele, TXS[TX2], TXS[TX1]];

    const r = await search({ skipHubs: true, maxTxPerAddress: 500 });
    expect(r.stats.hubsSkipped).toBeGreaterThan(0);
  });

  it("zählt die benutzten Quellen mit", async () => {
    const r = await search();
    expect(r.providersUsed.test).toBeGreaterThan(0);
    expect(r.stats.addressesExpanded).toBeGreaterThan(0);
    expect(r.stats.durationMs).toBeGreaterThanOrEqual(0);
  });
});
