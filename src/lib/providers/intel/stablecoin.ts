import { fetchJson } from "../http";
import type { AddressLabel, IntelProvider, ProviderContext } from "../types";
import { memoPersist } from "../../cache";

const ID = "stablecoin";

/**
 * Sperrlisten der großen Stablecoin-Herausgeber. Anders als Community-Meldungen
 * ist das eine harte, direkt auf der Kette prüfbare Tatsache: Der Herausgeber
 * trägt die Adresse in den Token-Vertrag ein, ihr Guthaben ist danach eingefroren.
 *
 * Geprüft werden USDT (Tether) und USDC (Circle) auf Ethereum und auf Tron.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 4-Byte-Funktionsselektoren (die ersten 4 Bytes des keccak256 der Signatur).
 * Einmalig über https://www.4byte.directory ermittelt und anschließend per echtem
 * eth_call gegen den jeweiligen Vertrag empirisch verifiziert:
 *   isBlackListed(address) -> 0xe47d6060  (USDT, alte Schreibweise mit großem L)
 *   isBlacklisted(address) -> 0xfe575a87  (USDC)
 * Gegenprobe: 0x7F367cC41522cE07553e823bf3be79A889DEbe1B liefert bei beiden
 * Verträgen 0x…01, 0xd8da…6045 (Vitalik) liefert 0x…00.
 */
const SEL_IS_BLACK_LISTED = "0xe47d6060";
const SEL_IS_BLACKLISTED = "0xfe575a87";

interface Check {
  /** Vertragsadresse (Ethereum: 0x…, Tron: Base58) */
  contract: string;
  /** Selektor für eth_call */
  selector: string;
  /** Signatur im Klartext, die TronGrid erwartet */
  signature: string;
  label: string;
  details: string;
}

const ETH_CHECKS: readonly Check[] = [
  {
    contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    selector: SEL_IS_BLACK_LISTED,
    signature: "isBlackListed(address)",
    label: "USDT gesperrt (Tether)",
    details: "Adresse ist im USDT-Vertrag auf der Sperrliste; Guthaben ist eingefroren",
  },
  {
    contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    selector: SEL_IS_BLACKLISTED,
    signature: "isBlacklisted(address)",
    label: "USDC gesperrt (Circle)",
    details: "Adresse ist im USDC-Vertrag auf der Sperrliste; Guthaben ist eingefroren",
  },
];

const TRON_CHECKS: readonly Check[] = [
  {
    contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // USDT-TRC20
    selector: SEL_IS_BLACK_LISTED,
    signature: "isBlackListed(address)",
    label: "USDT gesperrt (Tether)",
    details: "Adresse ist im USDT-Vertrag auf der Sperrliste; Guthaben ist eingefroren",
  },
  {
    contract: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", // USDC-TRC20
    selector: SEL_IS_BLACKLISTED,
    signature: "isBlacklisted(address)",
    label: "USDC gesperrt (Circle)",
    details: "Adresse ist im USDC-Vertrag auf der Sperrliste; Guthaben ist eingefroren",
  },
];

/**
 * Öffentliche Ethereum-Endpunkte ohne Key. publicnode ist der Standard (im Test
 * zuverlässig und ohne Rate-Limit-Fehler); drpc und merkle dienen als Ausweichliste,
 * falls der erste Endpunkt nicht antwortet. Bewusst nicht verwendet: eth.llamarpc.com
 * (im Test HTTP 521) und rpc.ankr.com/eth (verlangt inzwischen einen API-Key).
 */
const DEFAULT_ETH_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://eth.merkle.io",
];

/**
 * Öffentliche Tron-Endpunkte (Full-Node-HTTP-API). publicnode steht bewusst vorn:
 * api.trongrid.io drosselt ohne API-Key bereits ab 3 Anfragen/Sekunde und sperrt
 * dann für 5 Sekunden (HTTP 429) — das würde bei einer Sanktionsprüfung stille
 * Falsch-Negative erzeugen. Alle drei Endpunkte liefern im Test identische Werte.
 */
const DEFAULT_TRON_APIS = [
  "https://tron-rpc.publicnode.com",
  "https://api.trongrid.io",
  "https://api.tronstack.io",
];

