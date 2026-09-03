"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { CHAIN_LIST, type ChainId } from "@/lib/chains";
import { shortHash } from "@/lib/format";
import { useFormatters, useT } from "@/lib/i18n/provider";
import { COMMON } from "@/lib/i18n/labels";

const TXT = {
  en: {
    loadFailed: "Loading failed.",
    networkError: "Network error while loading the watchlist.",
    addFailed: "Adding failed.",
    added: "This address is now being watched.",
    changeFailed: "The change failed.",
    confirmDelete: "Really delete this watch?",
    deleteFailed: "Deleting failed.",
    invalidResponse: "Invalid response.",
    checkFailed: "The check failed.",
    checkResult: (checked: number, changed: number, notified: number) =>
      `${checked} checked, ${changed} with a change, ${notified} notification${notified === 1 ? "" : "s"} sent.`,
    saveFailed: "Saving failed.",
    notifySaved: "Notification settings saved.",
    unreadEvents: (n: number) => `${n} unread event${n === 1 ? "" : "s"}`,
    noUnread: "No unread events",
    checkNow: "Check now",
    autoCheck: (minutes: number) => `Automatic check every ${minutes} minutes.`,
    autoCheckOff:
      "Automatic checking is inactive – set WATCH_INTERVAL_MINUTES or point a cron service at /api/watch/check with CRON_SECRET.",
    addTitle: "Watch an address",
    addressPlaceholder: "bc1…",
    labelPlaceholder: "e.g. exchange wallet",
    minAmount: (unit: string) => `Minimum amount (${unit})`,
    minAmountHint: (unit: string) =>
      `The minimum amount is given in the smallest unit of the chain (${unit}). 0 reports every movement.`,
    watch: "Watch",
    watchedTitle: "Watched addresses",
    empty: "No addresses in the watchlist yet.",
    colBalance: "Balance",
    colLastCheck: "Last check",
    colStatus: "Status",
    noLabel: "(no name)",
    unreadTitle: (n: number) => `${n} unread`,
    errorPrefix: "Error:",
    active: "active",
    paused: "paused",
    events: "Events",
    markRead: "Mark as read",
    noEvents: "No events yet.",
    notifyTitle: "Notifications",
    emailToAccount: "Send email to my account address",
    emailNotConfigured: "Email delivery is not configured – set SMTP_HOST and SMTP_FROM.",
    telegramChatId: "Telegram chat ID",
    telegramPlaceholder: "e.g. 123456789",
    telegramNotConfigured: "Telegram is not configured – set TELEGRAM_BOT_TOKEN.",
    webhookUrl: "Webhook URL",
    webhookHint: "Events are sent as JSON by POST to this URL. Leave empty to switch it off.",
  },
  de: {
    loadFailed: "Laden fehlgeschlagen.",
    networkError: "Netzwerkfehler beim Laden der Watchlist.",
    addFailed: "Hinzufügen fehlgeschlagen.",
    added: "Adresse wird jetzt beobachtet.",
    changeFailed: "Änderung fehlgeschlagen.",
    confirmDelete: "Beobachtung wirklich löschen?",
    deleteFailed: "Löschen fehlgeschlagen.",
    invalidResponse: "Ungültige Antwort.",
    checkFailed: "Prüfung fehlgeschlagen.",
    checkResult: (checked: number, changed: number, notified: number) =>
      `${checked} geprüft, ${changed} mit Veränderung, ${notified} Benachrichtigung(en) versendet.`,
    saveFailed: "Speichern fehlgeschlagen.",
    notifySaved: "Benachrichtigungseinstellungen gespeichert.",
    unreadEvents: (n: number) => `${n} ungelesene Ereignisse`,
    noUnread: "Keine ungelesenen Ereignisse",
    checkNow: "Jetzt prüfen",
    autoCheck: (minutes: number) => `Automatische Prüfung alle ${minutes} Minuten.`,
    autoCheckOff:
      "Automatische Prüfung inaktiv – WATCH_INTERVAL_MINUTES setzen oder einen Cron-Dienst auf /api/watch/check mit CRON_SECRET einrichten.",
    addTitle: "Adresse beobachten",
    addressPlaceholder: "bc1…",
    labelPlaceholder: "z. B. Börsen-Wallet",
    minAmount: (unit: string) => `Mindestbetrag (${unit})`,
    minAmountHint: (unit: string) =>
      `Der Mindestbetrag wird in der kleinsten Einheit der Chain angegeben (${unit}). 0 meldet jede Bewegung.`,
    watch: "Beobachten",
    watchedTitle: "Beobachtete Adressen",
    empty: "Noch keine Adressen in der Watchlist.",
    colBalance: "Saldo",
    colLastCheck: "Letzte Prüfung",
    colStatus: "Status",
    noLabel: "(ohne Bezeichnung)",
    unreadTitle: (n: number) => `${n} ungelesen`,
    errorPrefix: "Fehler:",
    active: "aktiv",
    paused: "pausiert",
    events: "Ereignisse",
    markRead: "Als gelesen markieren",
    noEvents: "Noch keine Ereignisse.",
    notifyTitle: "Benachrichtigungen",
    emailToAccount: "E-Mail an meine Kontoadresse senden",
    emailNotConfigured: "E-Mail-Versand nicht konfiguriert – SMTP_HOST und SMTP_FROM setzen.",
    telegramChatId: "Telegram-Chat-ID",
    telegramPlaceholder: "z. B. 123456789",
    telegramNotConfigured: "Telegram nicht konfiguriert – TELEGRAM_BOT_TOKEN setzen.",
    webhookUrl: "Webhook-URL",
    webhookHint: "Ereignisse werden als JSON per POST an diese URL geschickt. Leer lassen zum Deaktivieren.",
  },
};

