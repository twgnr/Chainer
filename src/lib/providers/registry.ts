import { mempoolSpace, blockstream, litecoinSpace } from "./esplora";
import { blockchainInfo } from "./blockchain-info";
import { blockcypher } from "./blockcypher";
import { blockchair } from "./blockchair";
import { bitcoinRpc } from "./bitcoin-rpc";
import { electrum } from "./electrum";
import { blockscout, etherscan } from "./evm";
import { trongrid } from "./tron";
import { walletExplorer } from "./intel/walletexplorer";
import { cryptoScamDb } from "./intel/cryptoscamdb";
import { chainabuse } from "./intel/chainabuse";
import { ofac } from "./intel/ofac";
import { ransomwhere } from "./intel/ransomwhere";
import { tagpacks } from "./intel/tagpacks";
import { bitcoinWhosWho } from "./intel/bitcoinwhoswho";
import { ownAnnotations } from "./intel/annotations";
import { stablecoinBlacklist } from "./intel/stablecoin";
import { memo, memoPersist, cacheSet } from "../cache";
import { recordEvidence } from "../evidence";
import { log } from "../logger";
import { DEFAULT_CHAIN, type ChainId } from "../chains";
import type {
  AddressInfo,
  AddressLabel,
  ChainProvider,
  IntelProvider,
  ProviderContext,
  ProviderMeta,
  TxInfo,
} from "./types";

/**
 * Reihenfolge = Priorität beim Fallback. Eigene Infrastruktur (Knoten, Electrum)
 * zuerst, danach die öffentlichen kostenlosen APIs.
 */
export const dataProviders: ChainProvider[] = [
  bitcoinRpc,
  electrum,
  mempoolSpace,
  blockstream,
  litecoinSpace,
  blockchainInfo,
  blockcypher,
  blockchair,
  blockscout,
  etherscan,
  trongrid,
];

export const intelProviders: IntelProvider[] = [
  ownAnnotations,
  ofac,
  stablecoinBlacklist,
  ransomwhere,
  tagpacks,
  walletExplorer,
  cryptoScamDb,
  chainabuse,
  bitcoinWhosWho,
];

export const allProviders: (ChainProvider | IntelProvider)[] = [...dataProviders, ...intelProviders];

/** Provider, die einen Key oder eine eigene Konfiguration annehmen */
export const keyableProviders: ProviderMeta[] = allProviders.filter(
  (p) => p.keyRequirement !== "none" || (p.configFields && p.configFields.length > 0),
);

const ENV_KEYS: Record<string, string | undefined> = {
  blockcypher: process.env.BLOCKCYPHER_TOKEN,
  blockchair: process.env.BLOCKCHAIR_KEY,
  chainabuse: process.env.CHAINABUSE_KEY,
  etherscan: process.env.ETHERSCAN_KEY,
  bitcoinwhoswho: process.env.BITCOINWHOSWHO_KEY,
  trongrid: process.env.TRONGRID_KEY,
};

export const envKeySet: Record<string, boolean> = Object.fromEntries(
  Object.entries(ENV_KEYS).map(([k, v]) => [k, !!v]),
);

export interface ContextOptions {
  chain?: ChainId;
  /** Nur Quellen nutzen, die das Ermittlungsziel nicht verraten */
  privacyMode?: boolean;
  userId?: string;
  orgId?: string;
  /** Vom Nutzer gespeicherte Keys (entschlüsselt) */
  userKeys?: Record<string, string | undefined>;
  /** Vom Team geteilte Keys (entschlüsselt) */
  orgKeys?: Record<string, string | undefined>;
  /** Provider-Konfiguration (eigener Knoten, Electrum-Server …) */
  config?: Record<string, Record<string, string> | undefined>;
}

/** Nutzer-Keys haben Vorrang vor Team-Keys, diese vor ENV-Keys. */
export function buildContext(opts: ContextOptions = {}): ProviderContext {
  const keys: Record<string, string | undefined> = { ...ENV_KEYS };
  for (const [k, v] of Object.entries(opts.orgKeys || {})) if (v) keys[k] = v;
  for (const [k, v] of Object.entries(opts.userKeys || {})) if (v) keys[k] = v;
  return {
    keys,
    config: opts.config || {},
    chain: opts.chain || DEFAULT_CHAIN,
    userId: opts.userId,
    orgId: opts.orgId,
    privacyMode: opts.privacyMode ?? process.env.PRIVACY_MODE === "true",
  };
}

