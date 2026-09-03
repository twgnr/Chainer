import { cookies, headers } from "next/headers";
import { randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { connectDb, isDbConfigured } from "./db";
import { MAX_SESSIONS, User, type UserSessionEntry } from "./models/User";
import { Org, type OrgRole } from "./models/Org";
import { decrypt } from "./crypto";
import { buildContext } from "./providers/registry";
import { setLogUser } from "./logger";
import { tokenFromHeaderValues, tokenFromRequest, verifyToken } from "./apitoken";
import { DEFAULT_CHAIN, isChainId, type ChainId } from "./chains";
import type { ProviderContext } from "./providers/types";

const COOKIE = "chainer_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 Tage

export interface Session {
  userId: string;
  email: string;
  /** Kennung dieser Sitzung im Sitzungsverzeichnis (ältere Token: nicht gesetzt) */
  sid?: string;
}

/** Angaben zum Gerät, die beim Anmelden festgehalten werden */
export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET ist nicht gesetzt");
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/**
 * Zwischenspeicher für die Sitzungsprüfung.
 *
 * Ohne ihn müsste jede einzelne Anfrage den Nutzer aus der Datenbank lesen.
 * Das Ergebnis gilt deshalb 60 Sekunden je Sitzungs-ID; ein Widerruf im selben
 * Prozess wirkt sofort (siehe `forgetSessionCache`), sonst spätestens nach
 * dieser Zeit.
 */
const SESSION_CACHE_MS = 60_000;
const MAX_SESSION_CACHE = 5_000;
const sessionCache = new Map<string, { valid: boolean; at: number }>();

/** Entfernt Einträge aus dem Zwischenspeicher (eine Sitzung oder alle). */
export function forgetSessionCache(sid?: string) {
  if (sid) sessionCache.delete(sid);
  else sessionCache.clear();
}

/** Prüft gegen die Datenbank, ob Sitzung und tokenVersion noch gültig sind. */
async function sessionStillValid(userId: string, sid: string, tv: number): Promise<boolean> {
  const now = Date.now();
  const hit = sessionCache.get(sid);
  if (hit && now - hit.at < SESSION_CACHE_MS) return hit.valid;

  let valid: boolean;
  try {
    const db = await connectDb();
    if (!db) return true; // ohne Datenbank wie bisher: das Token trägt sich selbst
    const user = await User.findById(userId).select("tokenVersion sessions").lean();
    if (!user) valid = false;
    else valid = (user.tokenVersion ?? 0) === tv && (user.sessions ?? []).some((s) => s.id === sid);
    if (valid) {
      // Beim Nachladen zugleich den Zeitstempel auffrischen
      await User.updateOne({ _id: userId, "sessions.id": sid }, { $set: { "sessions.$.lastSeenAt": new Date() } });
    }
  } catch {
    return true; // eine gestörte Datenbank soll niemanden aussperren
  }

  if (sessionCache.size >= MAX_SESSION_CACHE) {
    for (const [k, v] of sessionCache) if (now - v.at >= SESSION_CACHE_MS) sessionCache.delete(k);
    if (sessionCache.size >= MAX_SESSION_CACHE) {
      const first = sessionCache.keys().next().value;
      if (first !== undefined) sessionCache.delete(first);
    }
  }
  sessionCache.set(sid, { valid, at: now });
  return valid;
}

/**
 * Legt das Sitzungs-Cookie an und vermerkt die Sitzung beim Nutzer.
 *
 * Das JWT trägt zusätzlich `tv` (Stand des Widerruf-Zählers) und `sid`
 * (Kennung dieser Sitzung), damit sich einzelne Geräte abmelden lassen.
 */
export async function createSession(session: Session, meta: SessionMeta = {}) {
  const sid = randomBytes(16).toString("hex");
  let tv = 0;
  try {
    const db = await connectDb();
    if (db) {
      const user = await User.findById(session.userId);
      if (user) {
        tv = user.tokenVersion ?? 0;
        const jetzt = new Date();
        const eintrag: UserSessionEntry = {
          id: sid,
          createdAt: jetzt,
          lastSeenAt: jetzt,
          userAgent: (meta.userAgent || "").slice(0, 300),
          ip: (meta.ip || "").slice(0, 100),
        };
        // Einem Dokument-Array darf man kein einfaches Array zuweisen -> set()
        const liste = [...(user.sessions ?? []), eintrag];
        user.set("sessions", liste.slice(-MAX_SESSIONS));
        await user.save();
      }
    }
  } catch {
    /* ohne Datenbank bleibt die Sitzung nur im Token – wie bisher */
  }

  const token = await new SignJWT({ email: session.email, tv, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Gerätekennung und IP der laufenden Anfrage für das Sitzungsverzeichnis */
export function sessionMetaFromRequest(req: Request): SessionMeta {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip") || h.get("cf-connecting-ip") || "";
  return { userAgent: h.get("user-agent") || "", ip };
}

export async function getSession(): Promise<Session | null> {
  if (!isDbConfigured() || !process.env.AUTH_SECRET) return null;
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const sid = typeof payload.sid === "string" ? payload.sid : "";
    const tv = typeof payload.tv === "number" ? payload.tv : 0;
    const session: Session = { userId: payload.sub, email: String(payload.email || ""), sid: sid || undefined };
    // Ältere Token ohne `sid` bleiben gültig, damit niemand plötzlich ausgesperrt wird
    if (!sid) return session;
    if (!(await sessionStillValid(payload.sub, sid, tv))) return null;
    return session;
  } catch {
    return null;
  }
}

/** Sitzungen eines Nutzers, neueste zuerst */
export async function listSessions(userId: string): Promise<UserSessionEntry[]> {
  const db = await connectDb();
  if (!db) return [];
  const user = await User.findById(userId).select("sessions").lean();
  const liste = (user?.sessions ?? []) as UserSessionEntry[];
  return [...liste].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Beendet eine einzelne Sitzung. Gibt false zurück, wenn es sie nicht gab. */
export async function revokeSession(userId: string, sid: string): Promise<boolean> {
  const db = await connectDb();
  if (!db) return false;
  const user = await User.findById(userId);
  if (!user) return false;
  const vorher = (user.sessions ?? []).length;
  const liste = (user.sessions ?? []).filter((s) => s.id !== sid);
  if (liste.length === vorher) return false;
  user.set("sessions", liste);
  await user.save();
  forgetSessionCache(sid);
  return true;
}

/**
 * Meldet alle Geräte ab: erhöht den Widerruf-Zähler und leert das
 * Sitzungsverzeichnis. Damit werden sämtliche bestehenden Token ungültig.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const db = await connectDb();
  if (!db) return 0;
  const user = await User.findById(userId);
  if (!user) return 0;
  const anzahl = (user.sessions ?? []).length;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  user.set("sessions", []);
  await user.save();
  forgetSessionCache();
  return anzahl;
}

function decryptMap(map: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!map) return out;
  const entries = map instanceof Map ? [...map.entries()] : Object.entries(map as Record<string, unknown>);
  for (const [k, v] of entries) {
    if (typeof v !== "string") continue;
    try {
      out[k] = decrypt(v);
    } catch {
      /* mit anderem Secret verschlüsselt -> überspringen */
    }
  }
  return out;
}

export interface UserSettings {
  userKeys: Record<string, string>;
  orgKeys: Record<string, string>;
  config: Record<string, Record<string, string>>;
  orgId?: string;
  orgName?: string;
  role?: OrgRole;
  /** Nur Quellen nutzen, die die gesuchte Adresse nicht an Dritte weitergeben */
  privacyMode?: boolean;
}

/** Entschlüsselte Keys und Provider-Konfiguration des Nutzers und seines Teams */
export async function getUserSettings(session: Session | null): Promise<UserSettings> {
  const empty: UserSettings = { userKeys: {}, orgKeys: {}, config: {} };
  if (!session) return empty;
  try {
    const db = await connectDb();
    if (!db) return empty;
    const user = await User.findById(session.userId).lean();
    if (!user) return empty;
    const config: Record<string, Record<string, string>> = {};
    const cfgSrc = user.providerConfig;
    const cfgEntries =
      cfgSrc instanceof Map ? [...cfgSrc.entries()] : Object.entries((cfgSrc || {}) as Record<string, unknown>);
    for (const [provider, value] of cfgEntries) config[provider] = decryptMap(value);

    let orgKeys: Record<string, string> = {};
    let orgName: string | undefined;
    let role: OrgRole | undefined;
    if (user.orgId) {
      const org = await Org.findById(user.orgId).lean();
      if (org) {
        orgKeys = decryptMap(org.apiKeys);
        orgName = org.name;
        role = org.members.find((m) => String(m.userId) === session.userId)?.role as OrgRole | undefined;
      }
    }
    return {
      userKeys: decryptMap(user.apiKeys),
      orgKeys,
      config,
      privacyMode: !!user.privacyMode,
      orgId: user.orgId ? String(user.orgId) : undefined,
      orgName,
      role,
    };
  } catch {
    return empty;
  }
}

/** Alter Name, weiterhin für die Key-Verwaltung genutzt */
export async function getUserKeys(session: Session | null): Promise<Record<string, string>> {
  return (await getUserSettings(session)).userKeys;
}

/** Chain aus der Anfrage lesen (Query-Parameter `chain`) */
export function chainFromRequest(req: Request | undefined): ChainId {
  if (!req) return DEFAULT_CHAIN;
  try {
    const c = new URL(req.url).searchParams.get("chain");
    return isChainId(c) ? c : DEFAULT_CHAIN;
  } catch {
    return DEFAULT_CHAIN;
  }
}

/** Wie die Anfrage angemeldet wurde */
export type AuthKind = "session" | "token" | "none";

export interface RequestContext {
  session: Session | null;
  ctx: ProviderContext;
  settings: UserSettings;
  /** Herkunft der Anmeldung: Sitzungs-Cookie, Zugriffstoken oder gar keine */
  auth: AuthKind;
  /** Rechte des verwendeten Zugriffstokens */
  scopes?: string[];
}

/**
 * Sucht ein Zugriffstoken in der Anfrage. Liegt kein `Request` vor (z. B. bei
 * Serverkomponenten oder Routen ohne durchgereichte Anfrage), werden ersatzweise
 * die Kopfzeilen der laufenden Anfrage gelesen.
 */
async function findToken(req: Request | undefined): Promise<string | null> {
  if (req) return tokenFromRequest(req);
  try {
    const h = await headers();
    return tokenFromHeaderValues(h.get("authorization"), h.get("x-api-key"));
  } catch {
    return null;
  }
}

/**
 * Session + Provider-Kontext (Nutzer-Keys über Team-Keys über ENV) für eine Anfrage.
 *
 * Neben dem Sitzungs-Cookie wird auch ein Zugriffstoken akzeptiert
 * (`Authorization: Bearer chk_…` oder Kopf `X-API-Key`). Das Cookie hat Vorrang.
 */
export async function getRequestContext(opts: { chain?: ChainId; req?: Request } = {}): Promise<RequestContext> {
  let session = await getSession();
  let auth: AuthKind = session ? "session" : "none";
  let scopes: string[] | undefined;

  if (!session) {
    const token = await findToken(opts.req);
    if (token) {
      const identity = await verifyToken(token).catch(() => null);
      if (identity) {
        session = { userId: identity.userId, email: "" };
        auth = "token";
        scopes = identity.scopes;
      }
    }
  }

  const settings = await getUserSettings(session);
  const chain = opts.chain ?? chainFromRequest(opts.req);
  const ctx = buildContext({
    chain,
    userId: session?.userId,
    orgId: settings.orgId,
    userKeys: settings.userKeys,
    orgKeys: settings.orgKeys,
    config: settings.config,
    privacyMode: settings.privacyMode,
  });
  if (session) setLogUser(session.userId);
  return { session, ctx, settings, auth, scopes };
}

/** Kontext für Hintergrundaufgaben (Watchlist-Prüfung) ohne HTTP-Anfrage */
export async function contextForUser(userId: string, chain: ChainId): Promise<ProviderContext> {
  const settings = await getUserSettings({ userId, email: "" });
  return buildContext({
    chain,
    userId,
    orgId: settings.orgId,
    userKeys: settings.userKeys,
    orgKeys: settings.orgKeys,
    config: settings.config,
    privacyMode: settings.privacyMode,
  });
}
