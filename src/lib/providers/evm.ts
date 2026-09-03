import { fetchJson } from "./http";
import { ProviderError } from "./types";
import type { AddressInfo, ChainProvider, ProviderContext, TxInfo, TxInput, TxOutput } from "./types";
import type { ChainId } from "../chains";

/**
 * Ethereum-Unterstützung über die UTXO-artige Provider-Abstraktion.
 *
 * Eine EVM-Transaktion hat genau einen Absender und einen Empfänger; sie wird
 * deshalb als TxInfo mit `inputs = [Absender]` und `outputs = [Empfänger, …]`
 * abgebildet. Token-Transfers und interne Transfers erscheinen als zusätzliche
 * Outputs, damit Trace-Engine und Graph unverändert weiterarbeiten können.
 *
 * Alle Beträge werden in Wei geführt (kleinste Einheit, CHAINS.ethereum.decimals = 18).
 */

const CHAIN: ChainId = "ethereum";

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

/** Wandelt Zahl oder Zahlen-String (auch hex) in eine endliche Zahl, sonst undefined. */
function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = str(v);
  if (!s) return undefined;
  const n = s.startsWith("0x") || s.startsWith("0X") ? Number.parseInt(s, 16) : Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Wei-Betrag als `number`.
 *
 * BigInt parst sowohl Hex ("0x…") als auch Dezimalstrings exakt; die
 * anschließende Umwandlung nach `number` verliert oberhalb von 2^53 Wei
 * (etwa 0,009 ETH) an Genauigkeit. Das ist bewusst in Kauf genommen, weil die
 * gesamte Abstraktion mit `number` arbeitet und die Werte nur für Anzeige,
 * Gewichtung und Schwellwerte im Graph benutzt werden.
 */
function weiToNumber(v: string | number): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = v.trim();
  if (!s) return 0;
  try {
    return Number(BigInt(s));
  } catch {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
}

/** Wei-Betrag aus einem beliebigen (unbekannten) Feld. */
function weiOf(v: unknown): number {
  if (typeof v === "number" || typeof v === "string") return weiToNumber(v);
  return 0;
}

/** Adressen immer klein schreiben, damit Graph-Knoten zusammenfallen. */
function lc(v: unknown): string | undefined {
  const s = str(v);
  return s ? s.toLowerCase() : undefined;
}

/** Blockscout liefert Adressen als `{ hash: "0x…" }`, Etherscan als String. */
function addrOf(v: unknown): string | undefined {
  if (isRecord(v)) return lc(v.hash ?? v.address ?? v.address_hash);
  return lc(v);
}

