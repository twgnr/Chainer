import { describe, expect, it } from "vitest";
import { propagateFlow, propagateTaint } from "@/lib/trace/taint";
import type { AddressNodeData, TraceEdge, TraceNode, TxNodeData } from "@/lib/trace/types";

const BTC = 100_000_000;

/** Baut einen Adressknoten mit den Pflichtfeldern auf */
function addr(address: string, receivedSat = 0, sentSat = 0): TraceNode {
  const data: AddressNodeData = {
    type: "address",
    address,
    chain: "bitcoin",
    depth: 0,
    labels: [],
    risk: "none",
    receivedSat,
    sentSat,
  };
  return { id: `a:${address}`, data };
}

/** Baut einen Transaktionsknoten mit den Pflichtfeldern auf */
function tx(txid: string, blockTime: number, totalInSat = 0, totalOutSat = 0): TraceNode {
  const data: TxNodeData = {
    type: "tx",
    txid,
    chain: "bitcoin",
    depth: 0,
    blockTime,
    inputCount: 0,
    outputCount: 0,
    totalInSat,
    totalOutSat,
    hints: [],
  };
  return { id: `t:${txid}`, data };
}

function edge(id: string, source: string, target: string, valueSat: number): TraceEdge {
  return { id, source, target, valueSat };
}

function toMap(nodes: TraceNode[]): Map<string, TraceNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/**
 * Standardszenario: Startadresse S schickt 1 BTC in eine Transaktion, die
 * zusätzlich 3 BTC von der sauberen Adresse C erhält. Ausgänge: A = 1 BTC,
 * B = 3 BTC.
 */
function szenario() {
  const nodes = toMap([
    addr("S", BTC, BTC),
    addr("C", 3 * BTC, 3 * BTC),
    tx("TX1", 1_700_000_000, 4 * BTC, 4 * BTC),
    addr("A", BTC),
    addr("B", 3 * BTC),
  ]);
  const edges: TraceEdge[] = [
    edge("e1", "a:S", "t:TX1", BTC),
    edge("e2", "a:C", "t:TX1", 3 * BTC),
    edge("e3", "t:TX1", "a:A", BTC),
    edge("e4", "t:TX1", "a:B", 3 * BTC),
  ];
  return { nodes, edges };
}

function taintOf(nodes: Map<string, TraceNode>, id: string): number {
  const n = nodes.get(id);
  if (!n || n.data.type !== "address") throw new Error(`kein Adressknoten: ${id}`);
  return n.data.taintSat ?? 0;
}

describe("propagateTaint – Verteilungsmodelle", () => {
  it("haircut verteilt anteilig: A = 0,25 BTC, B = 0,75 BTC", () => {
    const { nodes, edges } = szenario();
    propagateTaint(nodes, edges, ["a:S"], "haircut");
    expect(taintOf(nodes, "a:A")).toBe(0.25 * BTC);
    expect(taintOf(nodes, "a:B")).toBe(0.75 * BTC);
  });

  it("fifo ordnet den ersten Eingang dem ersten Ausgang zu: A = 1 BTC, B = 0", () => {
    const { nodes, edges } = szenario();
    propagateTaint(nodes, edges, ["a:S"], "fifo");
    expect(taintOf(nodes, "a:A")).toBe(BTC);
    expect(taintOf(nodes, "a:B")).toBe(0);
  });

  it("poison belastet alle Ausgänge vollständig: A = 1 BTC, B = 3 BTC", () => {
    const { nodes, edges } = szenario();
    propagateTaint(nodes, edges, ["a:S"], "poison");
    expect(taintOf(nodes, "a:A")).toBe(BTC);
    expect(taintOf(nodes, "a:B")).toBe(3 * BTC);
  });

  it("taintModel \"none\" nimmt keinerlei Zuweisung vor", () => {
    const { nodes, edges } = szenario();
    const res = propagateTaint(nodes, edges, ["a:S"], "none");
    expect(res.taintedOutSat).toBe(0);
    for (const e of edges) expect(e.taintSat).toBeUndefined();
    const a = nodes.get("a:A");
    expect(a && a.data.type === "address" ? a.data.taintSat : undefined).toBeUndefined();
  });

  it("setzt das Verhältnis taintRatio passend zum Empfangenen", () => {
    const { nodes, edges } = szenario();
    propagateTaint(nodes, edges, ["a:S"], "haircut");
    const b = nodes.get("a:B");
    expect(b?.data.type === "address" ? b.data.taintRatio : undefined).toBeCloseTo(0.25, 10);
  });
});

