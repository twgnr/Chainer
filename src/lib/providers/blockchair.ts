import { fetchJson } from "./http";
import { chainMeta, type ChainId } from "../chains";
import type { AddressInfo, ChainProvider, ProviderContext, TxInfo } from "./types";
import { ProviderError, UnsupportedError } from "./types";

const ID = "blockchair";

interface BcAddrResp {
  data: Record<
    string,
    {
      address: { balance: number; received: number; spent: number; transaction_count: number };
      transactions: string[];
    }
  >;
}
interface BcTxData {
  transaction: { hash: string; size: number; fee: number; block_id: number; time: string };
  inputs: {
    index: number;
    recipient: string;
    value: number;
    is_from_coinbase: boolean;
    transaction_hash: string;
  }[];
  outputs: {
    index: number;
    recipient: string;
    value: number;
    is_spent: boolean;
    spending_transaction_hash?: string;
    type: string;
  }[];
}
interface BcTxResp {
  data: Record<string, BcTxData>;
}

function base(ctx: ProviderContext): string {
  const path = chainMeta(ctx.chain).blockchairPath;
  if (!path) throw new UnsupportedError(ID, `Chain ${ctx.chain}`);
  return `https://api.blockchair.com/${path}`;
}

function keyParam(ctx: ProviderContext) {
  const k = ctx.keys[ID];
  return k ? `?key=${encodeURIComponent(k)}` : "";
}

function mapTx(d: BcTxData, chain: ChainId): TxInfo {
  const t = d.transaction;
  return {
    txid: t.hash,
    chain,
    size: t.size,
    feeSat: t.fee,
    confirmed: t.block_id > 0,
    blockHeight: t.block_id > 0 ? t.block_id : undefined,
    blockTime: t.time ? Math.floor(new Date(t.time.replace(" ", "T") + "Z").getTime() / 1000) : undefined,
    inputs: d.inputs.map((i) => ({
      txid: i.transaction_hash,
      vout: i.index,
      coinbase: i.is_from_coinbase,
      address: i.recipient,
      valueSat: i.value,
    })),
    outputs: d.outputs.map((o) => ({
      n: o.index,
      address: o.recipient,
      valueSat: o.value,
      spent: o.is_spent,
      spentTxid: o.spending_transaction_hash,
      scriptType: o.type,
    })),
    provider: ID,
  };
}

export const blockchair: ChainProvider = {
  id: ID,
  name: "Blockchair",
  url: "https://blockchair.com",
  keyRequirement: "optional",
  keyHint: "Free-Tier ohne Key stark limitiert; Key unter https://blockchair.com/api/plans",
  rateLimit: "ohne Key ca. 30 Req/min",
  chains: ["bitcoin", "litecoin", "dogecoin", "bitcoin-cash"],
  leaksQuery: true,
  async getAddress(address, ctx): Promise<AddressInfo> {
    const r = await fetchJson<BcAddrResp>(ID, `${base(ctx)}/dashboards/address/${address}${keyParam(ctx)}`);
    if (!r?.data) throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Adresse");
    const a = r.data[address]?.address;
    if (!a) throw new ProviderError(ID, "Adresse nicht gefunden");
    return {
      address,
      chain: ctx.chain,
      balanceSat: a.balance,
      receivedSat: a.received,
      sentSat: a.spent,
      txCount: a.transaction_count,
      provider: ID,
    };
  },
  async getAddressTxs(address, ctx, limit = 50) {
    const r = await fetchJson<BcAddrResp>(ID, `${base(ctx)}/dashboards/address/${address}${keyParam(ctx)}`);
    if (!r?.data) throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Adressliste");
    const hashes = (r.data[address]?.transactions || []).slice(0, Math.min(limit, 10));
    if (!hashes.length) return [];
    const tr = await fetchJson<BcTxResp>(ID, `${base(ctx)}/dashboards/transactions/${hashes.join(",")}${keyParam(ctx)}`);
    if (!tr?.data) throw new ProviderError(ID, "unerwartete Antwortstruktur bei den Transaktionen");
    return hashes.filter((h) => tr.data[h]).map((h) => mapTx(tr.data[h], ctx.chain));
  },
  async getTx(txid, ctx) {
    const r = await fetchJson<BcTxResp>(ID, `${base(ctx)}/dashboards/transaction/${txid}${keyParam(ctx)}`);
    if (!r?.data) throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Transaktion");
    const d = r.data[txid];
    if (!d) throw new ProviderError(ID, "Transaktion nicht gefunden");
    return mapTx(d, ctx.chain);
  },
  async getOutspends(txid, ctx) {
    const r = await fetchJson<BcTxResp>(ID, `${base(ctx)}/dashboards/transaction/${txid}${keyParam(ctx)}`);
    if (!r?.data) throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Transaktion");
    const d = r.data[txid];
    if (!d) throw new ProviderError(ID, "Transaktion nicht gefunden");
    return d.outputs.map((o) => ({ spent: o.is_spent, txid: o.spending_transaction_hash }));
  },
};