/** ISO-8601-Zeit ("2024-01-01T00:00:00.000000Z") -> Unix-Sekunden. */
function isoToUnix(v: unknown): number | undefined {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

/* ------------------------------------------------------------------ */
/* Gemeinsames Mapping EVM -> TxInfo                                   */
/* ------------------------------------------------------------------ */

/** Normalisierte EVM-Transaktion, aus der beide Provider ihre TxInfo bauen. */
interface EvmTxCore {
  hash: string;
  from?: string;
  to?: string;
  /** Nativer Betrag in Wei */
  value: number;
  blockHeight?: number;
  blockTime?: number;
  feeSat?: number;
  failed?: boolean;
  /** Bei Contract-Erstellung die erzeugte Adresse */
  contractCreated?: string;
}

interface EvmTokenTransfer {
  from?: string;
  to?: string;
  symbol: string;
  contract: string;
  decimals: number;
  /** Roh-Betrag als String (ohne Umrechnung der Dezimalstellen) */
  amount: string;
}

interface EvmInternalTransfer {
  from?: string;
  to?: string;
  value: number;
}

/**
 * Baut aus Kerntransaktion, Token-Transfers und internen Transfers eine TxInfo.
 * Reihenfolge der Outputs: nativer Transfer, dann Token, dann interne Transfers.
 */
function buildTxInfo(
  provider: string,
  core: EvmTxCore,
  tokens: EvmTokenTransfer[] = [],
  internals: EvmInternalTransfer[] = [],
): TxInfo {
  const inputs: TxInput[] = [{ address: core.from, valueSat: core.value }];
  const seenSenders = new Set<string>(core.from ? [core.from] : []);

  const outputs: TxOutput[] = [];
  let n = 0;

  // Nativer Transfer bzw. Contract-Erstellung
  const isCreation = !core.to && !!core.contractCreated;
  outputs.push({
    n: n++,
    address: core.to ?? core.contractCreated,
    valueSat: core.value,
    ...(isCreation ? { scriptType: "contract-creation" } : {}),
  });

  // Token-Transfers: eigener Output je Transfer, nativer Wert bleibt 0.
  for (const t of tokens) {
    outputs.push({
      n: n++,
      address: t.to,
      valueSat: 0,
      token: { symbol: t.symbol, contract: t.contract, decimals: t.decimals, amount: t.amount },
    });
    // Abweichender Token-Absender (z. B. Transfer über einen Router) wird als
    // zusätzlicher Input aufgenommen, damit die Kante im Graph korrekt startet.
    if (t.from && !seenSenders.has(t.from)) {
      seenSenders.add(t.from);
      inputs.push({ address: t.from, valueSat: 0 });
    }
  }

  // Interne Transfers (Contract-Calls, die ETH bewegen)
  for (const i of internals) {
    outputs.push({ n: n++, address: i.to, valueSat: i.value, internal: true });
    if (i.from && !seenSenders.has(i.from)) {
      seenSenders.add(i.from);
      inputs.push({ address: i.from, valueSat: 0 });
    }
  }

  return {
    txid: core.hash,
    chain: CHAIN,
    blockHeight: core.blockHeight,
    blockTime: core.blockTime,
    confirmed: core.blockHeight !== undefined,
    feeSat: core.feeSat,
    inputs,
    outputs,
    provider,
    ...(core.failed ? { failed: true } : {}),
  };
}

/** Summiert Ein- und Ausgänge einer Adresse aus bereits geladenen Transaktionen. */
function sumFlows(address: string, txs: TxInfo[]): { receivedSat: number; sentSat: number } {
  const a = address.toLowerCase();
  let receivedSat = 0;
  let sentSat = 0;
  for (const tx of txs) {
    for (const o of tx.outputs) if (o.address === a) receivedSat += o.valueSat || 0;
    for (const i of tx.inputs) if (i.address === a) sentSat += i.valueSat || 0;
  }
  return { receivedSat, sentSat };
}

/* ================================================================== */
/* Blockscout                                                          */
/* ================================================================== */

const BS_ID = "blockscout";
const BS_DEFAULT_BASE = "https://eth.blockscout.com/api/v2";

function bsBase(ctx: ProviderContext): string {
  const cfg = ctx.config?.[BS_ID]?.baseUrl;
  const base = str(cfg) || str(process.env.BLOCKSCOUT_BASE_URL) || BS_DEFAULT_BASE;
  return base.replace(/\/+$/, "");
}

interface BsPage {
  items: unknown[];
  nextPageParams?: Record<string, string>;
}

/** Wandelt `next_page_params` in Query-Parameter um (nur skalare Werte). */
function bsNextParams(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") out[k] = String(val);
  }
  return Object.keys(out).length ? out : undefined;
}

async function bsGetPage(url: string, params: Record<string, string>): Promise<BsPage> {
  const q = new URLSearchParams(params).toString();
  const data = await fetchJson<unknown>(BS_ID, q ? `${url}?${q}` : url);
  if (!isRecord(data)) return { items: [] };
  return { items: asArray(data.items), nextPageParams: bsNextParams(data.next_page_params) };
}

/** Lädt bis zu `maxPages` Seiten und bricht ab, sobald `limit` Einträge vorliegen. */
async function bsGetItems(
  url: string,
  params: Record<string, string>,
  limit: number,
  maxPages = 3,
): Promise<unknown[]> {
  const items: unknown[] = [];
  let next: Record<string, string> | undefined = params;
  for (let page = 0; page < maxPages && next; page++) {
    const res: BsPage = await bsGetPage(url, next);
    items.push(...res.items);
    if (items.length >= limit || !res.nextPageParams) break;
    next = { ...params, ...res.nextPageParams };
  }
  return items.slice(0, limit);
}