describe("propagateFlow – Erhaltung und Sonderfälle", () => {
  it("erhält bei haircut die eingebrachte Summe über die Ausgänge", () => {
    const { nodes, edges } = szenario();
    const seeds = new Map([["a:S", BTC]]);
    const flow = propagateFlow(nodes, edges, seeds, "haircut");
    const outSum = (flow.edgeAmount.get("e3") ?? 0) + (flow.edgeAmount.get("e4") ?? 0);
    expect(outSum).toBe(BTC);
  });

  it("erhält bei fifo die eingebrachte Summe über die Ausgänge", () => {
    const { nodes, edges } = szenario();
    const seeds = new Map([["a:S", BTC]]);
    const flow = propagateFlow(nodes, edges, seeds, "fifo");
    const outSum = (flow.edgeAmount.get("e3") ?? 0) + (flow.edgeAmount.get("e4") ?? 0);
    expect(outSum).toBe(BTC);
  });

  it("belastet bei einer Transaktion als Startpunkt alle Ausgänge vollständig", () => {
    const { nodes, edges } = szenario();
    const seeds = new Map([["t:TX1", 4 * BTC]]);
    const flow = propagateFlow(nodes, edges, seeds, "haircut");
    expect(flow.edgeAmount.get("e3")).toBe(BTC);
    expect(flow.edgeAmount.get("e4")).toBe(3 * BTC);
    expect(flow.nodeAmount.get("a:A")).toBe(BTC);
    expect(flow.nodeAmount.get("a:B")).toBe(3 * BTC);
  });

  it("liefert mit trackSources die Quelladresse je Empfänger", () => {
    const { nodes, edges } = szenario();
    const seeds = new Map([["a:S", BTC]]);
    const flow = propagateFlow(nodes, edges, seeds, "haircut", true);
    expect([...(flow.nodeSources.get("a:A") ?? [])]).toEqual(["a:S"]);
    expect([...(flow.nodeSources.get("a:B") ?? [])]).toEqual(["a:S"]);
  });

  it("zählt Durchlaufposten in totalOut nicht doppelt (Kette S → X → Y)", () => {
    // S -> TX1 -> X -> TX2 -> Y: nur Y hält am Ende belastetes Geld.
    const nodes = toMap([
      addr("S", BTC, BTC),
      tx("TX1", 1_700_000_000, BTC, BTC),
      addr("X", BTC, BTC),
      tx("TX2", 1_700_000_100, BTC, BTC),
      addr("Y", BTC),
    ]);
    const edges: TraceEdge[] = [
      edge("e1", "a:S", "t:TX1", BTC),
      edge("e2", "t:TX1", "a:X", BTC),
      edge("e3", "a:X", "t:TX2", BTC),
      edge("e4", "t:TX2", "a:Y", BTC),
    ];
    const flow = propagateFlow(nodes, edges, new Map([["a:S", BTC]]), "haircut");
    expect(flow.nodeAmount.get("a:X")).toBe(BTC);
    expect(flow.nodeAmount.get("a:Y")).toBe(BTC);
    // X gibt alles weiter, daher bleibt nur Y als Endpunkt übrig
    expect(flow.totalOut).toBe(BTC);
  });

  it("liefert ohne Quellknoten ein leeres Ergebnis", () => {
    const { nodes, edges } = szenario();
    const flow = propagateFlow(nodes, edges, new Map(), "haircut");
    expect(flow.totalOut).toBe(0);
    expect(flow.edgeAmount.size).toBe(0);
  });
});
