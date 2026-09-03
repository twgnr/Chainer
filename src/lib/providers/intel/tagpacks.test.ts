import { describe, expect, it } from "vitest";
import { parseGeneric, parseTagPackYaml } from "@/lib/providers/intel/tagpacks";

const YAML_BINANCE = `title: Binance reserve wallets
category: exchange
tags:
- address: '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo'
  currency: BTC
  label: binance reserve wallets BTC
- address: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8'
  currency: ETH
  label: binance reserve wallets ETH
`;

describe("parseTagPackYaml", () => {
  it("liest das GraphSense-Format und trennt die Einträge nach Chain", () => {
    const out = parseTagPackYaml(YAML_BINANCE, "fallback");
    expect(Object.keys(out)).toHaveLength(2);

    const btc = out["bitcoin|34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo"];
    expect(btc).toEqual({
      label: "binance reserve wallets BTC",
      category: "exchange",
      source: "Binance reserve wallets",
    });

    // Ethereum-Adressen werden kleingeschrieben abgelegt
    const eth = out["ethereum|0xbe0eb53f46cd790cd13851d5eff43d12404d33e8"];
    expect(eth?.label).toBe("binance reserve wallets ETH");
    expect(eth?.category).toBe("exchange");
  });

  it("übernimmt eine oben gesetzte abuse-Angabe als Standardkategorie", () => {
    const yaml = `title: Ransomware-Liste
abuse: ransomware
tags:
- address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
  currency: BTC
  label: Erpresser-Wallet
`;
    const out = parseTagPackYaml(yaml, "fallback");
    expect(out["bitcoin|1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"]).toEqual({
      label: "Erpresser-Wallet",
      category: "ransomware",
      source: "Ransomware-Liste",
    });
  });

  it("nimmt ohne currency Bitcoin an und fällt beim Label auf den Titel zurück", () => {
    const yaml = `title: Ohne Angaben
tags:
- address: 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2
`;
    expect(parseTagPackYaml(yaml, "fallback")["bitcoin|1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"]).toEqual({
      label: "Ohne Angaben",
      category: undefined,
      source: "Ohne Angaben",
    });
  });

  it("überspringt Kommentare, Leerzeilen und nicht unterstützte Währungen", () => {
    const yaml = `# Kommentar
title: Test

tags:
- address: 'SoLaNaAdresse'
  currency: SOL
  label: nicht unterstützt
`;
    expect(parseTagPackYaml(yaml, "fallback")).toEqual({});
  });
});

describe("parseGeneric", () => {
  it("liest CSV mit Kopfzeile", () => {
    const csv = `address,label,category
1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2,Betrugsadresse,scam
3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy,Börse,exchange
`;
    const out = parseGeneric(csv, "CSV-Liste");
    expect(Object.keys(out)).toHaveLength(2);
    expect(out["bitcoin|1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"]).toEqual({
      label: "Betrugsadresse",
      category: "scam",
      source: "CSV-Liste",
    });
    expect(out["bitcoin|3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"]?.category).toBe("exchange");
  });

  it("liest ein JSON-Array", () => {
    const json = JSON.stringify([
      { address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", label: "Mixer-Eingang", category: "mixing_service" },
      { address: "0xBE0EB53F46CD790CD13851D5EFF43D12404D33E8", name: "Börse", currency: "ETH" },
    ]);
    const out = parseGeneric(json, "JSON-Liste");
    expect(out["bitcoin|1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"]?.category).toBe("mixer");
    expect(out["ethereum|0xbe0eb53f46cd790cd13851d5eff43d12404d33e8"]?.label).toBe("Börse");
  });

  it("liest ein JSON-Objekt mit Adresse als Schlüssel", () => {
    const out = parseGeneric(JSON.stringify({ "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2": "Notiz" }), "JSON-Objekt");
    expect(out["bitcoin|1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"]?.label).toBe("Notiz");
  });

  it("liefert bei ungültigem JSON ein leeres Ergebnis", () => {
    expect(parseGeneric("[kein json", "Kaputt")).toEqual({});
  });
});
