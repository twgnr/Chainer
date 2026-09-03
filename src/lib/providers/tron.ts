import { createHash } from "crypto";
import { memo } from "../cache";
import { fetchJson } from "./http";
import { ProviderError, UnsupportedError } from "./types";
import type { AddressInfo, ChainProvider, ProviderContext, TxInfo, TxInput, TxOutput } from "./types";
import type { ChainId } from "../chains";

/**
 * Tron-Unterstützung über TronGrid (https://www.trongrid.io).
 *
 * Tron nutzt wie Ethereum ein Konto-Modell: eine Transaktion hat genau einen
 * Absender und einen Empfänger. Sie wird deshalb als TxInfo mit
 * `inputs = [Absender]` und `outputs = [Empfänger]` abgebildet, damit
 * Trace-Engine und Graph unverändert weiterarbeiten können.
 *
 * Native Beträge werden in Sun geführt (kleinste Einheit,
 * CHAINS.tron.decimals = 6). TRC20-Transfers tragen ihren Betrag nicht als
 * `valueSat`, sondern als `token.amount` (Roheinheiten) am Ausgang.
 */

const ID = "trongrid";
const CHAIN: ChainId = "tron";
const DEFAULT_BASE = "https://api.trongrid.io";

/* ------------------------------------------------------------------ */
/* Kleine, defensive Helfer für unbekannte API-Antworten               */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Liefert nur nicht-leere Strings, sonst undefined. */
function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return undefined;
}

/** Wandelt Zahl oder Zahlen-String (auch hex mit 0x) in eine endliche Zahl. */
function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = str(v);
  if (!s) return undefined;
  const n = s.startsWith("0x") || s.startsWith("0X") ? Number.parseInt(s, 16) : Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Roh-Betrag (Sun oder Token-Roheinheiten) als `number`.
 *
 * BigInt parst Dezimalstrings exakt; die anschließende Umwandlung nach
 * `number` verliert oberhalb von 2^53 an Genauigkeit. Das ist bewusst in Kauf
 * genommen, weil die gesamte Abstraktion mit `number` arbeitet und die Werte
 * nur für Anzeige, Gewichtung und Schwellwerte im Graph benutzt werden.
 */
function sunOf(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = str(v);
  if (!s) return 0;
  try {
    return Number(BigInt(s));
  } catch {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
}

/** Millisekunden-Zeitstempel der API -> Unix-Sekunden. */
function msToSeconds(v: unknown): number | undefined {
  const n = num(v);
  if (n === undefined || n <= 0) return undefined;
  return Math.floor(n / 1000);
}

/* ------------------------------------------------------------------ */
/* Base58Check ohne externe Abhängigkeit                               */
/* ------------------------------------------------------------------ */

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Das Build-Ziel ist ES2017; BigInt-Literale (0n) sind dort nicht erlaubt.
const B58_ZERO = BigInt(0);
const B58_BASE = BigInt(58);
const B58_BYTE = BigInt(256);

function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

/** Reine Base58-Kodierung; führende Nullbytes werden zu "1". */
function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  let value = B58_ZERO;
  for (const b of bytes) value = value * B58_BYTE + BigInt(b);

  let body = "";
  while (value > B58_ZERO) {
    body = B58_ALPHABET[Number(value % B58_BASE)] + body;
    value /= B58_BASE;
  }
  return "1".repeat(zeros) + body;
}

/** Reine Base58-Dekodierung; liefert undefined bei ungültigen Zeichen. */
function base58Decode(value: string): Uint8Array | undefined {
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros++;

  let acc = B58_ZERO;
  for (const ch of value) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx < 0) return undefined;
    acc = acc * B58_BASE + BigInt(idx);
  }

  const body: number[] = [];
  while (acc > B58_ZERO) {
    body.unshift(Number(acc % B58_BYTE));
    acc /= B58_BYTE;
  }
  const out = new Uint8Array(zeros + body.length);
  out.set(body, zeros);
  return out;
}

