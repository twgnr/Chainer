"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n/provider";
import { COMMON } from "@/lib/i18n/labels";
import { translateHint } from "@/lib/i18n/hints";

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

const TXT = {
  en: {
    title: "Your own API keys",
    lead: "Keys are stored encrypted with AES-256-GCM and used only for your own requests. Order of precedence: your key, then the team key, then the server-side key.",
    activeTeam: (name: string) => ` Active team: ${name}.`,
    loginBefore: "To save, please ",
    login: "log in",
    saved: "Saved (encrypted).",
    keyRequired: "Key required",
    keyOptional: "Key optional",
    teamKeySet: "· team key set",
    serverKey: "· server key",
    placeholderSet: (masked: string) => `set: ${masked} (leave empty to keep)`,
    placeholderTeam: (masked: string) => `team key active (${masked}) – your own key takes precedence`,
    placeholderEnv: "server key active – your own key overrides it",
    placeholderEnter: "Enter API key",
    infraTitle: "Your own infrastructure",
    infraLead: (
      <>
        A node or Electrum server of your own takes precedence over every public API: no rate limits, and your queries
        are not passed to third parties. Bitcoin Core needs <span className="mono">txindex=1</span> and can only serve
        transactions (there is no address index) – for address lookups Electrum is the right companion.
      </>
    ),
    configSet: (masked: string) => `set: ${masked}`,
  },
  de: {
    title: "Eigene API-Keys",
    lead: "Keys werden mit AES-256-GCM verschlüsselt gespeichert und nur für deine Anfragen verwendet. Reihenfolge: eigener Key vor Team-Key vor serverseitigem Key.",
    activeTeam: (name: string) => ` Aktives Team: ${name}.`,
    loginBefore: "Zum Speichern bitte ",
    login: "einloggen",
    saved: "Gespeichert (verschlüsselt).",
    keyRequired: "Key erforderlich",
    keyOptional: "Key optional",
    teamKeySet: "· Team-Key gesetzt",
    serverKey: "· Server-Key",
    placeholderSet: (masked: string) => `gesetzt: ${masked} (leer lassen = behalten)`,
    placeholderTeam: (masked: string) => `Team-Key aktiv (${masked}) – eigener Key hat Vorrang`,
    placeholderEnv: "Server-Key aktiv – eigener Key überschreibt",
    placeholderEnter: "API-Key eingeben",
    infraTitle: "Eigene Infrastruktur",
    infraLead: (
      <>
        Ein eigener Knoten oder Electrum-Server hat Vorrang vor allen öffentlichen APIs: keine Rate-Limits, keine
        Weitergabe der Suchanfragen an Dritte. Bitcoin Core benötigt <span className="mono">txindex=1</span> und kann
        nur Transaktionen liefern (kein Adressindex) – für Adressabfragen ist Electrum die passende Ergänzung.
      </>
    ),
    configSet: (masked: string) => `gesetzt: ${masked}`,
  },
};

export default function KeysForm() {
  const t = useT(TXT);
  const c = useT(COMMON);
  const locale = useLocale();
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
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
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
    setMsg(res.ok ? t.saved : json.error);
    setSaving(false);
    if (res.ok) load();
  }

  const withKeys = providers.filter((p) => p.keyRequirement !== "none");
  const withConfig = providers.filter((p) => p.configFields?.length);

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="card space-y-4">
        <h2 className="font-semibold">{t.title}</h2>
        <p className="text-sm text-muted">
          {t.lead}
          {org?.name && t.activeTeam(org.name)}
        </p>
        {!loggedIn && (
          <p className="text-sm text-yellow-400">
            {t.loginBefore}
            <Link href="/login" className="text-brand">
              {t.login}
            </Link>
            .
          </p>
        )}
        {withKeys.map((p) => (
          <div key={p.id} className="grid gap-1 md:grid-cols-[240px_1fr]">
            <div>
              <a href={p.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand">
                {p.name}
              </a>
              <div className="text-xs text-subtle">
                {p.keyRequirement === "required" ? t.keyRequired : t.keyOptional}
                {p.orgKey && <span className="ml-1 text-indigo-300">{t.teamKeySet}</span>}
                {p.envKey && <span className="ml-1 text-subtle">{t.serverKey}</span>}
              </div>
            </div>
            <div>
              <input
                className="input mono"
                placeholder={
                  p.userKey
                    ? t.placeholderSet(p.userKey)
                    : p.orgKey
                      ? t.placeholderTeam(p.orgKey)
                      : p.envKey
                        ? t.placeholderEnv
                        : t.placeholderEnter
                }
                value={keys[p.id] ?? ""}
                onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                disabled={!loggedIn}
                autoComplete="off"
                suppressHydrationWarning
              />
              {p.keyHint && <div className="mt-1 text-xs text-subtle">{translateHint(p.keyHint, locale)}</div>}
            </div>
          </div>
        ))}
      </div>

      {withConfig.length > 0 && (
        <div className="card space-y-4">
          <h2 className="font-semibold">{t.infraTitle}</h2>
          <p className="text-sm text-muted">{t.infraLead}</p>
          {withConfig.map((p) => (
            <div key={p.id} className="space-y-2 rounded border border-border p-3">
              <div className="font-medium">{p.name}</div>
              <div className="grid gap-2 md:grid-cols-3">
                {p.configFields!.map((f) => (
                  <div key={f.key}>
                    <label className="label">{translateHint(f.label, locale)}</label>
                    <input
                      className="input mono"
                      type={f.secret ? "password" : "text"}
                      placeholder={p.config[f.key] ? t.configSet(p.config[f.key]) : f.placeholder}
                      value={config[p.id]?.[f.key] ?? ""}
                      onChange={(e) =>
                        setConfig({ ...config, [p.id]: { ...(config[p.id] || {}), [f.key]: e.target.value } })
                      }
                      disabled={!loggedIn}
                      autoComplete="off"
                      suppressHydrationWarning
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
          {c.save}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </form>
  );
}
