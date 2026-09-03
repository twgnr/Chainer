/**
 * Unterstützte Chains. UTXO-Chains und Account-Chains (EVM) nutzen dieselbe
 * Provider- und Graph-Abstraktion; Beträge werden immer in der kleinsten Einheit
 * geführt (Satoshi, Litoshi, Wei …).
 */
export type ChainId =
  | "bitcoin"
  | "litecoin"
  | "dogecoin"
  | "bitcoin-cash"
  | "ethereum"
  | "polygon"
  | "arbitrum"
  | "tron";

export type ChainKind = "utxo" | "account";

export interface ChainMeta {
  id: ChainId;
  name: string;
  symbol: string;
  kind: ChainKind;
  /** Nachkommastellen der Basiseinheit (BTC 8, ETH 18) */
  decimals: number;
  /** Name der kleinsten Einheit */
  unit: string;
  coingeckoId: string;
  explorer: string;
  /** Pfad in der Blockchair-API */
  blockchairPath?: string;
  /** Pfad in der BlockCypher-API (v1/<path>/main) */
  blockcypherPath?: string;
  /** Esplora-kompatible API */
  esplora?: { id: string; name: string; url: string; baseUrl: string };
  /**
   * EVM-Kette. `chainId` ist die Kennung der Etherscan-V2-Schnittstelle, die
   * alle Ketten über denselben Endpunkt bedient. `blockscoutBase` fehlt, wenn
   * es für die Kette keine öffentliche Blockscout-Instanz gibt — dann bleibt
   * nur Etherscan, und der Key wird zur Pflicht.
   */
  evm?: { chainId: number; blockscoutBase?: string };
}



export const CHAINS: Record<ChainId, ChainMeta> = {
  bitcoin: {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    kind: "utxo",
    decimals: 8,
    unit: "sat",
    coingeckoId: "bitcoin",
    explorer: "https://mempool.space",
    blockchairPath: "bitcoin",
    blockcypherPath: "btc",
    esplora: { id: "mempool", name: "mempool.space", url: "https://mempool.space", baseUrl: "https://mempool.space/api" },
  },
  litecoin: {
    id: "litecoin",
    name: "Litecoin",
    symbol: "LTC",
    kind: "utxo",
    decimals: 8,
    unit: "litoshi",
    coingeckoId: "litecoin",
    explorer: "https://litecoinspace.org",
    blockchairPath: "litecoin",
    blockcypherPath: "ltc",
    esplora: {
      id: "litecoinspace",
      name: "litecoinspace.org",
      url: "https://litecoinspace.org",
      baseUrl: "https://litecoinspace.org/api",
    },
  },
  dogecoin: {
    id: "dogecoin",
    name: "Dogecoin",
    symbol: "DOGE",
    kind: "utxo",
    decimals: 8,
    unit: "koinu",
    coingeckoId: "dogecoin",
    explorer: "https://blockchair.com/dogecoin",
    blockchairPath: "dogecoin",
    blockcypherPath: "doge",
  },
  "bitcoin-cash": {
    id: "bitcoin-cash",
    name: "Bitcoin Cash",
    symbol: "BCH",
    kind: "utxo",
    decimals: 8,
    unit: "sat",
    coingeckoId: "bitcoin-cash",
    explorer: "https://blockchair.com/bitcoin-cash",
    blockchairPath: "bitcoin-cash",
  },
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    kind: "account",
    decimals: 18,
    unit: "wei",
    coingeckoId: "ethereum",
    explorer: "https://etherscan.io",
    evm: { chainId: 1, blockscoutBase: "https://eth.blockscout.com/api/v2" },
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    symbol: "POL",
    kind: "account",
    decimals: 18,
    unit: "wei",
    coingeckoId: "matic-network",
    explorer: "https://polygonscan.com",
    evm: { chainId: 137, blockscoutBase: "https://polygon.blockscout.com/api/v2" },
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum One",
    symbol: "ETH",
    kind: "account",
    decimals: 18,
    unit: "wei",
    coingeckoId: "ethereum",
    explorer: "https://arbiscan.io",
    evm: { chainId: 42161, blockscoutBase: "https://arbitrum.blockscout.com/api/v2" },
  },
  tron: {
    id: "tron",
    name: "Tron",
    symbol: "TRX",
    kind: "account",
    decimals: 6,
    unit: "sun",
    coingeckoId: "tron",
    explorer: "https://tronscan.org/#",
  },
};

