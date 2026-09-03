import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { LocaleProvider, ThemeProvider } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import type { Theme } from "@/lib/theme";

/**
 * Gemeinsame Hilfen für die Komponententests.
 *
 * Komponenten hängen an zwei Kontexten — Sprache und Farbschema — und an der
 * Navigation von Next.js. `renderWith` stellt beides bereit, sodass ein Test
 * nur noch die Komponente und die gewünschte Sprache angeben muss.
 */

/** Merkt sich die Aufrufe der Navigation, damit Tests sie prüfen können. */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

/**
 * Die Navigation von Next.js gibt es nur im Rahmen der Anwendung. Der Ersatz
 * steht bewusst auf oberster Ebene: `vi.mock` wird ohnehin nach oben gezogen,
 * und in einer Funktion versteckt wäre die Reihenfolge irreführend.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

interface Options extends Omit<RenderOptions, "wrapper"> {
  locale?: Locale;
  theme?: Theme;
}

export function renderWith(ui: ReactElement, { locale = "en", theme = "dark", ...rest }: Options = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <LocaleProvider locale={locale}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </LocaleProvider>
    ),
    ...rest,
  });
}

/** Setzt alle Cookies des Testdokuments zurück. */
export function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}
