import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupLabels } from "../providers/registry";
import { analyseInflowRisk } from "@/lib/trace/inflow";
import type { AddressLabel, ProviderContext, TxInfo, TxInput, TxOutput } from "@/lib/providers/types";

// Die Registry macht echte Netzwerkaufrufe und wird daher vollständig ersetzt.
vi.mock("../providers/registry", () => ({
  lookupLabels: vi.fn(),
}));

const ZIEL = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const BOESE = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const BOESE_2 = "1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX";
const SAUBER = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy";

const ctx: ProviderContext = { keys: {}, config: {}, chain: "bitcoin" };

function tx(txid: string, inputs: TxInput[], outputs: TxOutput[]): TxInfo {
  return { txid, chain: "bitcoin", confirmed: true, inputs, outputs, provider: "test" };
}

/** Meldet die übergebenen Adressen als Betrugsadressen, alle anderen als unauffällig */
function meldeAlsSchaedlich(...adressen: string[]) {
  vi.mocked(lookupLabels).mockImplementation(async (_ctx: ProviderContext, address: string) => {
    const labels: AddressLabel[] = adressen.includes(address)
      ? [{ source: "testquelle", label: "Gemeldete Betrugsadresse", category: "scam", risk: "high" }]
      : [];
    return { labels, errors: [] };
  });
}

beforeEach(() => {
  vi.mocked(lookupLabels).mockReset();
});

describe("analyseInflowRisk", () => {
  it("erkennt einen Zufluss von einer gemeldeten Adresse", async () => {
    meldeAlsSchaedlich(BOESE);
    const txs = [tx("tx1", [{ address: BOESE, valueSat: 100_000_000 }], [{ n: 0, address: ZIEL, valueSat: 100_000_000 }])];

    const res = await analyseInflowRisk(ctx, ZIEL, txs);

    expect(res.checked).toBe(1);
    expect(res.skipped).toBe(0);
    expect(res.senders).toHaveLength(1);
    expect(res.senders[0].address).toBe(BOESE);
    expect(res.senders[0].amountSat).toBe(100_000_000);
    expect(res.senders[0].txids).toEqual(["tx1"]);
    expect(res.senders[0].verdict.severity).toBe("high");
    expect(res.totalSat).toBe(100_000_000);
  });

  it("meldet unauffällige Absender nicht", async () => {
    meldeAlsSchaedlich();
    const txs = [tx("tx1", [{ address: SAUBER, valueSat: 100_000_000 }], [{ n: 0, address: ZIEL, valueSat: 100_000_000 }])];

    const res = await analyseInflowRisk(ctx, ZIEL, txs);
    expect(res.checked).toBe(1);
    expect(res.senders).toEqual([]);
    expect(res.totalSat).toBe(0);
  });

  it("ignoriert ausgehende Transaktionen", async () => {
    meldeAlsSchaedlich(BOESE);
    const txs = [
      tx(
        "tx1",
        [{ address: ZIEL, valueSat: 200_000_000 }],
        [
          { n: 0, address: BOESE, valueSat: 150_000_000 },
          { n: 1, address: ZIEL, valueSat: 49_000_000 },
        ],
      ),
    ];

    const res = await analyseInflowRisk(ctx, ZIEL, txs);
    expect(res.checked).toBe(0);
    expect(res.senders).toEqual([]);
    expect(lookupLabels).not.toHaveBeenCalled();
  });

  it("ignoriert Coinbase-Eingänge", async () => {
    meldeAlsSchaedlich(BOESE);
    const txs = [
      tx("tx1", [{ coinbase: true, valueSat: 625_000_000 }], [{ n: 0, address: ZIEL, valueSat: 625_000_000 }]),
    ];

    const res = await analyseInflowRisk(ctx, ZIEL, txs);
    expect(res.checked).toBe(0);
    expect(res.senders).toEqual([]);
    expect(lookupLabels).not.toHaveBeenCalled();
  });

  it("verteilt den Nettozufluss anteilig nach Eingangswert auf zwei Absender", async () => {
    meldeAlsSchaedlich(BOESE, BOESE_2);
    const txs = [
      tx(
        "tx1",
        [
          { address: BOESE, valueSat: 300_000_000 },
          { address: BOESE_2, valueSat: 100_000_000 },
        ],
        [{ n: 0, address: ZIEL, valueSat: 400_000_000 }],
      ),
    ];

    const res = await analyseInflowRisk(ctx, ZIEL, txs);
    expect(res.senders.map((s) => [s.address, s.amountSat])).toEqual([
      [BOESE, 300_000_000],
      [BOESE_2, 100_000_000],
    ]);
    expect(res.totalSat).toBe(400_000_000);
  });

  it("rechnet nur den Nettozufluss zu, wenn die Adresse selbst mit ausgibt", async () => {
    meldeAlsSchaedlich(BOESE);
    const txs = [
      tx(
        "tx1",
        [
          { address: ZIEL, valueSat: 100_000_000 },
          { address: BOESE, valueSat: 100_000_000 },
        ],
        [{ n: 0, address: ZIEL, valueSat: 200_000_000 }],
      ),
    ];

    const res = await analyseInflowRisk(ctx, ZIEL, txs);
    expect(res.senders[0].amountSat).toBe(100_000_000);
  });

  it("begrenzt die Prüfung über maxSenders und zählt den Rest als übersprungen", async () => {
    meldeAlsSchaedlich(BOESE, BOESE_2);
    const txs = [
      tx("tx1", [{ address: BOESE, valueSat: 300_000_000 }], [{ n: 0, address: ZIEL, valueSat: 300_000_000 }]),
      tx("tx2", [{ address: BOESE_2, valueSat: 100_000_000 }], [{ n: 0, address: ZIEL, valueSat: 100_000_000 }]),
    ];

    const res = await analyseInflowRisk(ctx, ZIEL, txs, { maxSenders: 1 });
    expect(res.checked).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.senders.map((s) => s.address)).toEqual([BOESE]);
  });

  it("übergeht Fehler einzelner Abfragen", async () => {
    vi.mocked(lookupLabels).mockRejectedValue(new Error("Quelle nicht erreichbar"));
    const txs = [tx("tx1", [{ address: BOESE, valueSat: 100_000_000 }], [{ n: 0, address: ZIEL, valueSat: 100_000_000 }])];

    const res = await analyseInflowRisk(ctx, ZIEL, txs);
    expect(res.senders).toEqual([]);
    expect(res.checked).toBe(1);
  });
});
