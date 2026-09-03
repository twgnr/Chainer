import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { createHash } from "node:crypto";
import { memo, memoPersist } from "../cache";
import type { ChainId } from "../chains";
import {
  ProviderError,
  UnsupportedError,
  type AddressInfo,
  type ChainProvider,
  type ProviderContext,
  type TxInfo,
  type TxInput,
  type TxOutput,
} from "./types";

/**
 * Electrum-/ElectrumX-Provider für einen eigenen Server.
 *
 * Gesprochen wird das Electrum-Protokoll 1.4 direkt über TCP bzw. TLS: JSON-RPC
 * als eine Zeile pro Nachricht, getrennt durch "\n". Da es sich um einen selbst
 * betriebenen Server handelt, gibt es keine Rate-Limits.
 *
 * Einschränkungen des Protokolls:
 *  - Adressen werden nicht direkt unterstützt, sondern nur "Scripthashes"
 *    (SHA-256 über den scriptPubKey, Bytes umgedreht). Die Umrechnung
 *    (Base58Check, Bech32/Bech32m) passiert deshalb hier lokal.
 *  - Es gibt keine Auskunft darüber, wo ein Output ausgegeben wurde:
 *    `getOutspends` wird bewusst nicht implementiert.
 */

const PROVIDER = "electrum";
const CONNECT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
/** Parallelität beim Nachladen von Transaktionen (eigener Server, aber fair bleiben). */
const CONCURRENCY = 5;
/** Bestätigte Transaktionen sind unveränderlich und dürfen lange gecacht werden. */
const TX_TTL_MS = 30 * 24 * 60 * 60_000;
const SHORT_TTL_MS = 30_000;
/** Bis zu dieser Historienlänge wird received/sent exakt berechnet. */
const FULL_HISTORY_LIMIT = 50;

/* ------------------------------------------------------------------ *
 * Kleine Hilfen
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Text aus dem `error`-Feld einer JSON-RPC-Antwort. */
function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (isRecord(error)) {
    const message = asString(error.message);
    const code = asNumber(error.code);
    if (message) return code !== undefined ? `${message} (Code ${code})` : message;
  }
  return JSON.stringify(error);
}

function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

function sha256d(data: Buffer): Buffer {
  return sha256(sha256(data));
}

/** Führt fn über alle Elemente aus, aber höchstens `limit` gleichzeitig. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
  });
  await Promise.all(workers);
  return out;
}

/* ------------------------------------------------------------------ *
 * Konfiguration
 * ------------------------------------------------------------------ */

interface ElectrumConfig {
  host: string;
  port: number;
  protocol: "ssl" | "tcp";
}

/**
 * Liest Host/Port/Protokoll aus der Nutzer-Konfiguration, ersatzweise aus der
 * Umgebung. Ohne Host ist der Provider nicht nutzbar.
 */
function resolveConfig(ctx: ProviderContext): ElectrumConfig {
  const cfg = ctx.config[PROVIDER] ?? {};
  const host = (cfg.host || process.env.ELECTRUM_HOST || "").trim();
  if (!host) throw new UnsupportedError(PROVIDER, "kein Server konfiguriert");
  const raw = (cfg.protocol || process.env.ELECTRUM_PROTOCOL || "ssl").trim().toLowerCase();
  const protocol: "ssl" | "tcp" = raw === "tcp" ? "tcp" : "ssl";
  const port = Number.parseInt((cfg.port || process.env.ELECTRUM_PORT || "").trim(), 10);
  return {
    host,
    protocol,
    port: Number.isFinite(port) && port > 0 && port < 65536 ? port : protocol === "ssl" ? 50002 : 50001,
  };
}

function poolKey(cfg: ElectrumConfig): string {
  return `${cfg.protocol}://${cfg.host}:${cfg.port}`;
}

/* ------------------------------------------------------------------ *
 * Verbindung (JSON-Zeilen über TCP/TLS) mit Pooling
 * ------------------------------------------------------------------ */

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Eine offene Verbindung pro host:port, siehe `pool`. */
class ElectrumConnection {
  private socket: Socket | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private opening: Promise<string> | null = null;

  constructor(
    private readonly cfg: ElectrumConfig,
    private readonly key: string,
  ) {}