/** Hex-String -> Bytes; liefert undefined bei ungerader Länge oder Nicht-Hex. */
function hexToBytes(hex: string): Uint8Array | undefined {
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (h.length === 0 || h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) return undefined;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** base58check(bytes) = Base58 von `bytes || sha256(sha256(bytes)).slice(0, 4)` */
function base58Check(bytes: Uint8Array): string {
  const checksum = sha256(sha256(bytes)).slice(0, 4);
  const full = new Uint8Array(bytes.length + 4);
  full.set(bytes, 0);
  full.set(checksum, bytes.length);
  return base58Encode(full);
}

/**
 * Tron-Adresse aus den Rohdaten (Hex mit Präfix "41", 21 Byte) nach Base58Check.
 * Ist der Wert bereits Base58 ("T…"), wird er unverändert zurückgegeben; die
 * v1-Endpunkte liefern `from`/`to` schon in dieser Form.
 */
function hexToBase58(value: unknown): string | undefined {
  const s = str(value);
  if (!s) return undefined;
  if (s.startsWith("T")) return s;
  const raw = s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
  // 20-Byte-Adressen (etwa aus TRC20-Aufrufdaten) bekommen das Tron-Präfix 41.
  const hex = raw.length === 40 ? `41${raw}` : raw;
  const bytes = hexToBytes(hex);
  if (!bytes || bytes.length !== 21 || bytes[0] !== 0x41) return undefined;
  return base58Check(bytes);
}

/** Gegenrichtung: Base58Check-Adresse -> Hex mit Präfix "41" (ohne Prüfsumme). */
export function base58ToHex(value: string): string | undefined {
  const bytes = base58Decode(value.trim());
  if (!bytes || bytes.length !== 25) return undefined;
  const body = bytes.slice(0, 21);
  const expected = sha256(sha256(body)).slice(0, 4);
  for (let i = 0; i < 4; i++) if (expected[i] !== bytes[21 + i]) return undefined;
  return bytesToHex(body);
}

/* ------------------------------------------------------------------ */
/* Basis-URL, Header, Anfragen                                         */
/* ------------------------------------------------------------------ */

function baseUrl(ctx: ProviderContext): string {
  const fromConfig = str(ctx.config.trongrid?.baseUrl);
  const fromEnv = str(process.env.TRONGRID_BASE_URL);
  return (fromConfig ?? fromEnv ?? DEFAULT_BASE).replace(/\/+$/, "");
}

/** Mit API-Key erlaubt TronGrid deutlich mehr Anfragen; ohne Key geht es auch. */
function headers(ctx: ProviderContext): Record<string, string> {
  const key = str(ctx.keys.trongrid);
  return key ? { "TRON-PRO-API-KEY": key } : {};
}

/** Wirft, sobald der Provider für eine fremde Chain benutzt wird. */
function ensureChain(ctx: ProviderContext): void {
  if (ctx.chain !== CHAIN) throw new UnsupportedError(ID, `Chain ${ctx.chain}`);
}

function get<T>(ctx: ProviderContext, url: string): Promise<T> {
  return fetchJson<T>(ID, url, { headers: headers(ctx) });
}

function post<T>(ctx: ProviderContext, url: string, body: Record<string, unknown>): Promise<T> {
  return fetchJson<T>(ID, url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers(ctx) },
    body: JSON.stringify(body),
  });
}

/** `data`-Feld der v1-Endpunkte als Array. */
function dataItems(res: unknown): unknown[] {
  return isRecord(res) ? asArray(res.data) : [];
}

/* ------------------------------------------------------------------ */
/* Mapping Tron -> TxInfo                                              */
/* ------------------------------------------------------------------ */

interface TokenTransfer {
  from?: string;
  to?: string;
  symbol: string;
  contract: string;
  decimals: number;
  /** Roh-Betrag als String (ohne Umrechnung der Dezimalstellen) */
  amount: string;
}

/** Zusatzdaten aus /wallet/gettransactioninfobyid. */
interface TxMeta {
  blockHeight?: number;
  blockTime?: number;
  feeSat?: number;
  failed?: boolean;
}

