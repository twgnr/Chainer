import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheDelete, cacheGet, cacheSet, memo } from "@/lib/cache";

/** Eindeutiger Schlüssel je Test, damit sich die Tests nicht gegenseitig stören */
let counter = 0;
function schluessel(prefix = "test"): string {
  counter += 1;
  return `${prefix}:${counter}`;
}

const warte = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

afterEach(() => {
  cacheDelete("test:");
  cacheDelete("praefix");
});

describe("cacheGet / cacheSet / cacheDelete", () => {
  it("legt Werte ab und liest sie wieder aus", () => {
    const k = schluessel();
    expect(cacheGet(k)).toBeUndefined();
    cacheSet(k, { a: 1 }, 60_000);
    expect(cacheGet<{ a: number }>(k)).toEqual({ a: 1 });
  });

  it("liefert abgelaufene Werte nicht mehr aus", async () => {
    const k = schluessel();
    cacheSet(k, "wert", 5);
    await warte(20);
    expect(cacheGet(k)).toBeUndefined();
  });

  it("entfernt mit cacheDelete alle Einträge mit passendem Präfix", () => {
    cacheSet("praefixA:1", 1, 60_000);
    cacheSet("praefixA:2", 2, 60_000);
    cacheSet("praefixB:1", 3, 60_000);
    cacheDelete("praefixA:");
    expect(cacheGet("praefixA:1")).toBeUndefined();
    expect(cacheGet("praefixA:2")).toBeUndefined();
    expect(cacheGet("praefixB:1")).toBe(3);
    cacheDelete("praefixB:");
  });
});

describe("memo", () => {
  it("ruft die Funktion nur einmal je Schlüssel auf", async () => {
    const k = schluessel();
    const fn = vi.fn(async () => 42);
    expect(await memo(k, 60_000, fn)).toBe(42);
    expect(await memo(k, 60_000, fn)).toBe(42);
    expect(await memo(k, 60_000, fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("dedupliziert gleichzeitige Aufrufe", async () => {
    const k = schluessel();
    const fn = vi.fn(async () => {
      await warte(10);
      return "einmal";
    });
    const [a, b] = await Promise.all([memo(k, 60_000, fn), memo(k, 60_000, fn)]);
    expect(a).toBe("einmal");
    expect(b).toBe("einmal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("lädt nach Ablauf der TTL erneut", async () => {
    const k = schluessel();
    let n = 0;
    const fn = vi.fn(async () => ++n);
    expect(await memo(k, 5, fn)).toBe(1);
    await warte(25);
    expect(await memo(k, 5, fn)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("merkt sich Fehler nicht und gibt sie weiter", async () => {
    const k = schluessel();
    const fn = vi.fn(async () => {
      throw new Error("kaputt");
    });
    await expect(memo(k, 60_000, fn)).rejects.toThrow("kaputt");
    await expect(memo(k, 60_000, fn)).rejects.toThrow("kaputt");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
