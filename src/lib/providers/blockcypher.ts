import { fetchJson } from "./http";
import { chainMeta, type ChainId } from "../chains";
import type { AddressInfo, ChainProvider, ProviderContext, TxInfo } from "./types";
import { ProviderError, UnsupportedError } from "./types";

interface BcTx {
  hash: string;
  size: number;
  fees: number;
  block_height: number;
  confirmed?: string;
  confirmations: number;
  inputs: { prev_hash?: string; output_index?: number; addresses?: string[]; output_value?: number }[];
  outputs: { value: number; addresses?: string[]; script_type?: string; spent_by?: string }[];
}
interface BcAddressFull {
  address: string;
  balance: number;
  unconfirmed_balance: number;
  total_received: number;
  total_sent: number;
  n_tx: number;
  txs: BcTx[];
}

const ID = "blockcypher";

function base(ctx: ProviderContext): string {
  const path = chainMeta(ctx.chain).blockcypherPath;
  if (!path) throw new UnsupportedError(ID, `Chain ${ctx.chain}`);
  return `https://api.blockcypher.com/v1/${path}/main`;
}

function tokenParam(ctx: ProviderContext) {
  const t = ctx.keys[ID];
  return t ? `&token=${encodeURIComponent(t)}` : "";
}

function mapTx(t: BcTx, chain: ChainId): TxInfo {
  if (!t || !Array.isArray(t.inputs) || !Array.isArray(t.outputs)) {
    throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Transaktion");
  }
  return {
    txid: t.hash,
    chain,
    size: t.size,
    feeSat: t.fees,
    confirmed: t.block_height > 0,
    blockHeight: t.block_height > 0 ? t.block_height : undefined,
    blockTime: t.confirmed ? Math.floor(new Date(t.confirmed).getTime() / 1000) : undefined,
    inputs: t.inputs.map((i) => ({
      txid: i.prev_hash,
      vout: i.output_index,
      coinbase: !i.prev_hash || i.output_index === -1,
      address: i.addresses?.[0],
      valueSat: i.output_value,
    })),
    outputs: t.outputs.map((o, n) => ({
      n,
      address: o.addresses?.[0],
      valueSat: o.value,
      scriptType: o.script_type,
      spent: o.spent_by ? true : undefined,
      spentTxid: o.spent_by,
    })),
    provider: ID,
  };
}

export const blockcypher: ChainProvider = {
  id: ID,
  name: "BlockCypher",
  url: "https://www.blockcypher.com",
  keyRequirement: "optional",
  keyHint: "Kostenloser Token unter https://accounts.blockcypher.com (erhöht das Limit deutlich)",
  rateLimit: "ohne Token: 3 Req/s, 100 Req/h",
  chains: ["bitcoin", "litecoin", "dogecoin"],
  leaksQuery: true,
  async getAddress(address, ctx): Promise<AddressInfo> {
    const a = await fetchJson<BcAddressFull>(ID, `${base(ctx)}/addrs/${address}/balance?x=1${tokenParam(ctx)}`);
    // Ohne die Zahlenfelder entstünden stillschweigend NaN-Salden
    if (!a || typeof a.balance !== "number" || typeof a.total_received !== "number") {
      throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Adresse");
    }
    return {
      address: a.address,
      chain: ctx.chain,
      balanceSat: a.balance + (a.unconfirmed_balance || 0),
      receivedSat: a.total_received,
      sentSat: a.total_sent,
      txCount: a.n_tx,
      provider: ID,
    };
  },
  async getAddressTxs(address, ctx, limit = 50) {
    const a = await fetchJson<BcAddressFull>(
      ID,
      `${base(ctx)}/addrs/${address}/full?limit=${Math.min(limit, 50)}${tokenParam(ctx)}`,
    );
    if (!a || (a.txs !== undefined && !Array.isArray(a.txs))) {
      throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Adressliste");
    }
    return (a.txs || []).map((t) => mapTx(t, ctx.chain));
  },
  async getTx(txid, ctx) {
    const t = await fetchJson<BcTx>(ID, `${base(ctx)}/txs/${txid}?limit=500${tokenParam(ctx)}`);
    return mapTx(t, ctx.chain);
  },
  async getOutspends(txid, ctx) {
    const t = await fetchJson<BcTx>(ID, `${base(ctx)}/txs/${txid}?limit=500${tokenParam(ctx)}`);
    return t.outputs.map((o) => ({ spent: !!o.spent_by, txid: o.spent_by }));
  },
};
