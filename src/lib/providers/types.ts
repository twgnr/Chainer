import type { ChainId } from "../chains";

/**
 * Gemeinsame Typen für alle Chain-Datenquellen.
 * Alle Beträge in der kleinsten Einheit der jeweiligen Chain (Satoshi, Wei …).
 */

export interface AddressInfo {
  address: string;
  chain: ChainId;
  balanceSat: number;
  receivedSat: number;
  sentSat: number;
  txCount: number;
  provider: string;
  /** Nur EVM: Nonce = Anzahl gesendeter Transaktionen */
  nonce?: number;
}

export interface TxInput {
  txid?: string;
  vout?: number;
  address?: string;
  valueSat?: number;
  coinbase?: boolean;
}

export interface TxOutput {
  n: number;
  address?: string;
  valueSat: number;
  spent?: boolean;
  spentTxid?: string;
  scriptType?: string;
  /** Token-Transfer (EVM): Symbol des Tokens statt nativer Währung */
  token?: { symbol: string; contract: string; decimals: number; amount: string };
  /** Interner Transfer (EVM) */
  internal?: boolean;
}

export interface TxInfo {
  txid: string;
  chain: ChainId;
  blockHeight?: number;
  blockTime?: number; // unix seconds
  confirmed: boolean;
  feeSat?: number;
  size?: number;
  inputs: TxInput[];
  outputs: TxOutput[];
  provider: string;
  /** Nur EVM: fehlgeschlagene Transaktion */
  failed?: boolean;
  /**
   * Rohmerkmale für den Wallet-Fingerabdruck (nur UTXO-Chains).
   * Werden nur von Quellen gefüllt, die diese Felder liefern.
   */
  raw?: {
    version?: number;
    locktime?: number;
    rbf?: boolean;
    bip69In?: boolean;
    bip69Out?: boolean;
    sequence?: string;
  };
}

export interface ProviderContext {
  /** Nur Quellen nutzen, die das Ermittlungsziel nicht an Dritte verraten */
  privacyMode?: boolean;
  /** Provider-ID -> API-Key (Nutzer-Keys über Org-Keys über ENV-Fallbacks) */
  keys: Record<string, string | undefined>;
  /** Freie Konfiguration pro Provider (z. B. Node-URL, Electrum-Host) */
  config: Record<string, Record<string, string> | undefined>;
  chain: ChainId;
  /** Für eigene Labels/Notizen aus der Datenbank */
  userId?: string;
  orgId?: string;
}

export type KeyRequirement = "none" | "optional" | "required";

export interface ProviderMeta {
  id: string;
  name: string;
  url: string;
  keyRequirement: KeyRequirement;
  /** Beschreibung, wo man den Key bekommt */
  keyHint?: string;
  /** Kurzbeschreibung der Rate-Limits im Free-Tier */
  rateLimit?: string;
  /** Unterstützte Chains (leer = alle) */
  chains?: ChainId[];
  /** Zusätzliche Konfigurationsfelder (eigener Node, Electrum …) */
  configFields?: { key: string; label: string; placeholder?: string; secret?: boolean; required?: boolean }[];
  /**
   * True, wenn die Quelle die gesuchte Adresse an Dritte übermittelt. Quellen,
   * die nur vollständige Listen herunterladen, verraten das Ermittlungsziel
   * nicht und bleiben im Datenschutzmodus nutzbar.
   */
  leaksQuery?: boolean;
}

export interface ChainProvider extends ProviderMeta {
  getAddress(address: string, ctx: ProviderContext): Promise<AddressInfo>;
  /** Liefert die (neuesten) Transaktionen einer Adresse. */
  getAddressTxs(address: string, ctx: ProviderContext, limit?: number): Promise<TxInfo[]>;
  getTx(txid: string, ctx: ProviderContext): Promise<TxInfo>;
  /** Optional: liefert für jeden Output die ausgebende Transaktion (UTXO-Tracing) */
  getOutspends?(txid: string, ctx: ProviderContext): Promise<{ spent: boolean; txid?: string; vin?: number }[]>;
}

/** Alter Name, aus Kompatibilitätsgründen erhalten */
export type BitcoinProvider = ChainProvider;

export type LabelCategory =
  | "exchange"
  | "mixer"
  | "scam"
  | "sanctioned"
  | "ransomware"
  | "darknet"
  | "gambling"
  | "mining"
  | "service"
  | "swap"
  | "bridge"
  | "wallet"
  | "custom"
  | "other";

/** Ergebnisse von Label-/Risiko-Quellen */
export interface AddressLabel {
  source: string;
  label: string;
  category?: LabelCategory;
  url?: string;
  risk?: "low" | "medium" | "high";
  details?: string;
  /** Eigene Notiz des Nutzers/Teams */
  own?: boolean;
}

export interface IntelProvider extends ProviderMeta {
  lookup(address: string, ctx: ProviderContext): Promise<AddressLabel[]>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}

export class UnsupportedError extends ProviderError {
  constructor(provider: string, what: string) {
    super(provider, `nicht unterstützt: ${what}`);
  }
}
