import { fetchJson } from "./http";
import type { AddressInfo, ChainProvider, ProviderContext, TxInfo } from "./types";
import { ProviderError, UnsupportedError } from "./types";

interface BiTx {
  hash: string;
  size: number;
  fee: number;
  time: number;
  /** Bei unbestätigten Transaktionen liefert die Quelle hier null */
  block_height?: number | null;
  inputs: { prev_out?: { addr?: string; value: number; tx_index: number; n: number } | null; coinbase?: boolean }[];
  out: { n: number; addr?: string; value: number; spent: boolean }[];
}

/**
 * Coinbase-Erkennung.
 *
 * Anders als das Feld `coinbase` vermuten lässt, liefert blockchain.info für
 * Coinbase-Eingänge ein `prev_out` mit dem Vorgängerindex 0xffffffff, dem Wert 0
 * und ohne Adresse. Ein fehlendes `prev_out` allein reicht als Kennzeichen also
 * nicht aus.
 */
const COINBASE_VOUT = 4294967295;

function isCoinbaseInput(i: BiTx["inputs"][number]): boolean {
  if (i.coinbase === true) return true;
  if (!i.prev_out) return true;
  return i.prev_out.n === COINBASE_VOUT && !i.prev_out.addr;
}
interface BiAddress {
  address: string;
  final_balance: number;
  total_received: number;
  total_sent: number;
  n_tx: number;
  txs: BiTx[];
}

const ID = "blockchain-info";
const BASE = "https://blockchain.info";

function guard(ctx: ProviderContext) {
  if (ctx.chain !== "bitcoin") throw new UnsupportedError(ID, `Chain ${ctx.chain}`);
}

function mapTx(t: BiTx): TxInfo {
  if (!t || !Array.isArray(t.inputs) || !Array.isArray(t.out)) {
    throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Transaktion");
  }
  return {
    txid: t.hash,
    chain: "bitcoin",
    size: t.size,
    feeSat: t.fee,
    confirmed: !!t.block_height,
    // Unbestätigte Transaktionen liefern null; der Typ erlaubt nur eine Zahl
    blockHeight: typeof t.block_height === "number" ? t.block_height : undefined,
    blockTime: t.time,
    inputs: t.inputs.map((i) => {
      const coinbase = isCoinbaseInput(i);
      return {
        coinbase,
        address: coinbase ? undefined : i.prev_out?.addr,
        valueSat: coinbase ? undefined : i.prev_out?.value,
        vout: coinbase ? undefined : i.prev_out?.n,
      };
    }),
    outputs: t.out.map((o) => ({ n: o.n, address: o.addr, valueSat: o.value, spent: o.spent })),
    provider: ID,
  };
}

export const blockchainInfo: ChainProvider = {
  id: ID,
  name: "Blockchain.com",
  url: "https://www.blockchain.com/explorer",
  keyRequirement: "none",
  rateLimit: "ca. 1 Anfrage / 10 s empfohlen",
  chains: ["bitcoin"],
  leaksQuery: true,
  async getAddress(address, ctx): Promise<AddressInfo> {
    guard(ctx);
    const a = await fetchJson<BiAddress>(ID, `${BASE}/rawaddr/${address}?limit=0`);
    if (!a || typeof a.final_balance !== "number") {
      throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Adresse");
    }
    return {
      address: a.address,
      chain: "bitcoin",
      balanceSat: a.final_balance,
      receivedSat: a.total_received,
      sentSat: a.total_sent,
      txCount: a.n_tx,
      provider: ID,
    };
  },
  async getAddressTxs(address, ctx, limit = 50) {
    guard(ctx);
    const a = await fetchJson<BiAddress>(ID, `${BASE}/rawaddr/${address}?limit=${Math.min(limit, 100)}`);
    if (!a || !Array.isArray(a.txs)) {
      throw new ProviderError(ID, "unerwartete Antwortstruktur bei der Adressliste");
    }
    return a.txs.map(mapTx);
  },
  async getTx(txid, ctx) {
    guard(ctx);
    const t = await fetchJson<BiTx>(ID, `${BASE}/rawtx/${txid}`);
    return mapTx(t);
  },
};
