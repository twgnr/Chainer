import { describe, expect, it } from "vitest";
import {
  CHAIN_LIST,
  chainMeta,
  classifyChainInput,
  guessChain,
  isChainAddress,
  isChainId,
  isChainTxid,
} from "@/lib/chains";

const BTC_LEGACY = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const BTC_P2SH = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy";
const BTC_BECH32 = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const BTC_TAPROOT = "bc1pmzfrwwndsqmk5yh69yjr5lfgfg4ev8c0tsc06e";
const LTC_LEGACY = "LhK2kQwiaAvhjWY799cZvMyYwnQAcxkarr";
const LTC_BECH32 = "ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9";
const DOGE = "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L";
const ETH = "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8";
const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";

describe("isChainAddress", () => {
  it("erkennt gültige Bitcoin-Adressen in allen Formaten", () => {
    for (const a of [BTC_LEGACY, BTC_P2SH, BTC_BECH32, BTC_TAPROOT]) {
      expect(isChainAddress(a, "bitcoin"), a).toBe(true);
    }
  });

  it("erkennt Litecoin-, Dogecoin- und Ethereum-Adressen", () => {
    expect(isChainAddress(LTC_LEGACY, "litecoin")).toBe(true);
    expect(isChainAddress(LTC_BECH32, "litecoin")).toBe(true);
    expect(isChainAddress(DOGE, "dogecoin")).toBe(true);
    expect(isChainAddress(ETH, "ethereum")).toBe(true);
  });

  it("lässt eine Ethereum-Adresse nicht als Bitcoin-Adresse durchgehen", () => {
    expect(isChainAddress(ETH, "bitcoin")).toBe(false);
    expect(isChainAddress(BTC_BECH32, "ethereum")).toBe(false);
  });

  it("weist ungültige Eingaben ab", () => {
    expect(isChainAddress("", "bitcoin")).toBe(false);
    expect(isChainAddress("1", "bitcoin")).toBe(false);
    // Die verbotenen Base58-Zeichen 0, O, I und l dürfen nicht vorkommen
    expect(isChainAddress("10OIl0OIl0OIl0OIl0OIl0OIl0OIl0", "bitcoin")).toBe(false);
    expect(isChainAddress("0xzz", "ethereum")).toBe(false);
    expect(isChainAddress(BTC_BECH32, "litecoin")).toBe(false);
  });

  it("ignoriert umschließende Leerzeichen", () => {
    expect(isChainAddress(`  ${BTC_LEGACY}  `, "bitcoin")).toBe(true);
  });
});

describe("isChainTxid", () => {
  it("akzeptiert 64-stelligen Hex als Transaktions-ID", () => {
    expect(isChainTxid(TXID, "bitcoin")).toBe(true);
    expect(isChainTxid(TXID.toUpperCase(), "bitcoin")).toBe(true);
    expect(isChainTxid(TXID, "litecoin")).toBe(true);
  });

  it("verlangt bei Ethereum das Präfix 0x", () => {
    expect(isChainTxid(TXID, "ethereum")).toBe(false);
    expect(isChainTxid(`0x${TXID}`, "ethereum")).toBe(true);
  });

  it("weist zu kurze oder nicht-hexadezimale Werte ab", () => {
    expect(isChainTxid(TXID.slice(0, 63), "bitcoin")).toBe(false);
    expect(isChainTxid("z".repeat(64), "bitcoin")).toBe(false);
  });
});

describe("classifyChainInput", () => {
  it("unterscheidet Adresse, Transaktions-ID und Unbekanntes", () => {
    expect(classifyChainInput(BTC_LEGACY, "bitcoin")).toBe("address");
    expect(classifyChainInput(TXID, "bitcoin")).toBe("txid");
    expect(classifyChainInput("hallo welt", "bitcoin")).toBe("unknown");
    expect(classifyChainInput(ETH, "ethereum")).toBe("address");
    expect(classifyChainInput(`0x${TXID}`, "ethereum")).toBe("txid");
  });
});

describe("guessChain", () => {
  it("rät die Chain anhand der typischen Präfixe", () => {
    expect(guessChain(ETH)).toBe("ethereum");
    expect(guessChain(`0x${TXID}`)).toBe("ethereum");
    expect(guessChain(BTC_BECH32)).toBe("bitcoin");
    expect(guessChain(BTC_TAPROOT)).toBe("bitcoin");
    expect(guessChain(BTC_LEGACY)).toBe("bitcoin");
    expect(guessChain(BTC_P2SH)).toBe("bitcoin");
    expect(guessChain(LTC_BECH32)).toBe("litecoin");
    expect(guessChain(LTC_LEGACY)).toBe("litecoin");
    expect(guessChain(DOGE)).toBe("dogecoin");
  });

  it("wertet 64-stelligen Hex ohne Präfix als Bitcoin-Transaktion", () => {
    expect(guessChain(TXID)).toBe("bitcoin");
  });

  it("liefert null bei unbekanntem Format", () => {
    expect(guessChain("kein gültiger Wert")).toBeNull();
    expect(guessChain("")).toBeNull();
  });
});

describe("chainMeta / isChainId / CHAIN_LIST", () => {
  it("liefert die Metadaten der Chain und fällt auf Bitcoin zurück", () => {
    expect(chainMeta("ethereum").decimals).toBe(18);
    expect(chainMeta("ethereum").symbol).toBe("ETH");
    expect(chainMeta("bitcoin").decimals).toBe(8);
    expect(chainMeta(undefined).id).toBe("bitcoin");
  });

  it("prüft Chain-Kennungen", () => {
    expect(isChainId("bitcoin")).toBe(true);
    expect(isChainId("bitcoin-cash")).toBe(true);
    expect(isChainId("solana")).toBe(false);
    expect(isChainId(42)).toBe(false);
    expect(isChainId(undefined)).toBe(false);
  });

  it("führt jede Chain genau einmal in CHAIN_LIST", () => {
    const ids = CHAIN_LIST.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("bitcoin");
    expect(ids).toContain("ethereum");
  });
});