/** Blockscout-Transaktion -> normalisierte Kerntransaktion. */
function bsCore(raw: unknown): EvmTxCore | undefined {
  if (!isRecord(raw)) return undefined;
  const hash = str(raw.hash);
  if (!hash) return undefined;
  const fee = isRecord(raw.fee) ? weiOf(raw.fee.value) : undefined;
  const status = str(raw.status)?.toLowerCase();
  const failed = status === "error" || num(raw.status) === 0 || str(raw.result)?.toLowerCase() === "error";
  return {
    hash,
    from: addrOf(raw.from),
    to: addrOf(raw.to),
    value: weiOf(raw.value),
    blockHeight: num(raw.block_number) ?? num(raw.block),
    blockTime: isoToUnix(raw.timestamp),
    feeSat: fee,
    failed: failed || undefined,
    contractCreated: addrOf(raw.created_contract),
  };
}

/** Blockscout-Token-Transfer -> normalisierter Token-Transfer. */
function bsToken(raw: unknown): { txHash?: string; transfer: EvmTokenTransfer } | undefined {
  if (!isRecord(raw)) return undefined;
  const token: Record<string, unknown> = isRecord(raw.token) ? raw.token : {};
  const total: Record<string, unknown> = isRecord(raw.total) ? raw.total : {};
  const contract = addrOf(token.address ?? token.address_hash);
  if (!contract) return undefined;
  return {
    txHash: str(raw.transaction_hash) ?? str(raw.tx_hash),
    transfer: {
      from: addrOf(raw.from),
      to: addrOf(raw.to),
      symbol: str(token.symbol) ?? str(token.name) ?? "TOKEN",
      contract,
      // NFTs liefern statt `value` eine `token_id`; beides bleibt Roh-String.
      decimals: num(total.decimals) ?? num(token.decimals) ?? 18,
      amount: str(total.value) ?? str(total.token_id) ?? "0",
    },
  };
}

/** Blockscout-Internal-Transaction -> normalisierter interner Transfer. */
function bsInternal(raw: unknown): EvmInternalTransfer | undefined {
  if (!isRecord(raw)) return undefined;
  const from = addrOf(raw.from);
  const to = addrOf(raw.to) ?? addrOf(raw.created_contract);
  if (!from && !to) return undefined;
  return { from, to, value: weiOf(raw.value) };
}

