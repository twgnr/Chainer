import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMS, type TraceParams, type TraceResult } from "@/lib/trace/types";
import type { AddressLabel, ProviderContext, TxInfo } from "@/lib/providers/types";

/**
 * Die Verfolgung selbst — das Herzstück der Anwendung.
 *
 * Die Datenquellen sind ersetzt: Der Test baut eine kleine, vollständig
 * bekannte Kette aus Transaktionen und prüft, was die Engine daraus macht.
 * So lässt sich jede Regel einzeln festnageln, ohne Netz und ohne Datenbank.
 */

/* ------------------------------------------------------------------ Daten */

const A = "1AaaAaaAaaAaaAaaAaaAaaAaaAaaAaaAaa";
const B = "1BbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbb";
const C = "1CccCccCccCccCccCccCccCccCccCccCcc";
const D = "1DddDddDddDddDddDddDddDddDddDddDdd";
const BAD = "1EvilEvilEvilEvilEvilEvilEvilEvilEv";

const TX1 = "1".repeat(64);
const TX2 = "2".repeat(64);
const TX3 = "3".repeat(64);

/** Alle Transaktionen der erfundenen Kette, nach TXID. */
let TXS: Record<string, TxInfo> = {};
/** Transaktionen je Adresse, neueste zuerst. */
let BY_ADDRESS: Record<string, TxInfo[]> = {};
/** Labels je Adresse. */
let LABELS: Record<string, AddressLabel[]> = {};

function tx(
  txid: string,
  inputs: { address?: string; valueSat?: number; coinbase?: boolean }[],
  outputs: { address?: string; valueSat: number; spentTxid?: string }[],
  blockTime = 1_700_000_000,
): TxInfo {
  return {
    txid,
    chain: "bitcoin",
    blockHeight: 800_000,
    blockTime,
    confirmed: true,
    feeSat: 1000,
    inputs: inputs.map((i) => ({ ...i })),
    outputs: outputs.map((o, n) => ({ n, spent: !!o.spentTxid, ...o })),
    provider: "test",
  };
}

/** Baut Kette und Indizes: A → TX1 → B (+ Wechselgeld an A), B → TX2 → C. */
function baseChain() {
  const t1 = tx(TX1, [{ address: A, valueSat: 100_000 }], [
    { address: B, valueSat: 60_000, spentTxid: TX2 },
    { address: A, valueSat: 39_000 },
  ]);
  const t2 = tx(TX2, [{ address: B, valueSat: 60_000 }], [{ address: C, valueSat: 59_000 }], 1_700_100_000);
  TXS = { [TX1]: t1, [TX2]: t2 };
  BY_ADDRESS = { [A]: [t1], [B]: [t2, t1], [C]: [t2] };
  LABELS = {};
}

/* ------------------------------------------------------- Ersatz-Datenquellen */

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
  getOutspends: vi.fn(async (_ctx: ProviderContext, txid: string) => ({
    data: (TXS[txid]?.outputs ?? []).map((o) => ({
      spent: !!o.spentTxid,
      txid: o.spentTxid,
      vin: 0,
    })),
    provider: "test",
    attempts: [],
  })),
  lookupLabels: vi.fn(async (_ctx: ProviderContext, address: string) => ({
    labels: LABELS[address] ?? [],
    errors: [],
  })),
}));

vi.mock("@/lib/providers/lightning", () => ({
  lightningForTx: vi.fn(async () => []),
  lightningHint: vi.fn(() => null),
}));

vi.mock("@/lib/providers/price", () => ({
  getHistoricalPrices: vi.fn(async () => ({ series: [], current: undefined })),
  priceAt: vi.fn(() => undefined),
}));

/* ---------------------------------------------------------------- Hilfen */

const ctx: ProviderContext = { keys: {}, config: {}, chain: "bitcoin" };

async function run(params: Partial<TraceParams>): Promise<TraceResult> {
  const { runTrace } = await import("@/lib/trace/engine");
  return runTrace(ctx, {
    ...DEFAULT_PARAMS,
    chain: "bitcoin",
    start: A,
    direction: "forward",
    enrich: false,
    historicPrices: false,
    lightning: false,
    ...params,
  } as TraceParams);
}

