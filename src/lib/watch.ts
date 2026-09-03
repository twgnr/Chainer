import { connectDb } from "./db";
import { Watch } from "./models/Watch";
import { User } from "./models/User";
import { contextForUser } from "./auth";
import { getAddress, getAddressTxs, lookupLabels } from "./providers/registry";
import { classifyHarmful } from "./trace/risk";
import { notify } from "./notify";
import { formatAmount, shortHash } from "./format";
import { isChainId, type ChainId } from "./chains";
import { toLocale, type Locale } from "./i18n/locale";
import { WATCH_TEXT } from "./i18n/notify";
import { translateHint } from "./i18n/hints";

export interface WatchCheckResult {
  checked: number;
  changed: number;
  notified: number;
  errors: { address: string; error: string }[];
}

function appUrl(path: string) {
  const base = process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  return `${base}${path}`;
}

/**
 * Prüft alle (oder die angegebenen) beobachteten Adressen auf neue Aktivität und
 * benachrichtigt die Besitzer. Wird vom Endpunkt /api/watch/check und vom
 * optionalen Hintergrund-Intervall aufgerufen.
 */
export async function checkWatches(opts: { userId?: string; limit?: number } = {}): Promise<WatchCheckResult> {
  const out: WatchCheckResult = { checked: 0, changed: 0, notified: 0, errors: [] };
  const db = await connectDb();
  if (!db) return out;

  const filter: Record<string, unknown> = { active: true };
  if (opts.userId) filter.userId = opts.userId;
  const watches = await Watch.find(filter).limit(opts.limit ?? 200);
  if (!watches.length) return out;

  // Kontexte je Nutzer nur einmal aufbauen
  const ctxCache = new Map<string, Awaited<ReturnType<typeof contextForUser>>>();
  const userCache = new Map<
    string,
    { email: string; telegramChatId?: string; webhookUrl?: string; wantsEmail: boolean; locale: Locale }
  >();

  /** Nutzerangaben je Konto nur einmal laden. */
  async function userOf(userId: string) {
    let user = userCache.get(userId);
    if (!user) {
      const u = await User.findById(userId).lean();
      user = {
        email: u?.email ?? "",
        telegramChatId: u?.notify?.telegramChatId || undefined,
        webhookUrl: u?.notify?.webhookUrl || undefined,
        wantsEmail: u?.notify?.email !== false,
        locale: toLocale(u?.locale),
      };
      userCache.set(userId, user);
    }
    return user;
  }

  for (const w of watches) {
    const chain: ChainId = isChainId(w.chain) ? w.chain : "bitcoin";
    const userId = String(w.userId);
    const ctxKey = `${userId}:${chain}`;
    out.checked++;
    try {
      let ctx = ctxCache.get(ctxKey);
      if (!ctx) {
        ctx = await contextForUser(userId, chain);
        ctxCache.set(ctxKey, ctx);
      }
      const [info, txs] = await Promise.all([
        getAddress(ctx, w.address),
        getAddressTxs(ctx, w.address, 5).catch(() => null),
      ]);
      const latest = txs?.data[0];
      const newTx = latest && latest.txid !== w.lastTxid;
      const delta = w.lastBalanceSat === null || w.lastBalanceSat === undefined ? 0 : info.data.balanceSat - w.lastBalanceSat;
      const firstRun = !w.lastCheckedAt;

      w.lastCheckedAt = new Date();
      w.lastError = "";

      if (firstRun) {
        // Erster Durchlauf legt nur den Ausgangszustand fest
        w.lastTxid = latest?.txid || "";
        w.lastBalanceSat = info.data.balanceSat;
        await w.save();
        continue;
      }

      if (newTx && Math.abs(delta) >= (w.minValueSat || 0)) {
        out.changed++;
        // Die Sprache des Kontos bestimmt Text und Zahlenformat.
        const user = await userOf(userId);
        const t = WATCH_TEXT[user.locale];
        const dir = delta >= 0 ? t.incoming : t.outgoing;
        // Esplora liefert auch Transaktionen aus dem Mempool; sie werden als
        // unbestätigt gemeldet, damit man sofort reagieren kann.
        const pending = latest && !latest.confirmed ? t.unconfirmed : "";

        // Bei Zuflüssen die direkten Absender gegen die Label- und Sanktionsquellen prüfen
        let riskNote = "";
        let riskShort = "";
        if (delta > 0 && latest) {
          const senders = [
            ...new Set(
              latest.inputs
                .filter((i) => i.address && i.address !== w.address && !i.coinbase)
                .map((i) => i.address as string),
            ),
          ].slice(0, 8);
          const hits: string[] = [];
          for (const sender of senders) {
            try {
              const labels = await lookupLabels(ctx, sender);
              const verdict = classifyHarmful(labels.labels, true);
              if (verdict)
                hits.push(t.sender(sender, translateHint(verdict.label, user.locale), verdict.source));
            } catch {
              /* Label-Quelle nicht erreichbar */
            }
          }
          if (hits.length) {
            riskNote = t.riskWarning(hits.join("\n"));
            riskShort = t.riskShort;
          }
        }

        const text =
          t.body(
            dir,
            w.label || w.address,
            formatAmount(Math.abs(delta), chain, 8, user.locale),
            formatAmount(info.data.balanceSat, chain, 8, user.locale),
            latest!.txid,
          ) + riskNote;
        w.events.unshift({
          at: new Date(),
          txid: latest!.txid,
          text: t.event(
            dir,
            pending,
            formatAmount(Math.abs(delta), chain, 8, user.locale),
            shortHash(latest!.txid, 6),
            riskShort,
          ),
          deltaSat: delta,
          read: false,
        });
        if (w.events.length > 50) w.events.splice(50);

        const results = await notify(
          {
            email: user.wantsEmail ? user.email : undefined,
            telegramChatId: user.telegramChatId,
            webhookUrl: user.webhookUrl,
          },
          {
            subject: `Chainer: ${riskShort ? "\u26a0 " : ""}${dir} bei ${w.label || shortHash(w.address, 8)}`,
            text,
            url: appUrl(`/address/${w.address}?chain=${chain}`),
          },
        );
        if (results.some((r) => r.ok)) out.notified++;
      }

      w.lastTxid = latest?.txid || w.lastTxid;
      w.lastBalanceSat = info.data.balanceSat;
      await w.save();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.errors.push({ address: w.address, error: msg });
      w.lastError = msg.slice(0, 300);
      w.lastCheckedAt = new Date();
      await w.save().catch(() => {});
    }
  }
  return out;
}