export const blockscout: ChainProvider = {
  id: BS_ID,
  name: "Blockscout",
  url: "https://eth.blockscout.com",
  keyRequirement: "none",
  rateLimit: "Fair use, ohne Key",
  chains: [CHAIN],
  leaksQuery: true,
  configFields: [{ key: "baseUrl", label: "Basis-URL der API", placeholder: BS_DEFAULT_BASE }],

  async getAddress(address, ctx): Promise<AddressInfo> {
    const base = bsBase(ctx);
    const addr = address.toLowerCase();
    const data = await fetchJson<unknown>(BS_ID, `${base}/addresses/${addr}`);
    const rec: Record<string, unknown> = isRecord(data) ? data : {};
    const balanceSat = weiOf(rec.coin_balance);

    // Die Zähler liegen in einem eigenen Endpunkt; ein Fehler ist nicht kritisch.
    let txCount = 0;
    try {
      const counters = await fetchJson<unknown>(BS_ID, `${base}/addresses/${addr}/counters`);
      if (isRecord(counters)) txCount = num(counters.transactions_count) ?? 0;
    } catch {
      txCount = 0;
    }

    // Blockscout liefert keine kumulierten Ein-/Ausgänge. Wir schätzen sie aus
    // den geladenen Transaktionen; sind keine Daten abrufbar, bleibt es bei 0.
    let receivedSat = 0;
    let sentSat = 0;
    try {
      const txs = await this.getAddressTxs(addr, ctx, 50);
      const flows = sumFlows(addr, txs);
      receivedSat = flows.receivedSat;
      sentSat = flows.sentSat;
      if (!txCount) txCount = txs.length;
    } catch {
      // bewusst ignoriert: Salden bleiben 0, die Balance stimmt trotzdem.
    }

    return { address: addr, chain: CHAIN, balanceSat, receivedSat, sentSat, txCount, provider: BS_ID };
  },

  async getAddressTxs(address, ctx, limit = 50): Promise<TxInfo[]> {
    const base = bsBase(ctx);
    const addr = address.toLowerCase();
    // Ohne `filter` liefert Blockscout ein- und ausgehende Transaktionen zusammen;
    // der Wert "to|from" wird von der API abgelehnt.
    const raw = await bsGetItems(`${base}/addresses/${addr}/transactions`, {}, limit, 3);

    const cores: EvmTxCore[] = [];
    for (const item of raw) {
      const c = bsCore(item);
      if (c) cores.push(c);
    }

    // Token-Transfers der Adresse (nur erste Seite) den Transaktionen zuordnen.
    // Transfers ohne passende Transaktion werden verworfen.
    const tokensByTx = new Map<string, EvmTokenTransfer[]>();
    try {
      const tt = await bsGetItems(`${base}/addresses/${addr}/token-transfers`, {}, Math.max(limit, 50), 1);
      for (const item of tt) {
        const parsed = bsToken(item);
        if (!parsed?.txHash) continue;
        const key = parsed.txHash.toLowerCase();
        const list = tokensByTx.get(key);
        if (list) list.push(parsed.transfer);
        else tokensByTx.set(key, [parsed.transfer]);
      }
    } catch {
      // Token-Transfers sind optional; ohne sie bleiben die nativen Transfers.
    }

    return cores.map((c) => buildTxInfo(BS_ID, c, tokensByTx.get(c.hash.toLowerCase()) ?? []));
  },

  async getTx(txid, ctx): Promise<TxInfo> {
    const base = bsBase(ctx);
    const data = await fetchJson<unknown>(BS_ID, `${base}/transactions/${txid}`);
    const core = bsCore(data);
    if (!core) throw new ProviderError(BS_ID, "Transaktion nicht gefunden");

    const tokens: EvmTokenTransfer[] = [];
    try {
      const res = await bsGetPage(`${base}/transactions/${txid}/token-transfers`, {});
      for (const item of res.items) {
        const parsed = bsToken(item);
        if (parsed) tokens.push(parsed.transfer);
      }
    } catch {
      // ohne Token-Transfers weitermachen
    }

    const internals: EvmInternalTransfer[] = [];
    try {
      const res = await bsGetPage(`${base}/transactions/${txid}/internal-transactions`, {});
      for (const item of res.items) {
        const parsed = bsInternal(item);
        if (parsed) internals.push(parsed);
      }
    } catch {
      // interne Transfers sind optional
    }

    return buildTxInfo(BS_ID, core, tokens, internals);
  },
  // getOutspends bleibt bewusst unimplementiert: EVM kennt keine UTXOs.
};

/* ================================================================== */
/* Etherscan (V2-API)                                                  */
/* ================================================================== */

const ES_ID = "etherscan";
const ES_BASE = "https://api.etherscan.io/v2/api";
const ES_CHAIN_ID = "1";

function esUrl(ctx: ProviderContext, params: Record<string, string>): string {
  const key = ctx.keys[ES_ID];
  if (!key) throw new ProviderError(ES_ID, "API-Key fehlt");
  const q = new URLSearchParams({ chainid: ES_CHAIN_ID, ...params, apikey: key });
  return `${ES_BASE}?${q.toString()}`;
}

/** Antworten mit `module=account`: `{ status, message, result }`. */
async function esAccount(ctx: ProviderContext, params: Record<string, string>): Promise<unknown> {
  const data = await fetchJson<unknown>(ES_ID, esUrl(ctx, { module: "account", ...params }));
  if (!isRecord(data)) throw new ProviderError(ES_ID, "Unerwartete Antwort");
  const status = str(data.status);
  const message = str(data.message) ?? "";
  // "No transactions found" ist ein gültiges Leerergebnis, kein Fehler.
  if (status === "0" && !/^No (transactions|records) found/i.test(message)) {
    throw new ProviderError(ES_ID, str(data.result) ?? (message || "Anfrage fehlgeschlagen"));
  }
  return data.result;
}

