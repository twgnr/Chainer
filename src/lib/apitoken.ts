import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { connectDb } from "./db";
import { ApiToken, TOKEN_SCOPES, type TokenScope } from "./models/ApiToken";
import { User } from "./models/User";

/** Erkennungsmerkmal am Anfang jedes Tokens */
export const TOKEN_PREFIX = "chk_";
/** Länge des Präfixes, das zur Wiedererkennung gespeichert wird */
const VISIBLE_PREFIX_LEN = TOKEN_PREFIX.length + 6;
/** lastUsedAt wird höchstens einmal pro Minute geschrieben */
const LAST_USED_INTERVAL_MS = 60_000;

export interface TokenInfo {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  expired: boolean;
  createdAt: string | null;
}

export interface TokenIdentity {
  userId: string;
  orgId?: string;
  scopes: string[];
}

/** SHA-256-Hashwert eines Tokens in Hex */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Prüft, ob eine Zeichenkette wie ein gültiger Rechtename aussieht */
export function isTokenScope(v: unknown): v is TokenScope {
  return typeof v === "string" && (TOKEN_SCOPES as readonly string[]).includes(v);
}

/**
 * Legt ein neues Token an und gibt es EINMALIG im Klartext zurück.
 * Gespeichert wird nur der Hashwert.
 */
export async function createToken(
  userId: string,
  name: string,
  scopes: string[] = ["read", "trace"],
  expiresInDays?: number,
): Promise<{ token: string; id: string }> {
  const db = await connectDb();
  if (!db) throw new Error("MongoDB ist nicht konfiguriert");

  const token = TOKEN_PREFIX + randomBytes(20).toString("hex");
  const clean = scopes.filter(isTokenScope);
  const user = await User.findById(userId).select("orgId").lean();
  const expiresAt =
    typeof expiresInDays === "number" && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const doc = await ApiToken.create({
    userId,
    orgId: user?.orgId ?? null,
    name,
    tokenHash: hashToken(token),
    prefix: token.slice(0, VISIBLE_PREFIX_LEN),
    scopes: clean.length ? clean : ["read", "trace"],
    expiresAt,
  });
  return { token, id: doc._id.toString() };
}

/**
 * Prüft ein Klartext-Token gegen die gespeicherten Hashwerte.
 * Berücksichtigt Widerruf und Ablauf; `lastUsedAt` wird höchstens einmal pro Minute geschrieben.
 */
export async function verifyToken(token: string): Promise<TokenIdentity | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  let db: Awaited<ReturnType<typeof connectDb>> = null;
  try {
    db = await connectDb();
  } catch {
    return null;
  }
  if (!db) return null;

  const hash = hashToken(token);
  const doc = await ApiToken.findOne({ tokenHash: hash });
  if (!doc) return null;
  // Zusätzlicher Vergleich in konstanter Zeit
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(String(doc.tokenHash), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (doc.revoked) return null;
  if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) return null;

  const last = doc.lastUsedAt ? doc.lastUsedAt.getTime() : 0;
  if (Date.now() - last > LAST_USED_INTERVAL_MS) {
    await ApiToken.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } }).catch(() => null);
  }

  return {
    userId: String(doc.userId),
    orgId: doc.orgId ? String(doc.orgId) : undefined,
    scopes: (doc.scopes ?? []).map((s) => String(s)),
  };
}

/** Liest das Token aus `Authorization: Bearer chk_…` oder dem Kopf `X-API-Key`. */
export function tokenFromRequest(req: Request): string | null {
  return tokenFromHeaderValues(req.headers.get("authorization"), req.headers.get("x-api-key"));
}

/** Wie `tokenFromRequest`, aber für einzelne Kopfzeilen (z. B. aus `headers()`). */
export function tokenFromHeaderValues(authorization: string | null, apiKey: string | null): string | null {
  const auth = (authorization || "").trim();
  if (/^Bearer\s+/i.test(auth)) {
    const value = auth.replace(/^Bearer\s+/i, "").trim();
    if (value.startsWith(TOKEN_PREFIX)) return value;
  }
  const key = (apiKey || "").trim();
  if (key.startsWith(TOKEN_PREFIX)) return key;
  return null;
}

/** Alle Token eines Nutzers – niemals das Klartext-Token, nur das Präfix. */
export async function listTokens(userId: string): Promise<TokenInfo[]> {
  const db = await connectDb();
  if (!db) return [];
  const docs = await ApiToken.find({ userId }).sort({ createdAt: -1 }).lean();
  const now = Date.now();
  return docs.map((d) => ({
    id: String(d._id),
    name: String(d.name),
    prefix: String(d.prefix || ""),
    scopes: (d.scopes ?? []).map((s) => String(s)),
    lastUsedAt: d.lastUsedAt ? new Date(d.lastUsedAt).toISOString() : null,
    expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : null,
    revoked: !!d.revoked,
    expired: !!d.expiresAt && new Date(d.expiresAt).getTime() <= now,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
  }));
}

/** Widerruft ein eigenes Token. Gibt false zurück, wenn es nicht existiert. */
export async function revokeToken(userId: string, id: string): Promise<boolean> {
  const db = await connectDb();
  if (!db) return false;
  const res = await ApiToken.updateOne({ _id: id, userId }, { $set: { revoked: true } });
  return res.matchedCount > 0;
}