/**
 * Beliebige gültige Tron-Adresse als "Aufrufer" — für einen reinen Lesezugriff
 * (triggerconstantcontract) wird nichts signiert und kein Guthaben benötigt.
 */
const TRON_DUMMY_CALLER = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";

interface EthRpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface TronCallResponse {
  constant_result?: unknown;
  result?: { result?: boolean; message?: string };
}

/**
 * Endpunkte in Reihenfolge: Nutzerkonfiguration, ENV, öffentliche Standardliste.
 * Die konfigurierte rpcUrl gilt nur für Ethereum — sie an die Tron-Liste zu hängen
 * würde dort nur einen sicheren Fehlversuch erzeugen.
 */
function endpoints(ctx: ProviderContext, defaults: string[], useConfigured: boolean): string[] {
  const list = useConfigured
    ? [ctx.config[ID]?.rpcUrl?.trim(), process.env.ETH_RPC_URL?.trim(), ...defaults]
    : [...defaults];
  return [...new Set(list.filter((u): u is string => !!u))];
}

/** 32-Byte-Argument: 24 Nullen + 40 Hex-Zeichen der Adresse. */
function encodeAddressArg(hex40: string): string {
  return "000000000000000000000000" + hex40;
}

/**
 * Wertet ein 32-Byte-Rückgabewort aus: 0 = false, 1 = true. Alles andere gilt als
 * unbekannt (undefined) — dann wird weder ein Label noch ein Fehler erzeugt.
 */
function parseBool(word: string): boolean | undefined {
  const hex = word.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{1,64}$/.test(hex)) return undefined;
  const value = hex.replace(/^0+/, "");
  if (value === "") return false;
  if (value === "1") return true;
  return undefined;
}

/* ---------------- Ethereum ---------------- */

async function ethIsBlacklisted(urls: string[], check: Check, address: string): Promise<boolean | undefined> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: check.contract, data: check.selector + encodeAddressArg(address.slice(2)) }, "latest"],
  });

  for (const url of urls) {
    let res: EthRpcResponse;
    try {
      // fetchJson wirft bei HTTP-Fehlern und bei HTML-Fehlerseiten (kein gültiges JSON).
      res = await fetchJson<EthRpcResponse>(ID, url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        timeoutMs: 10_000,
      });
    } catch {
      continue; // nächster Endpunkt
    }
    if (res.error || typeof res.result !== "string") continue;
    return parseBool(res.result);
  }
  return undefined; // kein Endpunkt hat geantwortet
}

/* ---------------- Tron ---------------- */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Dekodiert eine Tron-Base58Check-Adresse zu den 20 Hex-Bytes, die die ABI erwartet.
 * Aufbau: 1 Byte Präfix 0x41 + 20 Byte Adresse + 4 Byte Prüfsumme.
 * Die Prüfsumme wird nicht verifiziert (dafür wäre SHA-256 nötig); ein Tippfehler
 * führt dann lediglich zu einem "nicht gesperrt"-Ergebnis, nicht zu einem Fehler.
 */