/** Antworten mit `module=proxy`: `{ jsonrpc, id, result }` bzw. `{ error }`. */
async function esProxy(ctx: ProviderContext, params: Record<string, string>): Promise<unknown> {
  const data = await fetchJson<unknown>(ES_ID, esUrl(ctx, { module: "proxy", ...params }));
  if (!isRecord(data)) throw new ProviderError(ES_ID, "Unerwartete Antwort");
  if (isRecord(data.error)) throw new ProviderError(ES_ID, str(data.error.message) ?? "RPC-Fehler");
  return data.result;
}

/** Zeitstempel von Etherscan (Unix-Sekunden als String). */
function esTime(v: unknown): number | undefined {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
}

/** Eintrag aus `action=txlist` -> Kerntransaktion. */
function esListCore(raw: unknown): EvmTxCore | undefined {
  if (!isRecord(raw)) return undefined;
  const hash = str(raw.hash);
  if (!hash) return undefined;
  const gasUsed = num(raw.gasUsed);
  const gasPrice = weiOf(raw.gasPrice);
  const to = addrOf(raw.to);
  const created = addrOf(raw.contractAddress);
  return {
    hash,
    from: addrOf(raw.from),
    to,
    value: weiOf(raw.value),
    blockHeight: num(raw.blockNumber),
    blockTime: esTime(raw.timeStamp),
    feeSat: gasUsed !== undefined ? gasUsed * gasPrice : undefined,
    failed: str(raw.isError) === "1" || str(raw.txreceipt_status) === "0" || undefined,
    contractCreated: to ? undefined : created,
  };
}

/** Eintrag aus `action=tokentx` -> Token-Transfer samt Hülle für die Transaktion. */
function esTokenEntry(raw: unknown): { hash: string; core: EvmTxCore; transfer: EvmTokenTransfer } | undefined {
  if (!isRecord(raw)) return undefined;
  const hash = str(raw.hash);
  const contract = addrOf(raw.contractAddress);
  if (!hash || !contract) return undefined;
  const gasUsed = num(raw.gasUsed);
  const gasPrice = weiOf(raw.gasPrice);
  return {
    hash,
    core: {
      hash,
      from: addrOf(raw.from),
      // Bei reinen Token-Transfers ist der Contract der Empfänger der Transaktion.
      to: contract,
      value: 0,
      blockHeight: num(raw.blockNumber),
      blockTime: esTime(raw.timeStamp),
      feeSat: gasUsed !== undefined ? gasUsed * gasPrice : undefined,
    },
    transfer: {
      from: addrOf(raw.from),
      to: addrOf(raw.to),
      symbol: str(raw.tokenSymbol) ?? str(raw.tokenName) ?? "TOKEN",
      contract,
      decimals: num(raw.tokenDecimal) ?? 18,
      amount: str(raw.value) ?? "0",
    },
  };
}

