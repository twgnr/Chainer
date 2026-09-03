/**
 * Zweistufiger Cache: Prozessspeicher (schnell, flüchtig) und MongoDB (persistent,
 * überlebt Neustarts und wird von allen Instanzen geteilt). Ohne MONGODB_URI wird
 * nur der Speicher-Cache genutzt.
 */
interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 5000;

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number) {
  if (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first !== undefined) store.delete(first);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function cacheDelete(prefix: string) {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

/** Führt fn nur einmal pro Key innerhalb der TTL aus (mit Request-Deduplizierung). */
export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn()
    .then((v) => {
      cacheSet(key, v, ttlMs);
      return v;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/* ---------------- Persistente Ebene (MongoDB) ---------------- */

let persistBroken = false;

async function persistentGet<T>(key: string): Promise<T | undefined> {
  if (persistBroken || !process.env.MONGODB_URI) return undefined;
  try {
    const { connectDb } = await import("./db");
    const { CacheEntry } = await import("./models/CacheEntry");
    const db = await connectDb();
    if (!db) return undefined;
    const doc = await CacheEntry.findOne({ _id: key }).lean();
    if (!doc || doc.expiresAt.getTime() < Date.now()) return undefined;
    return doc.value as T;
  } catch {
    persistBroken = true;
    return undefined;
  }
}

async function persistentSet<T>(key: string, value: T, ttlMs: number) {
  if (persistBroken || !process.env.MONGODB_URI) return;
  try {
    const { connectDb } = await import("./db");
    const { CacheEntry } = await import("./models/CacheEntry");
    const db = await connectDb();
    if (!db) return;
    await CacheEntry.updateOne(
      { _id: key },
      { $set: { value, expiresAt: new Date(Date.now() + ttlMs) } },
      { upsert: true },
    );
  } catch {
    persistBroken = true;
  }
}

/**
 * Wie memo(), aber zusätzlich in MongoDB persistiert. Für teure, langlebige Daten
 * (bestätigte Transaktionen, Kurshistorie, Sanktions- und Label-Listen).
 */
export async function memoPersist<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = (async () => {
    const fromDb = await persistentGet<T>(key);
    if (fromDb !== undefined) {
      cacheSet(key, fromDb, Math.min(ttlMs, 10 * 60_000));
      return fromDb;
    }
    const v = await fn();
    cacheSet(key, v, Math.min(ttlMs, 10 * 60_000));
    void persistentSet(key, v, ttlMs);
    return v;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function cacheStats(): Promise<{ memory: number; persistent: number | null }> {
  let persistent: number | null = null;
  if (!persistBroken && process.env.MONGODB_URI) {
    try {
      const { connectDb } = await import("./db");
      const { CacheEntry } = await import("./models/CacheEntry");
      if (await connectDb()) persistent = await CacheEntry.countDocuments();
    } catch {
      persistent = null;
    }
  }
  return { memory: store.size, persistent };
}

export async function cacheClear(): Promise<void> {
  store.clear();
  if (!persistBroken && process.env.MONGODB_URI) {
    try {
      const { connectDb } = await import("./db");
      const { CacheEntry } = await import("./models/CacheEntry");
      if (await connectDb()) await CacheEntry.deleteMany({});
    } catch {
      /* ignorieren */
    }
  }
}