const addressNodes = (r: TraceResult) => r.nodes.filter((n) => n.data.type === "address");
const txNodes = (r: TraceResult) => r.nodes.filter((n) => n.data.type === "tx");
const addressIds = (r: TraceResult) =>
  addressNodes(r).map((n) => (n.data as { address: string }).address);

beforeEach(() => {
  baseChain();
  vi.clearAllMocks();
});

/* ----------------------------------------------------------------- Tests */

describe("runTrace: Aufbau des Graphen", () => {
  it("verfolgt vorwärts über mehrere Hops", async () => {
    const r = await run({ maxDepth: 3 });

    expect(addressIds(r)).toEqual(expect.arrayContaining([A, B, C]));
    expect(txNodes(r).map((n) => (n.data as { txid: string }).txid)).toEqual(
      expect.arrayContaining([TX1, TX2]),
    );
    // Jede Kante verbindet einen vorhandenen Knoten mit einem anderen.
    const ids = new Set(r.nodes.map((n) => n.id));
    for (const e of r.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("markiert den Startknoten und zählt die Tiefe hoch", async () => {
    const r = await run({ maxDepth: 3 });
    const start = addressNodes(r).find((n) => (n.data as { address: string }).address === A);
    expect((start!.data as { isStart?: boolean }).isStart).toBe(true);

    const first = txNodes(r).find((n) => (n.data as { txid: string }).txid === TX1);
    const second = txNodes(r).find((n) => (n.data as { txid: string }).txid === TX2);
    expect((second!.data as { depth: number }).depth).toBeGreaterThan((first!.data as { depth: number }).depth);
  });

  it("hält sich an die maximale Tiefe", async () => {
    const flach = await run({ maxDepth: 1 });
    expect(addressIds(flach)).toContain(B);
    // Bei Tiefe 1 ist die zweite Transaktion noch nicht dran.
    expect(txNodes(flach).map((n) => (n.data as { txid: string }).txid)).not.toContain(TX2);
  });

  it("zählt Statistik und benutzte Quellen mit", async () => {
    const r = await run({ maxDepth: 3 });
    expect(r.stats.addresses).toBe(addressNodes(r).length);
    expect(r.stats.txs).toBe(txNodes(r).length);
    expect(r.stats.apiCalls).toBeGreaterThan(0);
    expect(r.providersUsed.test).toBeGreaterThan(0);
  });

  it("nimmt eine Transaktions-ID als Startpunkt", async () => {
    const r = await run({ start: TX1, maxDepth: 2 });
    expect(txNodes(r).map((n) => (n.data as { txid: string }).txid)).toContain(TX1);
    const startTx = txNodes(r).find((n) => (n.data as { txid: string }).txid === TX1);
    expect((startTx!.data as { isStart?: boolean }).isStart).toBe(true);
  });
});

describe("runTrace: Grenzen", () => {
  it("filtert Ausgänge unterhalb des Mindestbetrags weg", async () => {
    const r = await run({ maxDepth: 3, minValueSat: 50_000 });
    // Das Wechselgeld von 39.000 liegt unter der Grenze und wird nicht verfolgt.
    const zurueckAnA = r.edges.filter((e) => e.source === `t:${TX1}` && e.target === `a:${A}`);
    expect(zurueckAnA).toHaveLength(0);
  });

  it("bricht am Knotenlimit ab und sagt es", async () => {
    const r = await run({ maxDepth: 5, maxNodes: 2 });
    expect(r.stats.truncated).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/Knotenlimit/);
  });

  it("liefert für eine Adresse ohne Transaktionen einen leeren Graphen, ohne zu warnen", async () => {
    // Keine Transaktionen ist kein Fehler, sondern ein Ergebnis.
    const r = await run({ start: "1UnbekannteAdresseOhneTransaktionen" });
    expect(txNodes(r)).toHaveLength(0);
    expect(r.edges).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("meldet einen nicht ladbaren Startpunkt als Warnung statt zu scheitern", async () => {
    const { getAddressTxs } = await import("@/lib/providers/registry");
    vi.mocked(getAddressTxs).mockRejectedValueOnce(new Error("Quelle nicht erreichbar"));

    const r = await run({ start: A });
    // Die Warnung nennt die betroffene Adresse und den Grund.
    expect(r.warnings.join(" ")).toContain("Quelle nicht erreichbar");
    expect(r.warnings.join(" ")).toContain(A);
    expect(txNodes(r)).toHaveLength(0);
  });
});

describe("runTrace: Heuristiken", () => {
  it("erkennt Wechselgeld an der wiederverwendeten Adresse", async () => {
    const r = await run({ maxDepth: 2 });
    const t1 = txNodes(r).find((n) => (n.data as { txid: string }).txid === TX1);
    expect((t1!.data as { hints: string[] }).hints.join(" ")).toMatch(/Wechselgeld/);
    // Und die Kante dorthin ist als Wechselgeld markiert.
    const change = r.edges.find((e) => e.source === `t:${TX1}` && e.target === `a:${A}`);
    expect(change?.change).toBe(true);
  });

  it("führt Adressen gemeinsamer Eingänge zu einem Cluster zusammen", async () => {
    // TX3 gibt A und D zusammen aus: klassisches Common-Input-Ownership.
    const t3 = tx(TX3, [
      { address: A, valueSat: 10_000 },
      { address: D, valueSat: 10_000 },
    ], [{ address: C, valueSat: 19_000 }]);
    TXS[TX3] = t3;
    BY_ADDRESS[A] = [t3, TXS[TX1]];
    BY_ADDRESS[D] = [t3];

    const r = await run({ maxDepth: 2 });
    const cluster = r.clusters.find((c) => c.addresses.includes(A) && c.addresses.includes(D));
    expect(cluster).toBeDefined();
    const t3Node = txNodes(r).find((n) => (n.data as { txid: string }).txid === TX3);
    expect((t3Node!.data as { hints: string[] }).hints.join(" ")).toMatch(/Common-Input/);
  });

  it("kennzeichnet frisch geschürfte Coins", async () => {
    const coinbase = tx(TX3, [{ coinbase: true }], [{ address: A, valueSat: 5_000_000 }]);
    TXS[TX3] = coinbase;
    BY_ADDRESS[A] = [coinbase];

    // Die Coinbase liegt in der Herkunft von A, also rückwärts verfolgen.
    const r = await run({ direction: "backward", maxDepth: 2 });
    expect(addressIds(r)).toContain("coinbase");
  });
});

describe("runTrace: Herkunft von schädlichen Adressen", () => {
  beforeEach(() => {
    // BAD zahlt an A, A zahlt weiter — die Belastung muss mitwandern.
    const boese = tx(TX3, [{ address: BAD, valueSat: 100_000 }], [{ address: A, valueSat: 100_000, spentTxid: TX1 }]);
    TXS[TX3] = boese;
    BY_ADDRESS[BAD] = [boese];
    BY_ADDRESS[A] = [boese, TXS[TX1]];
    LABELS = {
      [BAD]: [{ source: "testliste", label: "Gemeldete Betrugsadresse", category: "scam", risk: "high" }],
    };
  });

  it("findet die gemeldete Adresse und reicht die Belastung weiter", async () => {
    const r = await run({ start: BAD, maxDepth: 3, enrich: true });

    expect(r.riskSources.map((s) => s.address)).toContain(BAD);

    const empfaenger = addressNodes(r).find((n) => (n.data as { address: string }).address === A);
    expect((empfaenger!.data as { riskFromSat?: number }).riskFromSat).toBeGreaterThan(0);
    expect(r.stats.riskAffected).toBeGreaterThan(0);
  });

  it("lässt ohne Label-Abfrage auch keine Warnung entstehen", async () => {
    const r = await run({ start: BAD, maxDepth: 3, enrich: false });
    expect(r.riskSources).toHaveLength(0);
  });
});

describe("runTrace: Abbruch", () => {
  it("hört auf, wenn das Signal abgebrochen wird", async () => {
    const { runTrace } = await import("@/lib/trace/engine");
    const ac = new AbortController();
    ac.abort();
    const r = await runTrace(
      ctx,
      { ...DEFAULT_PARAMS, chain: "bitcoin", start: A, direction: "forward", enrich: false } as TraceParams,
      { signal: ac.signal },
    );
    expect(r.warnings.join(" ")).toMatch(/Abgebrochen/);
  });
});
