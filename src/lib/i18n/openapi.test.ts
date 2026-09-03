import { describe, expect, it } from "vitest";
import { translateApiText, translateOpenApi } from "@/lib/i18n/openapi";

/**
 * Das OpenAPI-Dokument wird beim Ausliefern übersetzt. Fehlt ein Text in der
 * Tabelle, wird er unbemerkt auf Deutsch ausgeliefert — dieser Test baut das
 * Dokument, läuft es durch und meldet jeden Rest.
 */

/** Beschreibende Felder aus dem fertigen Dokument einsammeln. */
function textsOf(doc: unknown): string[] {
  const fields = new Set(["description", "summary", "title"]);
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (fields.has(k) && typeof val === "string") out.push(val);
        else walk(val);
      }
    }
  };
  walk(doc);
  return out;
}

/** Sieht der Text nach unübersetztem Deutsch aus? */
function looksGerman(v: string): boolean {
  return (
    /[äöüßÄÖÜ]/.test(v) ||
    /\b(der|die|das|und|oder|nicht|wird|werden|eine|einen|mit|ohne|nur|je|zur|zum|bei|von|für|auf|als)\b/.test(v)
  );
}

describe("OpenAPI-Übersetzung", () => {
  it("übersetzt jeden beschreibenden Text des Dokuments", async () => {
    const { GET } = await import("@/app/api/openapi/route");
    const res = await GET(new Request("http://test/api/openapi"));
    const doc = await res.json();

    const texts = textsOf(doc);
    expect(texts.length).toBeGreaterThan(50);

    // Ohne Cookie und ohne Accept-Language gilt Englisch.
    const missing = [...new Set(texts.filter(looksGerman))];
    expect(missing).toEqual([]);
  });

  it("lässt das Dokument auf Deutsch unverändert", () => {
    const doc = { info: { title: "Chainer API", description: "Dieser Server" }, paths: {} };
    expect(translateOpenApi(doc, "de")).toEqual(doc);
  });

  it("rührt nur beschreibende Felder an", () => {
    const doc = {
      paths: { "/api/trace": { post: { summary: "Geldfluss verfolgen", operationId: "Geldfluss verfolgen" } } },
    };
    const out = translateOpenApi(doc, "en");
    expect(out.paths["/api/trace"].post.summary).toBe("Trace the flow of funds");
    // Kein Fließtext, also unverändert
    expect(out.paths["/api/trace"].post.operationId).toBe("Geldfluss verfolgen");
  });

  it("reicht unbekannte Texte unverändert durch", () => {
    expect(translateApiText("Etwas ganz Neues", "en")).toBe("Etwas ganz Neues");
  });
});
