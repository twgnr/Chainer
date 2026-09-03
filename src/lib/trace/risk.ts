import type { AddressLabel, LabelCategory } from "../providers/types";

/**
 * Einstufung von Adressen als schädlich. Grundlage für die Herkunfts-Warnung:
 * Geld, das von einer solchen Adresse stammt, wird im Graph, im Verlauf und auf
 * der Adressseite als belastet markiert.
 */

/** Kategorien, die eine Adresse unabhängig vom gemeldeten Risiko belasten */
export const HARMFUL_CATEGORIES: LabelCategory[] = ["sanctioned", "ransomware", "scam", "darknet"];

/** Kategorien, die die Herkunft verschleiern und daher als erhöhtes Risiko gelten */
export const OBSCURING_CATEGORIES: LabelCategory[] = ["mixer"];

export interface HarmfulVerdict {
  label: string;
  category?: LabelCategory;
  source: string;
  severity: "high" | "medium";
  details?: string;
  url?: string;
}

const CATEGORY_TEXT: Partial<Record<LabelCategory, string>> = {
  sanctioned: "sanktioniert",
  ransomware: "Ransomware",
  scam: "Betrug",
  darknet: "Darknet-Markt",
  mixer: "Mixer",
};

export function categoryText(c?: string): string {
  return (c && CATEGORY_TEXT[c as LabelCategory]) || c || "auffällig";
}

/**
 * Prüft die Labels einer Adresse und liefert die schwerwiegendste Einstufung.
 * Eigene Labels des Nutzers zählen dabei wie externe Quellen.
 *
 * @param includeMedium auch Mixer und Labels mit mittlerem Risiko werten
 */
export function classifyHarmful(labels: AddressLabel[], includeMedium = false): HarmfulVerdict | null {
  let best: HarmfulVerdict | null = null;
  for (const l of labels) {
    const cat = l.category;
    let severity: HarmfulVerdict["severity"] | null = null;

    if (cat && HARMFUL_CATEGORIES.includes(cat)) severity = "high";
    else if (l.risk === "high") severity = "high";
    else if (cat && OBSCURING_CATEGORIES.includes(cat)) severity = "medium";
    else if (l.risk === "medium") severity = "medium";

    if (!severity) continue;
    if (severity === "medium" && !includeMedium) {
      // Mittleres Risiko nur merken, falls nichts Schwereres gefunden wird
      if (!best) best = { label: l.label, category: cat, source: l.source, severity, details: l.details, url: l.url };
      continue;
    }
    if (!best || (best.severity === "medium" && severity === "high")) {
      best = { label: l.label, category: cat, source: l.source, severity, details: l.details, url: l.url };
    }
  }
  if (best && best.severity === "medium" && !includeMedium) return null;
  return best;
}

/** Alle belastenden Einstufungen einer Adresse, für die Detailanzeige */
export function allHarmful(labels: AddressLabel[]): HarmfulVerdict[] {
  const out: HarmfulVerdict[] = [];
  for (const l of labels) {
    const v = classifyHarmful([l], true);
    if (v) out.push(v);
  }
  return out;
}
