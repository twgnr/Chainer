import { describe, expect, it } from "vitest";
import {
  activityPattern,
  addressType,
  behaviorLabels,
  collectBehavior,
  detectChange,
  detectPeeling,
  maxEqualOutputs,
  roundness,
  txHints,
} from "@/lib/trace/heuristics";
import type { AddressNodeData, TraceEdge, TraceNode, TxNodeData } from "@/lib/trace/types";
import type { TxInfo } from "@/lib/providers/types";

const P2PKH_IN = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const P2PKH_A = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const P2PKH_B = "1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX";
const BECH32 = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

describe("addressType", () => {
  it("erkennt die gängigen Skript-Typen", () => {
    expect(addressType(P2PKH_A)).toBe("p2pkh");
    expect(addressType("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe("p2sh");
    expect(addressType(BECH32)).toBe("p2wpkh");
    expect(addressType("bc1pmzfrwwndsqmk5yh69yjr5lfgfg4ev8c0tsc06e")).toBe("p2tr");
    expect(addressType("0x0000000000000000000000000000000000000001")).toBe("evm");
    expect(addressType("irgendwas")).toBe("other");
  });
});

describe("roundness", () => {
  it("zählt die abschließenden Nullen", () => {
    expect(roundness(100_000_000)).toBe(8);
    expect(roundness(50_000_000)).toBe(7);
    expect(roundness(12_345_678)).toBe(0);
    expect(roundness(0)).toBe(0);
  });
});

describe("detectChange", () => {
  it("erkennt Wechselgeld an der wiederverwendeten Adresse", () => {
    const res = detectChange(
      [
        { n: 0, address: P2PKH_A, valueSat: 10_000_000 },
        { n: 1, address: P2PKH_IN, valueSat: 5_000_000 },
      ],
      [P2PKH_IN],
    );
    expect(res).toEqual({ index: 1, reason: "Adresse wird wiederverwendet" });
  });

  it("erkennt Wechselgeld am gleichen Skript-Typ wie die Eingänge", () => {
    const res = detectChange(
      [
        { n: 0, address: P2PKH_A, valueSat: 10_000_000 },
        { n: 1, address: BECH32, valueSat: 5_000_000 },
      ],
      [P2PKH_IN],
    );
    expect(res).toEqual({ index: 0, reason: "gleicher Skript-Typ wie Eingänge" });
  });

  it("erkennt Wechselgeld am unrunden Betrag", () => {
    const res = detectChange(
      [
        { n: 0, address: P2PKH_A, valueSat: 50_000_000 },
        { n: 1, address: P2PKH_B, valueSat: 12_345_678 },
      ],
      [P2PKH_IN],
    );
    expect(res).toEqual({ index: 1, reason: "unrunder Betrag" });
  });

  it("trifft ohne unterscheidendes Merkmal keine Entscheidung", () => {
    const res = detectChange(
      [
        { n: 0, address: P2PKH_A, valueSat: 12_345_678 },
        { n: 1, address: P2PKH_B, valueSat: 87_654_321 },
      ],
      [P2PKH_IN],
    );
    expect(res).toBeNull();
  });

  it("liefert null bei einer anderen Anzahl Ausgänge oder ohne Eingänge", () => {
    expect(detectChange([{ n: 0, address: P2PKH_A, valueSat: 1 }], [P2PKH_IN])).toBeNull();
    expect(
      detectChange(
        [
          { n: 0, address: P2PKH_A, valueSat: 1 },
          { n: 1, address: P2PKH_B, valueSat: 2 },
        ],
        [],
      ),
    ).toBeNull();
  });
});

describe("maxEqualOutputs", () => {
  it("zählt die größte Gruppe betragsgleicher Ausgänge", () => {
    expect(maxEqualOutputs([])).toBe(0);
    expect(maxEqualOutputs([1, 2, 3])).toBe(1);
    expect(maxEqualOutputs([5, 5, 5, 7, 7])).toBe(3);
  });
});

function txInfo(over: Partial<TxInfo> = {}): TxInfo {
  return {
    txid: "a".repeat(64),
    chain: "bitcoin",
    confirmed: true,
    inputs: [],
    outputs: [],
    provider: "test",
    ...over,
  };
}

describe("txHints", () => {
  it("meldet einen möglichen CoinJoin bei gleich großen Ausgängen", () => {
    const hints = txHints(txInfo(), [P2PKH_A, P2PKH_B, P2PKH_IN], 6, 3);
    expect(hints.some((h) => h.includes("CoinJoin"))).toBe(true);
  });

  it("meldet eine Konsolidierung bei vielen Eingängen und einem Ausgang", () => {
    const hints = txHints(txInfo(), ["a", "b", "c", "d", "e"], 1, 1);
    expect(hints.some((h) => h.includes("Konsolidierung"))).toBe(true);
  });

  it("meldet eine Batch-Auszahlung bei mehr als 20 Ausgängen", () => {
    const hints = txHints(txInfo(), [P2PKH_A], 21, 1);
    expect(hints.some((h) => h.includes("Batch-Auszahlung"))).toBe(true);
  });

  it("meldet Coinbase-Transaktionen und gibt sonst keine Hinweise aus", () => {
    expect(txHints(txInfo({ inputs: [{ coinbase: true }] }), [], 1, 1)[0]).toContain("Coinbase");
    expect(txHints(txInfo(), [P2PKH_A], 2, 1)).toEqual([]);
  });
});

/* ---------------- Peeling ---------------- */

function addrNode(address: string): TraceNode {
  const data: AddressNodeData = {
    type: "address",
    address,
    chain: "bitcoin",
    depth: 0,
    labels: [],
    risk: "none",
    receivedSat: 0,
    sentSat: 0,
  };
  return { id: `a:${address}`, data };
}

function txNode(txid: string): TraceNode {
  const data: TxNodeData = {
    type: "tx",
    txid,
    chain: "bitcoin",
    depth: 0,
    inputCount: 1,
    outputCount: 2,
    totalInSat: 0,
    totalOutSat: 0,
    hints: [],
  };
  return { id: `t:${txid}`, data };
}

/** Baut eine Peeling-Kette mit der angegebenen Anzahl Schritte auf */
function peelingGraph(steps: number) {
  const nodes = new Map<string, TraceNode>();
  const edges: TraceEdge[] = [];
  nodes.set("a:S", addrNode("S"));
  let rest = 100_000_000;
  let from = "a:S";
  for (let i = 1; i <= steps; i++) {
    const txId = `t:TX${i}`;
    nodes.set(txId, txNode(`TX${i}`));
    edges.push({ id: `in${i}`, source: from, target: txId, valueSat: rest });
    const small = 5_000_000;
    const big = rest - small;
    nodes.set(`a:R${i}`, addrNode(`R${i}`));
    nodes.set(`a:P${i}`, addrNode(`P${i}`));
    edges.push({ id: `big${i}`, source: txId, target: `a:R${i}`, valueSat: big });
    edges.push({ id: `small${i}`, source: txId, target: `a:P${i}`, valueSat: small });
    rest = big;
    from = `a:R${i}`;
  }
  return { nodes, edges };
}

describe("detectPeeling", () => {
  it("erkennt eine Kette über drei Schritte", () => {
    const { nodes, edges } = peelingGraph(3);
    const chains = detectPeeling(nodes, edges);
    expect(chains).toHaveLength(1);
    expect(chains[0].txids).toEqual(["TX1", "TX2", "TX3"]);
    expect(chains[0].peeledSat).toEqual([5_000_000, 5_000_000, 5_000_000]);
    expect(chains[0].totalPeeledSat).toBe(15_000_000);
    expect(chains[0].remainingSat).toBe(85_000_000);
  });

  it("wertet zwei Schritte nicht als Kette", () => {
    const { nodes, edges } = peelingGraph(2);
    expect(detectPeeling(nodes, edges)).toEqual([]);
  });
});

/* ---------------- Aktivitätsmuster ---------------- */

/** Zeitstempel für die angegebenen UTC-Stunden am 1. Januar 2024 */
function stunden(hours: number[]): number[] {
  return hours.map((h) => Date.UTC(2024, 0, 1, h, 30, 0) / 1000);
}

describe("activityPattern", () => {
  it("schätzt die Zeitzone aus dem ruhigsten Sechs-Stunden-Fenster", () => {
    // Ruhig von 22:00 bis 03:59 UTC - das entspricht lokal 1-7 Uhr bei UTC+3
    const aktiv = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    const p = activityPattern(stunden(aktiv));
    expect(p.total).toBe(18);
    expect(p.guessedUtcOffset).toBe(3);
    expect(p.guessedRegion).toBeTruthy();
    expect(Math.abs(p.guessedUtcOffset ?? 99)).toBeLessThanOrEqual(12);
  });

  it("füllt die Wochentag-/Stunden-Matrix und die Eckdaten", () => {
    const times = stunden([4, 5, 6]);
    const p = activityPattern(times);
    // Der 1. Januar 2024 ist ein Montag (UTC-Wochentag 1)
    expect(p.matrix[1][4]).toBe(1);
    expect(p.matrix).toHaveLength(7);
    expect(p.matrix[0]).toHaveLength(24);
    expect(p.firstSeen).toBe(Math.min(...times));
    expect(p.lastSeen).toBe(Math.max(...times));
  });

  it("schätzt bei weniger als 12 Zeitstempeln keine Zeitzone", () => {
    const p = activityPattern(stunden([4, 5, 6, 7, 8]));
    expect(p.guessedUtcOffset).toBeUndefined();
    expect(p.guessedRegion).toBeUndefined();
  });

  it("ignoriert ungültige Zeitstempel", () => {
    const p = activityPattern([0, Number.NaN, -5, ...stunden([9])]);
    expect(p.total).toBe(1);
  });
});

/* ---------------- Verhalten ---------------- */

describe("behaviorLabels / collectBehavior", () => {
  it("leitet aus den Kennzahlen passende Hinweise ab", () => {
    expect(
      behaviorLabels({
        txCount: 3,
        batchTxCount: 2,
        consolidationCount: 2,
        reuseCount: 5,
        distinctCounterparties: 2,
        receivedSat: 1000,
        sentSat: 0,
      }),
    ).toEqual([
      "Batch-Auszahlungen (Börsen-typisch)",
      "Sammeladresse (Konsolidierung)",
      "Adresse mehrfach wiederverwendet",
      "Nur Eingänge (Sparadresse / Cold Wallet)",
    ]);
  });

  it("liefert ohne Auffälligkeiten keine Hinweise", () => {
    expect(
      behaviorLabels({
        txCount: 1,
        batchTxCount: 0,
        consolidationCount: 0,
        reuseCount: 1,
        distinctCounterparties: 1,
        receivedSat: 1000,
        sentSat: 1000,
      }),
    ).toEqual([]);
  });

  it("sammelt die Kennzahlen aus dem Graphen", () => {
    const { nodes, edges } = peelingGraph(2);
    const b = collectBehavior("S", nodes, edges);
    expect(b.txCount).toBe(1);
    expect(b.reuseCount).toBe(1);
    expect(b.distinctCounterparties).toBe(2);
  });
});