/** Kennung von `transfer(address,uint256)` in den Aufrufdaten eines Contracts. */
const TRC20_TRANSFER_SELECTOR = "a9059cbb";

/**
 * Zerlegt die Aufrufdaten eines TriggerSmartContract. Ohne zusätzlichen
 * Contract-Aufruf sind Symbol und Dezimalstellen des Tokens nicht bekannt;
 * es bleibt daher beim Platzhalter "TRC20" und den auf Tron üblichen sechs
 * Dezimalstellen. Der TRC20-Listenendpunkt liefert diese Angaben dagegen mit.
 */
function parseTrc20Call(contractHex: unknown, ownerHex: unknown, data: unknown): TokenTransfer | undefined {
  const raw = str(data)?.toLowerCase();
  const contract = hexToBase58(contractHex);
  if (!raw || !contract) return undefined;
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!hex.startsWith(TRC20_TRANSFER_SELECTOR) || hex.length < 8 + 64 + 64) return undefined;

  const toWord = hex.slice(8, 8 + 64);
  const amountWord = hex.slice(8 + 64, 8 + 128);
  // Die Adresse steht in den letzten 20 Byte des 32-Byte-Wortes.
  const to = hexToBase58(toWord.slice(24));
  let amount = "0";
  try {
    amount = BigInt(`0x${amountWord}`).toString(10);
  } catch {
    amount = "0";
  }

  return { from: hexToBase58(ownerHex), to, symbol: "TRC20", contract, decimals: 6, amount };
}

/** Ergebnis der Analyse von `raw_data.contract[0]`. */
interface ContractInfo {
  type?: string;
  from?: string;
  to?: string;
  /** Nativer Betrag in Sun */
  amount: number;
  token?: TokenTransfer;
}

function readContract(rawData: unknown): ContractInfo {
  const contracts = isRecord(rawData) ? asArray(rawData.contract) : [];
  const first = contracts[0];
  if (!isRecord(first)) return { amount: 0 };

  const type = str(first.type);
  const parameter = isRecord(first.parameter) ? first.parameter : {};
  const value = isRecord(parameter.value) ? parameter.value : {};
  // In den Rohdaten sind owner_address/to_address Hex mit Präfix 41.
  const from = hexToBase58(value.owner_address);

  if (type === "TriggerSmartContract") {
    const token = parseTrc20Call(value.contract_address, value.owner_address, value.data);
    return { type, from, to: token?.to ?? hexToBase58(value.contract_address), amount: 0, token };
  }

  // TransferContract (TRX) und TransferAssetContract (TRC10) tragen `amount`.
  return { type, from, to: hexToBase58(value.to_address), amount: sunOf(value.amount) };
}

/** Baut aus einer Roh-Transaktion und optionalen Zusatzdaten eine TxInfo. */
function buildTxInfo(raw: unknown, extra: TxMeta = {}): TxInfo | undefined {
  if (!isRecord(raw)) return undefined;
  const txid = (str(raw.txID) ?? str(raw.txid) ?? str(raw.id))?.toLowerCase();
  if (!txid) return undefined;

  const info = readContract(raw.raw_data);

  // `ret[0]` trägt in Listen-Antworten Ergebnis und Gebühr der Transaktion.
  const ret = asArray(raw.ret)[0];
  const retRec = isRecord(ret) ? ret : {};
  const contractRet = str(retRec.contractRet);

  const blockHeight = extra.blockHeight ?? num(raw.blockNumber);
  const blockTime = extra.blockTime ?? msToSeconds(raw.block_timestamp) ?? msToSeconds(raw.blockTimeStamp);
  const feeSat = extra.feeSat ?? num(retRec.fee);
  const failed = extra.failed ?? (contractRet !== undefined && contractRet !== "SUCCESS");

  const inputs: TxInput[] = [];
  const outputs: TxOutput[] = [];

  if (info.token) {
    // TRC20: der native Betrag ist 0, der Token-Betrag hängt am Ausgang.
    inputs.push({ address: info.token.from ?? info.from, valueSat: 0 });
    outputs.push({
      n: 0,
      address: info.token.to,
      valueSat: 0,
      token: {
        symbol: info.token.symbol,
        contract: info.token.contract,
        decimals: info.token.decimals,
        amount: info.token.amount,
      },
    });
  } else {
    inputs.push({ address: info.from, valueSat: info.amount });
    outputs.push({ n: 0, address: info.to, valueSat: info.amount });
  }

  return {
    txid,
    chain: CHAIN,
    blockHeight,
    blockTime,
    confirmed: blockHeight !== undefined,
    feeSat,
    inputs,
    outputs,
    provider: ID,
    failed: failed || undefined,
  };
}