/**
 * Im Datenschutzmodus sind nur Quellen erlaubt, die die gesuchte Adresse nicht
 * an Dritte übermitteln: eigene Infrastruktur sowie Quellen, die vollständige
 * Listen herunterladen und lokal prüfen.
 */
export function allowedInPrivacyMode(p: ProviderMeta): boolean {
  return p.leaksQuery !== true;
}

export interface ProviderAttempt {
  provider: string;
  ok: boolean;
  error?: string;
  ms: number;
}

export interface FallbackResult<T> {
  data: T;
  provider: string;
  attempts: ProviderAttempt[];
}

function supportsChain(p: ProviderMeta, chain: ChainId) {
  return !p.chains || p.chains.includes(chain);
}

function hasConfig(p: ProviderMeta, ctx: ProviderContext) {
  const required = p.configFields?.filter((f) => f.required) ?? [];
  if (!required.length) return true;
  const c = ctx.config[p.id];
  const envFallback =
    (p.id === "bitcoin-rpc" && !!process.env.BITCOIN_RPC_URL) || (p.id === "electrum" && !!process.env.ELECTRUM_HOST);
  return required.every((f) => !!c?.[f.key]) || envFallback;
}

export function usable(p: ProviderMeta, ctx: ProviderContext) {
  if (!supportsChain(p, ctx.chain)) return false;
  if (ctx.privacyMode && !allowedInPrivacyMode(p)) return false;
  if (p.keyRequirement === "required" && !ctx.keys[p.id]) return false;
  if (!hasConfig(p, ctx)) return false;
  return true;
}

/** Datenquellen für die aktuelle Chain in Prioritätsreihenfolge */
export function providersFor(ctx: ProviderContext, prefer?: string): ChainProvider[] {
  const list = dataProviders.filter((p) => usable(p, ctx));
  if (!prefer) return list;
  return [...list.filter((p) => p.id === prefer), ...list.filter((p) => p.id !== prefer)];
}

/**
 * Probiert die Datenquellen der Reihe nach, bis eine antwortet.
 */
export async function withFallback<T>(
  ctx: ProviderContext,
  fn: (p: ChainProvider) => Promise<T>,
  opts: { prefer?: string; require?: (p: ChainProvider) => boolean } = {},
): Promise<FallbackResult<T>> {
  const attempts: ProviderAttempt[] = [];
  const order = providersFor(ctx, opts.prefer).filter((p) => !opts.require || opts.require(p));
  if (!order.length) throw new Error(`Keine passende Datenquelle für ${ctx.chain} verfügbar`);
  for (const p of order) {
    const t0 = Date.now();
    try {
      const data = await fn(p);
      attempts.push({ provider: p.id, ok: true, ms: Date.now() - t0 });
      return { data, provider: p.id, attempts };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      attempts.push({ provider: p.id, ok: false, ms: Date.now() - t0, error });
      log.warn("Datenquelle nicht erreichbar", { provider: p.id, chain: ctx.chain, ms: Date.now() - t0, error });
    }
  }
  log.error("Alle Datenquellen gescheitert", { chain: ctx.chain, versuche: attempts.length });
  throw new Error("Keine Datenquelle konnte antworten: " + attempts.map((a) => `${a.provider}: ${a.error}`).join("; "));
}

const TTL_ADDR = 60_000;
const TTL_TX_CONFIRMED = 30 * 24 * 60 * 60 * 1000;
const TTL_TX_UNCONFIRMED = 30_000;

const ck = (ctx: ProviderContext, s: string) => `${ctx.chain}:${s}`;

export async function getAddress(ctx: ProviderContext, address: string, prefer?: string) {
  const r = await memo(ck(ctx, `addr:${address}`), TTL_ADDR, () =>
    withFallback<AddressInfo>(ctx, (p) => p.getAddress(address, ctx), { prefer }),
  );
  recordEvidence({ kind: "address", key: address, chain: ctx.chain, provider: r.provider }, r.data);
  return r;
}

export async function getAddressTxs(ctx: ProviderContext, address: string, limit = 50, prefer?: string) {
  const r = await memo(ck(ctx, `addrtxs:${address}:${limit}`), TTL_ADDR, () =>
    withFallback<TxInfo[]>(ctx, (p) => p.getAddressTxs(address, ctx, limit), { prefer }),
  );
  recordEvidence({ kind: "addressTxs", key: address, chain: ctx.chain, provider: r.provider }, r.data);
  return r;
}

