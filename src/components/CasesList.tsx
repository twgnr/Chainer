"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { shortHash } from "@/lib/format";
import { chainMeta } from "@/lib/chains";

interface CaseRow {
  _id: string;
  name: string;
  notes: string;
  chain: string;
  start: string;
  shared: boolean;
  own: boolean;
  params: { direction?: string; maxDepth?: number; mode?: string };
  traces?: { id: string }[];
  updatedAt: string;
}

export default function CasesList() {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/cases");
    const json = await res.json();
    if (!res.ok) return setErr(json.error);
    setCases(json.cases);
  }
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, []);

  async function remove(id: string) {
    if (!confirm("Fall wirklich löschen?")) return;
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
    load();
  }

  if (err) return <div className="card text-yellow-400">{err}</div>;
  if (!cases) return <p className="text-gray-500">Lade…</p>;
  if (!cases.length)
    return <div className="card text-gray-400">Noch keine Fälle gespeichert. Starte einen Trace und speichere ihn.</div>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-gray-500">
        <tr>
          <th className="py-1">Name</th>
          <th>Chain</th>
          <th>Start</th>
          <th>Traces</th>
          <th>Modus</th>
          <th>Geändert</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {cases.map((c) => (
          <tr key={c._id} className="border-t border-border">
            <td className="py-2">
              <Link href={`/cases/${c._id}`} className="font-medium hover:text-accent">
                {c.name}
              </Link>
              {c.shared && <span className="ml-2 rounded bg-indigo-600/70 px-1 text-[10px] text-white">geteilt</span>}
              {!c.own && <span className="ml-1 text-[10px] text-gray-500">vom Team</span>}
            </td>
            <td className="text-gray-400">{chainMeta(c.chain as never).symbol}</td>
            <td className="mono text-xs">{shortHash(c.start, 8)}</td>
            <td className="text-gray-400">{c.traces?.length ?? 1}</td>
            <td className="text-gray-400">
              {c.params?.mode === "utxo" ? "UTXO" : "Adresse"} · {c.params?.direction} · Tiefe {c.params?.maxDepth}
            </td>
            <td className="text-gray-400">{new Date(c.updatedAt).toLocaleString("de-DE")}</td>
            <td className="text-right">
              <Link className="btn-secondary mr-2" href={`/cases/${c._id}/report`}>
                Bericht
              </Link>
              {c.own && (
                <button className="btn-secondary" onClick={() => remove(c._id)}>
                  Löschen
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
