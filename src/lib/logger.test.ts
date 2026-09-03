import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentRequest, errorFields, log, requestId, setLogUser, withBackgroundContext, withLogging } from "./logger";

let ausgabe: string[] = [];

beforeEach(() => {
  ausgabe = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void ausgabe.push(a.join(" ")));
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void ausgabe.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void ausgabe.push(a.join(" ")));
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe("Anfragekennung", () => {
  it("liefert außerhalb einer Anfrage einen Platzhalter", () => {
    expect(requestId()).toBe("-");
    expect(currentRequest()).toBeUndefined();
  });

  it("übernimmt eine mitgelieferte Kennung", async () => {
    const handler = withLogging("/test", async () => {
      expect(requestId()).toBe("abc-123");
      return new Response("ok");
    });
    const res = await handler(new Request("http://test/", { headers: { "x-request-id": "abc-123" } }));
    expect(res.headers.get("x-request-id")).toBe("abc-123");
  });

  it("vergibt eine eigene Kennung, wenn keine mitkommt", async () => {
    const handler = withLogging("/test", async () => new Response("ok"));
    const res = await handler(new Request("http://test/"));
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("weist überlange Kennungen ab und vergibt eine eigene", async () => {
    const handler = withLogging("/test", async () => new Response("ok"));
    const res = await handler(new Request("http://test/", { headers: { "x-request-id": "x".repeat(200) } }));
    expect(res.headers.get("x-request-id")).not.toBe("x".repeat(200));
  });

  it("erhält Statuscode und Rumpf der Antwort", async () => {
    const handler = withLogging("/test", async () => new Response(JSON.stringify({ a: 1 }), { status: 418 }));
    const res = await handler(new Request("http://test/"));
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("reicht Fehler weiter und protokolliert sie", async () => {
    const handler = withLogging("/test", async () => {
      throw new Error("kaputt");
    });
    await expect(handler(new Request("http://test/"))).rejects.toThrow("kaputt");
    expect(ausgabe.join("\n")).toContain("fehlgeschlagen");
  });

  it("merkt sich die Nutzerkennung der laufenden Anfrage", async () => {
    const handler = withLogging("/test", async () => {
      setLogUser("nutzer-1");
      expect(currentRequest()?.userId).toBe("nutzer-1");
      return new Response("ok");
    });
    await handler(new Request("http://test/"));
  });
});

describe("Protokollstufen", () => {
  it("unterdrückt Debug-Meldungen bei Standardstufe", () => {
    log.debug("nicht sichtbar");
    expect(ausgabe.join("\n")).not.toContain("nicht sichtbar");
  });

  it("gibt Debug-Meldungen bei niedriger Stufe aus", () => {
    process.env.LOG_LEVEL = "debug";
    log.debug("sichtbar");
    expect(ausgabe.join("\n")).toContain("sichtbar");
  });

  it("gibt Warnungen und Fehler immer aus", () => {
    log.warn("Warnung");
    log.error("Fehler");
    expect(ausgabe.join("\n")).toContain("Warnung");
    expect(ausgabe.join("\n")).toContain("Fehler");
  });
});

describe("Hilfen", () => {
  it("wandelt Fehler in protokollierbare Felder", () => {
    const f = errorFields(new Error("Testfehler"));
    expect(f.error).toBe("Testfehler");
    expect(f.errorName).toBe("Error");
    const g = errorFields("nur Text");
    expect(g.error).toBe("nur Text");
  });

  it("umschließt Hintergrundaufgaben mit eigener Kennung", async () => {
    const r = await withBackgroundContext("test-aufgabe", async () => {
      expect(requestId()).not.toBe("-");
      expect(currentRequest()?.method).toBe("JOB");
      return 7;
    });
    expect(r).toBe(7);
  });
});
