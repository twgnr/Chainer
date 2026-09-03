/**
 * Sprachauswahl / language selection.
 *
 * Die Sprache steht in einem Cookie, damit sie sowohl der Server (Layout,
 * Server-Komponenten) als auch der Browser vor dem ersten Rendern kennt.
 * Englisch ist die Standardsprache.
 */

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "chainer_locale";
/** Ein Jahr; die Auswahl soll Sitzungen überdauern. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Anzeigename je Sprache – immer in der jeweiligen Sprache selbst. */
export const LOCALE_NAME: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

/** BCP-47-Kennung für `Intl` (Zahlen, Datum, Währung). */
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-GB",
  de: "de-DE",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Unbekannte oder fehlende Werte fallen auf die Standardsprache zurück. */
export function toLocale(v: unknown): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/**
 * Wählt aus einem `Accept-Language`-Header die beste unterstützte Sprache.
 * Wird nur genutzt, solange noch kein Cookie gesetzt ist.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number.parseFloat(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((e) => e.tag)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}

/** Texte, die in jeder Sprache vorliegen: `{ en: …, de: … }`. */
export type Translations<T> = Record<Locale, T>;