  /** Stellt die Verbindung her (einmalig) und liefert die Server-Version. */
  ready(): Promise<string> {
    if (!this.opening) {
      this.opening = this.open().catch((err: unknown) => {
        this.fail(err instanceof Error ? err : new ProviderError(PROVIDER, String(err)));
        throw err;
      });
    }
    return this.opening;
  }

  async request<T>(method: string, params: unknown[]): Promise<T> {
    await this.ready();
    return this.send<T>(method, params);
  }

  private open(): Promise<string> {
    const { host, port, protocol } = this.cfg;
    return new Promise<Socket>((resolve, reject) => {
      // Electrum-Server nutzen fast ausschließlich selbstsignierte Zertifikate;
      // eine Zertifikatsprüfung würde deshalb jede Verbindung scheitern lassen.
      // Der Server wird vom Betreiber selbst eingetragen, das Vertrauen ergibt
      // sich also aus der Konfiguration.
      const socket: Socket =
        protocol === "ssl"
          ? tlsConnect({ host, port, servername: host, rejectUnauthorized: false })
          : netConnect({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new ProviderError(PROVIDER, `Zeitüberschreitung beim Verbinden mit ${host}:${port}`));
      }, CONNECT_TIMEOUT_MS);
      const onError = (err: Error) => {
        clearTimeout(timer);
        socket.destroy();
        reject(new ProviderError(PROVIDER, `Verbindungsfehler zu ${host}:${port}: ${err.message}`));
      };
      socket.once("error", onError);
      socket.once(protocol === "ssl" ? "secureConnect" : "connect", () => {
        clearTimeout(timer);
        socket.off("error", onError);
        resolve(socket);
      });
    }).then(async (socket) => {
      socket.setNoDelay(true);
      // unref(): eine gepoolte Verbindung soll den Node-Prozess nicht am Leben halten.
      socket.unref();
      socket.on("data", (chunk: Buffer) => this.onData(chunk));
      socket.on("error", (err: Error) => this.fail(new ProviderError(PROVIDER, `Socketfehler: ${err.message}`)));
      socket.on("close", () => this.fail(new ProviderError(PROVIDER, "Verbindung wurde geschlossen")));
      this.socket = socket;
      const result = await this.send<unknown>("server.version", ["Chainer/0.1", "1.4"]);
      if (Array.isArray(result)) return asString(result[0]) ?? "unbekannt";
      return asString(result) ?? "unbekannt";
    });
  }

  private send<T>(method: string, params: unknown[]): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.destroyed) {
      return Promise.reject(new ProviderError(PROVIDER, "keine offene Verbindung"));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProviderError(PROVIDER, `Zeitüberschreitung bei ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (err?: Error | null) => {
        if (!err) return;
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        clearTimeout(entry.timer);
        reject(new ProviderError(PROVIDER, `Schreibfehler: ${err.message}`));
      });
    });
  }

  /** Zerlegt den Bytestrom in Zeilen; eine Zeile = eine JSON-Nachricht. */
  private onData(chunk: Buffer) {
    this.buffer += chunk.toString("utf8");
    let idx = this.buffer.indexOf("\n");
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line) {
        try {
          this.handle(JSON.parse(line) as unknown);
        } catch {
          /* unlesbare Zeile ignorieren */
        }
      }
      idx = this.buffer.indexOf("\n");
    }
  }

  /** Ordnet eine Antwort anhand der JSON-RPC-id der wartenden Anfrage zu. */
  private handle(msg: unknown) {
    if (!isRecord(msg)) return;
    const id = asNumber(msg.id);
    // Ohne id handelt es sich um eine Benachrichtigung (Subscription) – ignorieren.
    if (id === undefined) return;
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (msg.error !== undefined && msg.error !== null) {
      entry.reject(new ProviderError(PROVIDER, errorText(msg.error)));
      return;
    }
    entry.resolve(msg.result);
  }

  /** Räumt die Verbindung auf und lässt alle offenen Anfragen scheitern. */
  private fail(err: Error) {
    if (pool.get(this.key) === this) pool.delete(this.key);
    const socket = this.socket;
    this.socket = null;
    this.opening = null;
    this.buffer = "";
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
    }
  }
}

const pool = new Map<string, ElectrumConnection>();

function getConnection(cfg: ElectrumConfig, key: string): ElectrumConnection {
  const existing = pool.get(key);
  if (existing) return existing;
  const created = new ElectrumConnection(cfg, key);
  pool.set(key, created);
  return created;
}

function isConnectionError(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  return /Verbindung|Verbinden|Socketfehler|Schreibfehler/i.test(err.message);
}

/** Ein RPC-Aufruf; bei abgestorbener Pool-Verbindung genau ein Neuversuch. */
async function rpc<T>(cfg: ElectrumConfig, method: string, params: unknown[]): Promise<T> {
  const key = poolKey(cfg);
  try {
    return await getConnection(cfg, key).request<T>(method, params);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    pool.delete(key);
    return getConnection(cfg, key).request<T>(method, params);
  }
}

/* ------------------------------------------------------------------ *
 * Adressen: Base58Check und Bech32/Bech32m
 * ------------------------------------------------------------------ */

interface ChainParams {
  /** Erlaubte Versionsbytes für P2PKH (das erste wird zum Kodieren genutzt) */
  p2pkh: number[];
  p2sh: number[];
  hrp: string;
}

const PARAMS: Partial<Record<ChainId, ChainParams>> = {
  bitcoin: { p2pkh: [0x00], p2sh: [0x05], hrp: "bc" },
  // Litecoin nutzt für P2SH 0x32 ("M…"); ältere Adressen ("3…") haben noch 0x05.
  litecoin: { p2pkh: [0x30], p2sh: [0x32, 0x05], hrp: "ltc" },
};

function chainParams(chain: ChainId): ChainParams {
  const params = PARAMS[chain];
  if (!params) throw new UnsupportedError(PROVIDER, `Chain ${chain}`);
  return params;
}

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(input: string): Buffer {
  const bytes: number[] = [];
  for (const ch of input) {
    let carry = B58_ALPHABET.indexOf(ch);
    if (carry < 0) throw new ProviderError(PROVIDER, `ungültiges Base58-Zeichen: ${ch}`);
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < input.length && input[i] === "1"; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

function base58Encode(data: Buffer): string {
  const digits: number[] = [];
  for (const byte of data) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const byte of data) {
    if (byte !== 0) break;
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
  return out;
}

/** Base58Check dekodieren und Prüfsumme (doppeltes SHA-256) verifizieren. */
function base58CheckDecode(input: string): { version: number; payload: Buffer } {
  const raw = base58Decode(input);
  if (raw.length < 5) throw new ProviderError(PROVIDER, `Adresse zu kurz: ${input}`);
  const body = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  if (!sha256d(body).subarray(0, 4).equals(checksum)) {
    throw new ProviderError(PROVIDER, `ungültige Prüfsumme: ${input}`);
  }
  return { version: body[0], payload: body.subarray(1) };
}

function base58CheckEncode(version: number, payload: Buffer): string {
  const body = Buffer.concat([Buffer.from([version]), payload]);
  return base58Encode(Buffer.concat([body, sha256d(body).subarray(0, 4)]));
}

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= generator[i];
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/** Liefert hrp, die 5-Bit-Wörter (ohne Prüfsumme) und die erkannte Konstante. */
function bech32Decode(address: string): { hrp: string; words: number[]; constant: number } | null {
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return null;
  const lower = address.toLowerCase();
  if (lower.length < 8 || lower.length > 100) return null;
  const sep = lower.lastIndexOf("1");
  if (sep < 1 || sep + 7 > lower.length) return null;
  const hrp = lower.slice(0, sep);
  const words: number[] = [];
  for (const ch of lower.slice(sep + 1)) {
    const value = BECH32_CHARSET.indexOf(ch);
    if (value < 0) return null;
    words.push(value);
  }
  const checksum = bech32Polymod([...bech32HrpExpand(hrp), ...words]);
  if (checksum !== BECH32_CONST && checksum !== BECH32M_CONST) return null;
  return { hrp, words: words.slice(0, words.length - 6), constant: checksum };
}

function bech32Encode(hrp: string, words: number[], constant: number): string {
  const mod = bech32Polymod([...bech32HrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ constant;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...checksum].map((w) => BECH32_CHARSET[w]).join("")}`;
}

/** Bit-Umgruppierung (5 -> 8 beim Dekodieren, 8 -> 5 beim Kodieren). */
function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >>> from !== 0) return null;
    acc = ((acc << from) | value) >>> 0;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >>> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    return null;
  }
  return out;
}