/** Ein Eintrag des TRC20-Endpunkts -> TxInfo. */
function trc20ToTxInfo(raw: unknown): TxInfo | undefined {
  if (!isRecord(raw)) return undefined;
  const txid = str(raw.transaction_id)?.toLowerCase();
  if (!txid) return undefined;

  const tokenInfo = isRecord(raw.token_info) ? raw.token_info : {};
  const contract = hexToBase58(tokenInfo.address) ?? str(tokenInfo.address) ?? "";
  const blockTime = msToSeconds(raw.block_timestamp);
  const blockHeight = num(raw.block);

  return {
    txid,
    chain: CHAIN,
    blockHeight,
    blockTime,
    // Der TRC20-Endpunkt liefert nur aufgezeichnete (also bestätigte) Transfers,
    // eine Blockhöhe aber nicht immer; deshalb genügt hier der Zeitstempel.
    confirmed: blockHeight !== undefined || blockTime !== undefined,
    inputs: [{ address: hexToBase58(raw.from), valueSat: 0 }],
    outputs: [
      {
        n: 0,
        address: hexToBase58(raw.to),
        valueSat: 0,
        token: {
          symbol: str(tokenInfo.symbol) ?? "TRC20",
          contract,
          decimals: num(tokenInfo.decimals) ?? 6,
          amount: str(raw.value) ?? "0",
        },
      },
    ],
    provider: ID,
  };
}