export async function getTx(ctx: ProviderContext, txid: string, prefer?: string) {
  const key = ck(ctx, `tx:${txid}`);
  // Bestätigte Transaktionen sind unveränderlich und werden dauerhaft persistiert
  const r = await memoPersist(key, TTL_TX_UNCONFIRMED, () =>
    withFallback<TxInfo>(ctx, (p) => p.getTx(txid, ctx), { prefer }),
  );
  if (r.data.confirmed) cacheSet(key, r, TTL_TX_CONFIRMED);
  recordEvidence({ kind: "tx", key: txid, chain: ctx.chain, provider: r.provider }, r.data);
  return r;
}

/** Ausgebende Transaktionen je Output – Grundlage für UTXO-genaues Tracing. */
export async function getOutspends(ctx: ProviderContext, txid: string, prefer?: string) {
  const r = await memoPersist(ck(ctx, `outspends:${txid}`), 60 * 60 * 1000, () =>
    withFallback<{ spent: boolean; txid?: string; vin?: number }[]>(
      ctx,
      (p) => p.getOutspends!(txid, ctx),
      { prefer, require: (p) => typeof p.getOutspends === "function" },
    ),
  );
  recordEvidence({ kind: "outspends", key: txid, chain: ctx.chain, provider: r.provider }, r.data);
  return r;
}

export interface LabelResult {
  labels: AddressLabel[];
  errors: { provider: string; error: string }[];
}

/** Fragt alle Intel-Quellen parallel ab; Fehler einzelner Quellen brechen nicht ab. */
export function lookupLabels(ctx: ProviderContext, address: string): Promise<LabelResult> {
  const active = intelProviders.filter((p) => usable(p, ctx));
  // Eigene Labels dürfen nicht global gecacht werden -> Nutzer/Team im Schlüssel
  const scope = ctx.userId || ctx.orgId ? `${ctx.userId ?? ""}/${ctx.orgId ?? ""}` : "anon";
  const cacheKey = ck(ctx, `labels:${scope}:${address}:${active.map((p) => p.id).join(",")}`);
  return memo(cacheKey, 5 * 60_000, async () => {
    const results = await Promise.allSettled(active.map((p) => p.lookup(address, ctx)));
    const labels: AddressLabel[] = [];
    const errors: LabelResult["errors"] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") labels.push(...r.value);
      else errors.push({ provider: active[i].id, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    });
    recordEvidence(
      { kind: "labels", key: address, chain: ctx.chain, provider: active.map((p) => p.id).join("+") },
      labels,
    );
    return { labels, errors };
  });
}

export interface ProviderStatus extends ProviderMeta {
  kind: "data" | "intel";
  /** Im Datenschutzmodus gesperrt, weil die Quelle die Adresse weitergibt */
  blockedByPrivacy?: boolean;
  hasKey: boolean;
  hasConfig: boolean;
  active: boolean;
  ok?: boolean;
  ms?: number;
  error?: string;
}

const TEST_ADDRESS: Record<ChainId, string> = {
  bitcoin: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  litecoin: "LhyLNfBkoKshT7R8Pce6vkB9T2cP2o84hx",
  dogecoin: "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L",
  "bitcoin-cash": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  ethereum: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
  // Tron: Vertragsadresse von USDT-TRC20, dauerhaft aktiv
  tron: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
};

/** Health-Check aller Quellen der aktuellen Chain */
export async function providerStatus(ctx: ProviderContext, ping = false): Promise<ProviderStatus[]> {
  const test = TEST_ADDRESS[ctx.chain];
  return Promise.all(
    allProviders.map(async (p): Promise<ProviderStatus> => {
      const isData = "getAddress" in p;
      const base: ProviderStatus = {
        id: p.id,
        name: p.name,
        url: p.url,
        keyRequirement: p.keyRequirement,
        keyHint: p.keyHint,
        rateLimit: p.rateLimit,
        chains: p.chains,
        configFields: p.configFields,
        kind: isData ? "data" : "intel",
        leaksQuery: p.leaksQuery,
        blockedByPrivacy: ctx.privacyMode === true && !allowedInPrivacyMode(p),
        hasKey: !!ctx.keys[p.id],
        hasConfig: hasConfig(p, ctx),
        active: usable(p, ctx),
      };
      if (!ping || !base.active) return base;
      const t0 = Date.now();
      try {
        if (isData) await (p as ChainProvider).getAddress(test, ctx);
        else await (p as IntelProvider).lookup(test, ctx);
        return { ...base, ok: true, ms: Date.now() - t0 };
      } catch (e) {
        return { ...base, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}
