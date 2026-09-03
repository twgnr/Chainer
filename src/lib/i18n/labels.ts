import type { Locale, Translations } from "./locale";

/**
 * Beschriftungen, die an mehreren Stellen auftauchen: Label-Kategorien,
 * Risikostufen und ein paar wiederkehrende Knöpfe. Sie stehen hier zentral,
 * damit dieselbe Kategorie überall gleich heißt.
 */

export const CATEGORIES = [
  "exchange",
  "mixer",
  "scam",
  "sanctioned",
  "ransomware",
  "darknet",
  "gambling",
  "mining",
  "service",
  "swap",
  "bridge",
  "wallet",
  "custom",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Kategorien, die beim Anlegen eigener Labels zur Auswahl stehen. „swap“ und
 * „bridge“ kommen nur aus externen Quellen und nimmt `/api/annotations` nicht
 * an, deshalb fehlen sie in den Formularen.
 */
export const SELECTABLE_CATEGORIES = CATEGORIES.filter(
  (c): c is Exclude<Category, "swap" | "bridge"> => c !== "swap" && c !== "bridge",
);

export const CATEGORY_LABEL: Translations<Record<Category, string>> = {
  en: {
    exchange: "Exchange",
    mixer: "Mixer",
    scam: "Scam",
    sanctioned: "Sanctioned",
    ransomware: "Ransomware",
    darknet: "Darknet",
    gambling: "Gambling",
    mining: "Mining",
    service: "Service",
    swap: "Swap",
    bridge: "Bridge",
    wallet: "Wallet",
    custom: "Own",
    other: "Other",
  },
  de: {
    exchange: "Börse",
    mixer: "Mixer",
    scam: "Betrug",
    sanctioned: "Sanktioniert",
    ransomware: "Ransomware",
    darknet: "Darknet",
    gambling: "Glücksspiel",
    mining: "Mining",
    service: "Dienst",
    swap: "Swap",
    bridge: "Bridge",
    wallet: "Wallet",
    custom: "Eigene",
    other: "Sonstiges",
  },
};

export type Risk = "low" | "medium" | "high";

export const RISK_LABEL: Translations<Record<Risk, string>> = {
  en: { low: "low", medium: "medium", high: "high" },
  de: { low: "niedrig", medium: "mittel", high: "hoch" },
};

/** „keins“ für die Auswahlliste der Risikostufe */
export const RISK_NONE: Translations<string> = { en: "none", de: "keins" };

export function categoryLabel(category: string | undefined, locale: Locale): string {
  const map = CATEGORY_LABEL[locale];
  return map[(category as Category) in map ? (category as Category) : "other"];
}

export function riskLabel(risk: string | null | undefined, locale: Locale): string {
  if (risk !== "low" && risk !== "medium" && risk !== "high") return "–";
  return RISK_LABEL[locale][risk];
}

/** Knöpfe und Meldungen, die in fast jeder Ansicht vorkommen. */
export const COMMON: Translations<{
  save: string;
  saving: string;
  cancel: string;
  edit: string;
  delete: string;
  close: string;
  loading: string;
  error: string;
  none: string;
  shared: string;
  private: string;
  shareWithTeam: string;
  address: string;
  label: string;
  category: string;
  risk: string;
  note: string;
  chain: string;
  running: string;
  refresh: string;
  copy: string;
  copied: string;
}> = {
  en: {
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    close: "Close",
    loading: "Loading…",
    error: "Error",
    none: "none",
    shared: "shared",
    private: "private",
    shareWithTeam: "Share with the team",
    address: "Address",
    label: "Name",
    category: "Category",
    risk: "Risk",
    note: "Note",
    chain: "Chain",
    running: "Running…",
    refresh: "Refresh",
    copy: "Copy",
    copied: "Copied.",
  },
  de: {
    save: "Speichern",
    saving: "Speichere…",
    cancel: "Abbrechen",
    edit: "Bearbeiten",
    delete: "Löschen",
    close: "Schließen",
    loading: "Lade…",
    error: "Fehler",
    none: "keins",
    shared: "geteilt",
    private: "privat",
    shareWithTeam: "Im Team teilen",
    address: "Adresse",
    label: "Bezeichnung",
    category: "Kategorie",
    risk: "Risiko",
    note: "Notiz",
    chain: "Chain",
    running: "Läuft…",
    refresh: "Aktualisieren",
    copy: "Kopieren",
    copied: "Kopiert.",
  },
};

/** Richtungen und Modi eines Traces */
export const DIRECTION_LABEL: Translations<Record<"forward" | "backward" | "both", string>> = {
  en: { forward: "forward", backward: "backward", both: "both directions" },
  de: { forward: "vorwärts", backward: "rückwärts", both: "beide Richtungen" },
};

export const MODE_LABEL: Translations<Record<"address" | "utxo", string>> = {
  en: { address: "Address", utxo: "UTXO" },
  de: { address: "Adresse", utxo: "UTXO" },
};

export function directionLabel(v: string | undefined, locale: Locale): string {
  const map = DIRECTION_LABEL[locale];
  return v === "forward" || v === "backward" || v === "both" ? map[v] : (v ?? "–");
}