export const DEFAULT_CHAIN: ChainId = "bitcoin";

export const CHAIN_LIST = Object.values(CHAINS);

/**
 * Alle EVM-kompatiblen Ketten. Sie teilen sich Adressformat, Datenquellen und
 * Abbildung auf das Graph-Modell; abgeleitet aus den Definitionen oben, damit
 * eine neue Kette nur an einer Stelle eingetragen werden muss.
 */
export const EVM_CHAINS: ChainId[] = CHAIN_LIST.filter((c) => c.evm).map((c) => c.id);

/** EVM-Ketten mit öffentlicher Blockscout-Instanz, also ohne Key nutzbar. */
export const BLOCKSCOUT_CHAINS: ChainId[] = CHAIN_LIST.filter((c) => c.evm?.blockscoutBase).map((c) => c.id);

export function isEvmChain(chain: ChainId): boolean {
  return !!CHAINS[chain]?.evm;
}

export function chainMeta(chain: ChainId | undefined): ChainMeta {
  return CHAINS[chain || DEFAULT_CHAIN] || CHAINS[DEFAULT_CHAIN];
}

export function isChainId(v: unknown): v is ChainId {
  return typeof v === "string" && v in CHAINS;
}

/* ---------------- Adress- und Hash-Erkennung pro Chain ---------------- */

/**
 * Zeichenvorrat des Datenteils einer Bech32-Adresse. „1“, „b“, „i“ und „o“
 * fehlen darin absichtlich, weil sie zu leicht zu verwechseln sind. Ein
 * weiter gefasstes Muster liesse offensichtlich falsche Adressen durch und
 * schickte sie an sämtliche Datenquellen, statt sie sofort abzuweisen.
 */
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const bech32Re = (hrp: string) =>
  new RegExp(`^(?:${hrp}1[${BECH32}]{25,87}|${hrp.toUpperCase()}1[${BECH32.toUpperCase()}]{25,87})$`);

const RE = {
  btcLegacy: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  btcBech32: bech32Re("bc"),
  ltcLegacy: /^[LM3][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  ltcBech32: bech32Re("ltc"),
  doge: /^[DA9][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  bchCash: /^(bitcoincash:)?[qp][a-z0-9]{38,60}$/,
  bchLegacy: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  evm: /^0x[0-9a-fA-F]{40}$/,
  hash64: /^[0-9a-fA-F]{64}$/,
  evmTx: /^0x[0-9a-fA-F]{64}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
};

export function isChainAddress(value: string, chain: ChainId): boolean {
  const v = value.trim();
  switch (chain) {
    case "bitcoin":
      return RE.btcLegacy.test(v) || RE.btcBech32.test(v);
    case "litecoin":
      return RE.ltcLegacy.test(v) || RE.ltcBech32.test(v);
    case "dogecoin":
      return RE.doge.test(v);
    case "bitcoin-cash":
      return RE.bchCash.test(v) || RE.bchLegacy.test(v);
    case "ethereum":
    case "polygon":
    case "arbitrum":
      return RE.evm.test(v);
    case "tron":
      return RE.tron.test(v);
  }
}

export function isChainTxid(value: string, chain: ChainId): boolean {
  const v = value.trim();
  return isEvmChain(chain) ? RE.evmTx.test(v) : RE.hash64.test(v);
}

export function classifyChainInput(value: string, chain: ChainId): "address" | "txid" | "unknown" {
  if (isChainTxid(value, chain)) return "txid";
  if (isChainAddress(value, chain)) return "address";
  return "unknown";
}

/** Rät die Chain anhand des Formats (für die globale Suche). */
export function guessChain(value: string): ChainId | null {
  const v = value.trim();
  if (RE.evm.test(v) || RE.evmTx.test(v)) return "ethereum";
  if (RE.tron.test(v)) return "tron";
  if (RE.btcBech32.test(v)) return "bitcoin";
  if (RE.ltcBech32.test(v)) return "litecoin";
  if (RE.bchCash.test(v) && v.startsWith("bitcoincash:")) return "bitcoin-cash";
  if (RE.doge.test(v) && /^[DA9]/.test(v)) return "dogecoin";
  if (RE.ltcLegacy.test(v) && /^[LM]/.test(v)) return "litecoin";
  if (RE.btcLegacy.test(v)) return "bitcoin";
  if (RE.hash64.test(v)) return "bitcoin";
  return null;
}
