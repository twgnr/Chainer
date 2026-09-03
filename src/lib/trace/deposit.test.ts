import { describe, expect, it } from "vitest";
import { detectDepositFromTxs, detectDepositInGraph, depositHint } from "./deposit";
import type { TxInfo } from "../providers/types";
import type { TraceEdge, TraceNode } from "./types";

const DEPOSIT = "1DepositAdresse";
const HOTWALLET = "1SammelAdresseDerBoerse";
const ZAHLER = "1Einzahler";

function tx(partial: Partial<TxInfo> & Pick<TxInfo, "txid" | "inputs" | "outputs">): TxInfo {
  return { chain: "bitcoin", confirmed: true, provider: "test", ...partial };
}

describe("Einzahlungsadressen aus Transaktionen", () => {
  it("erkennt einmaligen Empfang mit vollständiger Weiterleitung", () => {
    const txs: TxInfo[] = [
      tx({
        txid: "a".repeat(64),
        inputs: [{ address: ZAHLER, valueSat: 1_000_000 }],
        outputs: [{ n: 0, address: DEPOSIT, valueSat: 1_000_000 }],
      }),
      tx({
        txid: "b".repeat(64),
        inputs: [{ address: DEPOSIT, valueSat: 1_000_000 }],
        outputs: [{ n: 0, address: HOTWALLET, valueSat: 995_000 }],
      }),
    ];
    const v = detectDepositFromTxs(DEPOSIT, txs);
    expect(v).not.toBeNull();
    expect(v!.forwardsTo).toBe(HOTWALLET);
    expect(v!.forwardCount).toBe(1);
    expect(v!.ratio).toBeGreaterThan(0.99);
  });

  it("erkennt mehrere Weiterleitungen an dieselbe Adresse", () => {
    const txs: TxInfo[] = [
      tx({ txid: "1".repeat(64), inputs: [{ address: ZAHLER, valueSat: 500 }], outputs: [{ n: 0, address: DEPOSIT, valueSat: 500_000 }] }),
      tx({ txid: "2".repeat(64), inputs: [{ address: DEPOSIT, valueSat: 500_000 }], outputs: [{ n: 0, address: HOTWALLET, valueSat: 499_000 }] }),
      tx({ txid: "3".repeat(64), inputs: [{ address: ZAHLER, valueSat: 500 }], outputs: [{ n: 0, address: DEPOSIT, valueSat: 500_000 }] }),
      tx({ txid: "4".repeat(64), inputs: [{ address: DEPOSIT, valueSat: 500_000 }], outputs: [{ n: 0, address: HOTWALLET, valueSat: 499_000 }] }),
    ];
    const v = detectDepositFromTxs(DEPOSIT, txs);
    expect(v?.forwardCount).toBe(2);
    expect(v?.forwardsTo).toBe(HOTWALLET);
  });

  it("erkennt keine Einzahlungsadresse bei mehreren Empfängern", () => {
    const txs: TxInfo[] = [
      tx({ txid: "1".repeat(64), inputs: [{ address: ZAHLER, valueSat: 500 }], outputs: [{ n: 0, address: DEPOSIT, valueSat: 1_000_000 }] }),
      tx({
        txid: "2".repeat(64),
        inputs: [{ address: DEPOSIT, valueSat: 1_000_000 }],
        outputs: [
          { n: 0, address: HOTWALLET, valueSat: 500_000 },
          { n: 1, address: "1AndereAdresse", valueSat: 495_000 },
        ],
      }),
    ];
    expect(detectDepositFromTxs(DEPOSIT, txs)).toBeNull();
  });

  it("erkennt keine Einzahlungsadresse, wenn zu wenig weitergeleitet wird", () => {
    const txs: TxInfo[] = [
      tx({ txid: "1".repeat(64), inputs: [{ address: ZAHLER, valueSat: 500 }], outputs: [{ n: 0, address: DEPOSIT, valueSat: 1_000_000 }] }),
      tx({ txid: "2".repeat(64), inputs: [{ address: DEPOSIT, valueSat: 400_000 }], outputs: [{ n: 0, address: HOTWALLET, valueSat: 399_000 }] }),
    ];
    expect(detectDepositFromTxs(DEPOSIT, txs)).toBeNull();
  });

  it("liefert einen Hinweistext mit dem Dienstnamen", () => {
    const v = { forwardsTo: HOTWALLET, receivedSat: 1, forwardedSat: 1, ratio: 1, forwardCount: 1, reason: "Test" };
    expect(depositHint(v, "Binance")).toContain("Binance");
    expect(depositHint(v)).toContain("Einzahlungsadresse");
  });
});

describe("Einzahlungsadressen im Graphen", () => {
  it("erkennt die Weiterleitung über den Graphen", () => {
    const nodes = new Map<string, TraceNode>();
    const addr = (a: string, recv: number, sent: number) =>
      nodes.set(`a:${a}`, {
        id: `a:${a}`,
        data: {
          type: "address",
          address: a,
          chain: "bitcoin",
          depth: 0,
          labels: [],
          risk: "none",
          receivedSat: recv,
          sentSat: sent,
        },
      });
    addr(DEPOSIT, 1_000_000, 1_000_000);
    addr(HOTWALLET, 995_000, 0);
    nodes.set("t:x", {
      id: "t:x",
      data: {
        type: "tx",
        txid: "x",
        chain: "bitcoin",
        depth: 1,
        inputCount: 1,
        outputCount: 1,
        totalInSat: 1_000_000,
        totalOutSat: 995_000,
        hints: [],
      },
    });
    const edges: TraceEdge[] = [
      { id: "e1", source: `a:${DEPOSIT}`, target: "t:x", valueSat: 1_000_000 },
      { id: "e2", source: "t:x", target: `a:${HOTWALLET}`, valueSat: 995_000 },
    ];
    const v = detectDepositInGraph(DEPOSIT, nodes, edges);
    expect(v?.forwardsTo).toBe(HOTWALLET);
    expect(v?.ratio).toBeGreaterThan(0.99);
  });
});
