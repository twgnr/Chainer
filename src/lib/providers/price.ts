import { fetchJson } from "./http";
import { memo, memoPersist } from "../cache";
import { chainMeta, type ChainId } from "../chains";

export interface PriceInfo {
  eur: number;
  usd: number;
  source: string;
  fetchedAt: number;
}

/**
 * Aktueller Kurs: CoinGecko (kostenlos, ohne Key) mit Fallback auf den
 * Blockchain.com-Ticker (nur Bitcoin).
 */
export async function getBtcPrice(chain: ChainId = "bitcoin"): Promise<PriceInfo> {
  const cg = chainMeta(chain).coingeckoId;
  return memo(`price:${chain}`, 60_000, async () => {
    try {
      const r = await fetchJson<Record<string, { eur: number; usd: number }>>(
        "coingecko",
        `https://api.coingecko.com/api/v3/simple/price?ids=${cg}&vs_currencies=eur,usd`,
      );
      const p = r[cg];
      if (!p) throw new Error("Kurs nicht gefunden");
      return { eur: p.eur, usd: p.usd, source: "CoinGecko", fetchedAt: Date.now() };
    } catch (e) {
      if (chain !== "bitcoin") throw e;
      const r = await fetchJson<Record<string, { last: number }>>("blockchain-ticker", "https://blockchain.info/ticker");
      return { eur: r.EUR.last, usd: r.USD.last, source: "Blockchain.com", fetchedAt: Date.now() };
    }
  });
}

/* -------------------- Historische Kurse -------------------- */

/** [unix-Sekunden, Kurs] aufsteigend sortiert */
export type PriceSeries = [number, number][];

const DAY = 24 * 60 * 60;

/**
 * Kurshistorie für einen Zeitraum. CoinGecko liefert im kostenlosen Tarif für
 * `market_chart/range` je nach Spanne stündliche oder tägliche Werte – eine
 * einzige Anfrage deckt damit einen kompletten Trace ab.
 * Das Ergebnis wird tagesgenau gerundet und persistent zwischengespeichert.
 */
export async function getPriceSeries(
  chain: ChainId,
  fromUnix: number,
  toUnix: number,
  currency = "eur",
): Promise<PriceSeries> {
  const cg = chainMeta(chain).coingeckoId;
  // Auf Tagesgrenzen runden, damit der Cache greift
  const from = Math.floor(fromUnix / DAY) * DAY - DAY;
  const to = Math.ceil(toUnix / DAY) * DAY + DAY;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
  // Der kostenlose CoinGecko-Zugang liefert nur die letzten 365 Tage.
  const earliest = Math.floor(Date.now() / 1000) - 364 * DAY;
  const clampedFrom = Math.max(from, earliest);
  if (to <= earliest) return [];
  const key = `pricehist:${cg}:${currency}:${clampedFrom}:${to}`;
  return memoPersist(key, 12 * 60 * 60 * 1000, async () => {
    const r = await fetchJson<{ prices?: [number, number][] }>(
      "coingecko",
      `https://api.coingecko.com/api/v3/coins/${cg}/market_chart/range?vs_currency=${currency}&from=${clampedFrom}&to=${to}`,
      { timeoutMs: 25_000 },
    );
    return (r.prices || []).map(([ms, price]): [number, number] => [Math.floor(ms / 1000), price]);
  });
}

/** Kurs zum Zeitpunkt ts per binärer Suche in der Zeitreihe (nächster Nachbar). */
export function priceAt(series: PriceSeries, ts: number | undefined): number | undefined {
  if (!series.length || !ts) return undefined;
  let lo = 0;
  let hi = series.length - 1;
  if (ts <= series[0][0]) return series[0][1];
  if (ts >= series[hi][0]) return series[hi][1];
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] === ts) return series[mid][1];
    if (series[mid][0] < ts) lo = mid;
    else hi = mid;
  }
  return Math.abs(series[lo][0] - ts) <= Math.abs(series[hi][0] - ts) ? series[lo][1] : series[hi][1];
}

/**
 * Historische Kurse für eine Liste von Zeitpunkten. Fällt auf den aktuellen Kurs
 * zurück, wenn CoinGecko nicht erreichbar ist.
 */
export async function getHistoricalPrices(
  chain: ChainId,
  timestamps: number[],
  currency = "eur",
): Promise<{ series: PriceSeries; current?: number; error?: string }> {
  const valid = timestamps.filter((t) => Number.isFinite(t) && t > 0);
  let current: number | undefined;
  try {
    current = (await getBtcPrice(chain))[currency === "usd" ? "usd" : "eur"];
  } catch {
    current = undefined;
  }
  if (!valid.length) return { series: [], current };
  try {
    const series = await getPriceSeries(chain, Math.min(...valid), Math.max(...valid), currency);
    return { series, current };
  } catch (e) {
    return { series: [], current, error: e instanceof Error ? e.message : String(e) };
  }
}
