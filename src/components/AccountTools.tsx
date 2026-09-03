"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n/provider";
import { translateHint } from "@/lib/i18n/hints";

interface SettingsInfo {
  loggedIn: boolean;
  privacyMode: boolean;
  privacyForcedByEnv: boolean;
  keyRotationConfigured: boolean;
}

interface RekeyResult {
  changed: number;
  orgChanged: number;
  failed: number;
  hinweis: string;
}

const Var = ({ children }: { children: React.ReactNode }) => <span className="mono">{children}</span>;

const TXT = {
  en: {
    needsLogin: "Privacy mode, key rotation and the full export are available once you are signed in.",
    privacyTitle: "Privacy mode",
    privacyLead:
      "Every query to a public source tells that source what is being looked for. In privacy mode only sources that do not learn the target of the investigation are used: your own infrastructure, plus lists that are downloaded in full and checked locally, such as the sanctions and TagPack lists.",
    privacyWarning:
      "Without your own node or Electrum server, privacy mode leaves no blockchain sources at all. Store the credentials above under “Your own infrastructure” before switching it on.",
    privacyToggle: "Only use sources that do not learn the address being looked up",
    privacyOn: "Privacy mode switched on.",
    privacyOff: "Privacy mode switched off.",
    forcedByEnv: (
      <>
        Enforced server-side through <Var>PRIVACY_MODE=true</Var> and not switchable here.
      </>
    ),
    rekeyTitle: "Rotate the key protecting the stored credentials",
    rekeyLead: (
      <>
        If <Var>ENCRYPTION_KEY</Var> changes, existing credentials stay readable only while the old value is present in{" "}
        <Var>ENCRYPTION_KEY_PREVIOUS</Var>. This button re-encrypts all of your own values with the new key; the old
        entry can be removed afterwards.
      </>
    ),
    rekeyButton: "Re-encrypt now",
    rekeyRunning: "Running…",
    rekeyResult: (r: RekeyResult) =>
      `${r.changed} of your own and ${r.orgChanged} shared values re-encrypted${r.failed ? `, ${r.failed} failed` : ""}. ${r.hinweis}`,
    hasOldKey: "An old key is configured.",
    noOldKey: "No old key configured; the call then has no effect.",
    exportTitle: "Export all data",
    exportLead:
      "Downloads cases, your own labels, the watchlist, team membership and settings as a single JSON file. Credentials are only included masked, so the export can be passed on safely.",
    exportButton: "Download export",
    withResults: "Include trace results (large file)",
    error: "Error",
  },
  de: {
    needsLogin: "Datenschutzmodus, Schlüsselwechsel und Gesamt-Export stehen nach der Anmeldung zur Verfügung.",
    privacyTitle: "Datenschutzmodus",
    privacyLead:
      "Jede Abfrage bei einer öffentlichen Quelle verrät dieser Quelle, wonach gesucht wird. Im Datenschutzmodus werden nur Quellen genutzt, die das Ermittlungsziel nicht weitergeben: eigene Infrastruktur sowie Listen, die vollständig heruntergeladen und lokal geprüft werden, etwa die Sanktions- und TagPack-Listen.",
    privacyWarning:
      "Ohne eigenen Knoten oder Electrum-Server bleiben im Datenschutzmodus keine Blockchain-Quellen übrig. Hinterlege die Zugangsdaten oben unter „Eigene Infrastruktur“, bevor du ihn einschaltest.",
    privacyToggle: "Nur Quellen nutzen, die die gesuchte Adresse nicht weitergeben",
    privacyOn: "Datenschutzmodus eingeschaltet.",
    privacyOff: "Datenschutzmodus ausgeschaltet.",
    forcedByEnv: (
      <>
        Serverseitig über <Var>PRIVACY_MODE=true</Var> erzwungen und hier nicht abschaltbar.
      </>
    ),
    rekeyTitle: "Schlüssel der gespeicherten Zugangsdaten wechseln",
    rekeyLead: (
      <>
        Wird <Var>ENCRYPTION_KEY</Var> geändert, bleiben bestehende Zugangsdaten nur lesbar, wenn der alte Wert in{" "}
        <Var>ENCRYPTION_KEY_PREVIOUS</Var> steht. Dieser Knopf verschlüsselt alle eigenen Werte mit dem neuen
        Schlüssel; danach kann der alte Eintrag entfernt werden.
      </>
    ),
    rekeyButton: "Jetzt neu verschlüsseln",
    rekeyRunning: "Läuft…",
    rekeyResult: (r: RekeyResult) =>
      `${r.changed} eigene und ${r.orgChanged} geteilte Werte neu verschlüsselt${r.failed ? `, ${r.failed} fehlgeschlagen` : ""}. ${r.hinweis}`,
    hasOldKey: "Ein alter Schlüssel ist hinterlegt.",
    noOldKey: "Kein alter Schlüssel hinterlegt; der Aufruf ist dann wirkungslos.",
    exportTitle: "Alle Daten exportieren",
    exportLead:
      "Lädt Fälle, eigene Labels, Watchlist, Team-Zugehörigkeit und Einstellungen als eine JSON-Datei herunter. Zugangsdaten sind nur maskiert enthalten, damit der Export gefahrlos weitergegeben werden kann.",
    exportButton: "Export herunterladen",
    withResults: "Trace-Ergebnisse einschließen (große Datei)",
    error: "Fehler",
  },
};