/** Summiert Ein- und Ausgänge einer Adresse über die geladenen Transaktionen. */
function sumFlows(address: string, txs: TxInfo[]): { receivedSat: number; sentSat: number } {
  let receivedSat = 0;
  let sentSat = 0;
  for (const tx of txs) {
    for (const o of tx.outputs) if (o.address === address) receivedSat += o.valueSat;
    for (const i of tx.inputs) if (i.address === address) sentSat += i.valueSat ?? 0;
  }
  return { receivedSat, sentSat };
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const trongrid: ChainProvider = {
  id: ID,
  name: "TronGrid",
  url: "https://www.trongrid.io",
  keyRequirement: "optional",
  keyHint: "Kostenloser API-Key erhöht das Limit: https://www.trongrid.io",
  rateLimit: "ohne Key ca. 15 Anfragen/s",
  chains: [CHAIN],
  leaksQuery: true,
  configFields: [{ key: "baseUrl", label: "Basis-URL der API", placeholder: DEFAULT_BASE }],

  async getAddress(address, ctx): Promise<AddressInfo> {
    ensureChain(ctx);
    const base = baseUrl(ctx);
    const addr = address.trim();

    const res = await memo(`tron:acct:${base}:${addr}`, 30_000, () =>
      get<unknown>(ctx, `${base}/v1/accounts/${encodeURIComponent(addr)}`),
    );
    const account = dataItems(res)[0];
    const balanceSat = isRecord(account) ? sunOf(account.balance) : 0;

    // TronGrid liefert weder kumulierte Summen noch einen Transaktionszähler.
    // `receivedSat`, `sentSat` und `txCount` decken deshalb nur die hier
    // geladene Auswahl der neuesten Transaktionen ab, nicht die vollständige
    // Historie der Adresse. Der Saldo stammt dagegen aus dem Konto-Endpunkt und
    // ist vollständig.
    let receivedSat = 0;
    let sentSat = 0;
    let txCount = 0;
    try {
      const txs = await this.getAddressTxs(addr, ctx, 50);
      const flows = sumFlows(addr, txs);
      receivedSat = flows.receivedSat;
      sentSat = flows.sentSat;
      txCount = txs.length;
    } catch {
      // bewusst ignoriert: der Saldo stimmt auch ohne Transaktionsliste.
    }

    return { address: addr, chain: CHAIN, balanceSat, receivedSat, sentSat, txCount, provider: ID };
  },

  async getAddressTxs(address, ctx, limit = 50): Promise<TxInfo[]> {
    ensureChain(ctx);
    const base = baseUrl(ctx);
    const addr = address.trim();
    // TronGrid begrenzt `limit` je Seite auf 200.
    const perPage = Math.min(Math.max(limit, 1), 200);
    const query = `limit=${perPage}&order_by=block_timestamp,desc`;
    const path = `${base}/v1/accounts/${encodeURIComponent(addr)}/transactions`;

    // Nacheinander abfragen: ohne API-Key erlaubt TronGrid nur wenige Anfragen
    // pro Sekunde, parallele Aufrufe laufen sonst in ein HTTP 429. Ein Ausfall
    // einer der beiden Listen soll die andere nicht mitreißen; schlagen beide
    // fehl, wird der Fehler weitergereicht statt eine leere Liste vorzutäuschen.
    let firstError: unknown;
    const native = await get<unknown>(ctx, `${path}?${query}`).catch((e: unknown) => {
      firstError = e;
      return undefined;
    });
    const tokens = await get<unknown>(ctx, `${path}/trc20?${query}`).catch((e: unknown) => {
      firstError ??= e;
      return undefined;
    });
    if (native === undefined && tokens === undefined) {
      throw firstError instanceof Error ? firstError : new ProviderError(ID, "Transaktionsliste nicht abrufbar");
    }

    // TRX- und TRC20-Transfers zusammenführen. Ein TRC20-Transfer taucht in
    // beiden Listen auf; der TRC20-Endpunkt kennt Symbol und Dezimalstellen des
    // Tokens und gewinnt deshalb bei gleicher Transaktions-ID.
    const byTxid = new Map<string, TxInfo>();
    for (const item of dataItems(native)) {
      const tx = buildTxInfo(item);
      if (tx) byTxid.set(tx.txid, tx);
    }
    for (const item of dataItems(tokens)) {
      const tx = trc20ToTxInfo(item);
      if (!tx) continue;
      // Block und Gebühr stehen nur in der nativen Liste.
      const native = byTxid.get(tx.txid);
      byTxid.set(tx.txid, {
        ...tx,
        blockHeight: tx.blockHeight ?? native?.blockHeight,
        feeSat: tx.feeSat ?? native?.feeSat,
        failed: tx.failed ?? native?.failed,
      });
    }

    // Neueste zuerst, dann auf das gewünschte Limit kürzen.
    const out = [...byTxid.values()].sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
    return out.slice(0, limit);
  },

  async getTx(txid, ctx): Promise<TxInfo> {
    ensureChain(ctx);
    const base = baseUrl(ctx);
    const id = txid.trim().toLowerCase();

    const [raw, info] = await Promise.all([
      post<unknown>(ctx, `${base}/wallet/gettransactionbyid`, { value: id }),
      // Die Zusatzinfos (Gebühr, Block, Ergebnis) sind hilfreich, aber optional.
      post<unknown>(ctx, `${base}/wallet/gettransactioninfobyid`, { value: id }).catch(() => undefined),
    ]);

    const meta: TxMeta = {};
    if (isRecord(info)) {
      meta.blockHeight = num(info.blockNumber);
      meta.blockTime = msToSeconds(info.blockTimeStamp);
      meta.feeSat = num(info.fee);
      const result = isRecord(info.receipt) ? str(info.receipt.result) : undefined;
      if (result !== undefined) meta.failed = result !== "SUCCESS";
    }

    const tx = buildTxInfo(raw, meta);
    if (!tx) throw new ProviderError(ID, "Transaktion nicht gefunden");
    return tx;
  },
};
