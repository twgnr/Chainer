/**
 * Gemeinsame Hilfen für die Integrationstests der API-Routen.
 *
 * Enthält zwei Dinge:
 *  1. kleine Bauer für `Request`-Objekte und Routen-Parameter,
 *  2. Ersatzmodule (Mocks) für alles, was sonst ins Netz oder in die Datenbank
 *     ginge. Alle Ersatzmodule lesen ihre Antworten aus einem gemeinsamen
 *     Zustandsobjekt (`MockState`), das jeder Test frei setzen kann.
 */
import type { RequestContext, Session, UserSettings } from "@/lib/auth";
import type { CaseRefreshResult } from "@/lib/caseRefresh";
import type { ChainId } from "@/lib/chains";
import type { LabelResult, ProviderAttempt, ProviderStatus } from "@/lib/providers/registry";
import type { AddressInfo, ProviderContext, TxInfo } from "@/lib/providers/types";
import type { LightningChannel } from "@/lib/providers/lightning";
import type { PriceInfo, PriceSeries } from "@/lib/providers/price";
import type { InflowRisk } from "@/lib/trace/inflow";
import type { PathParams, PathResult } from "@/lib/trace/path";
import type { TraceResult } from "@/lib/trace/types";
import type { WatchCheckResult } from "@/lib/watch";

/* ---------------- Feste Testdaten ---------------- */

/** Gültige Bitcoin-Adresse (Genesis-Block) */
export const BTC_ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
/** Zweite gültige Bitcoin-Adresse (bech32) */
export const BTC_ADDRESS_2 = "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97";
/** Gültige Transaktions-ID (64 Hexzeichen) */
export const BTC_TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";

/* ---------------- Bauer für Anfragen ---------------- */

let ipZaehler = 0;

/**
 * Liefert bei jedem Aufruf eine neue Absenderadresse. Das Rate-Limit merkt sich
 * den Absender über `x-forwarded-for`; mit einer eigenen Adresse je Test können
 * sich die Tests nicht gegenseitig beeinflussen.
 */
export function uniqueIp(): string {
  ipZaehler += 1;
  return `10.0.${Math.floor(ipZaehler / 250)}.${ipZaehler % 250}`;
}

export interface RequestOptions {
  /** Absenderadresse für das Rate-Limit; ohne Angabe wird eine neue vergeben */
  ip?: string;
  headers?: Record<string, string>;
  method?: string;
}

function baseHeaders(opts: RequestOptions): Record<string, string> {
  return { "x-forwarded-for": opts.ip ?? uniqueIp(), ...(opts.headers ?? {}) };
}