/**
 * Kontoweite Werkzeuge: Datenschutzmodus, Schlüsselwechsel und Gesamt-Export.
 */
export default function AccountTools() {
  const t = useT(TXT);
  const locale = useLocale();
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [withResults, setWithResults] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/settings/keys");
      if (!res.ok) return;
      setInfo(await res.json());
    } catch {
      /* ignorieren */
    }
  }
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, []);

  async function setPrivacy(value: boolean) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacyMode: value }),
    });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? (value ? t.privacyOn : t.privacyOff) : j.error);
    if (res.ok) load();
  }

  async function rekey() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings/rekey", { method: "POST" });
    const j: RekeyResult & { error?: string } = await res.json();
    setBusy(false);
    setMsg(res.ok ? t.rekeyResult({ ...j, hinweis: translateHint(j.hinweis, locale) }) : j.error || t.error);
  }

  function exportAll() {
    // Über einen Anker herunterladen, damit die Seite bestehen bleibt
    const a = document.createElement("a");
    a.href = `/api/export${withResults ? "" : "?cases=0"}`;
    a.rel = "noreferrer";
    a.click();
  }

  if (!info?.loggedIn) {
    return <div className="card text-sm text-muted">{t.needsLogin}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Datenschutzmodus */}
      <div className="card space-y-2">
        <h2 className="font-semibold">{t.privacyTitle}</h2>
        <p className="text-sm text-muted">{t.privacyLead}</p>
        <p className="text-sm text-yellow-400">{t.privacyWarning}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={info.privacyMode || info.privacyForcedByEnv}
            disabled={busy || info.privacyForcedByEnv}
            onChange={(e) => setPrivacy(e.target.checked)}
          />
          {t.privacyToggle}
        </label>
        {info.privacyForcedByEnv && <p className="text-xs text-subtle">{t.forcedByEnv}</p>}
      </div>

      {/* Schlüsselwechsel */}
      <div className="card space-y-2">
        <h2 className="font-semibold">{t.rekeyTitle}</h2>
        <p className="text-sm text-muted">{t.rekeyLead}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={rekey} disabled={busy}>
            {busy ? t.rekeyRunning : t.rekeyButton}
          </button>
          <span className="text-xs text-subtle">{info.keyRotationConfigured ? t.hasOldKey : t.noOldKey}</span>
        </div>
      </div>

      {/* Gesamt-Export */}
      <div className="card space-y-2">
        <h2 className="font-semibold">{t.exportTitle}</h2>
        <p className="text-sm text-muted">{t.exportLead}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={exportAll} disabled={busy}>
            {t.exportButton}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withResults} onChange={(e) => setWithResults(e.target.checked)} />
            {t.withResults}
          </label>
        </div>
      </div>

      {msg && <p className="text-sm text-fg-2">{msg}</p>}
    </div>
  );
}
