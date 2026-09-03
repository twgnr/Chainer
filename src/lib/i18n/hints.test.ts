import { describe, expect, it } from "vitest";
import { translateHint, translateHints } from "@/lib/i18n/hints";
import { translateMessage } from "@/lib/i18n/messages";

describe("translateHint", () => {
  it("lässt deutsche Anzeige unverändert", () => {
    const de = "Coinbase-Transaktion (Mining-Belohnung)";
    expect(translateHint(de, "de")).toBe(de);
  });

  it("übersetzt feste Hinweise", () => {
    expect(translateHint("Coinbase-Transaktion (Mining-Belohnung)", "en")).toBe(
      "Coinbase transaction (mining reward)",
    );
    expect(translateHint("Nur Eingänge (Sparadresse / Cold Wallet)", "en")).toBe(
      "Deposits only (savings address / cold wallet)",
    );
  });

  it("übersetzt Hinweise mit eingesetzten Werten", () => {
    expect(translateHint("Möglicher CoinJoin (5 gleich große Outputs)", "en")).toBe(
      "Possible CoinJoin (5 equally sized outputs)",
    );
    expect(translateHint("Beginn einer Peeling-Kette über 4 Schritte", "en")).toBe(
      "Start of a peeling chain over 4 steps",
    );
    expect(translateHint("Knotenlimit (600) erreicht – Graph unvollständig.", "en")).toBe(
      "Node limit (600) reached – the graph is incomplete.",
    );
  });

  it("übersetzt auch den eingebetteten Grund einer Wechselgeld-Erkennung", () => {
    expect(translateHint("Output #1 vermutlich Wechselgeld (Adresse wird wiederverwendet)", "en")).toBe(
      "Output #1 is probably change (the address is reused)",
    );
  });

  it("reicht unbekannte Texte unverändert durch", () => {
    expect(translateHint("Etwas ganz Neues", "en")).toBe("Etwas ganz Neues");
    expect(translateHint("", "en")).toBe("");
  });

  it("übersetzt Listen", () => {
    expect(translateHints(["Abgebrochen.", "Taint-Analyse"], "en")).toEqual(["Cancelled.", "Taint analysis"]);
    expect(translateHints(undefined, "en")).toEqual([]);
  });
});

describe("translateMessage", () => {
  it("übersetzt Fehlermeldungen der API", () => {
    expect(translateMessage("Nicht eingeloggt", "en")).toBe("Not signed in");
    expect(translateMessage("Nicht eingeloggt", "de")).toBe("Nicht eingeloggt");
    expect(translateMessage("Keine gültige bitcoin-Adresse", "en")).toBe("Not a valid bitcoin address");
    expect(translateMessage("Ungültige Eingabe: foo", "en")).toBe("Invalid input: foo");
    expect(translateMessage("„abc“ ist keine gültige bitcoin-Adresse", "en")).toBe(
      "“abc” is not a valid bitcoin address",
    );
  });

  it("reicht unbekannte Meldungen unverändert durch", () => {
    expect(translateMessage("Irgendetwas anderes", "en")).toBe("Irgendetwas anderes");
  });
});