/** Baut den scriptPubKey zu einer Adresse (P2PKH, P2SH, P2WPKH/P2WSH, P2TR). */
function addressToScript(address: string, chain: ChainId): Buffer {
  const params = chainParams(chain);
  const trimmed = address.trim();
  const segwit = bech32Decode(trimmed);
  if (segwit) {
    if (segwit.hrp !== params.hrp) {
      throw new ProviderError(PROVIDER, `Adresse gehört nicht zu ${chain}: ${address}`);
    }
    if (segwit.words.length < 1) throw new ProviderError(PROVIDER, `ungültige Adresse: ${address}`);
    const version = segwit.words[0];
    const program = convertBits(segwit.words.slice(1), 5, 8, false);
    if (!program) throw new ProviderError(PROVIDER, `ungültige Adresse: ${address}`);
    // Version 0 nutzt Bech32, ab Version 1 (Taproot) gilt Bech32m.
    if (segwit.constant !== (version === 0 ? BECH32_CONST : BECH32M_CONST)) {
      throw new ProviderError(PROVIDER, `falsche Prüfsummen-Variante (bech32/bech32m): ${address}`);
    }
    if (version === 0 && program.length !== 20 && program.length !== 32) {
      throw new ProviderError(PROVIDER, `ungültige Witness-Länge: ${address}`);
    }
    if (version > 16 || program.length < 2 || program.length > 40) {
      throw new ProviderError(PROVIDER, `ungültiges Witness-Programm: ${address}`);
    }
    // OP_0 = 0x00, OP_1..OP_16 = 0x51..0x60 (Taproot = Version 1 -> 0x51)
    const opVersion = version === 0 ? 0x00 : 0x50 + version;
    return Buffer.concat([Buffer.from([opVersion, program.length]), Buffer.from(program)]);
  }
  const { version, payload } = base58CheckDecode(trimmed);
  if (payload.length !== 20) throw new ProviderError(PROVIDER, `ungültige Adresslänge: ${address}`);
  if (params.p2pkh.includes(version)) {
    // OP_DUP OP_HASH160 <20 Byte> OP_EQUALVERIFY OP_CHECKSIG
    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), payload, Buffer.from([0x88, 0xac])]);
  }
  if (params.p2sh.includes(version)) {
    // OP_HASH160 <20 Byte> OP_EQUAL
    return Buffer.concat([Buffer.from([0xa9, 0x14]), payload, Buffer.from([0x87])]);
  }
  throw new ProviderError(PROVIDER, `unbekanntes Versionsbyte 0x${version.toString(16)} in ${address}`);
}

