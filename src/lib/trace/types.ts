import type { AddressLabel } from "../providers/types";
import type { ChainId } from "../chains";
import type { FingerprintGroup } from "./fingerprint";
import type { EvidenceLog } from "../evidence";

export type TraceDirection = "forward" | "backward" | "both";

/** Verfolgungsmodus: alle Transaktionen einer Adresse oder nur die konkreten Coins */
export type TraceMode = "address" | "utxo";

/** Modell zur Verteilung der „Verunreinigung“ über Transaktionen hinweg */
export type TaintModel = "none" | "haircut" | "poison" | "fifo";

export interface TraceParams {
  /** Adresse oder Transaktions-ID */
  start: string;
  /**
   * Weitere Startpunkte. Sinnvoll, wenn mehrere Geschädigte gemeinsam verfolgt
   * werden sollen: Der Graph zeigt dann, wo die Wege zusammenlaufen.
   */
  starts?: string[];
  chain: ChainId;
  mode: TraceMode;
  direction: TraceDirection;
  taintModel: TaintModel;
  /** Maximale Tiefe (Anzahl Transaktions-Hops) */
  maxDepth: number;
  /** Max. Transaktionen, die pro Adresse verfolgt werden */
  maxTxPerAddress: number;
  /** Max. Adressen, die pro Transaktion weiterverfolgt werden */
  maxAddrPerTx: number;
  /** Ausgänge unterhalb dieses Betrags (kleinste Einheit) ignorieren */
  minValueSat: number;
  /** Harte Obergrenze für die Anzahl Knoten */
  maxNodes: number;
  /** Labels/Risiko-Quellen abfragen */
  enrich: boolean;
  /** Historische Kurse zum Transaktionszeitpunkt laden */
  historicPrices?: boolean;
  /** Lightning-Kanäle erkennen */
  lightning?: boolean;
  /** Auch Adressen mit mittlerem Risiko als schädliche Quelle werten */
  includeMediumRisk?: boolean;
  /** Manuell zusammengeführte Adressen (Cluster-Korrektur durch den Ermittler) */
  merges?: string[][];
}

export interface AddressNodeData {
  type: "address";
  address: string;
  chain: ChainId;
  depth: number;
  clusterId?: number;
  labels: AddressLabel[];
  risk: "none" | "low" | "medium" | "high";
  receivedSat: number;
  sentSat: number;
  /** Anteil, der aus der Startquelle stammt (kleinste Einheit) */
  taintSat?: number;
  /** Anteil am Empfangenen, der aus der Startquelle stammt (0..1) */
  taintRatio?: number;
  /** Adresse ist selbst als schädlich eingestuft */
  isRiskSource?: boolean;
  /** Zufluss, der von schädlichen Adressen stammt (kleinste Einheit) */
  riskFromSat?: number;
  /** Anteil am Empfangenen, der von schädlichen Adressen stammt (0..1) */
  riskFromRatio?: number;
  /** Adressen, aus denen dieser belastete Zufluss stammt */
  riskSources?: string[];
  /** Betrag, der an schädliche Adressen abgeflossen ist */
  sentToRiskSat?: number;
  isStart?: boolean;
  /** Adresse wurde nicht weiter verfolgt (Tiefe/Limit erreicht) */
  truncated?: boolean;
  /** Verhaltensbasierte Einschätzung (Börse, Sammeladresse …) */
  behavior?: string[];
  /** Vermutliche Einzahlungsadresse eines Dienstes */
  deposit?: {
    forwardsTo: string;
    ratio: number;
    forwardCount: number;
    reason: string;
    /** Dienst hinter der Sammeladresse, falls bekannt */
    service?: string;
  };
  /** Adresse gehört zu einem Tausch- oder Brückendienst */
  swapService?: { name: string; kind: "swap" | "bridge"; source: string };
}

export interface TxNodeData {
  type: "tx";
  txid: string;
  chain: ChainId;
  depth: number;
  blockTime?: number;
  blockHeight?: number;
  feeSat?: number;
  inputCount: number;
  outputCount: number;
  totalInSat: number;
  totalOutSat: number;
  /** Heuristik-Hinweise (z. B. Wechselgeld, Konsolidierung, CoinJoin) */
  hints: string[];
  /** Kurs zum Zeitpunkt der Transaktion (EUR je Einheit) */
  priceEur?: number;
  /** Position in einer erkannten Peeling-Kette */
  peelingIndex?: number;
  /** Transaktion bewegt Geld, das von schädlichen Adressen stammt */
  carriesRisk?: boolean;
  /** Kurzform des Wallet-Fingerabdrucks */
  fingerprint?: string;
  /** Transaktion führt Geld an einen Tausch- oder Brückendienst */
  crossChain?: { service: string; kind: "swap" | "bridge"; address: string };
  isStart?: boolean;
  failed?: boolean;
}

