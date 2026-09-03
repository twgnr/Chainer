"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { shortHash } from "@/lib/format";
import { chainMeta } from "@/lib/chains";
import { useFormatters, useLocale, useT } from "@/lib/i18n/provider";
import { COMMON, MODE_LABEL, directionLabel } from "@/lib/i18n/labels";

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

const TXT = {
  en: {
    confirmDelete: "Really delete this case?",
    empty: "No cases saved yet. Start a trace and save it.",
    colName: "Name",
    colStart: "Start",
    colTraces: "Traces",
    colMode: "Mode",
    colChanged: "Changed",
    shared: "shared",
    fromTeam: "from the team",
    depth: "depth",
    report: "Report",
  },
  de: {
    confirmDelete: "Fall wirklich löschen?",
    empty: "Noch keine Fälle gespeichert. Starte einen Trace und speichere ihn.",
    colName: "Name",
    colStart: "Start",
    colTraces: "Traces",
    colMode: "Modus",
    colChanged: "Geändert",
    shared: "geteilt",
    fromTeam: "vom Team",
    depth: "Tiefe",
    report: "Bericht",
  },
};

export default function CasesList() {
  const t = useT(TXT);
  const common = useT(COMMON);
  const modeName = useT(MODE_LABEL);
  const locale = useLocale();
  const fmt = useFormatters();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/cases");
    const json = await res.json();
    if (!res.ok) return setErr(json.error);
    setCases(json.cases);
  }
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, []);

  async function remove(id: string) {
    if (!confirm(t.confirmDelete)) return;
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
    load();
  }

  if (err) return <div className="card text-yellow-400">{err}</div>;
  if (!cases) return <p className="text-subtle">{common.loading}</p>;
  if (!cases.length) return <div className="card text-muted">{t.empty}</div>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-subtle">
        <tr>
          <th className="py-1">{t.colName}</th>
          <th>{common.chain}</th>
          <th>{t.colStart}</th>
          <th>{t.colTraces}</th>
          <th>{t.colMode}</th>
          <th>{t.colChanged}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {cases.map((c) => (
          <tr key={c._id} className="border-t border-border">
            <td className="py-2">
              <Link href={`/cases/${c._id}`} className="font-medium hover:text-brand">
                {c.name}
              </Link>
              {c.shared && (
                <span className="ml-2 rounded bg-indigo-600/70 px-1 text-[10px] text-white">{t.shared}</span>
              )}
              {!c.own && <span className="ml-1 text-[10px] text-subtle">{t.fromTeam}</span>}
            </td>
            <td className="text-muted">{chainMeta(c.chain as never).symbol}</td>
            <td className="mono text-xs">{shortHash(c.start, 8)}</td>
            <td className="text-muted">{c.traces?.length ?? 1}</td>
            <td className="text-muted">
              {c.params?.mode === "utxo" ? modeName.utxo : modeName.address} ·{" "}
              {directionLabel(c.params?.direction, locale)} · {t.depth} {c.params?.maxDepth}
            </td>
            <td className="text-muted">{fmt.timestamp(c.updatedAt)}</td>
            <td className="text-right">
              <Link className="btn-secondary mr-2" href={`/cases/${c._id}/report`}>
                {t.report}
              </Link>
              {c.own && (
                <button className="btn-secondary" onClick={() => remove(c._id)}>
                  {common.delete}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
