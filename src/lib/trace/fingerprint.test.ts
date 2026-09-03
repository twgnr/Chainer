import { describe, expect, it } from "vitest";
import { bip69Inputs, bip69Outputs, computeRawFeatures, groupByFingerprint, walletFingerprint } from "./fingerprint";
import type { TxInfo } from "../providers/types";

function tx(raw: TxInfo["raw"], outputs: TxInfo["outputs"] = [], txid = "a".repeat(64)): TxInfo {
  return { txid, chain: "bitcoin", confirmed: true, provider: "test", inputs: [], outputs, raw };
}

describe("BIP69-Sortierung", () => {
  it("erkennt sortierte Eingänge", () => {
    expect(bip69Inputs([{ txid: "aa", vout: 0 }, { txid: "bb", vout: 1 }])).toBe(true);
    expect(bip69Inputs([{ txid: "aa", vout: 1 }, { txid: "aa", vout: 2 }])).toBe(true);
  });
  it("erkennt unsortierte Eingänge", () => {
    expect(bip69Inputs([{ txid: "bb", vout: 0 }, { txid: "aa", vout: 0 }])).toBe(false);
    expect(bip69Inputs([{ txid: "aa", vout: 3 }, { txid: "aa", vout: 1 }])).toBe(false);
  });
  it("wertet einen einzelnen Eingang nicht als sortiert", () => {
    expect(bip69Inputs([{ txid: "aa", vout: 0 }])).toBe(false);
  });
  it("erkennt sortierte und unsortierte Ausgänge", () => {
    expect(bip69Outputs([{ valueSat: 100, script: "aa" }, { valueSat: 200, script: "bb" }])).toBe(true);
    expect(bip69Outputs([{ valueSat: 200, script: "aa" }, { valueSat: 100, script: "bb" }])).toBe(false);
    expect(bip69Outputs([{ valueSat: 100, script: "bb" }, { valueSat: 100, script: "aa" }])).toBe(false);
  });
});

describe("Rohmerkmale", () => {
  it("erkennt Ersetzbarkeit nach BIP125", () => {
    expect(computeRawFeatures({ sequences: [0xfffffffd], ins: [], outs: [] }).rbf).toBe(true);
    expect(computeRawFeatures({ sequences: [0xffffffff], ins: [], outs: [] }).rbf).toBe(false);
    expect(computeRawFeatures({ sequences: [0xfffffffe], ins: [], outs: [] }).rbf).toBe(false);
  });
  it("liefert ohne Sequenzen keine Aussage zur Ersetzbarkeit", () => {
    expect(computeRawFeatures({ ins: [], outs: [] }).rbf).toBeUndefined();
  });
  it("bestimmt den häufigsten Sequenzwert", () => {
    const f = computeRawFeatures({ sequences: [0xfffffffd, 0xfffffffd, 0xffffffff], ins: [], outs: [] });
    expect(f.sequence).toBe("fffffffd");
  });
});

describe("Wallet-Fingerabdruck", () => {
  it("liefert ohne Rohmerkmale nichts", () => {
    expect(walletFingerprint(tx(undefined))).toBeNull();
  });

  it("bildet eine stabile Kurzform", () => {
    const a = walletFingerprint(tx({ version: 2, locktime: 800000, rbf: true, sequence: "fffffffd", bip69In: false, bip69Out: false }));
    const b = walletFingerprint(tx({ version: 2, locktime: 799999, rbf: true, sequence: "fffffffd", bip69In: false, bip69Out: false }));
    expect(a?.signature).toBe(b?.signature);
  });

  it("unterscheidet abweichendes Bauverhalten", () => {
    const a = walletFingerprint(tx({ version: 2, locktime: 800000, rbf: true, sequence: "fffffffd" }));
    const b = walletFingerprint(tx({ version: 1, locktime: 0, rbf: false, sequence: "ffffffff" }));
    expect(a?.signature).not.toBe(b?.signature);
  });

  it("nennt Kandidaten bei gesetzter Sperrzeit und Ersetzbarkeit", () => {
    const fp = walletFingerprint(tx({ version: 2, locktime: 800000, rbf: true, sequence: "fffffffd" }));
    expect(fp?.candidates).toContain("Bitcoin Core");
  });

  it("nennt BIP69-Wallets bei sortierten Ein- und Ausgängen", () => {
    const fp = walletFingerprint(tx({ version: 2, locktime: 0, rbf: false, bip69In: true, bip69Out: true }));
    expect(fp?.candidates.join(" ")).toContain("Trezor");
  });
});

describe("Gruppierung nach Fingerabdruck", () => {
  it("fasst gleiche Bauweise zusammen und verwirft Einzelfälle", () => {
    const raw = { version: 2, locktime: 800000, rbf: true, sequence: "fffffffd", bip69In: false, bip69Out: false };
    const other = { version: 1, locktime: 0, rbf: false, sequence: "ffffffff", bip69In: false, bip69Out: false };
    const groups = groupByFingerprint([
      tx(raw, [], "1".repeat(64)),
      tx(raw, [], "2".repeat(64)),
      tx(other, [], "3".repeat(64)),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].txids).toHaveLength(2);
  });
});
