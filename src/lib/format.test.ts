import { describe, expect, it } from "vitest";
import {
  classifyInput,
  formatAmount,
  formatBtc,
  formatDate,
  formatDateShort,
  formatFiat,
  formatPercent,
  isBtcAddress,
  isTxid,
  shortHash,
  toUnits,
} from "@/lib/format";

const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
const BTC_ADDRESS = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";

/**
 * Zahl in derselben Locale formatieren wie das Modul, damit Trennzeichen nicht
 * stören. Ohne ausdrückliche Sprache formatiert das Modul in der
 * Standardsprache Englisch (`en-GB`).
 */
function num(value: number, maximumFractionDigits: number, locale = "en-GB"): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits });
}

describe("formatAmount", () => {
  it("rechnet Satoshi in BTC um", () => {
    expect(formatAmount(100_000_000)).toBe("1 BTC");
    expect(formatBtc(100_000_000)).toBe("1 BTC");
    expect(formatAmount(150_000_000)).toBe(`${num(1.5, 8)} BTC`);
  });

  it("nutzt bei Ethereum 18 Nachkommastellen", () => {
    expect(formatAmount(1e18, "ethereum", 18)).toBe("1 ETH");
    expect(formatAmount(5e17, "ethereum", 18)).toBe(`${num(0.5, 18)} ETH`);
  });

  it("rundet sehr kleine Beträge nicht auf null", () => {
    const out = formatAmount(1, "bitcoin", 2);
    expect(out).not.toBe("0 BTC");
    expect(out).toContain(num(1e-8, 8));
  });

  it("liefert für undefined, null und NaN einen Gedankenstrich", () => {
    expect(formatAmount(undefined)).toBe("–");
    expect(formatAmount(Number.NaN)).toBe("–");
  });

  it("begrenzt die Nachkommastellen auf den übergebenen Wert", () => {
    expect(formatAmount(123_456_789, "bitcoin", 2)).toBe(`${num(1.23, 2)} BTC`);
  });
});

describe("toUnits", () => {
  it("rechnet in die Basiseinheit der Chain um", () => {
    expect(toUnits(100_000_000)).toBe(1);
    expect(toUnits(1e18, "ethereum")).toBe(1);
    expect(toUnits(undefined)).toBe(0);
  });
});

describe("formatFiat", () => {
  it("multipliziert den Betrag mit dem Kurs", () => {
    const erwartet = (50_000).toLocaleString("en-GB", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    });
    expect(formatFiat(100_000_000, 50_000)).toBe(erwartet);
  });

  it("liefert ohne Kurs oder Betrag einen leeren Text", () => {
    expect(formatFiat(undefined, 50_000)).toBe("");
    expect(formatFiat(100_000_000, undefined)).toBe("");
    expect(formatFiat(100_000_000, 0)).toBe("");
  });
});

describe("formatPercent", () => {
  it("stellt Anteile als Prozentwert dar", () => {
    expect(formatPercent(0.25)).toBe(`${num(25, 1)} %`);
    expect(formatPercent(0.1234, 2)).toBe(`${num(12.34, 2)} %`);
  });
});

describe("shortHash", () => {
  it("kürzt nur ausreichend lange Zeichenketten", () => {
    const kurz = shortHash(TXID);
    expect(kurz).toContain("…");
    expect(kurz.startsWith(TXID.slice(0, 8))).toBe(true);
    expect(kurz.endsWith(TXID.slice(-8))).toBe(true);
    expect(shortHash("abc")).toBe("abc");
    expect(shortHash("")).toBe("");
    // Genau 2n+1 Zeichen bleiben unverändert
    expect(shortHash("a".repeat(17))).toBe("a".repeat(17));
  });
});

describe("formatDate / formatDateShort", () => {
  it("weist fehlende Zeitstempel als unbestätigt aus", () => {
    expect(formatDate(undefined)).toBe("unconfirmed");
    expect(formatDate(0)).toBe("unconfirmed");
    expect(formatDateShort(undefined)).toBe("unconf.");
    expect(formatDate(undefined, "de")).toBe("unbestätigt");
    expect(formatDateShort(undefined, "de")).toBe("unbest.");
  });

  it("formatiert einen Zeitstempel in der Locale der gewählten Sprache", () => {
    const unix = Date.UTC(2024, 0, 1, 12, 0, 0) / 1000;
    expect(formatDate(unix)).toBe(new Date(unix * 1000).toLocaleString("en-GB"));
    expect(formatDate(unix, "de")).toBe(new Date(unix * 1000).toLocaleString("de-DE"));
    expect(formatDateShort(unix)).toBe(
      new Date(unix * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }),
    );
  });
});

describe("isTxid / isBtcAddress / classifyInput", () => {
  it("erkennt Transaktions-IDs und Bitcoin-Adressen", () => {
    expect(isTxid(TXID)).toBe(true);
    expect(isTxid(` ${TXID} `)).toBe(true);
    expect(isTxid(TXID.slice(0, 63))).toBe(false);
    expect(isBtcAddress(BTC_ADDRESS)).toBe(true);
    expect(isBtcAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(true);
    expect(isBtcAddress("0xbe0eb53f46cd790cd13851d5eff43d12404d33e8")).toBe(false);
  });

  it("ordnet Eingaben zu", () => {
    expect(classifyInput(TXID)).toBe("txid");
    expect(classifyInput(BTC_ADDRESS)).toBe("address");
    expect(classifyInput("hallo")).toBe("unknown");
  });
});

describe("makeFormatters", () => {
  it("bindet die Sprache an alle Formatierer", async () => {
    const { makeFormatters } = await import("@/lib/format");
    const en = makeFormatters("en");
    const de = makeFormatters("de");
    expect(en.amount(150_000_000)).toBe(`${num(1.5, 8)} BTC`);
    expect(de.amount(150_000_000)).toBe(`${num(1.5, 8, "de-DE")} BTC`);
    expect(en.percent(0.25)).toBe(`${num(25, 1)} %`);
    expect(de.percent(0.25)).toBe(`${num(25, 1, "de-DE")} %`);
    expect(en.date(undefined)).toBe("unconfirmed");
    expect(de.date(undefined)).toBe("unbestätigt");
    expect(de.intlLocale).toBe("de-DE");
  });

  it("gibt für fehlende Zeitstempel den Ersatztext zurück", async () => {
    const { makeFormatters } = await import("@/lib/format");
    const f = makeFormatters("en");
    expect(f.timestamp(undefined)).toBe("–");
    expect(f.timestamp("kein Datum")).toBe("–");
    expect(f.timestamp("2024-01-01T12:00:00.000Z")).toBe(
      new Date("2024-01-01T12:00:00.000Z").toLocaleString("en-GB"),
    );
  });
});
