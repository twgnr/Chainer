import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Vorbereitung der Komponententests.
 *
 * Aufgeräumt wird nach jedem Test; zusätzlich werden die Browser-Bausteine
 * bereitgestellt, die jsdom nicht mitbringt, die die Komponenten aber
 * benutzen. Ohne sie scheitert bereits das Rendern — was nichts über die
 * Komponente aussagen würde.
 */

afterEach(() => {
  cleanup();
});

// Der Umschalter für das Farbschema fragt die Einstellung des Betriebssystems ab.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

// React Flow misst den Graphen aus; jsdom kennt weder ResizeObserver noch DOMMatrix.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Manche Komponenten scrollen nach dem Bearbeiten an den Seitenanfang.
window.scrollTo = vi.fn();
