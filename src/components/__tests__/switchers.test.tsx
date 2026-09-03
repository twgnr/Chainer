import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearCookies, renderWith, router } from "./helpers";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import LabelBadges from "@/components/LabelBadges";
import type { AddressLabel } from "@/lib/providers/types";

/**
 * Sprachauswahl, Farbschema und die Anzeige der Labels.
 *
 * Alle drei entscheiden darüber, was der Nutzer überhaupt zu sehen bekommt,
 * und alle drei hängen an Zustand außerhalb von React — Cookie und das
 * Attribut am `<html>`-Element.
 */

beforeEach(() => {
  clearCookies();
  document.documentElement.removeAttribute("data-theme");
  // Erst den Aufrufverlauf leeren, dann den Ersatz für fetch setzen — sonst
  // löscht das Leeren ihn gleich wieder.
  vi.clearAllMocks();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("LocaleSwitcher", () => {
  it("zeigt beide Sprachen und die aktuelle Auswahl", () => {
    renderWith(<LocaleSwitcher locale="de" />, { locale: "de" });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("de");
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Deutsch" })).toBeInTheDocument();
  });

  it("schreibt die Wahl ins Cookie und lädt die Seite neu", async () => {
    renderWith(<LocaleSwitcher locale="en" />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "de");

    expect(document.cookie).toContain("chainer_locale=de");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("merkt die Sprache zusätzlich am Konto", async () => {
    // Benachrichtigungen entstehen im Hintergrund und lesen die Sprache dort.
    renderWith(<LocaleSwitcher locale="en" />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "de");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/settings/keys",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ locale: "de" }) }),
    );
  });

  it("tut nichts, wenn dieselbe Sprache gewählt wird", async () => {
    renderWith(<LocaleSwitcher locale="en" />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "en");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("ThemeToggle", () => {
  it("schaltet der Reihe nach durch hell, dunkel und System", async () => {
    renderWith(<ThemeToggle theme="light" />);
    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleName(/Light/);

    await userEvent.click(button);
    expect(button).toHaveAccessibleName(/Dark/);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.cookie).toContain("chainer_theme=dark");

    await userEvent.click(button);
    expect(button).toHaveAccessibleName(/System/);
    expect(document.cookie).toContain("chainer_theme=system");

    await userEvent.click(button);
    expect(button).toHaveAccessibleName(/Light/);
  });

  it("löst „System“ auf einen echten Modus auf", async () => {
    // Ohne Vorliebe des Betriebssystems gilt dunkel.
    renderWith(<ThemeToggle theme="system" />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("beschriftet sich auf Deutsch", () => {
    renderWith(<ThemeToggle theme="dark" />, { locale: "de" });
    expect(screen.getByRole("button")).toHaveAccessibleName(/Farbschema: Dunkel/);
  });
});

describe("LabelBadges", () => {
  const labels: AddressLabel[] = [
    { source: "ofac", label: "OFAC-sanktioniert", category: "sanctioned", risk: "high", details: "Adresse steht auf der SDN-Liste des US-Finanzministeriums" },
    { source: "walletexplorer", label: "Binance", category: "exchange" },
  ];

  it("übersetzt die Texte der Meldequellen", () => {
    renderWith(<LabelBadges labels={labels} />);
    expect(screen.getByText(/OFAC-sanctioned/)).toBeInTheDocument();
  });

  it("lässt sie auf Deutsch stehen", () => {
    renderWith(<LabelBadges labels={labels} />, { locale: "de" });
    expect(screen.getByText(/OFAC-sanktioniert/)).toBeInTheDocument();
  });

  it("reicht Namen fremder Dienste unverändert durch", () => {
    // „Binance“ ist ein Eigenname und darf nicht übersetzt werden.
    renderWith(<LabelBadges labels={labels} />);
    expect(screen.getByText(/Binance/)).toBeInTheDocument();
  });

  it("sagt Bescheid, wenn es nichts gibt", () => {
    renderWith(<LabelBadges labels={[]} />);
    expect(screen.getByText("no labels known")).toBeInTheDocument();
  });

  it("bleibt in der knappen Darstellung still", () => {
    const { container } = renderWith(<LabelBadges labels={[]} compact />);
    expect(container).toBeEmptyDOMElement();
  });
});
