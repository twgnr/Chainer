import { NextResponse } from "next/server";

/**
 * Einfaches Rate-Limit mit festem Zeitfenster, im Arbeitsspeicher gehalten.
 *
 * Es schützt die teuren Endpunkte (Trace, Verbindungssuche, Massenprüfung) davor,
 * die kostenlosen Datenquellen zu überlasten. Bei mehreren Instanzen zählt jede
 * für sich; für einen strengeren Schutz gehört ein Reverse-Proxy davor.
 */

export interface RateLimitRule {
  /** Erlaubte Anfragen pro Zeitfenster */
  limit: number;
  windowMs: number;
}

export interface RateLimitVerdict {
  ok: boolean;
  remaining: number;
  /** Sekunden bis zum nächsten freien Kontingent */
  retryAfter: number;
  limit: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

/** Standardregeln je Endpunkt; über ENV abschaltbar. */
export const RULES: Record<string, RateLimitRule> = {
  trace: { limit: 20, windowMs: 60_000 },
  path: { limit: 10, windowMs: 60_000 },
  screen: { limit: 5, windowMs: 60_000 },
  address: { limit: 120, windowMs: 60_000 },
  tx: { limit: 120, windowMs: 60_000 },
  ping: { limit: 10, windowMs: 60_000 },
};

function disabled() {
  return process.env.RATE_LIMIT_DISABLED === "true";
}

/** Ermittelt den Absender möglichst genau, auch hinter einem Reverse-Proxy. */
export function clientKey(req: Request): string {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || h.get("cf-connecting-ip") || "lokal";
}

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  // Falls immer noch zu voll: ältesten Eintrag entfernen
  if (buckets.size >= MAX_BUCKETS) {
    const first = buckets.keys().next().value;
    if (first !== undefined) buckets.delete(first);
  }
}

export function checkRateLimit(req: Request, route: keyof typeof RULES | string, rule?: RateLimitRule): RateLimitVerdict {
  const r = rule ?? RULES[route] ?? { limit: 60, windowMs: 60_000 };
  if (disabled()) return { ok: true, remaining: r.limit, retryAfter: 0, limit: r.limit };

  const now = Date.now();
  sweep(now);
  const key = `${route}:${clientKey(req)}`;
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + r.windowMs });
    return { ok: true, remaining: r.limit - 1, retryAfter: 0, limit: r.limit };
  }
  b.count++;
  if (b.count > r.limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000), limit: r.limit };
  }
  return { ok: true, remaining: r.limit - b.count, retryAfter: 0, limit: r.limit };
}

/** Antwort bei überschrittenem Limit, mit den üblichen Kopfzeilen. */
export function rateLimitResponse(v: RateLimitVerdict) {
  return NextResponse.json(
    {
      error: `Zu viele Anfragen. Bitte in ${v.retryAfter} Sekunden erneut versuchen. Grenze: ${v.limit} pro Minute.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(v.retryAfter),
        "X-RateLimit-Limit": String(v.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

/** Kurzform: prüft und liefert bei Überschreitung direkt die Antwort. */
export function guard(req: Request, route: string, rule?: RateLimitRule): NextResponse | null {
  const v = checkRateLimit(req, route, rule);
  return v.ok ? null : rateLimitResponse(v);
}
