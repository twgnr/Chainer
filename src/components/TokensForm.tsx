"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatters, useT } from "@/lib/i18n/provider";
import { COMMON } from "@/lib/i18n/labels";

interface TokenInfo {
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

const SCOPE_IDS = ["read", "trace", "write"] as const;

const TXT = {
  en: {
    /** Beschreibung der Rechte für die Auswahl */
    scopes: {
      read: { label: "Read", hint: "Addresses, transactions, rates, data sources" },
      trace: { label: "Trace", hint: "Trace, connection search, bulk check" },
      write: { label: "Write", hint: "Change cases, labels and watches" },
    },
    title: "Access tokens for scripts",
    lead: (
      <>
        A token lets scripts use the API without signing in through the browser: as{" "}
        <span className="mono">Authorization: Bearer chk_…</span> or in the <span className="mono">X-API-Key</span>{" "}
        header. Your stored provider keys apply exactly as they do in the interface. Every endpoint is described at{" "}
        <Link href="/api-docs" className="text-brand">
          /api-docs
        </Link>
        .
      </>
    ),
    loadFailed: "The tokens could not be loaded.",
    createFailed: "Creating the token failed.",
    revokeFailed: "Revoking the token failed.",
    copyFailed: "Copying is not possible – please select it by hand.",
    loginBefore: "To manage tokens, please ",
    login: "log in",
    newToken: "New token – it is shown this once only and cannot be retrieved again later.",
    copied: "Copied",
    hide: "Hide",
    keepSafe: "Keep it like a password. If it is lost, revoke it here and create a new one.",
    name: "Name",
    namePlaceholder: "e.g. analysis script",
    validity: "Validity (days)",
    unlimited: "unlimited",
    rights: "Permissions",
    create: "Create token",
    colPrefix: "Prefix",
    colLastUsed: "Last used",
    colExpiry: "Expiry",
    colStatus: "Status",
    revoked: "revoked",
    expired: "expired",
    active: "active",
    revoke: "Revoke",
  },
  de: {
    scopes: {
      read: { label: "Lesen", hint: "Adressen, Transaktionen, Kurse, Datenquellen" },
      trace: { label: "Verfolgen", hint: "Trace, Verbindungssuche, Massenprüfung" },
      write: { label: "Schreiben", hint: "Fälle, Labels und Beobachtungen ändern" },
    },
    title: "Zugriffstoken für Skripte",
    lead: (
      <>
        Mit einem Token lässt sich die API ohne Anmeldung im Browser nutzen: als{" "}
        <span className="mono">Authorization: Bearer chk_…</span> oder im Kopf <span className="mono">X-API-Key</span>.
        Deine hinterlegten Provider-Keys gelten dabei genauso wie in der Oberfläche. Alle Endpunkte sind unter{" "}
        <Link href="/api-docs" className="text-brand">
          /api-docs
        </Link>{" "}
        beschrieben.
      </>
    ),
    loadFailed: "Token konnten nicht geladen werden.",
    createFailed: "Anlegen fehlgeschlagen.",
    revokeFailed: "Widerrufen fehlgeschlagen.",
    copyFailed: "Kopieren nicht möglich – bitte von Hand markieren.",
    loginBefore: "Zum Verwalten von Token bitte ",
    login: "einloggen",
    newToken: "Neues Token – es wird nur dieses eine Mal angezeigt und kann später nicht erneut abgerufen werden.",
    copied: "Kopiert",
    hide: "Ausblenden",
    keepSafe: "Bewahre es wie ein Passwort auf. Geht es verloren, widerrufe es hier und lege ein neues an.",
    name: "Name",
    namePlaceholder: "z. B. Auswertungsskript",
    validity: "Gültigkeit (Tage)",
    unlimited: "unbegrenzt",
    rights: "Rechte",
    create: "Token anlegen",
    colPrefix: "Präfix",
    colLastUsed: "Zuletzt benutzt",
    colExpiry: "Ablauf",
    colStatus: "Status",
    revoked: "widerrufen",
    expired: "abgelaufen",
    active: "aktiv",
    revoke: "Widerrufen",
  },
};

export default function TokensForm() {
  const t = useT(TXT);
  const c = useT(COMMON);
  const fmt = useFormatters();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loggedIn, setLoggedIn] = useState(true);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read", "trace"]);
  const [days, setDays] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/tokens");
    if (res.status === 401) {
      setLoggedIn(false);
      setTokens([]);
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error || t.loadFailed);
      return;
    }
    setLoggedIn(true);
    setTokens(json.tokens || []);
  }

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleScope(id: string) {
    setScopes((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setNewToken(null);
    setCopied(false);
    const validDays = Number(days);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        scopes,
        ...(Number.isFinite(validDays) && validDays > 0 ? { expiresInDays: Math.round(validDays) } : {}),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error || t.createFailed);
      return;
    }
    setNewToken(json.token as string);
    setName("");
    setDays("");
    load();
  }

  async function revoke(id: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(json.error || t.revokeFailed);
    load();
  }

  async function copy() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setMsg(t.copyFailed);
    }
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">{t.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.lead}</p>
      </div>

      {!loggedIn && (
        <p className="text-sm text-yellow-400">
          {t.loginBefore}
          <Link href="/login" className="text-brand">
            {t.login}
          </Link>
          .
        </p>
      )}

      {newToken && (
        <div className="space-y-2 rounded-md border border-accent bg-accent/10 p-3">
          <div className="text-sm font-semibold text-brand">{t.newToken}</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="mono break-all rounded bg-background px-2 py-1 text-sm">{newToken}</code>
            <button type="button" className="btn-secondary" onClick={copy}>
              {copied ? t.copied : c.copy}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setNewToken(null)}>
              {t.hide}
            </button>
          </div>
          <p className="text-xs text-muted">{t.keepSafe}</p>
        </div>
      )}

      <form onSubmit={create} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <div>
            <label className="label" htmlFor="token-name">
              {t.name}
            </label>
            <input
              id="token-name"
              className="input"
              placeholder={t.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!loggedIn || busy}
              required
              maxLength={100}
              suppressHydrationWarning
            />
          </div>
          <div>
            <label className="label" htmlFor="token-days">
              {t.validity}
            </label>
            <input
              id="token-days"
              className="input"
              type="number"
              min={1}
              max={3650}
              placeholder={t.unlimited}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={!loggedIn || busy}
            />
          </div>
        </div>
        <div>
          <span className="label">{t.rights}</span>
          <div className="flex flex-wrap gap-4">
            {SCOPE_IDS.map((id) => (
              <label key={id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={scopes.includes(id)}
                  onChange={() => toggleScope(id)}
                  disabled={!loggedIn || busy}
                />
                <span>
                  {t.scopes[id].label}
                  <span className="block text-xs text-subtle">{t.scopes[id].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" disabled={!loggedIn || busy || !name.trim() || scopes.length === 0}>
            {t.create}
          </button>
          {msg && <span className="text-sm text-yellow-400">{msg}</span>}
        </div>
      </form>

      {tokens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">{t.name}</th>
                <th className="py-2 pr-3">{t.colPrefix}</th>
                <th className="py-2 pr-3">{t.rights}</th>
                <th className="py-2 pr-3">{t.colLastUsed}</th>
                <th className="py-2 pr-3">{t.colExpiry}</th>
                <th className="py-2 pr-3">{t.colStatus}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((tok) => (
                <tr key={tok.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3">{tok.name}</td>
                  <td className="mono py-2 pr-3">{tok.prefix}…</td>
                  <td className="py-2 pr-3">
                    {tok.scopes
                      .map((s) => (SCOPE_IDS as readonly string[]).includes(s) ? t.scopes[s as (typeof SCOPE_IDS)[number]].label : s)
                      .join(", ") || "–"}
                  </td>
                  <td className="py-2 pr-3 text-muted">{fmt.timestamp(tok.lastUsedAt ?? undefined)}</td>
                  <td className="py-2 pr-3 text-muted">
                    {tok.expiresAt ? fmt.timestamp(tok.expiresAt) : t.unlimited}
                  </td>
                  <td className="py-2 pr-3">
                    {tok.revoked ? (
                      <span className="text-subtle">{t.revoked}</span>
                    ) : tok.expired ? (
                      <span className="text-yellow-400">{t.expired}</span>
                    ) : (
                      <span className="text-emerald-400">{t.active}</span>
                    )}
                  </td>
                  <td className="py-2">
                    {!tok.revoked && (
                      <button type="button" className="btn-secondary" onClick={() => revoke(tok.id)} disabled={busy}>
                        {t.revoke}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
