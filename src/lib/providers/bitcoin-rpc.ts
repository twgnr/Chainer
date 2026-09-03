import { chainMeta } from "../chains";
import { memoPersist } from "../cache";
import type { AddressInfo, ChainProvider, ProviderContext, TxInfo } from "./types";
import { ProviderError, UnsupportedError } from "./types";

const ID = "bitcoin-rpc";

interface RpcConfig {
  url: string;
  user?: string;
  pass?: string;
}

function config(ctx: ProviderContext): RpcConfig | null {
  const c = ctx.config[ID] || {};
  const url = c.url || process.env.BITCOIN_RPC_URL;
  if (!url) return null;
  return { url, user: c.user || process.env.BITCOIN_RPC_USER, pass: c.pass || process.env.BITCOIN_RPC_PASSWORD };
}

interface RpcResponse<T> {
  result: T | null;
  error: { code: number; message: string } | null;
}

async function rpc<T>(cfg: RpcConfig, method: string, params: unknown[]): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.user) headers.Authorization = `Basic ${Buffer.from(`${cfg.user}:${cfg.pass ?? ""}`).toString("base64")}`;
    const res = await fetch(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "1.0", id: "chainer", method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok && res.status !== 500) {
      throw new ProviderError(ID, `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`, res.status);
    }
    const json = (await res.json()) as RpcResponse<T>;
    if (json.error) throw new ProviderError(ID, `${json.error.message} (Code ${json.error.code})`);
    if (json.result === null || json.result === undefined) throw new ProviderError(ID, "leere Antwort");
    return json.result;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const msg = e instanceof Error ? (e.name === "AbortError" ? "Timeout" : e.message) : String(e);
    throw new ProviderError(ID, msg);
  } finally {
    clearTimeout(timer);
  }
}

interface RawTxVin {
  txid?: string;
  vout?: number;
  coinbase?: string;
}
interface RawTxVout {
  n: number;
  value: number;
  scriptPubKey: { address?: string; addresses?: string[]; type?: string };
}
interface RawTx {
  txid: string;
  size: number;
  vsize?: number;
  blockhash?: string;
  blocktime?: number;
  confirmations?: number;
  vin: RawTxVin[];
  vout: RawTxVout[];
}

const outAddress = (o: RawTxVout) => o.scriptPubKey.address ?? o.scriptPubKey.addresses?.[0];
const toSat = (btc: number) => Math.round(btc * 1e8);

async function fetchRaw(cfg: RpcConfig, txid: string): Promise<RawTx> {
  // Bestätigte Transaktionen sind unveränderlich -> dauerhaft cachen
  return memoPersist(`rpc:tx:${txid}`, 24 * 60 * 60 * 1000, () => rpc<RawTx>(cfg, "getrawtransaction", [txid, true]));
}

async function toTxInfo(cfg: RpcConfig, raw: RawTx): Promise<TxInfo> {
  // Bitcoin Core liefert keine Eingangsbeträge -> Eltern-Transaktionen nachladen
  const parents = new Map<string, RawTx>();
  const needed = [...new Set(raw.vin.filter((v) => v.txid).map((v) => v.txid!))];
  const CONC = 6;
  for (let i = 0; i < needed.length; i += CONC) {
    const batch = needed.slice(i, i + CONC);
    const loaded = await Promise.all(
      batch.map(async (t) => {
        try {
          return [t, await fetchRaw(cfg, t)] as const;
        } catch {
          return null;
        }
      }),
    );
    for (const l of loaded) if (l) parents.set(l[0], l[1]);
  }
  const inputs = raw.vin.map((v) => {
    if (v.coinbase) return { coinbase: true };
    const p = v.txid ? parents.get(v.txid) : undefined;
    const po = p && v.vout !== undefined ? p.vout[v.vout] : undefined;
    return { txid: v.txid, vout: v.vout, address: po ? outAddress(po) : undefined, valueSat: po ? toSat(po.value) : undefined };
  });
  const outputs = raw.vout.map((o) => ({
    n: o.n,
    address: outAddress(o),
    valueSat: toSat(o.value),
    scriptType: o.scriptPubKey.type,
  }));
  const allIn = inputs.every((i) => i.coinbase || i.valueSat !== undefined);
  const totalIn = inputs.reduce((s, i) => s + (i.valueSat || 0), 0);
  const totalOut = outputs.reduce((s, o) => s + o.valueSat, 0);
  return {
    txid: raw.txid,
    chain: "bitcoin",
    size: raw.vsize ?? raw.size,
    feeSat: allIn && !inputs.some((i) => i.coinbase) ? totalIn - totalOut : undefined,
    confirmed: !!raw.blockhash,
    blockTime: raw.blocktime,
    inputs,
    outputs,
    provider: ID,
  };
}

/**
 * Eigener Bitcoin-Core-Knoten über JSON-RPC. Braucht `txindex=1` für beliebige
 * Transaktionen. Core führt keinen Adressindex, deshalb sind Adressabfragen nicht
 * möglich – dafür greift die Fallback-Kette (Electrum oder eine öffentliche API).
 */
export const bitcoinRpc: ChainProvider = {
  id: ID,
  name: "Bitcoin Core (eigener Knoten)",
  url: "https://bitcoincore.org",
  keyRequirement: "none",
  rateLimit: "unbegrenzt (eigener Knoten)",
  chains: ["bitcoin"],
  configFields: [
    { key: "url", label: "RPC-URL", placeholder: "http://127.0.0.1:8332", required: true },
    { key: "user", label: "RPC-Benutzer" },
    { key: "pass", label: "RPC-Passwort", secret: true },
  ],
  async getAddress(_address, ctx): Promise<AddressInfo> {
    if (!config(ctx)) throw new UnsupportedError(ID, "kein Knoten konfiguriert");
    throw new UnsupportedError(ID, "Adressabfragen (Bitcoin Core führt keinen Adressindex)");
  },
  async getAddressTxs(_address, ctx) {
    if (!config(ctx)) throw new UnsupportedError(ID, "kein Knoten konfiguriert");
    throw new UnsupportedError(ID, "Adressabfragen (Bitcoin Core führt keinen Adressindex)");
  },
  async getTx(txid, ctx) {
    const cfg = config(ctx);
    if (!cfg) throw new UnsupportedError(ID, "kein Knoten konfiguriert");
    if (ctx.chain !== "bitcoin") throw new UnsupportedError(ID, `Chain ${chainMeta(ctx.chain).name}`);
    return toTxInfo(cfg, await fetchRaw(cfg, txid));
  },
  async getOutspends(txid, ctx) {
    const cfg = config(ctx);
    if (!cfg) throw new UnsupportedError(ID, "kein Knoten konfiguriert");
    const raw = await fetchRaw(cfg, txid);
    // gettxout liefert nur UNGESPENDETE Outputs; die ausgebende Transaktion kennt
    // Core ohne zusätzlichen Index nicht. Daher nur der Spent-Status.
    return Promise.all(
      raw.vout.map(async (o) => {
        try {
          const utxo = await rpc<unknown>(cfg, "gettxout", [txid, o.n, true]);
          return { spent: utxo === null };
        } catch {
          return { spent: false };
        }
      }),
    );
  },
};

export async function bitcoinRpcPing(ctx: ProviderContext): Promise<{ ok: boolean; info?: string; error?: string }> {
  const cfg = config(ctx);
  if (!cfg) return { ok: false, error: "kein Knoten konfiguriert" };
  try {
    const info = await rpc<{ chain: string; blocks: number }>(cfg, "getblockchaininfo", []);
    return { ok: true, info: `${info.chain}, Höhe ${info.blocks}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
