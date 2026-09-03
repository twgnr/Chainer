"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

/** Beschreibung der Rechte für die Auswahl */
const SCOPES: { id: string; label: string; hint: string }[] = [
  { id: "read", label: "Lesen", hint: "Adressen, Transaktionen, Kurse, Datenquellen" },
  { id: "trace", label: "Verfolgen", hint: "Trace, Verbindungssuche, Massenprüfung" },
  { id: "write", label: "Schreiben", hint: "Fälle, Labels und Beobachtungen ändern" },
];

function datum(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE");
}

export default function TokensForm() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loggedIn, setLoggedIn] = useState(true);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read", "trace"]);
  const [days, setDays] = useState("");
  const [neuesToken, setNeuesToken] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
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
      setMsg(json.error || "Token konnten nicht geladen werden.");
      return;
    }
    setLoggedIn(true);
    setTokens(json.tokens || []);
  }

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, []);

  function toggleScope(id: string) {
    setScopes((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function anlegen(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setNeuesToken(null);
    setKopiert(false);
    const tage = Number(days);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        scopes,
        ...(Number.isFinite(tage) && tage > 0 ? { expiresInDays: Math.round(tage) } : {}),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error || "Anlegen fehlgeschlagen.");
      return;
    }
    setNeuesToken(json.token as string);
    setName("");
    setDays("");
    load();
  }

  async function widerrufen(id: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(json.error || "Widerrufen fehlgeschlagen.");
    load();
  }

  async function kopieren() {
    if (!neuesToken) return;
    try {
      await navigator.clipboard.writeText(neuesToken);
      setKopiert(true);
    } catch {
      setMsg("Kopieren nicht möglich – bitte von Hand markieren.");
    }
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Zugriffstoken für Skripte</h2>
        <p className="mt-1 text-sm text-gray-400">
          Mit einem Token lässt sich die API ohne Anmeldung im Browser nutzen: als{" "}
          <span className="mono">Authorization: Bearer chk_…</span> oder im Kopf <span className="mono">X-API-Key</span>.
          Deine hinterlegten Provider-Keys gelten dabei genauso wie in der Oberfläche. Alle Endpunkte sind unter{" "}
          <Link href="/api-docs" className="text-accent">
            /api-docs
          </Link>{" "}
          beschrieben.
        </p>
      </div>

      {!loggedIn && (
        <p className="text-sm text-yellow-400">
          Zum Verwalten von Token bitte{" "}
          <Link href="/login" className="text-accent">
            einloggen
          </Link>
          .
        </p>
      )}

      {neuesToken && (
        <div className="space-y-2 rounded-md border border-accent bg-accent/10 p-3">
          <div className="text-sm font-semibold text-accent">
            Neues Token – es wird nur dieses eine Mal angezeigt und kann später nicht erneut abgerufen werden.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="mono break-all rounded bg-background px-2 py-1 text-sm">{neuesToken}</code>
            <button type="button" className="btn-secondary" onClick={kopieren}>
              {kopiert ? "Kopiert" : "Kopieren"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setNeuesToken(null)}>
              Ausblenden
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Bewahre es wie ein Passwort auf. Geht es verloren, widerrufe es hier und lege ein neues an.
          </p>
        </div>
      )}

      <form onSubmit={anlegen} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <div>
            <label className="label" htmlFor="token-name">
              Name
            </label>
            <input
              id="token-name"
              className="input"
              placeholder="z. B. Auswertungsskript"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!loggedIn || busy}
              required
              maxLength={100}
            />
          </div>
          <div>
            <label className="label" htmlFor="token-days">
              Gültigkeit (Tage)
            </label>
            <input
              id="token-days"
              className="input"
              type="number"
              min={1}
              max={3650}
              placeholder="unbegrenzt"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={!loggedIn || busy}
            />
          </div>
        </div>
        <div>
          <span className="label">Rechte</span>
          <div className="flex flex-wrap gap-4">
            {SCOPES.map((s) => (
              <label key={s.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={scopes.includes(s.id)}
                  onChange={() => toggleScope(s.id)}
                  disabled={!loggedIn || busy}
                />
                <span>
                  {s.label}
                  <span className="block text-xs text-gray-500">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" disabled={!loggedIn || busy || !name.trim() || scopes.length === 0}>
            Token anlegen
          </button>
          {msg && <span className="text-sm text-yellow-400">{msg}</span>}
        </div>
      </form>

      {tokens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Präfix</th>
                <th className="py-2 pr-3">Rechte</th>
                <th className="py-2 pr-3">Zuletzt benutzt</th>
                <th className="py-2 pr-3">Ablauf</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3">{t.name}</td>
                  <td className="mono py-2 pr-3">{t.prefix}…</td>
                  <td className="py-2 pr-3">{t.scopes.join(", ") || "–"}</td>
                  <td className="py-2 pr-3 text-gray-400">{datum(t.lastUsedAt)}</td>
                  <td className="py-2 pr-3 text-gray-400">{t.expiresAt ? datum(t.expiresAt) : "unbegrenzt"}</td>
                  <td className="py-2 pr-3">
                    {t.revoked ? (
                      <span className="text-gray-500">widerrufen</span>
                    ) : t.expired ? (
                      <span className="text-yellow-400">abgelaufen</span>
                    ) : (
                      <span className="text-emerald-400">aktiv</span>
                    )}
                  </td>
                  <td className="py-2">
                    {!t.revoked && (
                      <button type="button" className="btn-secondary" onClick={() => widerrufen(t.id)} disabled={busy}>
                        Widerrufen
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
