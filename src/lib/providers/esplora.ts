import { fetchJson } from "./http";
import { CHAINS, type ChainId } from "../chains";
import { computeRawFeatures } from "../trace/fingerprint";
import type { AddressInfo, ChainProvider, ProviderContext, TxInfo } from "./types";
import { ProviderError, UnsupportedError } from "./types";

/**
 * Esplora-kompatible API (mempool.space, Blockstream, litecoinspace).
 */
interface EsploraAddress {
  address: string;
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
}
interface EsploraTx {
  txid: string;
  size: number;
  fee: number;
  version?: number;
  locktime?: number;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vin: {
    txid: string;
    vout: number;
    is_coinbase: boolean;
    sequence?: number;
    prevout: { scriptpubkey_address?: string; value: number } | null;
  }[];
  vout: { scriptpubkey_address?: string; scriptpubkey_type: string; scriptpubkey?: string; value: number }[];
}
interface EsploraOutspend {
  spent: boolean;
  txid?: string;
  vin?: number;
}

function mapTx(t: EsploraTx, provider: string, chain: ChainId): TxInfo {
  // Antwortstruktur prüfen: eine Wartungsseite oder ein Fehlerobjekt mit
  // Status 200 darf keinen TypeError auslösen, sondern muss als Anbieterfehler
  // erkennbar sein, damit die Fallback-Kette greift.
  if (!t || !t.status || !Array.isArray(t.vin) || !Array.isArray(t.vout)) {
    throw new ProviderError(provider, "unerwartete Antwortstruktur bei der Transaktion");
  }
  return {
    txid: t.txid,
    chain,
    size: t.size,
    feeSat: t.fee,
    confirmed: t.status.confirmed,
    blockHeight: t.status.block_height,
    blockTime: t.status.block_time,
    inputs: t.vin.map((v) => ({
      txid: v.is_coinbase ? undefined : v.txid,
      vout: v.is_coinbase ? undefined : v.vout,
      coinbase: v.is_coinbase,
      address: v.prevout?.scriptpubkey_address,
      valueSat: v.prevout?.value,
    })),
    outputs: t.vout.map((o, n) => ({
      n,
      address: o.scriptpubkey_address,
      valueSat: o.value,
      scriptType: o.scriptpubkey_type,
    })),
    provider,
    // Rohmerkmale für den Wallet-Fingerabdruck
    raw: computeRawFeatures({
      version: t.version,
      locktime: t.locktime,
      sequences: t.vin.map((v) => v.sequence).filter((v): v is number => typeof v === "number"),
      ins: t.vin.map((v) => ({ txid: v.txid, vout: v.vout })),
      outs: t.vout.map((o) => ({ valueSat: o.value, script: o.scriptpubkey })),
    }),
  };
}

async function enrichOutspends(id: string, baseUrl: string, txs: TxInfo[]) {
  await Promise.all(
    txs.map(async (tx) => {
      try {
        const spends = await fetchJson<EsploraOutspend[]>(id, `${baseUrl}/tx/${tx.txid}/outspends`);
        spends.forEach((s, i) => {
          if (tx.outputs[i]) {
            tx.outputs[i].spent = s.spent;
            tx.outputs[i].spentTxid = s.txid;
          }
        });
      } catch {
        /* optional */
      }
    }),
  );
}

export function createEsploraProvider(opts: {
  id: string;
  name: string;
  url: string;
  baseUrl: string;
  chain: ChainId;
  rateLimit?: string;
}): ChainProvider {
  const { id, baseUrl, chain } = opts;
  const guard = (ctx: ProviderContext) => {
    if (ctx.chain !== chain) throw new UnsupportedError(id, `Chain ${ctx.chain}`);
  };
  return {
    id,
    name: opts.name,
    url: opts.url,
    keyRequirement: "none",
    rateLimit: opts.rateLimit,
    chains: [chain],
    // Die abgefragte Adresse geht an einen fremden Dienst
    leaksQuery: true,
    async getAddress(address, ctx): Promise<AddressInfo> {
      guard(ctx);
      const a = await fetchJson<EsploraAddress>(id, `${baseUrl}/address/${address}`);
      if (!a?.chain_stats || !a?.mempool_stats) {
        throw new ProviderError(id, "unerwartete Antwortstruktur bei der Adresse");
      }
      const received = a.chain_stats.funded_txo_sum + a.mempool_stats.funded_txo_sum;
      const sent = a.chain_stats.spent_txo_sum + a.mempool_stats.spent_txo_sum;
      return {
        address: a.address,
        chain,
        receivedSat: received,
        sentSat: sent,
        balanceSat: received - sent,
        txCount: a.chain_stats.tx_count + a.mempool_stats.tx_count,
        provider: id,
      };
    },
    async getAddressTxs(address, ctx, limit = 50): Promise<TxInfo[]> {
      guard(ctx);
      // Esplora liefert 25 bestätigte + Mempool pro Seite; Paginierung über last_seen_txid
      const out: TxInfo[] = [];
      let lastSeen: string | undefined;
      while (out.length < limit) {
        const url = lastSeen
          ? `${baseUrl}/address/${address}/txs/chain/${lastSeen}`
          : `${baseUrl}/address/${address}/txs`;
        const page = await fetchJson<EsploraTx[]>(id, url);
        if (!Array.isArray(page)) throw new ProviderError(id, "unerwartete Antwortstruktur bei der Adressliste");
        if (!page.length) break;
        out.push(...page.map((t) => mapTx(t, id, chain)));
        const confirmed = page.filter((t) => t.status.confirmed);
        if (page.length < 25 || !confirmed.length) break;
        lastSeen = confirmed[confirmed.length - 1].txid;
      }
      const txs = out.slice(0, limit);
      // Outspends nur für wenige Transaktionen nachladen (Rate-Limit schonen)
      await enrichOutspends(id, baseUrl, txs.slice(0, 10));
      return txs;
    },
    async getTx(txid, ctx): Promise<TxInfo> {
      guard(ctx);
      const t = await fetchJson<EsploraTx>(id, `${baseUrl}/tx/${txid}`);
      const tx = mapTx(t, id, chain);
      await enrichOutspends(id, baseUrl, [tx]);
      return tx;
    },
    async getOutspends(txid, ctx) {
      guard(ctx);
      const spends = await fetchJson<EsploraOutspend[]>(id, `${baseUrl}/tx/${txid}/outspends`);
      return spends.map((s) => ({ spent: s.spent, txid: s.txid, vin: s.vin }));
    },
  };
}

export const mempoolSpace = createEsploraProvider({
  id: "mempool",
  name: "mempool.space",
  url: "https://mempool.space",
  baseUrl: "https://mempool.space/api",
  chain: "bitcoin",
  rateLimit: "Fair use, ohne Key",
});

export const blockstream = createEsploraProvider({
  id: "blockstream",
  name: "Blockstream Esplora",
  url: "https://blockstream.info",
  baseUrl: "https://blockstream.info/api",
  chain: "bitcoin",
  rateLimit: "Fair use, ohne Key",
});

export const litecoinSpace = createEsploraProvider({
  id: "litecoinspace",
  name: "litecoinspace.org",
  url: CHAINS.litecoin.explorer,
  baseUrl: "https://litecoinspace.org/api",
  chain: "litecoin",
  rateLimit: "Fair use, ohne Key",
});
