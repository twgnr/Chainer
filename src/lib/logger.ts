import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Strukturierte Protokollierung.
 *
 * Jede Zeile ist ein JSON-Objekt, damit sich die Ausgabe maschinell auswerten
 * lässt. Zu jeder Anfrage gehört eine Kennung, die in allen Zeilen derselben
 * Anfrage auftaucht. Scheitert bei einem Nutzer eine Analyse, lässt sich damit
 * der gesamte Ablauf nachvollziehen.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = (process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVELS[configured as LogLevel] ?? LEVELS.info;
}

export interface RequestContext {
  requestId: string;
  route?: string;
  method?: string;
  userId?: string;
  startedAt: number;
}

const store = new AsyncLocalStorage<RequestContext>();

export function currentRequest(): RequestContext | undefined {
  return store.getStore();
}

/** Kennung der laufenden Anfrage, oder "-" außerhalb einer Anfrage. */
export function requestId(): string {
  return store.getStore()?.requestId ?? "-";
}

function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < threshold()) return;
  const ctx = store.getStore();
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(ctx ? { requestId: ctx.requestId, route: ctx.route, method: ctx.method, userId: ctx.userId } : {}),
    ...fields,
  };
  // In der Entwicklung lesbar, im Betrieb als JSON-Zeile
  if (process.env.NODE_ENV !== "production" && process.env.LOG_JSON !== "true") {
    const extra = Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" ");
    const prefix = ctx ? `[${ctx.requestId.slice(0, 8)}]` : "[-]";
    const out = `${prefix} ${level.toUpperCase()} ${message}${extra ? " " + extra : ""}`;
    if (level === "error") console.error(out);
    else if (level === "warn") console.warn(out);
    else console.log(out);
    return;
  }
  const json = JSON.stringify(line);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  else console.log(json);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

/** Fehlerobjekt in protokollierbare Felder umwandeln. */
export function errorFields(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { error: e.message, errorName: e.name, stack: e.stack?.split("\n").slice(0, 4).join(" | ") };
  return { error: String(e) };
}

/**
 * Umschließt einen Route-Handler: vergibt eine Anfragekennung, protokolliert
 * Beginn und Ende samt Dauer und Statuscode und hängt die Kennung an die Antwort.
 */
export function withLogging<T extends unknown[]>(
  route: string,
  handler: (req: Request, ...rest: T) => Promise<Response>,
): (req: Request, ...rest: T) => Promise<Response> {
  return async (req: Request, ...rest: T) => {
    const incoming = req.headers.get("x-request-id");
    const ctx: RequestContext = {
      requestId: incoming && incoming.length <= 64 ? incoming : randomUUID(),
      route,
      method: req.method,
      startedAt: Date.now(),
    };
    return store.run(ctx, async () => {
      log.debug("Anfrage begonnen");
      try {
        const res = await handler(req, ...rest);
        const ms = Date.now() - ctx.startedAt;
        const level: LogLevel = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
        write(level, "Anfrage beendet", { status: res.status, ms });
        // Kennung zurückgeben, damit sie im Fehlerfall genannt werden kann
        const headers = new Headers(res.headers);
        headers.set("x-request-id", ctx.requestId);
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      } catch (e) {
        log.error("Anfrage fehlgeschlagen", { ...errorFields(e), ms: Date.now() - ctx.startedAt });
        throw e;
      }
    });
  };
}

/** Setzt die Nutzerkennung der laufenden Anfrage, sobald sie bekannt ist. */
export function setLogUser(userId: string | undefined) {
  const ctx = store.getStore();
  if (ctx) ctx.userId = userId;
}

/** Führt eine Hintergrundaufgabe mit eigener Kennung aus. */
export async function withBackgroundContext<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const ctx: RequestContext = { requestId: randomUUID(), route: name, method: "JOB", startedAt: Date.now() };
  return store.run(ctx, async () => {
    log.info("Hintergrundaufgabe begonnen");
    try {
      const r = await fn();
      log.info("Hintergrundaufgabe beendet", { ms: Date.now() - ctx.startedAt });
      return r;
    } catch (e) {
      log.error("Hintergrundaufgabe fehlgeschlagen", { ...errorFields(e), ms: Date.now() - ctx.startedAt });
      throw e;
    }
  });
}