/** Electrum-Scripthash: SHA-256 über den scriptPubKey, Bytes umgedreht, als Hex. */
function scriptHash(script: Buffer): string {
  return Buffer.from(sha256(script).reverse()).toString("hex");
}

function addressScriptHash(address: string, chain: ChainId): string {
  return scriptHash(addressToScript(address, chain));
}

/** Erkennt den Typ eines scriptPubKey und kodiert – wenn möglich – die Adresse. */
function scriptToAddress(script: Buffer, chain: ChainId): { address?: string; scriptType: string } {
  const params = PARAMS[chain];
  const len = script.length;
  if (
    len === 25 &&
    script[0] === 0x76 &&
    script[1] === 0xa9 &&
    script[2] === 0x14 &&
    script[23] === 0x88 &&
    script[24] === 0xac
  ) {
    const hash = script.subarray(3, 23);
    return { scriptType: "p2pkh", address: params ? base58CheckEncode(params.p2pkh[0], hash) : undefined };
  }
  if (len === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) {
    const hash = script.subarray(2, 22);
    return { scriptType: "p2sh", address: params ? base58CheckEncode(params.p2sh[0], hash) : undefined };
  }
  if ((len === 22 && script[0] === 0x00 && script[1] === 0x14) || (len === 34 && script[0] === 0x00 && script[1] === 0x20)) {
    const words = convertBits([...script.subarray(2)], 8, 5, true);
    return {
      scriptType: len === 22 ? "p2wpkh" : "p2wsh",
      address: params && words ? bech32Encode(params.hrp, [0, ...words], BECH32_CONST) : undefined,
    };
  }
  if (len === 34 && script[0] === 0x51 && script[1] === 0x20) {
    const words = convertBits([...script.subarray(2)], 8, 5, true);
    return {
      scriptType: "p2tr",
      address: params && words ? bech32Encode(params.hrp, [1, ...words], BECH32M_CONST) : undefined,
    };
  }
  if ((len === 35 && script[0] === 0x21 && script[34] === 0xac) || (len === 67 && script[0] === 0x41 && script[66] === 0xac)) {
    // P2PK hat keine Adressdarstellung.
    return { scriptType: "p2pk" };
  }
  if (len > 0 && script[0] === 0x6a) return { scriptType: "op_return" };
  return { scriptType: "unknown" };
}

