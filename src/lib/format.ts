import { chainMeta, isChainAddress, type ChainId } from "./chains";
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "./i18n/locale";

export const SATS = 100_000_000;

/** „unbestätigt“ je Sprache – ein Zeitstempel fehlt bei Transaktionen im Mempool. */
const UNCONFIRMED: Record<Locale, { long: string; short: string }> = {
  en: { long: "unconfirmed", short: "unconf." },
  de: { long: "unbestätigt", short: "unbest." },
};

function intl(locale: Locale): string {
  return INTL_LOCALE[locale];
}

/** Betrag in kleinster Einheit -> Anzeige mit Symbol der Chain */
export function formatAmount(
  value: number | undefined,
  chain: ChainId = "bitcoin",
  digits = 8,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "–";
  const m = chainMeta(chain);
  const v = value / 10 ** m.decimals;
  const max = Math.min(digits, m.decimals);
  const abs = Math.abs(v);
  // Sehr kleine Beträge nicht auf 0 runden
  const frac = abs > 0 && abs < 10 ** -max ? m.decimals : max;
  return `${v.toLocaleString(intl(locale), { minimumFractionDigits: 0, maximumFractionDigits: frac })} ${m.symbol}`;
}

export function formatBtc(sat: number | undefined, digits = 8, locale: Locale = DEFAULT_LOCALE): string {
  return formatAmount(sat, "bitcoin", digits, locale);
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
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (value === undefined || !rate) return "";
  return (toUnits(value, chain) * rate).toLocaleString(intl(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(v: number, digits = 1, locale: Locale = DEFAULT_LOCALE): string {
  return `${(v * 100).toLocaleString(intl(locale), { maximumFractionDigits: digits })} %`;
}

export function formatNumber(v: number, digits = 0, locale: Locale = DEFAULT_LOCALE): string {
  return v.toLocaleString(intl(locale), { maximumFractionDigits: digits });
}

export function shortHash(h: string, n = 8): string {
  if (!h || h.length <= n * 2 + 1) return h;
  return `${h.slice(0, n)}…${h.slice(-n)}`;
}

export function formatDate(unix?: number, locale: Locale = DEFAULT_LOCALE): string {
  if (!unix) return UNCONFIRMED[locale].long;
  return new Date(unix * 1000).toLocaleString(intl(locale));
}

export function formatDateShort(unix?: number, locale: Locale = DEFAULT_LOCALE): string {
  if (!unix) return UNCONFIRMED[locale].short;
  return new Date(unix * 1000).toLocaleDateString(intl(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** ISO-Zeitstempel (etwa aus der Datenbank) in der gewählten Sprache. */
export function formatTimestamp(iso: string | undefined, locale: Locale = DEFAULT_LOCALE, fallback = "–"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString(intl(locale));
}

/* --------------------------------------------------------------------------
 * An eine Sprache gebundene Formatierer.
 *
 * Komponenten holen sie über `useFormatters()` bzw. `getFormatters()` und
 * müssen die Sprache dann nicht bei jedem einzelnen Aufruf mitgeben.
 * -------------------------------------------------------------------------- */

export interface Formatters {
  locale: Locale;
  intlLocale: string;
  amount: (value: number | undefined, chain?: ChainId, digits?: number) => string;
  btc: (sat: number | undefined, digits?: number) => string;
  fiat: (value: number | undefined, rate: number | undefined, chain?: ChainId, currency?: string) => string;
  percent: (v: number, digits?: number) => string;
  number: (v: number, digits?: number) => string;
  date: (unix?: number) => string;
  dateShort: (unix?: number) => string;
  timestamp: (iso: string | undefined, fallback?: string) => string;
}

export function makeFormatters(locale: Locale): Formatters {
  return {
    locale,
    intlLocale: intl(locale),
    amount: (value, chain = "bitcoin", digits = 8) => formatAmount(value, chain, digits, locale),
    btc: (sat, digits = 8) => formatBtc(sat, digits, locale),
    fiat: (value, rate, chain = "bitcoin", currency = "EUR") => formatFiat(value, rate, chain, currency, locale),
    percent: (v, digits = 1) => formatPercent(v, digits, locale),
    number: (v, digits = 0) => formatNumber(v, digits, locale),
    date: (unix) => formatDate(unix, locale),
    dateShort: (unix) => formatDateShort(unix, locale),
    timestamp: (iso, fallback = "–") => formatTimestamp(iso, locale, fallback),
  };
}

/* --- Bitcoin-spezifische Kurzformen, weiterhin für die BTC-Seiten genutzt --- */

export function isTxid(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s.trim());
}

export function isBtcAddress(s: string): boolean {
  return isChainAddress(s, "bitcoin");
}

export function classifyInput(s: string): "address" | "txid" | "unknown" {
  if (isTxid(s)) return "txid";
  if (isBtcAddress(s)) return "address";
  return "unknown";
}