function tronToHex(address: string): string | undefined {
  // Base58 -> Bytes per Byte-Arithmetik (kein BigInt, damit das Ziel-ES-Level egal ist).
  const bytes: number[] = [];
  for (const char of address) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) return undefined;
    for (let i = bytes.length - 1; i >= 0; i--) {
      carry += 58 * bytes[i];
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }
  // Führende "1" stehen je für ein Null-Byte.
  for (const char of address) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  if (bytes.length !== 25 || bytes[0] !== 0x41) return undefined;
  return bytes
    .slice(1, 21)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function tronIsBlacklisted(urls: string[], check: Check, hex40: string): Promise<boolean | undefined> {
  const body = JSON.stringify({
    owner_address: TRON_DUMMY_CALLER,
    contract_address: check.contract,
    function_selector: check.signature,
    parameter: encodeAddressArg(hex40),
    visible: true,
  });

  for (const url of urls) {
    let res: TronCallResponse;
    try {
      res = await fetchJson<TronCallResponse>(ID, `${url}/wallet/triggerconstantcontract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        timeoutMs: 10_000,
      });
    } catch {
      continue;
    }
    if (res.result?.result !== true) continue;
    const words = res.constant_result;
    if (!Array.isArray(words) || typeof words[0] !== "string") continue;
    return parseBool(words[0]);
  }
  return undefined;
}

/* ---------------- Zusammenführung ---------------- */

async function lookupUncached(address: string, ctx: ProviderContext): Promise<AddressLabel[]> {
  const isTron = ctx.chain === "tron";
  const checks = isTron ? TRON_CHECKS : ETH_CHECKS;
  const urls = endpoints(ctx, isTron ? DEFAULT_TRON_APIS : DEFAULT_ETH_RPCS, !isTron);
  const explorer = isTron ? `https://tronscan.org/#/address/${address}` : `https://etherscan.io/address/${address}`;

  const tronHex = isTron ? tronToHex(address) : undefined;
  if (isTron && !tronHex) return [];

  // Beide Prüfungen parallel; ein Fehler darf die jeweils andere nicht verhindern.
  const results = await Promise.allSettled(
    checks.map((check) =>
      isTron && tronHex ? tronIsBlacklisted(urls, check, tronHex) : ethIsBlacklisted(urls, check, address),
    ),
  );

  const labels: AddressLabel[] = [];
  results.forEach((result, i) => {
    if (result.status !== "fulfilled" || result.value !== true) return;
    const check = checks[i];
    labels.push({
      source: ID,
      label: check.label,
      category: "sanctioned",
      risk: "high",
      url: explorer,
      details: check.details,
    });
  });
  return labels;
}

/**
 * Prüft direkt auf der Kette, ob eine Adresse von Tether (USDT) oder Circle (USDC)
 * gesperrt wurde. Kein API-Key nötig, es genügt ein öffentlicher Endpunkt.
 */

/** Prüft, ob die Adresse einer der geprüften Token-Verträge selbst ist. */
function isOwnContract(address: string, chain: "ethereum" | "tron"): boolean {
  const list = chain === "ethereum" ? ETH_CHECKS : TRON_CHECKS;
  return list.some((c) =>
    chain === "ethereum" ? c.contract.toLowerCase() === address.toLowerCase() : c.contract === address,
  );
}

export const stablecoinBlacklist: IntelProvider = {
  id: ID,
  name: "Stablecoin-Sperrlisten",
  url: "https://tether.to",
  keyRequirement: "none",
  rateLimit: "öffentlicher RPC, Ergebnis 24 h zwischengespeichert",
  chains: ["ethereum", "tron"],
  // Die Adresse geht an einen fremden RPC; mit eigenem Endpunkt entfällt das
  leaksQuery: true,
  configFields: [{ key: "rpcUrl", label: "Ethereum-RPC-URL", placeholder: "https://ethereum-rpc.publicnode.com" }],
  async lookup(address, ctx): Promise<AddressLabel[]> {
    if (ctx.chain !== "ethereum" && ctx.chain !== "tron") return [];
    // Ethereum-Adressen werden kleingeschrieben, Tron-Adressen sind Base58 und
    // dürfen NICHT in der Schreibweise verändert werden.
    const normalized = ctx.chain === "tron" ? address : address.toLowerCase();
    if (ctx.chain === "ethereum" && !/^0x[0-9a-f]{40}$/.test(normalized)) return [];
    if (ctx.chain === "tron" && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalized)) return [];
    // Die Token-Verträge führen sich teilweise selbst auf ihrer Sperrliste
    // (geprüft: der USDT-Vertrag auf Tron liefert für die eigene Adresse eine 1).
    // Für eine Ermittlung ist das ohne Aussage und würde nur einen Fehlalarm erzeugen.
    if (isOwnContract(normalized, ctx.chain)) return [];
    // Auch das negative Ergebnis (leeres Array) wird 24 h gecacht, damit nicht bei
    // jeder Ansicht erneut ein RPC-Aufruf nötig ist.
    return memoPersist(`stablecoin-blacklist:${ctx.chain}:${normalized}`, DAY_MS, () => lookupUncached(normalized, ctx));
  },
};