/* ------------------------------------------------------------------ *
 * Roh-Transaktionen selbst parsen (Fallback ohne verbose)
 * ------------------------------------------------------------------ */

class ByteReader {
  offset = 0;
  constructor(readonly buf: Buffer) {}

  private need(n: number) {
    if (this.offset + n > this.buf.length) throw new ProviderError(PROVIDER, "Transaktion unvollständig");
  }
  u8(): number {
    this.need(1);
    return this.buf[this.offset++];
  }
  u32(): number {
    this.need(4);
    const value = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }
  /** 64 Bit little endian ohne BigInt (Satoshi-Beträge passen in Number). */
  u64(): number {
    const low = this.u32();
    const high = this.u32();
    return high * 0x1_0000_0000 + low;
  }
  varint(): number {
    const tag = this.u8();
    if (tag < 0xfd) return tag;
    if (tag === 0xfd) {
      this.need(2);
      const value = this.buf.readUInt16LE(this.offset);
      this.offset += 2;
      return value;
    }
    if (tag === 0xfe) return this.u32();
    return this.u64();
  }
  slice(n: number): Buffer {
    this.need(n);
    const value = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return value;
  }
}

/** Grundgerüst einer Transaktion – Adressen/Werte der Inputs fehlen noch. */
interface BaseTx {
  txid: string;
  size: number;
  confirmed: boolean;
  blockHeight?: number;
  blockTime?: number;
  inputs: TxInput[];
  outputs: TxOutput[];
}

/**
 * Kompakter Bitcoin-Transaktionsparser (Legacy und SegWit). Die txid ist das
 * doppelte SHA-256 über die Serialisierung OHNE Marker/Flag und Witness-Daten,
 * in umgedrehter Byte-Reihenfolge.
 */
function parseRawTx(hex: string, chain: ChainId): BaseTx {
  const buf = Buffer.from(hex.trim(), "hex");
  if (buf.length < 10) throw new ProviderError(PROVIDER, "Roh-Transaktion zu kurz");
  const reader = new ByteReader(buf);
  reader.u32(); // Version
  const segwit = buf.length > 6 && buf[4] === 0x00 && buf[5] !== 0x00;
  if (segwit) reader.offset = 6; // Marker (0x00) und Flag überspringen
  const bodyStart = reader.offset;

  const inputCount = reader.varint();
  const inputs: TxInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    const prev = Buffer.from(reader.slice(32)).reverse().toString("hex");
    const vout = reader.u32();
    reader.slice(reader.varint()); // scriptSig
    reader.u32(); // Sequence
    const coinbase = /^0{64}$/.test(prev) && vout === 0xffffffff;
    inputs.push(coinbase ? { coinbase: true } : { txid: prev, vout });
  }

  const outputCount = reader.varint();
  const outputs: TxOutput[] = [];
  for (let n = 0; n < outputCount; n++) {
    const valueSat = reader.u64();
    const script = reader.slice(reader.varint());
    const info = scriptToAddress(script, chain);
    outputs.push({ n, valueSat, address: info.address, scriptType: info.scriptType });
  }
  const bodyEnd = reader.offset;

  if (segwit) {
    for (let i = 0; i < inputCount; i++) {
      const items = reader.varint();
      for (let j = 0; j < items; j++) reader.slice(reader.varint());
    }
  }
  const locktimeStart = reader.offset;
  reader.u32(); // Locktime

  const stripped = segwit
    ? Buffer.concat([
        buf.subarray(0, 4),
        buf.subarray(bodyStart, bodyEnd),
        buf.subarray(locktimeStart, locktimeStart + 4),
      ])
    : buf;
  const txid = Buffer.from(sha256d(stripped).reverse()).toString("hex");
  // Aus dem Roh-Hex ist der Bestätigungsstatus nicht ableitbar; er wird später
  // aus der Historie ergänzt, sofern dort eine Blockhöhe bekannt ist.
  return { txid, size: buf.length, confirmed: false, inputs, outputs };
}

