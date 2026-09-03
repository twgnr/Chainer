import { connectDb } from "./db";
import { Case } from "./models/Case";
import { User } from "./models/User";
import { contextForUser } from "./auth";
import { runTrace } from "./trace/engine";
import { traceParamsSchema } from "./trace/params";
import { notify } from "./notify";
import { toLocale } from "./i18n/locale";
import { CASE_TEXT } from "./i18n/notify";
import { formatAmount, shortHash } from "./format";
import { isChainId, type ChainId } from "./chains";
import type { TraceResult } from "./trace/types";

/**
 * Automatische Aktualisierung gespeicherter Fälle.
 *
 * Ein Fall wird in einem festen Abstand neu gerechnet. Weicht das Ergebnis vom
 * letzten Stand ab (neue Adressen, neue Transaktionen, neue Warnungen), wird ein
 * Eintrag ins Ermittlungsprotokoll geschrieben und der Besitzer benachrichtigt.
 */

export interface CaseRefreshResult {
  checked: number;
  refreshed: number;
  changed: number;
  notified: number;
  errors: { caseId: string; error: string }[];
}

function appUrl(path: string) {
  const base = process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  return `${base}${path}`;
}

interface Diff {
  newAddresses: string[];
  newTxs: string[];
  newRiskSources: string[];
  changed: boolean;
}

/** Vergleicht zwei Trace-Ergebnisse und listet die Zugänge auf. */
export function diffResults(before: TraceResult | undefined, after: TraceResult): Diff {
  const oldAddresses = new Set(
    (before?.nodes ?? []).filter((n) => n.data.type === "address").map((n) => n.id),
  );
  const oldTxs = new Set((before?.nodes ?? []).filter((n) => n.data.type === "tx").map((n) => n.id));
  const oldRisks = new Set((before?.riskSources ?? []).map((r) => r.address));

  const newAddresses = after.nodes
    .filter((n) => n.data.type === "address" && !oldAddresses.has(n.id))
    .map((n) => (n.data as { address: string }).address);
  const newTxs = after.nodes
    .filter((n) => n.data.type === "tx" && !oldTxs.has(n.id))
    .map((n) => (n.data as { txid: string }).txid);
  const newRiskSources = after.riskSources.filter((r) => !oldRisks.has(r.address)).map((r) => r.address);

  return {
    newAddresses,
    newTxs,
    newRiskSources,
    changed: newAddresses.length > 0 || newTxs.length > 0 || newRiskSources.length > 0,
  };
}

/**
 * Prüft fällige Fälle. Ohne `caseId` werden alle Fälle geprüft, deren
 * Aktualisierung eingeschaltet und deren Abstand abgelaufen ist.
 */
export async function refreshCases(opts: { caseId?: string; userId?: string; limit?: number } = {}): Promise<CaseRefreshResult> {
  const out: CaseRefreshResult = { checked: 0, refreshed: 0, changed: 0, notified: 0, errors: [] };
  const db = await connectDb();
  if (!db) return out;

  const filter: Record<string, unknown> = opts.caseId ? { _id: opts.caseId } : { autoRefresh: true };
  if (opts.userId) filter.userId = opts.userId;
  const cases = await Case.find(filter).limit(opts.limit ?? 25);

  for (const c of cases) {
    out.checked++;
    const intervalMs = Math.max(1, c.refreshIntervalHours || 24) * 3600_000;
    const due = !c.lastRefreshAt || Date.now() - new Date(c.lastRefreshAt).getTime() >= intervalMs;
    if (!opts.caseId && !due) continue;

    try {
      const chain: ChainId = isChainId(c.chain) ? c.chain : "bitcoin";
      const ctx = await contextForUser(String(c.userId), chain);
      // Zuletzt gespeicherten Trace als Vergleichsgrundlage nehmen
      const lastTrace = c.traces.length ? c.traces[c.traces.length - 1] : null;
      const rawParams = (lastTrace?.params ?? c.params ?? {}) as Record<string, unknown>;
      const parsed = traceParamsSchema.safeParse({
        ...rawParams,
        start: lastTrace?.start ?? c.start,
        chain,
        // Der Nachweis wird beim automatischen Lauf nicht mitgeschrieben
        evidence: false,
      });
      if (!parsed.success) {
        out.errors.push({ caseId: String(c._id), error: "Parameter des Falls sind unvollständig" });
        continue;
      }

      const result = await runTrace(ctx, parsed.data);
      out.refreshed++;
      const before = (lastTrace?.result ?? c.result) as TraceResult | undefined;
      const diff = diffResults(before, result);

      c.lastRefreshAt = new Date();
      if (diff.changed) {
        out.changed++;
        // Der Fall gehört einem Konto; dessen Sprache bestimmt Protokoll und
        // Benachrichtigung.
        const user = await User.findById(c.userId).lean();
        const locale = toLocale(user?.locale);
        const t = CASE_TEXT[locale];
        const parts = [
          diff.newTxs.length ? t.newTxs(diff.newTxs.length) : null,
          diff.newAddresses.length ? t.newAddresses(diff.newAddresses.length) : null,
          diff.newRiskSources.length ? t.newRiskSources(diff.newRiskSources.length) : null,
        ].filter(Boolean);
        const text = t.logEntry(parts.join(", "));
        c.log.push({ at: new Date(), author: t.systemAuthor, text });
        c.traces.push({
          id: `auto-${Date.now()}`,
          name: t.traceName(new Date().toLocaleDateString(locale === "de" ? "de-DE" : "en-GB")),
          start: parsed.data.start,
          chain,
          params: parsed.data,
          result,
          createdAt: new Date(),
        });
        // Nur die letzten zehn automatischen Läufe behalten
        if (c.traces.length > 10) c.set("traces", c.traces.slice(-10));

        if (user) {
          const results = await notify(
            {
              email: user.notify?.email !== false ? user.email : undefined,
              telegramChatId: user.notify?.telegramChatId || undefined,
              webhookUrl: user.notify?.webhookUrl || undefined,
            },
            {
              subject: t.subject(c.name),
              text:
                `${text}\n` +
                (diff.newRiskSources.length
                  ? t.riskLine(diff.newRiskSources.slice(0, 3).map((a) => shortHash(a, 8)).join(", "))
                  : "") +
                t.volume(
                  formatAmount(
                    result.nodes
                      .filter((n) => n.data.type === "tx")
                      .reduce((s, n) => s + (n.data as { totalOutSat: number }).totalOutSat, 0),
                    chain,
                    4,
                    locale,
                  ),
                ),
              url: appUrl(`/cases/${String(c._id)}`),
            },
          );
          if (results.some((r) => r.ok)) out.notified++;
        }
      }
      await c.save();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.errors.push({ caseId: String(c._id), error: msg });
      c.lastRefreshAt = new Date();
      await c.save().catch(() => {});
    }
  }
  return out;
}