export interface TraceNode {
  id: string;
  data: AddressNodeData | TxNodeData;
}

export interface TraceEdge {
  id: string;
  source: string;
  target: string;
  valueSat: number;
  /** Anteil dieses Flusses, der aus der Startquelle stammt */
  taintSat?: number;
  /** Anteil dieses Flusses, der von schädlichen Adressen stammt */
  riskSat?: number;
  /** Kante führt direkt auf eine schädliche Adresse */
  toRisk?: boolean;
  /** Wechselgeld-Verdacht (Output geht vermutlich zurück an den Sender) */
  change?: boolean;
  coinbase?: boolean;
  /** Token-Transfer (EVM) statt nativer Währung */
  token?: string;
}

export interface TraceCluster {
  id: number;
  addresses: string[];
  label?: string;
  /** Cluster wurde manuell zusammengeführt */
  manual?: boolean;
  totalReceivedSat: number;
  behavior?: string[];
}

/** Aktivitätsmuster: 7 Wochentage × 24 Stunden (UTC) */
export interface ActivityPattern {
  /** [wochentag][stunde] = Anzahl Transaktionen */
  matrix: number[][];
  total: number;
  /** Geschätzte Zeitzone anhand der inaktiven Nachtstunden */
  guessedUtcOffset?: number;
  guessedRegion?: string;
  firstSeen?: number;
  lastSeen?: number;
}

export interface PeelingChain {
  txids: string[];
  /** abgezweigte Beträge je Schritt */
  peeledSat: number[];
  totalPeeledSat: number;
  remainingSat: number;
}

/** Eine im Graph gefundene schädliche Adresse */
export interface RiskSource {
  address: string;
  label: string;
  category?: string;
  source: string;
  severity: "high" | "medium";
  /** Betrag, den diese Adresse im Graph weitergegeben hat */
  outflowSat: number;
  /** Anzahl der nachgelagerten Adressen, die davon Geld erhalten haben */
  affectedAddresses: number;
}

export interface TraceStats {
  addresses: number;
  txs: number;
  apiCalls: number;
  durationMs: number;
  truncated: boolean;
  /** Gesamtwert, der aus der Startquelle stammt und den Graph verlässt */
  taintedOutSat?: number;
  /** Gesamtwert, der im Graph von schädlichen Adressen stammt */
  riskInflowSat?: number;
  /** Anzahl der Adressen mit belastetem Zufluss */
  riskAffected?: number;
}

export interface TraceResult {
  params: TraceParams;
  nodes: TraceNode[];
  edges: TraceEdge[];
  clusters: TraceCluster[];
  activity: ActivityPattern;
  peeling: PeelingChain[];
  /** Im Graph gefundene schädliche Adressen (Quellen der Herkunfts-Warnung) */
  riskSources: RiskSource[];
  /** Gruppen von Transaktionen mit gleichem Wallet-Fingerabdruck */
  fingerprints: FingerprintGroup[];
  /** Erkannte Einzahlungsadressen von Diensten */
  deposits: {
    address: string;
    forwardsTo: string;
    ratio: number;
    forwardCount: number;
    service?: string;
  }[];
  /** Übergänge auf andere Chains über Tausch- oder Brückendienste */
  crossChain: { txid: string; address: string; service: string; kind: "swap" | "bridge" }[];
  /** Nachweis der verwendeten Rohdaten */
  evidence?: EvidenceLog;
  stats: TraceStats;
  warnings: string[];
  providersUsed: Record<string, number>;
  /** Aktueller Kurs zum Zeitpunkt der Auswertung */
  priceEur?: number;
}

/** Zwischenstand beim Streaming-Trace */
export interface TraceProgress {
  phase: "traversal" | "taint" | "cluster" | "heuristics" | "enrich" | "done";
  message: string;
  nodes: number;
  edges: number;
  apiCalls: number;
  /** Nur bei phase "done": das vollständige Ergebnis */
  result?: TraceResult;
}

export const DEFAULT_PARAMS: Omit<TraceParams, "start"> = {
  chain: "bitcoin",
  mode: "address",
  direction: "forward",
  taintModel: "haircut",
  maxDepth: 3,
  maxTxPerAddress: 10,
  maxAddrPerTx: 8,
  minValueSat: 1000,
  maxNodes: 250,
  enrich: true,
  historicPrices: true,
  lightning: true,
  includeMediumRisk: false,
};