/* ------------------------------------------------------------------ *
 * Antworten des Servers auswerten
 * ------------------------------------------------------------------ */

function btcToSat(value: unknown): number {
  const num = asNumber(value);
  return num === undefined ? 0 : Math.round(num * 1e8);
}

/** Mappt die verbose-Antwort (bitcoind-Format) auf das interne Grundgerüst. */
function mapVerbose(raw: Record<string, unknown>, chain: ChainId, fallbackTxid: string): BaseTx {
  const inputs: TxInput[] = [];
  if (Array.isArray(raw.vin)) {
    for (const entry of raw.vin) {
      if (!isRecord(entry)) continue;
      if (entry.coinbase !== undefined) {
        inputs.push({ coinbase: true });
        continue;
      }
      // verbose liefert keine Prevout-Werte – die werden später durch Nachladen
      // der Eltern-Transaktion ergänzt.
      inputs.push({ txid: asString(entry.txid), vout: asNumber(entry.vout) });
    }
  }
  const outputs: TxOutput[] = [];
  if (Array.isArray(raw.vout)) {
    raw.vout.forEach((entry: unknown, index: number) => {
      if (!isRecord(entry)) return;
      const spk = isRecord(entry.scriptPubKey) ? entry.scriptPubKey : undefined;
      let address = spk ? asString(spk.address) : undefined;
      if (!address && spk && Array.isArray(spk.addresses)) address = asString(spk.addresses[0]);
      let scriptType = spk ? asString(spk.type) : undefined;
      if (!address && spk) {
        const hex = asString(spk.hex);
        if (hex) {
          const info = scriptToAddress(Buffer.from(hex, "hex"), chain);
          address = info.address;
          scriptType = scriptType ?? info.scriptType;
        }
      }
      outputs.push({ n: asNumber(entry.n) ?? index, valueSat: btcToSat(entry.value), address, scriptType });
    });
  }
  const blockTime = asNumber(raw.blocktime) ?? asNumber(raw.time);
  const confirmations = asNumber(raw.confirmations) ?? 0;
  return {
    txid: asString(raw.txid) ?? asString(raw.hash) ?? fallbackTxid,
    size: asNumber(raw.size) ?? asNumber(raw.vsize) ?? 0,
    confirmed: confirmations > 0 || blockTime !== undefined,
    blockHeight: asNumber(raw.height) ?? asNumber(raw.block_height),
    blockTime,
    inputs,
    outputs,
  };
}

