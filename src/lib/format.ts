import { chainMeta, type ChainId } from "./chains";

export const SATS = 100_000_000;

/** Betrag in kleinster Einheit -> Anzeige mit Symbol der Chain */
export function formatAmount(value: number | undefined, chain: ChainId = "bitcoin", digits = 8): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "–";
  const m = chainMeta(chain);
  const v = value / 10 ** m.decimals;
  const max = Math.min(digits, m.decimals);
  const abs = Math.abs(v);
  // Sehr kleine Beträge nicht auf 0 runden
  const frac = abs > 0 && abs < 10 ** -max ? m.decimals : max;
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: frac })} ${m.symbol}`;
}

export function formatBtc(sat: number | undefined, digits = 8): string {
  return formatAmount(sat, "bitcoin", digits);
}

export function toUnits(value: number | undefined, chain: ChainId = "bitcoin"): number {
  if (value === undefined) return 0;
  return value / 10 ** chainMeta(chain).decimals;
}

export function formatFiat(
  value: number | undefined,
  rate: number | undefined,
  chain: ChainId = "bitcoin",
  currency = "EUR",
): string {
  if (value === undefined || !rate) return "";
  return (toUnits(value, chain) * rate).toLocaleString("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(v: number, digits = 1): string {
  return `${(v * 100).toLocaleString("de-DE", { maximumFractionDigits: digits })} %`;
}

export function shortHash(h: string, n = 8): string {
  if (!h || h.length <= n * 2 + 1) return h;
  return `${h.slice(0, n)}…${h.slice(-n)}`;
}

export function formatDate(unix?: number): string {
  if (!unix) return "unbestätigt";
  return new Date(unix * 1000).toLocaleString("de-DE");
}

export function formatDateShort(unix?: number): string {
  if (!unix) return "unbest.";
  return new Date(unix * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/* --- Bitcoin-spezifische Kurzformen, weiterhin für die BTC-Seiten genutzt --- */

export function isTxid(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s.trim());
}

export function isBtcAddress(s: string): boolean {
  const v = s.trim();
  return /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v) || /^bc1[a-zA-HJ-NP-Z0-9]{25,90}$/.test(v);
}

export function classifyInput(s: string): "address" | "txid" | "unknown" {
  if (isTxid(s)) return "txid";
  if (isBtcAddress(s)) return "address";
  return "unknown";
}
