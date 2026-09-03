import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { translateHint } from "@/lib/i18n/hints";

/**
 * Wächter über die Übersetzung der Texte aus Analyse und Datenquellen.
 *
 * Diese Texte werden im Quelltext auf Deutsch formuliert und erst bei der
 * Anzeige übersetzt (siehe `hints.ts`). Ein Tippfehler in der Tabelle fällt
 * dabei nicht auf: die Übersetzung reicht unbekannte Texte einfach durch, und
 * in der Oberfläche steht dann still und leise wieder Deutsch.
 *
 * Der Test liest deshalb die Texte direkt aus den Quelldateien und prüft, dass
 * jeder von ihnen tatsächlich übersetzt wird.
 */

const ROOTS = ["src/lib/trace", "src/lib/providers"];

/** Felder, deren Inhalt in der Oberfläche sichtbar wird. */
const FIELDS = ["label", "details", "rateLimit", "keyHint"];

/** Enthält der Text deutsche Wörter oder Umlaute? */
function looksGerman(v: string): boolean {
  return /[äöüßÄÖÜ]/.test(v) || /\b(gesperrt|sanktioniert|gemeldet|nicht|kein|Adresse|geladen|Liste)\b/.test(v);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__fixtures__") continue;
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/** Alle festen Textwerte der oben genannten Felder einsammeln. */
function collect(): { file: string; text: string }[] {
  const found: { file: string; text: string }[] = [];
  const re = new RegExp(`(?:${FIELDS.join("|")}): "([^"\\\\$]+)"`, "g");
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(re)) {
        if (looksGerman(m[1])) found.push({ file, text: m[1] });
      }
    }
  }
  return found;
}

describe("Übersetzungsabdeckung", () => {
  const texts = collect();

  it("findet überhaupt Texte zum Prüfen", () => {
    // Schlägt der Aufbau der Quellen um, soll der Test das melden statt
    // stillschweigend nichts mehr zu prüfen.
    expect(texts.length).toBeGreaterThan(8);
  });

  it("übersetzt jeden deutschen Label- und Hinweistext der Quellen", () => {
    const missing = texts
      .filter(({ text }) => translateHint(text, "en") === text)
      .map(({ file, text }) => `${file}: ${JSON.stringify(text)}`);
    expect(missing).toEqual([]);
  });

  it("lässt deutsche Anzeige unverändert", () => {
    for (const { text } of texts) expect(translateHint(text, "de")).toBe(text);
  });
});