/** POST-Anfrage mit JSON-Rumpf. Ohne `body` wird bewusst gar kein Rumpf gesendet. */
export function jsonRequest(url: string, body?: unknown, opts: RequestOptions = {}): Request {
  return new Request(url, {
    method: opts.method ?? "POST",
    headers: { "Content-Type": "application/json", ...baseHeaders(opts) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Einfache GET-Anfrage */
export function getRequest(url: string, opts: RequestOptions = {}): Request {
  return new Request(url, { method: opts.method ?? "GET", headers: baseHeaders(opts) });
}

/** Zweites Argument für Routen mit dynamischen Pfadsegmenten */
export function routeParams<T extends Record<string, string>>(werte: T): { params: Promise<T> } {
  return { params: Promise.resolve(werte) };
}

/* ---------------- Beispielantworten der Datenquellen ---------------- */

export function sampleAddressInfo(): AddressInfo {
  return {
    address: BTC_ADDRESS,
    chain: "bitcoin",
    balanceSat: 5_000_000,
    receivedSat: 9_000_000,
    sentSat: 4_000_000,
    txCount: 3,
    provider: "mempool",
  };
}

export function sampleTx(): TxInfo {
  return {
    txid: BTC_TXID,
    chain: "bitcoin",
    blockHeight: 800_000,
    blockTime: 1_700_000_000,
    confirmed: true,
    feeSat: 500,
    inputs: [{ txid: BTC_TXID, vout: 0, address: BTC_ADDRESS_2, valueSat: 1_000_000 }],
    outputs: [{ n: 0, address: BTC_ADDRESS, valueSat: 999_500 }],
    provider: "mempool",
  };
}

export function sampleAttempts(): ProviderAttempt[] {
  return [{ provider: "mempool", ok: true, ms: 1 }];
}

export function sampleTraceResult(): TraceResult {
  return {
    params: {
      start: BTC_ADDRESS,
      chain: "bitcoin",
      mode: "address",
      direction: "forward",
      taintModel: "haircut",
      maxDepth: 2,
      maxTxPerAddress: 10,
      maxAddrPerTx: 8,
      minValueSat: 1000,
      maxNodes: 250,
      enrich: true,
    },
    nodes: [
      {
        id: BTC_ADDRESS,
        data: {
          type: "address",
          address: BTC_ADDRESS,
          chain: "bitcoin",
          depth: 0,
          labels: [],
          risk: "none",
          receivedSat: 9_000_000,
          sentSat: 4_000_000,
          isStart: true,
        },
      },
    ],
    edges: [],
    clusters: [],
    activity: { matrix: [], total: 0 },
    peeling: [],
    riskSources: [],
    fingerprints: [],
    deposits: [],
    crossChain: [],
    stats: { addresses: 1, txs: 0, apiCalls: 1, durationMs: 1, truncated: false },
    warnings: [],
    providersUsed: { mempool: 1 },
  };
}

/**
 * Vorgaben der Verbindungssuche. Absichtlich als eigene Kopie hinterlegt, damit
 * das Ersatzmodul für `@/lib/trace/path` nicht das echte Modul laden muss.
 * Muss zu `DEFAULT_PATH_PARAMS` in `src/lib/trace/path.ts` passen.
 */
export const TEST_PATH_DEFAULTS: Omit<PathParams, "from" | "to"> = {
  chain: "bitcoin",
  maxDepth: 3,
  maxTxPerAddress: 8,
  maxAddrPerTx: 6,
  minValueSat: 1000,
  maxApiCalls: 120,
  maxPaths: 5,
  directed: true,
  skipHubs: true,
  enrich: true,
};

export function samplePathResult(): PathResult {
  return {
    params: { ...TEST_PATH_DEFAULTS, from: BTC_ADDRESS, to: BTC_ADDRESS_2 },
    found: false,
    paths: [],
    graph: sampleTraceResult(),
    stats: { apiCalls: 2, addressesExpanded: 2, durationMs: 1, exhausted: true, hubsSkipped: 0 },
    warnings: [],
    providersUsed: { mempool: 2 },
  };
}

export function sampleProviderStatus(): ProviderStatus[] {
  return [
    {
      id: "mempool",
      name: "mempool.space",
      url: "https://mempool.space",
      keyRequirement: "none",
      kind: "data",
      hasKey: false,
      hasConfig: true,
      active: true,
    },
  ];
}

/* ---------------- Gemeinsamer Zustand der Ersatzmodule ---------------- */

export interface MockState {
  /** Angemeldeter Nutzer oder `null` für „nicht angemeldet“ */
  session: Session | null;
  settings: UserSettings;
  /** Ist eine MONGODB_URI hinterlegt? */
  dbConfigured: boolean;
  /** Kommt eine Verbindung zustande? `false` -> `connectDb()` liefert null */
  dbConnected: boolean;
  address: AddressInfo;
  txs: TxInfo[];
  tx: TxInfo;
  labels: LabelResult;
  outspends: { spent: boolean; txid?: string; vin?: number }[];
  providerStatus: ProviderStatus[];
  trace: TraceResult;
  path: PathResult;
  inflow: InflowRisk | null;
  price: PriceInfo;
  priceSeries: PriceSeries;
  lightning: LightningChannel[];
  mixer: Record<string, unknown>;
  crosschain: Record<string, unknown>;
  watchCheck: WatchCheckResult;
  caseRefresh: CaseRefreshResult;
  jobs: Record<string, unknown>[];
  jobId: string;
}

/** Frischer Ausgangszustand: niemand angemeldet, keine Datenbank, feste Daten. */
export function defaultMockState(): MockState {
  return {
    session: null,
    settings: { userKeys: {}, orgKeys: {}, config: {} },
    dbConfigured: false,
    dbConnected: false,
    address: sampleAddressInfo(),
    txs: [sampleTx()],
    tx: sampleTx(),
    labels: { labels: [], errors: [] },
    outspends: [{ spent: false }],
    providerStatus: sampleProviderStatus(),
    trace: sampleTraceResult(),
    path: samplePathResult(),
    inflow: { totalSat: 0, senders: [], checked: 1, skipped: 0 },
    price: { eur: 50_000, usd: 55_000, source: "test", fetchedAt: 1_700_000_000_000 },
    priceSeries: [[1_700_000_000, 50_000]],
    lightning: [],
    mixer: { candidates: [], stats: { scanned: 0 } },
    crosschain: { matches: [], stats: { scanned: 0 } },
    watchCheck: { checked: 0, changed: 0, notified: 0, errors: [] },
    caseRefresh: { checked: 0, refreshed: 0, changed: 0, notified: 0, errors: [] },
    jobs: [],
    jobId: "auftrag-1",
  };
}

/** Meldet einen Nutzer an. */
export function anmelden(state: MockState, userId = "nutzer-1", email = "test@example.org"): void {
  state.session = { userId, email };
}

/** Schaltet die Datenbank scharf (nur für Tests, die den 503-Zweig prüfen). */
export function datenbankVerfuegbar(state: MockState, verfuegbar: boolean): void {
  state.dbConfigured = verfuegbar;
  state.dbConnected = verfuegbar;
}

/* ---------------- Ersatzmodule ---------------- */

export function authMock(state: MockState) {
  const kontext = (chain: ChainId, userId?: string): ProviderContext => ({
    keys: {},
    config: {},
    chain,
    userId,
    orgId: state.settings.orgId,
  });
  return {
    getSession: async (): Promise<Session | null> => state.session,
    getUserSettings: async (): Promise<UserSettings> => state.settings,
    getRequestContext: async (opts: { chain?: ChainId; req?: Request } = {}): Promise<RequestContext> => ({
      session: state.session,
      ctx: kontext(opts.chain ?? "bitcoin", state.session?.userId),
      settings: state.settings,
      auth: state.session ? "session" : "none",
      scopes: undefined,
    }),
    contextForUser: async (userId: string, chain: ChainId): Promise<ProviderContext> => kontext(chain, userId),
  };
}

export function dbMock(state: MockState) {
  return {
    isDbConfigured: (): boolean => state.dbConfigured,
    /** Ohne Datenbank liefert `connectDb` null – die Routen antworten dann mit 503. */
    connectDb: async (): Promise<object | null> => (state.dbConnected ? { verbunden: true } : null),
  };
}

export function registryMock(state: MockState) {
  return {
    getAddress: async () => ({ data: state.address, provider: state.address.provider, attempts: sampleAttempts() }),
    getAddressTxs: async () => ({ data: state.txs, provider: "mempool", attempts: sampleAttempts() }),
    getTx: async () => ({ data: state.tx, provider: state.tx.provider, attempts: sampleAttempts() }),
    getOutspends: async () => ({ data: state.outspends, provider: "mempool", attempts: sampleAttempts() }),
    lookupLabels: async (): Promise<LabelResult> => state.labels,
    providerStatus: async (): Promise<ProviderStatus[]> => state.providerStatus,
    buildContext: (opts: { chain?: ChainId } = {}): ProviderContext => ({
      keys: {},
      config: {},
      chain: opts.chain ?? "bitcoin",
    }),
    dataProviders: state.providerStatus.filter((p) => p.kind === "data"),
    intelProviders: state.providerStatus.filter((p) => p.kind === "intel"),
    allProviders: state.providerStatus,
    keyableProviders: [],
    envKeySet: {},
    usable: () => true,
    providersFor: () => [],
  };
}

export function engineMock(state: MockState) {
  return {
    runTrace: async (): Promise<TraceResult> => state.trace,
    riskFromLabels: () => "none" as const,
  };
}

export function pathMock(state: MockState) {
  return {
    findPaths: async (): Promise<PathResult> => state.path,
    DEFAULT_PATH_PARAMS: TEST_PATH_DEFAULTS,
  };
}

export function priceMock(state: MockState) {
  return {
    getBtcPrice: async (): Promise<PriceInfo> => state.price,
    getPriceSeries: async (): Promise<PriceSeries> => state.priceSeries,
    getHistoricalPrices: async (): Promise<PriceSeries> => state.priceSeries,
    priceAt: (): number | undefined => state.price.eur,
  };
}

export function lightningMock(state: MockState) {
  return {
    lightningForTx: async (): Promise<LightningChannel[]> => state.lightning,
    lightningHint: (): string | null => null,
  };
}

export function inflowMock(state: MockState) {
  return { analyseInflowRisk: async (): Promise<InflowRisk | null> => state.inflow };
}

export function mixerMock(state: MockState) {
  return { correlateMixerOutputs: async (): Promise<Record<string, unknown>> => state.mixer };
}

export function crosschainMock(state: MockState) {
  return { correlateCrossChain: async (): Promise<Record<string, unknown>> => state.crosschain };
}

export function watchMock(state: MockState) {
  return { checkWatches: async (): Promise<WatchCheckResult> => state.watchCheck };
}

export function caseRefreshMock(state: MockState) {
  return {
    refreshCases: async (): Promise<CaseRefreshResult> => state.caseRefresh,
    diffResults: () => ({ newAddresses: [], newTxs: [], newRiskSources: [], changed: false }),
  };
}

export function jobsMock(state: MockState) {
  return {
    listJobs: async (): Promise<Record<string, unknown>[]> => state.jobs,
    enqueueJob: async (): Promise<string> => state.jobId,
    getJob: async (): Promise<null> => null,
    cancelJob: async (): Promise<boolean> => false,
    claimNextJob: async (): Promise<null> => null,
    releaseStaleJobs: async (): Promise<number> => 0,
  };
}

/** Cache ohne persistente Ebene – so wird nie eine Datenbank angefasst. */
export function cacheMock() {
  return {
    cacheGet: (): undefined => undefined,
    cacheSet: (): void => undefined,
    cacheDelete: (): void => undefined,
    memo: async <T>(schluessel: string, ttl: number, fn: () => Promise<T>): Promise<T> => {
      void schluessel;
      void ttl;
      return fn();
    },
    memoPersist: async <T>(schluessel: string, ttl: number, fn: () => Promise<T>): Promise<T> => {
      void schluessel;
      void ttl;
      return fn();
    },
    cacheStats: async (): Promise<{ memory: number; persistent: number | null }> => ({ memory: 0, persistent: null }),
    cacheClear: async (): Promise<void> => undefined,
  };
}
