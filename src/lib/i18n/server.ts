import { cookies, headers } from "next/headers";
import { makeFormatters, type Formatters } from "@/lib/format";
import {
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  toLocale,
  type Locale,
  type Translations,
} from "./locale";
import { THEME_COOKIE, toTheme, type Theme } from "@/lib/theme";

/**
 * Sprache der aktuellen Anfrage: Cookie zuerst, sonst `Accept-Language`,
 * sonst die Standardsprache Englisch.
 */
export async function getLocale(): Promise<Locale> {
  // Cookie und Kopfzeilen gibt es nur innerhalb einer Anfrage. Außerhalb —
  // etwa in Tests oder beim Vorabrendern — gilt die Standardsprache; eine
  // fehlende Sprache darf keine Antwort scheitern lassen.
  try {
    const store = await cookies();
    const fromCookie = store.get(LOCALE_COOKIE)?.value;
    if (fromCookie) return toLocale(fromCookie);
  } catch {
    return toLocale(undefined);
  }
  try {
    const h = await headers();
    return localeFromAcceptLanguage(h.get("accept-language")) ?? toLocale(undefined);
  } catch {
    return toLocale(undefined);
  }
}

export async function getTheme(): Promise<Theme> {
  try {
    const store = await cookies();
    return toTheme(store.get(THEME_COOKIE)?.value);
  } catch {
    return toTheme(undefined);
  }
}

/** Texte der aktuellen Sprache in einer Server-Komponente. */
export async function getT<T>(texts: Translations<T>): Promise<T> {
  return texts[await getLocale()];
}

export async function getFormatters(): Promise<Formatters> {
  return makeFormatters(await getLocale());
}
