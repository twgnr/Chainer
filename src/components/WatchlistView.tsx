"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { CHAIN_LIST, type ChainId } from "@/lib/chains";
import { formatAmount, shortHash } from "@/lib/format";

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

/** Zeitstempel der API sind ISO-Strings, daher lokale Formatierung statt formatDate */
function formatIso(iso?: string): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE");
}

/** Name der kleinsten Einheit einer Chain (sat, litoshi, wei …) */
function unitOf(chain: ChainId): string {
  return CHAIN_LIST.find((c) => c.id === chain)?.unit ?? "sat";
}

export default function WatchlistView() {
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
        setErr(json.error ?? "Laden fehlgeschlagen.");
        return;
      }
      setErr(null);
      setData(json);
      setEmail(json.notify?.email ?? false);
      setTelegramChatId(json.notify?.telegramChatId ?? "");
      setWebhookUrl(json.notify?.webhookUrl ?? "");
    } catch {
      setErr("Netzwerkfehler beim Laden der Watchlist.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
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
    if (!res.ok) setErr(json.error ?? "Hinzufügen fehlgeschlagen.");
    else {
      setAddress("");
      setLabel("");
      setMsg("Adresse wird jetzt beobachtet.");
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
    if (!res.ok) setErr(json.error ?? "Änderung fehlgeschlagen.");
    else await load();
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Beobachtung wirklich löschen?")) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/watch/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json: { error?: string } = await res.json().catch(() => ({}));
      setErr(json.error ?? "Löschen fehlgeschlagen.");
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
      error: "Ungültige Antwort.",
    }));
    if (!res.ok) setErr(json.error ?? "Prüfung fehlgeschlagen.");
    else {
      setMsg(
        `${json.checked} geprüft, ${json.changed} mit Veränderung, ${json.notified} Benachrichtigung(en) versendet.`,
      );
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
    if (!res.ok) setErr(json.error ?? "Speichern fehlgeschlagen.");
    else {
      setMsg("Benachrichtigungseinstellungen gespeichert.");
      await load();
    }
    setBusy(false);
  }

  if (err && !data) return <div className="card text-yellow-400">{err}</div>;
  if (!data) return <p className="text-gray-500">Lade…</p>;

  const unread = data.watches.reduce((sum, w) => sum + w.events.filter((ev) => !ev.read).length, 0);

  return (
    <div className="space-y-4">
      {err && <div className="card text-yellow-400">{err}</div>}
      {msg && <div className="card text-sm text-gray-300">{msg}</div>}

      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            {unread > 0 ? (
              <span className="text-accent">{unread} ungelesene Ereignisse</span>
            ) : (
              <span className="text-gray-400">Keine ungelesenen Ereignisse</span>
            )}
          </div>
          <button className="btn" onClick={checkNow} disabled={busy}>
            Jetzt prüfen
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {data.intervalMinutes > 0
            ? `Automatische Prüfung alle ${data.intervalMinutes} Minuten.`
            : "Automatische Prüfung inaktiv – WATCH_INTERVAL_MINUTES setzen oder einen Cron-Dienst auf /api/watch/check mit CRON_SECRET einrichten."}
        </p>
      </div>

      <form onSubmit={add} className="card space-y-3">
        <h2 className="font-semibold">Adresse beobachten</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="watch-chain">
              Chain
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
              Adresse
            </label>
            <input
              id="watch-address"
              className="input mono"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="bc1…"
              autoComplete="off"
              required
              disabled={busy}
            />
          </div>
          <div>
            <label className="label" htmlFor="watch-label">
              Bezeichnung
            </label>
            <input
              id="watch-label"
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z. B. Börsen-Wallet"
              disabled={busy}
            />
          </div>
          <div>
            <label className="label" htmlFor="watch-min">
              Mindestbetrag ({unitOf(chain)})
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
        <p className="text-xs text-gray-500">
          Der Mindestbetrag wird in der kleinsten Einheit der Chain angegeben ({unitOf(chain)}). 0 meldet jede Bewegung.
        </p>
        <button className="btn" disabled={busy}>
          Beobachten
        </button>
      </form>

      <div className="card">
        <h2 className="mb-2 font-semibold">Beobachtete Adressen</h2>
        {!data.watches.length ? (
          <p className="text-sm text-gray-400">Noch keine Adressen in der Watchlist.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-1">Bezeichnung</th>
                  <th>Adresse</th>
                  <th>Chain</th>
                  <th>Saldo</th>
                  <th>Letzte Prüfung</th>
                  <th>Status</th>
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
                            className="text-left font-medium hover:text-accent"
                            onClick={() => setOpen((o) => ({ ...o, [w._id]: !o[w._id] }))}
                          >
                            {open[w._id] ? "▾" : "▸"} {w.label || "(ohne Bezeichnung)"}
                          </button>
                          {wUnread > 0 && (
                            <span className="ml-2 text-accent" title={`${wUnread} ungelesen`}>
                              ● {wUnread}
                            </span>
                          )}
                          {w.lastError && <div className="text-xs text-yellow-400">Fehler: {w.lastError}</div>}
                        </td>
                        <td className="mono text-xs">
                          <Link href={`/address/${w.address}?chain=${w.chain}`} className="hover:text-accent">
                            {shortHash(w.address, 8)}
                          </Link>
                        </td>
                        <td>{CHAIN_LIST.find((c) => c.id === w.chain)?.name ?? w.chain}</td>
                        <td className="mono text-xs">{formatAmount(w.lastBalanceSat, w.chain)}</td>
                        <td className="text-gray-400">{formatIso(w.lastCheckedAt)}</td>
                        <td>
                          <button
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => patch(w._id, { active: !w.active })}
                          >
                            {w.active ? "aktiv" : "pausiert"}
                          </button>
                        </td>
                        <td className="text-right">
                          <button className="btn-secondary" disabled={busy} onClick={() => remove(w._id)}>
                            Löschen
                          </button>
                        </td>
                      </tr>
                      {open[w._id] && (
                        <tr className="border-t border-border">
                          <td colSpan={7} className="py-2">
                            <div className="mb-2 flex items-center gap-3">
                              <span className="text-xs uppercase tracking-wide text-gray-500">Ereignisse</span>
                              <button
                                className="btn-secondary"
                                disabled={busy || wUnread === 0}
                                onClick={() => patch(w._id, { markRead: true })}
                              >
                                Als gelesen markieren
                              </button>
                            </div>
                            {!w.events.length ? (
                              <p className="text-sm text-gray-500">Noch keine Ereignisse.</p>
                            ) : (
                              <ul className="space-y-1">
                                {w.events.map((ev, i) => (
                                  <li key={`${ev.txid}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className={ev.read ? "text-transparent" : "text-accent"}>●</span>
                                    <span className="text-gray-400">{formatIso(ev.at)}</span>
                                    <span>{ev.text}</span>
                                    <span className="mono text-xs text-gray-400">
                                      {formatAmount(ev.deltaSat, w.chain)}
                                    </span>
                                    {ev.txid && (
                                      <Link
                                        href={`/tx/${ev.txid}?chain=${w.chain}`}
                                        className="mono text-xs hover:text-accent"
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
        <h2 className="font-semibold">Benachrichtigungen</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
            disabled={busy || !data.channels.email}
          />
          <span className={data.channels.email ? "" : "text-gray-500"}>E-Mail an meine Kontoadresse senden</span>
        </label>
        {!data.channels.email && (
          <p className="text-xs text-gray-500">E-Mail-Versand nicht konfiguriert – SMTP_HOST und SMTP_FROM setzen.</p>
        )}
        <div>
          <label className="label" htmlFor="notify-telegram">
            Telegram-Chat-ID
          </label>
          <input
            id="notify-telegram"
            className="input mono"
            value={telegramChatId}
            onChange={(e) => setTelegramChatId(e.target.value)}
            disabled={busy || !data.channels.telegram}
            placeholder="z. B. 123456789"
            autoComplete="off"
          />
          {!data.channels.telegram && (
            <p className="mt-1 text-xs text-gray-500">Telegram nicht konfiguriert – TELEGRAM_BOT_TOKEN setzen.</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="notify-webhook">
            Webhook-URL
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
          <p className="mt-1 text-xs text-gray-500">
            Ereignisse werden als JSON per POST an diese URL geschickt. Leer lassen zum Deaktivieren.
          </p>
        </div>
        <button className="btn" disabled={busy}>
          Speichern
        </button>
      </form>
    </div>
  );
}
