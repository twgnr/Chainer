"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale, type Translations } from "./locale";
import { makeFormatters, type Formatters } from "@/lib/format";
import { DEFAULT_THEME, type Theme } from "@/lib/theme";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/**
 * Aufgelöstes Farbschema, also „light“ oder „dark“ – auch dann, wenn der
 * Nutzer „System“ gewählt hat.
 *
 * Komponenten wie der Graph brauchen die Farbe als Wert, nicht nur als
 * CSS-Variable. Beim ersten Rendern gilt der Wert aus dem Cookie, damit Server
 * und Browser dasselbe erzeugen; „system“ wird gleich danach im
 * Layout-Effekt – also vor dem ersten Anzeigen – aufgelöst.
 */
const ResolvedThemeContext = createContext<"light" | "dark">(DEFAULT_THEME === "light" ? "light" : "dark");

export function ThemeProvider({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const [resolved, setResolved] = useState<"light" | "dark">(theme === "light" ? "light" : "dark");

  useLayoutEffect(() => {
    const read = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      setResolved(attr === "light" ? "light" : "dark");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", read);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", read);
    };
  }, []);

  return <ResolvedThemeContext.Provider value={resolved}>{children}</ResolvedThemeContext.Provider>;
}

/** „light“ oder „dark“, nie „system“. */
export function useResolvedTheme(): "light" | "dark" {
  return useContext(ResolvedThemeContext);
}

/** Aktuell gewählte Sprache. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/**
 * Wählt aus einem `{ en, de }`-Block die Texte der aktuellen Sprache.
 *
 * Die Texte stehen bewusst in derselben Datei wie die Komponente, die sie
 * benutzt: so bleiben Original und Übersetzung nebeneinander und der
 * Zugriff (`t.title`) ist getippt statt über Schlüsselpfade.
 */
export function useT<T>(texts: Translations<T>): T {
  return texts[useLocale()];
}

/** Zahlen-, Datums- und Währungsformate der aktuellen Sprache. */
export function useFormatters(): Formatters {
  const locale = useLocale();
  return useMemo(() => makeFormatters(locale), [locale]);
}

/** BCP-47-Kennung der aktuellen Sprache, etwa für eigene `Intl`-Aufrufe. */
export function useIntlLocale(): string {
  return INTL_LOCALE[useLocale()];
}
