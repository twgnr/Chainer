import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWith, router } from "./helpers";
import SearchBox from "@/components/SearchBox";

/**
 * Die Suche ist der Einstieg in die Anwendung. Geprüft werden die Erkennung
 * des Eingabeformats, die Weiterleitung und die Sprache.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

const BTC = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const BECH32 = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";

async function searchFor(value: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), value);
  await user.click(screen.getByRole("button", { name: /search|suchen/i }));
}

describe("SearchBox", () => {
  it("leitet eine Adresse auf die Adressseite", async () => {
    renderWith(<SearchBox />);
    await searchFor(BTC);
    expect(router.push).toHaveBeenCalledWith(`/address/${BTC}?chain=bitcoin`);
  });

  it("erkennt eine Bech32-Adresse", async () => {
    renderWith(<SearchBox />);
    await searchFor(BECH32);
    expect(router.push).toHaveBeenCalledWith(`/address/${BECH32}?chain=bitcoin`);
  });

  it("leitet eine Transaktions-ID auf die Transaktionsseite", async () => {
    renderWith(<SearchBox />);
    await searchFor(TXID);
    expect(router.push).toHaveBeenCalledWith(`/tx/${TXID}?chain=bitcoin`);
  });

  it("weist eine Bech32-Adresse mit verbotenen Zeichen ab", async () => {
    // „i“ und „o“ gehören nicht zum Zeichenvorrat; früher lief so eine Eingabe
    // ungeprüft an sämtliche Datenquellen.
    renderWith(<SearchBox />);
    await searchFor("bc1q9x7v3p3k5q6a8z2m4x9p0w7e8r5t6y7u8i9o0p");

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText(/not recognised|nicht erkannt/i)).toBeInTheDocument();
  });

  it("meldet unbrauchbare Eingaben, statt sie weiterzureichen", async () => {
    renderWith(<SearchBox />);
    await searchFor("kein sinnvoller wert");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText(/not recognised/i)).toBeInTheDocument();
  });

  it("beschriftet sich auf Deutsch", async () => {
    renderWith(<SearchBox />, { locale: "de" });
    expect(screen.getByPlaceholderText("Adresse oder Transaktions-ID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suchen" })).toBeInTheDocument();

    await searchFor("unsinn");
    expect(screen.getByText(/Format nicht erkannt/)).toBeInTheDocument();
  });

  it("beschriftet sich auf Englisch", () => {
    renderWith(<SearchBox />, { locale: "en" });
    expect(screen.getByPlaceholderText("Address or transaction ID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });
});
