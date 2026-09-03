"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatters, useT } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";

interface SessionInfo {
  id: string;
  createdAt: string | null;
  lastSeenAt: string | null;
  userAgent: string;
  ip: string;
  current: boolean;
}

const TXT = {
  en: {
    title: "Signed-in devices",
    lead: "Every sign-in is recorded here. If a session looks unfamiliar, end it – its cookie stops working straight away.",
    needsLoginBefore: "To manage your sessions, please ",
    login: "log in",
    loadFailed: "The sessions could not be loaded.",
    endFailed: "Ending the session failed.",
    logoutFailed: "Signing out failed.",
    endedThis: "This session has been ended. Please sign in again.",
    endedAll: "All devices have been signed out. Please sign in again.",
    colDevice: "Device",
    colIp: "IP",
    colCreated: "Created",
    colLastSeen: "Last seen",
    currentSession: "current session",
    endSession: "End this session",
    logoutEverywhere: "Sign out everywhere",
    unknownDevice: "Unknown device",
    otherBrowser: "Other browser",
    on: "on",
  },
  de: {
    title: "Angemeldete Geräte",
    lead: "Jede Anmeldung wird hier festgehalten. Kommt dir eine Sitzung fremd vor, beende sie – das zugehörige Cookie gilt dann nicht mehr.",
    needsLoginBefore: "Zum Verwalten der Sitzungen bitte ",
    login: "einloggen",
    loadFailed: "Sitzungen konnten nicht geladen werden.",
    endFailed: "Beenden fehlgeschlagen.",
    logoutFailed: "Abmelden fehlgeschlagen.",
    endedThis: "Diese Sitzung wurde beendet. Bitte melde dich neu an.",
    endedAll: "Alle Geräte wurden abgemeldet. Bitte melde dich neu an.",
    colDevice: "Gerät",
    colIp: "IP",
    colCreated: "Angelegt",
    colLastSeen: "Zuletzt gesehen",
    currentSession: "aktuelle Sitzung",
    endSession: "Diese Sitzung beenden",
    logoutEverywhere: "Überall abmelden",
    unknownDevice: "Unbekanntes Gerät",
    otherBrowser: "Anderer Browser",
    on: "auf",
  },
};

/** Grobe Kurzform der Gerätekennung, damit die Tabelle lesbar bleibt. */
function deviceName(ua: string, t: (typeof TXT)[Locale]): string {
  if (!ua) return t.unknownDevice;
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
            : t.otherBrowser;
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
  return system ? `${browser} ${t.on} ${system}` : browser;
}

/** Übersicht der angemeldeten Geräte mit Möglichkeit zum Abmelden. */
export default function SessionsPanel() {
  const t = useT(TXT);
  const fmt = useFormatters();
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
      setMsg(json.error || t.loadFailed);
      return;
    }
    setLoggedIn(true);
    setMsg(null);
    setSessions(json.sessions || []);
  }

  // Kein synchrones setState im Effekt – das Laden wird um einen Tick verzögert
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function endSession(id: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/auth/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error || t.endFailed);
      return;
    }
    if (json.selbst) {
      setLoggedIn(false);
      setSessions([]);
      setMsg(t.endedThis);
      return;
    }
    load();
  }

  async function logoutEverywhere() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/sessions", { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error || t.logoutFailed);
      return;
    }
    setLoggedIn(false);
    setSessions([]);
    setMsg(t.endedAll);
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">{t.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.lead}</p>
      </div>

      {!loggedIn && (
        <p className="text-sm text-yellow-400">
          {t.needsLoginBefore}
          <Link href="/login" className="text-brand">
            {t.login}
          </Link>
          .
        </p>
      )}

      {msg && <p className="text-sm text-yellow-400">{msg}</p>}

      {sessions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">{t.colDevice}</th>
                <th className="py-2 pr-3">{t.colIp}</th>
                <th className="py-2 pr-3">{t.colCreated}</th>
                <th className="py-2 pr-3">{t.colLastSeen}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3">
                    {deviceName(s.userAgent, t)}
                    {s.current && <span className="ml-2 text-xs text-emerald-400">{t.currentSession}</span>}
                  </td>
                  <td className="mono py-2 pr-3 text-muted">{s.ip || "–"}</td>
                  <td className="py-2 pr-3 text-muted">{fmt.timestamp(s.createdAt ?? undefined)}</td>
                  <td className="py-2 pr-3 text-muted">{fmt.timestamp(s.lastSeenAt ?? undefined)}</td>
                  <td className="py-2">
                    <button type="button" className="btn-secondary" onClick={() => endSession(s.id)} disabled={busy}>
                      {t.endSession}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" className="btn-secondary" onClick={logoutEverywhere} disabled={!loggedIn || busy}>
        {t.logoutEverywhere}
      </button>
    </div>
  );
}