export const etherscan: ChainProvider = {
  id: ES_ID,
  name: "Etherscan",
  url: "https://etherscan.io",
  keyRequirement: "required",
  keyHint: "Kostenloser API-Key: https://etherscan.io/myapikey",
  rateLimit: "Free-Tier: 5 Req/s, 100.000 Req/Tag",
  chains: [CHAIN],
  leaksQuery: true,

  async getAddress(address, ctx): Promise<AddressInfo> {
    const addr = address.toLowerCase();
    const balanceSat = weiOf(await esAccount(ctx, { action: "balance", address: addr, tag: "latest" }));

    // Die Nonce entspricht der Anzahl gesendeter Transaktionen.
    let nonce: number | undefined;
    try {
      nonce = num(await esProxy(ctx, { action: "eth_getTransactionCount", address: addr, tag: "latest" }));
    } catch {
      nonce = undefined;
    }

    // Kumulierte Ein-/Ausgänge liefert die API nicht; aus den zuletzt
    // geladenen Transaktionen geschätzt, sonst 0.
    let receivedSat = 0;
    let sentSat = 0;
    let txCount = nonce ?? 0;
    try {
      const txs = await this.getAddressTxs(addr, ctx, 50);
      const flows = sumFlows(addr, txs);
      receivedSat = flows.receivedSat;
      sentSat = flows.sentSat;
      if (!txCount) txCount = txs.length;
    } catch {
      // Salden bleiben 0
    }

    return { address: addr, chain: CHAIN, balanceSat, receivedSat, sentSat, txCount, provider: ES_ID, nonce };
  },

  async getAddressTxs(address, ctx, limit = 50): Promise<TxInfo[]> {
    const addr = address.toLowerCase();
    const page: Record<string, string> = {
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: String(Math.max(1, Math.min(limit, 100))),
      sort: "desc",
    };

    const [normal, tokens] = await Promise.all([
      esAccount(ctx, { action: "txlist", address: addr, ...page }).catch((): unknown => []),
      esAccount(ctx, { action: "tokentx", address: addr, ...page }).catch((): unknown => []),
    ]);

    const cores = new Map<string, EvmTxCore>();
    const tokensByTx = new Map<string, EvmTokenTransfer[]>();

    for (const item of asArray(normal)) {
      const c = esListCore(item);
      if (c) cores.set(c.hash.toLowerCase(), c);
    }

    for (const item of asArray(tokens)) {
      const parsed = esTokenEntry(item);
      if (!parsed) continue;
      const key = parsed.hash.toLowerCase();
      // Nur wenn die Transaktion nicht schon aus txlist bekannt ist, wird eine
      // Hülle angelegt (Transfers, die die Adresse nicht selbst gesendet hat).
      if (!cores.has(key)) cores.set(key, parsed.core);
      const list = tokensByTx.get(key);
      if (list) list.push(parsed.transfer);
      else tokensByTx.set(key, [parsed.transfer]);
    }

    return [...cores.values()]
      .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0) || (b.blockHeight ?? 0) - (a.blockHeight ?? 0))
      .slice(0, limit)
      .map((c) => buildTxInfo(ES_ID, c, tokensByTx.get(c.hash.toLowerCase()) ?? []));
  },

  async getTx(txid, ctx): Promise<TxInfo> {
    const txRaw = await esProxy(ctx, { action: "eth_getTransactionByHash", txhash: txid });
    if (!isRecord(txRaw)) throw new ProviderError(ES_ID, "Transaktion nicht gefunden");

    const hash = str(txRaw.hash) ?? txid;
    const blockNumber = str(txRaw.blockNumber);
    const gasPrice = weiOf(txRaw.gasPrice);

    // Die Quittung liefert den tatsächlichen Gasverbrauch, den Status und die
    // bei einer Contract-Erstellung erzeugte Adresse.
    let gasUsed: number | undefined;
    let effectivePrice = gasPrice;
    let failed = false;
    let contractCreated: string | undefined;
    try {
      const rc = await esProxy(ctx, { action: "eth_getTransactionReceipt", txhash: txid });
      if (isRecord(rc)) {
        gasUsed = num(rc.gasUsed);
        const eff = weiOf(rc.effectiveGasPrice);
        if (eff > 0) effectivePrice = eff;
        failed = num(rc.status) === 0;
        contractCreated = addrOf(rc.contractAddress);
      }
    } catch {
      // ohne Quittung fehlen lediglich Gebühr und Status
    }

    // Der Zeitstempel steckt nur im Block-Header (zweiter Parameter false).
    let blockTime: number | undefined;
    if (blockNumber) {
      try {
        const block = await esProxy(ctx, {
          action: "eth_getBlockByNumber",
          tag: blockNumber,
          boolean: "false",
        });
        if (isRecord(block)) blockTime = num(block.timestamp);
      } catch {
        blockTime = undefined;
      }
    }

    const to = addrOf(txRaw.to);
    const core: EvmTxCore = {
      hash,
      from: addrOf(txRaw.from),
      to,
      value: weiOf(txRaw.value),
      blockHeight: num(txRaw.blockNumber),
      blockTime,
      feeSat: gasUsed !== undefined ? gasUsed * effectivePrice : undefined,
      failed: failed || undefined,
      contractCreated: to ? undefined : contractCreated,
    };
    return buildTxInfo(ES_ID, core);
  },
  // getOutspends bleibt bewusst unimplementiert: EVM kennt keine UTXOs.
};

/** Alle EVM-Datenquellen in der bevorzugten Reihenfolge. */
export const evmProviders: ChainProvider[] = [blockscout, etherscan];