/** Holt eine Transaktion vom Server – bevorzugt verbose, sonst Roh-Hex. */
async function fetchBaseTx(txid: string, cfg: ElectrumConfig, chain: ChainId): Promise<BaseTx> {
  try {
    const result = await rpc<unknown>(cfg, "blockchain.transaction.get", [txid, true]);
    if (isRecord(result)) return mapVerbose(result, chain, txid);
    // Manche Server ignorieren `verbose` und liefern trotzdem nur das Roh-Hex.
    if (typeof result === "string") return parseRawTx(result, chain);
    throw new ProviderError(PROVIDER, `unerwartete Antwort für ${txid}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/verbose|verbosity/i.test(message)) throw err;
    // Server kennt verbose nicht: Roh-Hex holen und selbst parsen.
    const hex = await rpc<unknown>(cfg, "blockchain.transaction.get", [txid]);
    if (typeof hex !== "string") throw new ProviderError(PROVIDER, `unerwartete Antwort für ${txid}`);
    return parseRawTx(hex, chain);
  }
}

/**
 * Gecachtes Laden einer Transaktion. Bestätigte Transaktionen ändern sich nie
 * und werden persistent gespeichert. Wird dagegen ein unbestätigter Stand aus
 * dem Cache geliefert, wird bewusst frisch nachgeladen, weil sich Blockhöhe und
 * Bestätigungsstatus noch ändern.
 */
async function loadBaseTx(txid: string, cfg: ElectrumConfig, chain: ChainId): Promise<BaseTx> {
  const key = `electrum:tx:${chain}:${txid}`;
  let fresh = false;
  const cached = await memoPersist<BaseTx>(key, TX_TTL_MS, async () => {
    fresh = true;
    return fetchBaseTx(txid, cfg, chain);
  });
  if (cached.confirmed || fresh) return cached;
  return memo(`${key}:live`, SHORT_TTL_MS, () => fetchBaseTx(txid, cfg, chain));
}

/** Ergänzt Adresse und Wert der Inputs aus den Eltern-Transaktionen. */
async function enrichInputs(base: BaseTx, cfg: ElectrumConfig, chain: ChainId): Promise<TxInput[]> {
  const parentIds = [...new Set(base.inputs.map((i) => i.txid).filter((id): id is string => !!id))];
  const parents = new Map<string, BaseTx>();
  await mapLimit(parentIds, CONCURRENCY, async (id) => {
    try {
      parents.set(id, await loadBaseTx(id, cfg, chain));
    } catch {
      // Eine nicht ladbare Eltern-Transaktion darf die Auswertung nicht stoppen.
    }
  });
  return base.inputs.map((input) => {
    if (input.coinbase || !input.txid || input.vout === undefined) return input;
    const out = parents.get(input.txid)?.outputs.find((o) => o.n === input.vout);
    return out ? { ...input, address: out.address, valueSat: out.valueSat } : input;
  });
}

function toTxInfo(base: BaseTx, inputs: TxInput[], chain: ChainId): TxInfo {
  const hasCoinbase = inputs.some((i) => i.coinbase);
  const allKnown = inputs.length > 0 && inputs.every((i) => typeof i.valueSat === "number");
  const outSum = base.outputs.reduce((sum, o) => sum + o.valueSat, 0);
  // Gebühr nur, wenn alle Input-Werte bekannt sind und es keine Coinbase ist.
  const fee = !hasCoinbase && allKnown ? inputs.reduce((sum, i) => sum + (i.valueSat ?? 0), 0) - outSum : undefined;
  return {
    txid: base.txid,
    chain,
    blockHeight: base.blockHeight,
    blockTime: base.blockTime,
    confirmed: base.confirmed,
    feeSat: fee !== undefined && fee >= 0 ? fee : undefined,
    size: base.size || undefined,
    inputs,
    outputs: base.outputs,
    provider: PROVIDER,
  };
}

/* ------------------------------------------------------------------ *
 * Historie und Guthaben
 * ------------------------------------------------------------------ */

interface HistoryEntry {
  txid: string;
  height: number;
}

function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const txid = asString(entry.tx_hash);
    if (txid) out.push({ txid, height: asNumber(entry.height) ?? 0 });
  }
  return out;
}

/** Unbestätigte Einträge (height <= 0) gelten als die neuesten. */
function historyRank(entry: HistoryEntry): number {
  return entry.height <= 0 ? Number.MAX_SAFE_INTEGER : entry.height;
}

async function loadHistory(address: string, cfg: ElectrumConfig, chain: ChainId): Promise<HistoryEntry[]> {
  const hash = addressScriptHash(address, chain);
  return memo(`electrum:hist:${chain}:${hash}`, SHORT_TTL_MS, async () =>
    parseHistory(await rpc<unknown>(cfg, "blockchain.scripthash.get_history", [hash])),
  );
}

async function loadTxs(entries: HistoryEntry[], cfg: ElectrumConfig, chain: ChainId): Promise<TxInfo[]> {
  const loaded = await mapLimit(entries, CONCURRENCY, async (entry) => {
    try {
      const base = await loadBaseTx(entry.txid, cfg, chain);
      const inputs = await enrichInputs(base, cfg, chain);
      // Die Historie kennt die Blockhöhe auch dann, wenn die Antwort sie nicht enthält.
      const merged: BaseTx =
        entry.height > 0 ? { ...base, confirmed: true, blockHeight: base.blockHeight ?? entry.height } : base;
      return toTxInfo(merged, inputs, chain);
    } catch {
      return null;
    }
  });
  return loaded
    .filter((tx): tx is TxInfo => tx !== null)
    .sort((a, b) => (b.blockTime ?? Number.MAX_SAFE_INTEGER) - (a.blockTime ?? Number.MAX_SAFE_INTEGER));
}

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

export const electrum: ChainProvider = {
  id: PROVIDER,
  name: "Electrum-Server (eigener)",
  url: "https://electrum.readthedocs.io",
  keyRequirement: "none",
  rateLimit: "keine (eigener Server)",
  chains: ["bitcoin", "litecoin"],
  configFields: [
    { key: "host", label: "Host", placeholder: "electrum.example.org", required: true },
    { key: "port", label: "Port", placeholder: "50002" },
    { key: "protocol", label: "Protokoll (ssl oder tcp)", placeholder: "ssl" },
  ],

  async getAddress(address: string, ctx: ProviderContext): Promise<AddressInfo> {
    const cfg = resolveConfig(ctx);
    const chain = ctx.chain;
    const hash = addressScriptHash(address, chain);
    const [balanceRaw, history] = await Promise.all([
      rpc<unknown>(cfg, "blockchain.scripthash.get_balance", [hash]),
      loadHistory(address, cfg, chain),
    ]);
    const balance = isRecord(balanceRaw)
      ? (asNumber(balanceRaw.confirmed) ?? 0) + (asNumber(balanceRaw.unconfirmed) ?? 0)
      : 0;

    // Exakte Summen erfordern alle Transaktionen der Adresse. Das ist nur bei
    // kurzer Historie vertretbar; bei größeren Adressen (tausende Einträge)
    // bleibt receivedSat auf dem Guthaben und sentSat auf 0 – beide Werte sind
    // dann nur eine Untergrenze, txCount und balanceSat sind weiterhin exakt.
    let receivedSat = Math.max(0, balance);
    let sentSat = 0;
    if (history.length > 0 && history.length <= FULL_HISTORY_LIMIT) {
      const txs = await loadTxs(history, cfg, chain);
      receivedSat = 0;
      for (const tx of txs) {
        for (const out of tx.outputs) if (out.address === address) receivedSat += out.valueSat;
        for (const input of tx.inputs) if (input.address === address) sentSat += input.valueSat ?? 0;
      }
    }
    return {
      address,
      chain,
      balanceSat: balance,
      receivedSat,
      sentSat,
      txCount: history.length,
      provider: PROVIDER,
    };
  },

  async getAddressTxs(address: string, ctx: ProviderContext, limit = 50): Promise<TxInfo[]> {
    const cfg = resolveConfig(ctx);
    const history = await loadHistory(address, cfg, ctx.chain);
    const newest = [...history].sort((a, b) => historyRank(b) - historyRank(a)).slice(0, Math.max(1, limit));
    return loadTxs(newest, cfg, ctx.chain);
  },

  async getTx(txid: string, ctx: ProviderContext): Promise<TxInfo> {
    const cfg = resolveConfig(ctx);
    const base = await loadBaseTx(txid, cfg, ctx.chain);
    const inputs = await enrichInputs(base, cfg, ctx.chain);
    return toTxInfo(base, inputs, ctx.chain);
  },

  // getOutspends fehlt bewusst: Electrum kennt keine Verweise auf ausgebende Transaktionen.
};

/** Verbindungstest für die Einstellungsseite: liefert die Server-Version. */
export async function electrumPing(ctx: ProviderContext): Promise<{ ok: boolean; server?: string; error?: string }> {
  try {
    const cfg = resolveConfig(ctx);
    const server = await getConnection(cfg, poolKey(cfg)).ready();
    return { ok: true, server };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
