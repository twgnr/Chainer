import { describe, expect, it } from "vitest";
import { canonicalJson, isRecording, recordEvidence, sha256, summarizeEvidence, verifyEvidence, withEvidence } from "./evidence";

describe("Stabile JSON-Schreibweise", () => {
  it("ordnet Schlüssel unabhängig von der Eingabereihenfolge", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
  it("liefert für gleiche Inhalte denselben Prüfwert", () => {
    expect(sha256({ x: [1, 2], y: "z" })).toBe(sha256({ y: "z", x: [1, 2] }));
  });
  it("liefert für abweichende Inhalte verschiedene Prüfwerte", () => {
    expect(sha256({ a: 1 })).not.toBe(sha256({ a: 2 }));
  });
  it("verträgt zyklische Strukturen", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => canonicalJson(obj)).not.toThrow();
  });
});

describe("Aufzeichnung", () => {
  it("zeichnet nur innerhalb von withEvidence auf", async () => {
    expect(isRecording()).toBe(false);
    // Außerhalb darf der Aufruf nichts tun und nicht scheitern
    recordEvidence({ kind: "tx", key: "x", chain: "bitcoin", provider: "test" }, { a: 1 });

    const { evidence } = await withEvidence(async () => {
      expect(isRecording()).toBe(true);
      recordEvidence({ kind: "tx", key: "abc", chain: "bitcoin", provider: "mempool" }, { a: 1 });
      recordEvidence({ kind: "address", key: "def", chain: "bitcoin", provider: "blockstream" }, { b: 2 });
      return null;
    });
    expect(evidence.entries).toHaveLength(2);
    expect(evidence.entries[0].provider).toBe("mempool");
    expect(evidence.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gibt das Ergebnis der Auswertung zurück", async () => {
    const { result } = await withEvidence(async () => 42);
    expect(result).toBe(42);
  });

  it("erkennt unveränderte und veränderte Nachweise", async () => {
    const { evidence } = await withEvidence(async () => {
      recordEvidence({ kind: "tx", key: "abc", chain: "bitcoin", provider: "mempool" }, { a: 1 });
      return null;
    });
    expect(verifyEvidence(evidence)).toBe(true);
    evidence.entries[0].provider = "gefälscht";
    expect(verifyEvidence(evidence)).toBe(false);
  });

  it("fasst den Nachweis zusammen", async () => {
    const { evidence } = await withEvidence(async () => {
      recordEvidence({ kind: "tx", key: "a", chain: "bitcoin", provider: "mempool" }, {});
      recordEvidence({ kind: "tx", key: "b", chain: "bitcoin", provider: "mempool" }, {});
      recordEvidence({ kind: "labels", key: "c", chain: "bitcoin", provider: "ofac" }, {});
      return null;
    });
    const sum = summarizeEvidence(evidence);
    expect(sum.total).toBe(3);
    expect(sum.byProvider.mempool).toBe(2);
    expect(sum.byProvider.ofac).toBe(1);
    expect(sum.first).toBeLessThanOrEqual(sum.last!);
  });
});