interface WatchEvent {
  at: string;
  txid: string;
  text: string;
  deltaSat: number;
  read: boolean;
}

interface Watch {
  _id: string;
  chain: ChainId;
  address: string;
  label: string;
  active: boolean;
  minValueSat: number;
  lastTxid?: string;
  lastBalanceSat?: number;
  lastCheckedAt?: string;
  lastError?: string;
  events: WatchEvent[];
  createdAt: string;
  updatedAt: string;
}

interface NotifyChannels {
  email: boolean;
  telegram: boolean;
  webhook: boolean;
}

interface NotifySettings {
  email: boolean;
  telegramChatId: string;
  webhookUrl: string;
}

interface WatchResponse {
  watches: Watch[];
  channels: NotifyChannels;
  notify: NotifySettings;
  intervalMinutes: number;
  error?: string;
}

interface CheckResponse {
  checked: number;
  changed: number;
  notified: number;
  errors: { address: string; error: string }[];
  error?: string;
}

/** Name der kleinsten Einheit einer Chain (sat, litoshi, wei …) */
function unitOf(chain: ChainId): string {
  return CHAIN_LIST.find((c) => c.id === chain)?.unit ?? "sat";
}

export default function WatchlistView() {
  const t = useT(TXT);
  const c = useT(COMMON);
  const fmt = useFormatters();
  const [data, setData] = useState<WatchResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Formular „Adresse beobachten“
  const [chain, setChain] = useState<ChainId>("bitcoin");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [minValue, setMinValue] = useState("0");

  // Benachrichtigungseinstellungen
  const [email, setEmail] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/watch");
      const json: WatchResponse = await res.json();
      if (!res.ok) {
        setErr(json.error ?? t.loadFailed);
        return;
      }
      setErr(null);
      setData(json);
      setEmail(json.notify?.email ?? false);
      setTelegramChatId(json.notify?.telegramChatId ?? "");
      setWebhookUrl(json.notify?.webhookUrl ?? "");
    } catch {
      setErr(t.networkError);
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain,
        address: address.trim(),
        label: label.trim(),
        minValueSat: Number(minValue) || 0,
      }),
    });
    const json: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error ?? t.addFailed);
    else {
      setAddress("");
      setLabel("");
      setMsg(t.added);
      await load();
    }
    setBusy(false);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/watch/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: { error?: string } = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error ?? t.changeFailed);
    else await load();
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm(t.confirmDelete)) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/watch/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json: { error?: string } = await res.json().catch(() => ({}));
      setErr(json.error ?? t.deleteFailed);
    } else await load();
    setBusy(false);
  }

  async function checkNow() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/watch/check", { method: "POST" });
    const json: CheckResponse = await res.json().catch(() => ({
      checked: 0,
      changed: 0,
      notified: 0,
      errors: [],
      error: t.invalidResponse,
    }));
    if (!res.ok) setErr(json.error ?? t.checkFailed);
    else {
      setMsg(t.checkResult(json.checked, json.changed, json.notified));
      if (json.errors?.length) setErr(json.errors.map((x) => `${x.address}: ${x.error}`).join(" | "));
      await load();
    }
    setBusy(false);
  }

  async function saveNotify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/watch", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, telegramChatId, webhookUrl }),
    });
    const json: { error?: string } = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error ?? t.saveFailed);
    else {
      setMsg(t.notifySaved);
      await load();
    }
    setBusy(false);
  }

  if (err && !data) return <div className="card text-yellow-400">{err}</div>;
  if (!data) return <p className="text-subtle">{c.loading}</p>;

  const unread = data.watches.reduce((sum, w) => sum + w.events.filter((ev) => !ev.read).length, 0);

  return (
    <div className="space-y-4">
      {err && <div className="card text-yellow-400">{err}</div>}
      {msg && <div className="card text-sm text-fg-2">{msg}</div>}

      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            {unread > 0 ? (
              <span className="text-brand">{t.unreadEvents(unread)}</span>
            ) : (
              <span className="text-muted">{t.noUnread}</span>
            )}
          </div>
          <button className="btn" onClick={checkNow} disabled={busy}>
            {t.checkNow}
          </button>
        </div>
        <p className="text-xs text-subtle">
          {data.intervalMinutes > 0 ? t.autoCheck(data.intervalMinutes) : t.autoCheckOff}
        </p>
      </div>

      <form onSubmit={add} className="card space-y-3">
        <h2 className="font-semibold">{t.addTitle}</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="watch-chain">
              {c.chain}
            </label>
            <select
              id="watch-chain"
              className="input"
              value={chain}
              onChange={(e) => setChain(e.target.value as ChainId)}
              disabled={busy}
            >
              {CHAIN_LIST.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="watch-address">
              {c.address}
            </label>
            <input
              id="watch-address"
              className="input mono"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t.addressPlaceholder}
              autoComplete="off"
              required
              disabled={busy}
            />
          </div>
          <div>
            <label className="label" htmlFor="watch-label">
              {c.label}
            </label>
            <input
              id="watch-label"
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t.labelPlaceholder}
              disabled={busy}
            />
          </div>
          <div>
            <label className="label" htmlFor="watch-min">
              {t.minAmount(unitOf(chain))}
            </label>
            <input
              id="watch-min"
              className="input mono"
              type="number"
              min={0}
              value={minValue}
              onChange={(e) => setMinValue(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <p className="text-xs text-subtle">
          {t.minAmountHint(unitOf(chain))}
        </p>
        <button className="btn" disabled={busy}>
          {t.watch}
        </button>
      </form>

      <div className="card">
        <h2 className="mb-2 font-semibold">{t.watchedTitle}</h2>
        {!data.watches.length ? (
          <p className="text-sm text-muted">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-subtle">
                <tr>
                  <th className="py-1">{c.label}</th>
                  <th>{c.address}</th>
                  <th>{c.chain}</th>
                  <th>{t.colBalance}</th>
                  <th>{t.colLastCheck}</th>
                  <th>{t.colStatus}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.watches.map((w) => {
                  const wUnread = w.events.filter((ev) => !ev.read).length;
                  return (
                    <Fragment key={w._id}>
                      <tr className="border-t border-border align-top">
                        <td className="py-2">
                          <button
                            className="text-left font-medium hover:text-brand"
                            onClick={() => setOpen((o) => ({ ...o, [w._id]: !o[w._id] }))}
                          >
                            {open[w._id] ? "▾" : "▸"} {w.label || t.noLabel}
                          </button>
                          {wUnread > 0 && (
                            <span className="ml-2 text-brand" title={t.unreadTitle(wUnread)}>
                              ● {wUnread}
                            </span>
                          )}
                          {w.lastError && <div className="text-xs text-yellow-400">
                              {t.errorPrefix} {w.lastError}
                            </div>}
                        </td>
                        <td className="mono text-xs">
                          <Link href={`/address/${w.address}?chain=${w.chain}`} className="hover:text-brand">
                            {shortHash(w.address, 8)}
                          </Link>
                        </td>
                        <td>{CHAIN_LIST.find((c) => c.id === w.chain)?.name ?? w.chain}</td>
                        <td className="mono text-xs">{fmt.amount(w.lastBalanceSat, w.chain)}</td>
                        <td className="text-muted">{fmt.timestamp(w.lastCheckedAt)}</td>
                        <td>
                          <button
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => patch(w._id, { active: !w.active })}
                          >
                            {w.active ? t.active : t.paused}
                          </button>
                        </td>
                        <td className="text-right">
                          <button className="btn-secondary" disabled={busy} onClick={() => remove(w._id)}>
                            {c.delete}
                          </button>
                        </td>
                      </tr>
                      {open[w._id] && (
                        <tr className="border-t border-border">
                          <td colSpan={7} className="py-2">
                            <div className="mb-2 flex items-center gap-3">
                              <span className="text-xs uppercase tracking-wide text-subtle">{t.events}</span>
                              <button
                                className="btn-secondary"
                                disabled={busy || wUnread === 0}
                                onClick={() => patch(w._id, { markRead: true })}
                              >
                                {t.markRead}
                              </button>
                            </div>
                            {!w.events.length ? (
                              <p className="text-sm text-subtle">{t.noEvents}</p>
                            ) : (
                              <ul className="space-y-1">
                                {w.events.map((ev, i) => (
                                  <li key={`${ev.txid}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className={ev.read ? "text-transparent" : "text-brand"}>●</span>
                                    <span className="text-muted">{fmt.timestamp(ev.at)}</span>
                                    <span>{ev.text}</span>
                                    <span className="mono text-xs text-muted">
                                      {fmt.amount(ev.deltaSat, w.chain)}
                                    </span>
                                    {ev.txid && (
                                      <Link
                                        href={`/tx/${ev.txid}?chain=${w.chain}`}
                                        className="mono text-xs hover:text-brand"
                                      >
                                        {shortHash(ev.txid, 8)}
                                      </Link>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={saveNotify} className="card space-y-3">
        <h2 className="font-semibold">{t.notifyTitle}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
            disabled={busy || !data.channels.email}
          />
          <span className={data.channels.email ? "" : "text-subtle"}>{t.emailToAccount}</span>
        </label>
        {!data.channels.email && (
          <p className="text-xs text-subtle">{t.emailNotConfigured}</p>
        )}
        <div>
          <label className="label" htmlFor="notify-telegram">
            {t.telegramChatId}
          </label>
          <input
            id="notify-telegram"
            className="input mono"
            value={telegramChatId}
            onChange={(e) => setTelegramChatId(e.target.value)}
            disabled={busy || !data.channels.telegram}
            placeholder={t.telegramPlaceholder}
            autoComplete="off"
          />
          {!data.channels.telegram && (
            <p className="mt-1 text-xs text-subtle">{t.telegramNotConfigured}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="notify-webhook">
            {t.webhookUrl}
          </label>
          <input
            id="notify-webhook"
            className="input mono"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            disabled={busy}
            placeholder="https://…"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-subtle">
            {t.webhookHint}
          </p>
        </div>
        <button className="btn" disabled={busy}>
          {c.save}
        </button>
      </form>
    </div>
  );
}
