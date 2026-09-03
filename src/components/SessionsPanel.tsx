"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface SessionInfo {
  id: string;
  createdAt: string | null;
  lastSeenAt: string | null;
  userAgent: string;
  ip: string;
  current: boolean;
}

function datum(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE");
}

/** Grobe Kurzform der Gerätekennung, damit die Tabelle lesbar bleibt. */
function geraet(ua: string): string {
  if (!ua) return "Unbekanntes Gerät";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Anderer Browser";
  const system = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return system ? `${browser} auf ${system}` : browser;
}

/** Übersicht der angemeldeten Geräte mit Möglichkeit zum Abmelden. */
export default function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loggedIn, setLoggedIn] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/auth/sessions");
    if (res.status === 401) {
      setLoggedIn(false);
      setSessions([]);
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json.error || "Sitzungen konnten nicht geladen werden.");
      return;
    }
    setLoggedIn(true);
    setMsg(null);
    setSessions(json.sessions || []);
  }

  // Kein synchrones setState im Effekt – das Laden wird um einen Tick verzögert
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, []);

  async function beenden(id: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/auth/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error || "Beenden fehlgeschlagen.");
      return;
    }
    if (json.selbst) {
      setLoggedIn(false);
      setSessions([]);
      setMsg("Diese Sitzung wurde beendet. Bitte melde dich neu an.");
      return;
    }
    load();
  }

  async function ueberallAbmelden() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/sessions", { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error || "Abmelden fehlgeschlagen.");
      return;
    }
    setLoggedIn(false);
    setSessions([]);
    setMsg("Alle Geräte wurden abgemeldet. Bitte melde dich neu an.");
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Angemeldete Geräte</h2>
        <p className="mt-1 text-sm text-gray-400">
          Jede Anmeldung wird hier festgehalten. Kommt dir eine Sitzung fremd vor, beende sie – das zugehörige Cookie
          gilt dann nicht mehr.
        </p>
      </div>

      {!loggedIn && (
        <p className="text-sm text-yellow-400">
          Zum Verwalten der Sitzungen bitte{" "}
          <Link href="/login" className="text-accent">
            einloggen
          </Link>
          .
        </p>
      )}

      {msg && <p className="text-sm text-yellow-400">{msg}</p>}

      {sessions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">Gerät</th>
                <th className="py-2 pr-3">IP</th>
                <th className="py-2 pr-3">Angelegt</th>
                <th className="py-2 pr-3">Zuletzt gesehen</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3">
                    {geraet(s.userAgent)}
                    {s.current && <span className="ml-2 text-xs text-emerald-400">aktuelle Sitzung</span>}
                  </td>
                  <td className="mono py-2 pr-3 text-gray-400">{s.ip || "–"}</td>
                  <td className="py-2 pr-3 text-gray-400">{datum(s.createdAt)}</td>
                  <td className="py-2 pr-3 text-gray-400">{datum(s.lastSeenAt)}</td>
                  <td className="py-2">
                    <button type="button" className="btn-secondary" onClick={() => beenden(s.id)} disabled={busy}>
                      Diese Sitzung beenden
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" className="btn-secondary" onClick={ueberallAbmelden} disabled={!loggedIn || busy}>
        Überall abmelden
      </button>
    </div>
  );
}
