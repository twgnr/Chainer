"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ConfigField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

interface ProviderKeyInfo {
  id: string;
  name: string;
  url: string;
  chains?: string[];
  keyRequirement: "none" | "optional" | "required";
  keyHint?: string;
  rateLimit?: string;
  configFields?: ConfigField[];
  userKey: string | null;
  orgKey: string | null;
  envKey: boolean;
  config: Record<string, string>;
}

export default function KeysForm() {
  const [providers, setProviders] = useState<ProviderKeyInfo[]>([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [org, setOrg] = useState<{ name?: string } | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, Record<string, string>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/keys");
    const json = await res.json();
    setProviders(json.providers || []);
    setLoggedIn(json.loggedIn);
    setOrg(json.org);
    setKeys({});
    setConfig({});
  }
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/settings/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys, config }),
    });
    const json = await res.json();
    setMsg(res.ok ? "Gespeichert (verschlüsselt)." : json.error);
    setSaving(false);
    if (res.ok) load();
  }

  const withKeys = providers.filter((p) => p.keyRequirement !== "none");
  const withConfig = providers.filter((p) => p.configFields?.length);

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="card space-y-4">
        <h2 className="font-semibold">Eigene API-Keys</h2>
        <p className="text-sm text-gray-400">
          Keys werden mit AES-256-GCM verschlüsselt gespeichert und nur für deine Anfragen verwendet. Reihenfolge:
          eigener Key vor Team-Key vor serverseitigem Key.
          {org?.name && <> Aktives Team: {org.name}.</>}
        </p>
        {!loggedIn && (
          <p className="text-sm text-yellow-400">
            Zum Speichern bitte{" "}
            <Link href="/login" className="text-accent">
              einloggen
            </Link>
            .
          </p>
        )}
        {withKeys.map((p) => (
          <div key={p.id} className="grid gap-1 md:grid-cols-[240px_1fr]">
            <div>
              <a href={p.url} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">
                {p.name}
              </a>
              <div className="text-xs text-gray-500">
                {p.keyRequirement === "required" ? "Key erforderlich" : "Key optional"}
                {p.orgKey && <span className="ml-1 text-indigo-300">· Team-Key gesetzt</span>}
                {p.envKey && <span className="ml-1 text-gray-500">· Server-Key</span>}
              </div>
            </div>
            <div>
              <input
                className="input mono"
                placeholder={
                  p.userKey
                    ? `gesetzt: ${p.userKey} (leer lassen = behalten)`
                    : p.orgKey
                      ? `Team-Key aktiv (${p.orgKey}) – eigener Key hat Vorrang`
                      : p.envKey
                        ? "Server-Key aktiv – eigener Key überschreibt"
                        : "API-Key eingeben"
                }
                value={keys[p.id] ?? ""}
                onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                disabled={!loggedIn}
                autoComplete="off"
              />
              {p.keyHint && <div className="mt-1 text-xs text-gray-500">{p.keyHint}</div>}
            </div>
          </div>
        ))}
      </div>

      {withConfig.length > 0 && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Eigene Infrastruktur</h2>
          <p className="text-sm text-gray-400">
            Ein eigener Knoten oder Electrum-Server hat Vorrang vor allen öffentlichen APIs: keine Rate-Limits, keine
            Weitergabe der Suchanfragen an Dritte. Bitcoin Core benötigt <span className="mono">txindex=1</span> und kann
            nur Transaktionen liefern (kein Adressindex) – für Adressabfragen ist Electrum die passende Ergänzung.
          </p>
          {withConfig.map((p) => (
            <div key={p.id} className="space-y-2 rounded border border-border p-3">
              <div className="font-medium">{p.name}</div>
              <div className="grid gap-2 md:grid-cols-3">
                {p.configFields!.map((f) => (
                  <div key={f.key}>
                    <label className="label">{f.label}</label>
                    <input
                      className="input mono"
                      type={f.secret ? "password" : "text"}
                      placeholder={p.config[f.key] ? `gesetzt: ${p.config[f.key]}` : f.placeholder}
                      value={config[p.id]?.[f.key] ?? ""}
                      onChange={(e) => setConfig({ ...config, [p.id]: { ...(config[p.id] || {}), [f.key]: e.target.value } })}
                      disabled={!loggedIn}
                      autoComplete="off"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn" disabled={!loggedIn || saving}>
          Speichern
        </button>
        {msg && <span className="text-sm text-gray-400">{msg}</span>}
      </div>
    </form>
  );
}
