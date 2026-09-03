"use client";

import { useEffect, useState } from "react";
import { CHAIN_LIST, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";
import type { ProviderStatus } from "@/lib/providers/registry";

interface Response {
  chain: ChainId;
  providers: ProviderStatus[];
  cache: { memory: number; persistent: number | null };
}

export default function ProviderStatusList({ showCache = true }: { showCache?: boolean }) {
  const [data, setData] = useState<Response | null>(null);
  const [chain, setChain] = useState<ChainId>(DEFAULT_CHAIN);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(c: ChainId, ping: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/providers?chain=${c}${ping ? "&ping=1" : ""}`);
      setData(await res.json());
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(() => load(DEFAULT_CHAIN, false), 0);
    return () => clearTimeout(t);
  }, []);

  async function clearCache() {
    setMsg(null);
    const res = await fetch("/api/cache", { method: "DELETE" });
    const j = await res.json();
    setMsg(res.ok ? "Cache geleert." : j.error || "Fehler");
    load(chain, false);
  }

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Datenquellen</h2>
        <select
          className="input w-auto py-1"
          value={chain}
          onChange={(e) => {
            const c = e.target.value as ChainId;
            setChain(c);
            load(c, false);
          }}
        >
          {CHAIN_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={() => load(chain, true)} disabled={busy}>
          {busy ? "Prüfe…" : "Erreichbarkeit prüfen"}
        </button>
        {showCache && data?.cache && (
          <span className="ml-auto flex items-center gap-3 text-xs text-gray-400">
            Cache: {data.cache.memory} im Speicher
            {data.cache.persistent !== null ? `, ${data.cache.persistent} in der Datenbank` : ", keine Datenbank"}
            <button className="btn-secondary" onClick={clearCache}>
              Leeren
            </button>
            {msg && <span>{msg}</span>}
          </span>
        )}
      </div>
      {!data ? (
        <p className="text-sm text-gray-500">Lade…</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-1">Quelle</th>
              <th>Typ</th>
              <th>Chains</th>
              <th>Key</th>
              <th>Limit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.providers.map((p) => (
              <tr key={p.id} className={`border-t border-border ${p.active ? "" : "opacity-50"}`}>
                <td className="py-1.5">
                  <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                    {p.name}
                  </a>
                </td>
                <td className="text-gray-400">{p.kind === "data" ? "Blockchain" : "Labels/Risiko"}</td>
                <td className="text-xs text-gray-500">{p.chains ? p.chains.length : "alle"}</td>
                <td className="text-gray-400">
                  {p.configFields?.length && !p.hasConfig
                    ? "nicht konfiguriert"
                    : p.keyRequirement === "none"
                      ? "nicht nötig"
                      : p.hasKey
                        ? "✓ gesetzt"
                        : p.keyRequirement === "required"
                          ? "fehlt (inaktiv)"
                          : "optional"}
                </td>
                <td className="text-xs text-gray-500">{p.rateLimit || "–"}</td>
                <td>
                  {p.ok === undefined ? (
                    <span className="text-gray-500">{p.active ? "aktiv" : "inaktiv"}</span>
                  ) : p.ok ? (
                    <span className="text-green-400">OK ({p.ms} ms)</span>
                  ) : (
                    <span className="text-red-400" title={p.error}>
                      Fehler
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
