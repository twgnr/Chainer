"use client";

import { useLayoutEffect, useState } from "react";
import { applyTheme, persistTheme, THEMES, type Theme } from "@/lib/theme";
import { useT } from "@/lib/i18n/provider";

const TXT = {
  en: {
    label: "Colour scheme",
    light: "Light",
    dark: "Dark",
    system: "System",
    title: (next: string) => `Switch to: ${next}`,
  },
  de: {
    label: "Farbschema",
    light: "Hell",
    dark: "Dunkel",
    system: "System",
    title: (next: string) => `Umschalten auf: ${next}`,
  },
};

const ICON: Record<Theme, string> = { light: "☀", dark: "☾", system: "◐" };

/**
 * Umschalter für Hell-/Dunkelmodus.
 *
 * Der Wert kommt vom Server (Cookie), damit die Anzeige beim ersten Rendern
 * schon stimmt. Geklickt wird der Reihe nach durch hell → dunkel → System.
 */
export default function ThemeToggle({ theme }: { theme: Theme }) {
  const t = useT(TXT);
  const [current, setCurrent] = useState<Theme>(theme);
  const name: Record<Theme, string> = { light: t.light, dark: t.dark, system: t.system };

  // React setzt beim Remount in der Entwicklung die Attribute des
  // `<html>`-Elements zurück; hier wird der Modus deshalb erneut angewandt.
  useLayoutEffect(() => {
    applyTheme(current);
  }, [current]);

  // Bei „System“ auf Änderungen der Betriebssystem-Einstellung reagieren.
  useLayoutEffect(() => {
    if (current !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [current]);

  function cycle() {
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    setCurrent(next);
    persistTheme(next);
    applyTheme(next);
  }

  const nextName = name[THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]];

  return (
    <button
      type="button"
      onClick={cycle}
      className="btn-secondary"
      aria-label={`${t.label}: ${name[current]}`}
      title={t.title(nextName)}
    >
      <span aria-hidden>{ICON[current]}</span>
      <span className="hidden sm:inline">{name[current]}</span>
    </button>
  );
}
