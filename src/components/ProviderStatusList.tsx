"use client";

import { useEffect, useState } from "react";
import { CHAIN_LIST, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";
import type { ProviderStatus } from "@/lib/providers/registry";
import { useLocale, useT } from "@/lib/i18n/provider";
import { COMMON } from "@/lib/i18n/labels";
import { translateHint } from "@/lib/i18n/hints";

interface Response {
  chain: ChainId;
  providers: ProviderStatus[];
  cache: { memory: number; persistent: number | null };
}

const TXT = {
  en: {
    title: "Data sources",
    checking: "Checking…",
    checkReachability: "Check reachability",
    cache: "Cache:",
    inMemory: (n: number) => `${n} in memory`,
    inDatabase: (n: number) => `, ${n} in the database`,
    noDatabase: ", no database",
    clear: "Clear",
    cacheCleared: "Cache cleared.",
    colSource: "Source",
    colKind: "Type",
    colChains: "Chains",
    colKey: "Key",
    colLimit: "Limit",
    colStatus: "Status",
    kindData: "Blockchain",
    kindLabels: "Labels/risk",
    allChains: "all",
    notConfigured: "not configured",
    notNeeded: "not needed",
    keySet: "✓ set",
    keyMissing: "missing (inactive)",
    keyOptional: "optional",
    active: "active",
    inactive: "inactive",
  },
  de: {
    title: "Datenquellen",
    checking: "Prüfe…",
    checkReachability: "Erreichbarkeit prüfen",
    cache: "Cache:",
    inMemory: (n: number) => `${n} im Speicher`,
    inDatabase: (n: number) => `, ${n} in der Datenbank`,
    noDatabase: ", keine Datenbank",
    clear: "Leeren",
    cacheCleared: "Cache geleert.",
    colSource: "Quelle",
    colKind: "Typ",
    colChains: "Chains",
    colKey: "Key",
    colLimit: "Limit",
    colStatus: "Status",
    kindData: "Blockchain",
    kindLabels: "Labels/Risiko",
    allChains: "alle",
    notConfigured: "nicht konfiguriert",
    notNeeded: "nicht nötig",
    keySet: "✓ gesetzt",
    keyMissing: "fehlt (inaktiv)",
    keyOptional: "optional",
    active: "aktiv",
    inactive: "inaktiv",
  },
};

export default function ProviderStatusList({ showCache = true }: { showCache?: boolean }) {
  const t = useT(TXT);
  const c = useT(COMMON);
  const locale = useLocale();
  const [data, setData] = useState<Response | null>(null);
  const [chain, setChain] = useState<ChainId>(DEFAULT_CHAIN);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(ch: ChainId, ping: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/providers?chain=${ch}${ping ? "&ping=1" : ""}`);
      setData(await res.json());
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => load(DEFAULT_CHAIN, false), 0);
    return () => clearTimeout(timer);
  }, []);

  async function clearCache() {
    setMsg(null);
    const res = await fetch("/api/cache", { method: "DELETE" });
    const j = await res.json();
    setMsg(res.ok ? t.cacheCleared : j.error || c.error);
    load(chain, false);
  }

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{t.title}</h2>
        <select
          className="input w-auto py-1"
          value={chain}
          onChange={(e) => {
            const ch = e.target.value as ChainId;
            setChain(ch);
            load(ch, false);
          }}
        >
          {CHAIN_LIST.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={() => load(chain, true)} disabled={busy}>
          {busy ? t.checking : t.checkReachability}
        </button>
        {showCache && data?.cache && (
          <span className="ml-auto flex items-center gap-3 text-xs text-muted">
            {t.cache} {t.inMemory(data.cache.memory)}
            {data.cache.persistent !== null ? t.inDatabase(data.cache.persistent) : t.noDatabase}
            <button className="btn-secondary" onClick={clearCache}>
              {t.clear}
            </button>
            {msg && <span>{msg}</span>}
          </span>
        )}
      </div>
      {!data ? (
        <p className="text-sm text-subtle">{c.loading}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-subtle">
            <tr>
              <th className="py-1">{t.colSource}</th>
              <th>{t.colKind}</th>
              <th>{t.colChains}</th>
              <th>{t.colKey}</th>
              <th>{t.colLimit}</th>
              <th>{t.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {data.providers.map((p) => (
              <tr key={p.id} className={`border-t border-border ${p.active ? "" : "opacity-50"}`}>
                <td className="py-1.5">
                  <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-brand">
                    {p.name}
                  </a>
                </td>
                <td className="text-muted">{p.kind === "data" ? t.kindData : t.kindLabels}</td>
                <td className="text-xs text-subtle">{p.chains ? p.chains.length : t.allChains}</td>
                <td className="text-muted">
                  {p.configFields?.length && !p.hasConfig
                    ? t.notConfigured
                    : p.keyRequirement === "none"
                      ? t.notNeeded
                      : p.hasKey
                        ? t.keySet
                        : p.keyRequirement === "required"
                          ? t.keyMissing
                          : t.keyOptional}
                </td>
                <td className="text-xs text-subtle">{p.rateLimit ? translateHint(p.rateLimit, locale) : "–"}</td>
                <td>
                  {p.ok === undefined ? (
                    <span className="text-subtle">{p.active ? t.active : t.inactive}</span>
                  ) : p.ok ? (
                    <span className="text-green-400">OK ({p.ms} ms)</span>
                  ) : (
                    <span className="text-red-400" title={p.error ? translateHint(p.error, locale) : undefined}>
                      {c.error}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
