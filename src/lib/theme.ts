/**
 * Hell-/Dunkelmodus.
 *
 * Der gewählte Modus steht als `data-theme` am `<html>`-Element und zusätzlich
 * in einem Cookie. Ein kleines Inline-Skript im `<head>` setzt das Attribut
 * noch während des Parsens, damit die Seite nicht kurz im falschen Modus
 * aufblitzt (siehe `next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`).
 */

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";
export const THEME_COOKIE = "chainer_theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

export function toTheme(v: unknown): Theme {
  return isTheme(v) ? v : DEFAULT_THEME;
}

/**
 * Skript für den `<head>`: liest das Cookie und setzt `data-theme`, bei
 * „system“ nach der Einstellung des Betriebssystems.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);
var t=m?decodeURIComponent(m[1]):"${DEFAULT_THEME}";
if(t!=="light"&&t!=="dark"&&t!=="system")t="${DEFAULT_THEME}";
var r=t==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;
document.documentElement.setAttribute("data-theme",r);
document.documentElement.style.colorScheme=r;
}catch(e){}})()`;

/** Setzt Attribut und Cookie im Browser. */
export function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

export function persistTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}
