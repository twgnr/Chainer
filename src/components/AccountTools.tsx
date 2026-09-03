"use client";

import { useEffect, useState } from "react";

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

/**
 * Kontoweite Werkzeuge: Datenschutzmodus, Schlüsselwechsel und Gesamt-Export.
 */
export default function AccountTools() {
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
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
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
    setMsg(res.ok ? (value ? "Datenschutzmodus eingeschaltet." : "Datenschutzmodus ausgeschaltet.") : j.error);
    if (res.ok) load();
  }

  async function rekey() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings/rekey", { method: "POST" });
    const j: RekeyResult & { error?: string } = await res.json();
    setBusy(false);
    setMsg(
      res.ok
        ? `${j.changed} eigene und ${j.orgChanged} geteilte Werte neu verschlüsselt${j.failed ? `, ${j.failed} fehlgeschlagen` : ""}. ${j.hinweis}`
        : j.error || "Fehler",
    );
  }

  function exportAll() {
    // Über einen Anker herunterladen, damit die Seite bestehen bleibt
    const a = document.createElement("a");
    a.href = `/api/export${withResults ? "" : "?cases=0"}`;
    a.rel = "noreferrer";
    a.click();
  }

  if (!info?.loggedIn) {
    return (
      <div className="card text-sm text-gray-400">
        Datenschutzmodus, Schlüsselwechsel und Gesamt-Export stehen nach der Anmeldung zur Verfügung.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Datenschutzmodus */}
      <div className="card space-y-2">
        <h2 className="font-semibold">Datenschutzmodus</h2>
        <p className="text-sm text-gray-400">
          Jede Abfrage bei einer öffentlichen Quelle verrät dieser Quelle, wonach gesucht wird. Im Datenschutzmodus
          werden nur Quellen genutzt, die das Ermittlungsziel nicht weitergeben: eigene Infrastruktur sowie Listen,
          die vollständig heruntergeladen und lokal geprüft werden, etwa die Sanktions- und TagPack-Listen.
        </p>
        <p className="text-sm text-yellow-400">
          Ohne eigenen Knoten oder Electrum-Server bleiben im Datenschutzmodus keine Blockchain-Quellen übrig. Hinterlege
          die Zugangsdaten oben unter „Eigene Infrastruktur“, bevor du ihn einschaltest.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={info.privacyMode || info.privacyForcedByEnv}
            disabled={busy || info.privacyForcedByEnv}
            onChange={(e) => setPrivacy(e.target.checked)}
          />
          Nur Quellen nutzen, die die gesuchte Adresse nicht weitergeben
        </label>
        {info.privacyForcedByEnv && (
          <p className="text-xs text-gray-500">
            Serverseitig über <span className="mono">PRIVACY_MODE=true</span> erzwungen und hier nicht abschaltbar.
          </p>
        )}
      </div>

      {/* Schlüsselwechsel */}
      <div className="card space-y-2">
        <h2 className="font-semibold">Schlüssel der gespeicherten Zugangsdaten wechseln</h2>
        <p className="text-sm text-gray-400">
          Wird <span className="mono">ENCRYPTION_KEY</span> geändert, bleiben bestehende Zugangsdaten nur lesbar, wenn
          der alte Wert in <span className="mono">ENCRYPTION_KEY_PREVIOUS</span> steht. Dieser Knopf verschlüsselt alle
          eigenen Werte mit dem neuen Schlüssel; danach kann der alte Eintrag entfernt werden.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={rekey} disabled={busy}>
            {busy ? "Läuft…" : "Jetzt neu verschlüsseln"}
          </button>
          <span className="text-xs text-gray-500">
            {info.keyRotationConfigured
              ? "Ein alter Schlüssel ist hinterlegt."
              : "Kein alter Schlüssel hinterlegt; der Aufruf ist dann wirkungslos."}
          </span>
        </div>
      </div>

      {/* Gesamt-Export */}
      <div className="card space-y-2">
        <h2 className="font-semibold">Alle Daten exportieren</h2>
        <p className="text-sm text-gray-400">
          Lädt Fälle, eigene Labels, Watchlist, Team-Zugehörigkeit und Einstellungen als eine JSON-Datei herunter.
          Zugangsdaten sind nur maskiert enthalten, damit der Export gefahrlos weitergegeben werden kann.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={exportAll} disabled={busy}>
            Export herunterladen
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withResults} onChange={(e) => setWithResults(e.target.checked)} />
            Trace-Ergebnisse einschließen (große Datei)
          </label>
        </div>
      </div>

      {msg && <p className="text-sm text-gray-300">{msg}</p>}
    </div>
  );
}
