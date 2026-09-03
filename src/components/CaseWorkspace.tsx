"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import TraceView from "./TraceView";
import { EMPTY_VIEW, type GraphViewState } from "./TraceGraph";
import { shortHash } from "@/lib/format";
import type { ChainId } from "@/lib/chains";
import type { TraceResult } from "@/lib/trace/types";
import { useFormatters, useT } from "@/lib/i18n/provider";
import { COMMON } from "@/lib/i18n/labels";

const TXT = {
  en: {
    refreshed: (changed: number) =>
      `${changed} case${changed === 1 ? "" : "s"} with movement. Reload the page to see the new trace.`,
    noChange: "No change since the last state.",
    saved: "Saved.",
    logAdded: "Log entry added.",
    confirmRemoveTrace: "Remove this trace from the case?",
    traceRemoved: "Trace removed.",
    confirmDeleteCase: "Delete the whole case?",
    deleteFailed: "Deleting failed",
    caseRef: (ref: string) => `Case reference ${ref}`,
    changed: "changed",
    report: "Report",
    deleteCase: "Delete case",
    sharedOn: "Shared with the team.",
    sharedOff: "Sharing ended.",
    shareLabel: "Share with the team (every member can see and edit this case)",
    notes: "Notes",
    autoRefreshOn: "Automatic refresh on.",
    autoRefreshOff: "Off.",
    autoRefresh: "Refresh automatically",
    every: "every",
    hours: "hours",
    checking: "Checking…",
    refreshNow: "Refresh now",
    lastRefresh: "last",
    refreshHint: "When there is movement, a log entry is written and a notification is sent.",
    addrShort: "addr.",
    newTrace: "+ New trace",
    removeTrace: "Remove trace",
    logTitle: "Investigation log",
    logPlaceholder: "Add an entry",
    unknownAuthor: "unknown",
    noEntries: "No entries yet.",
    manualClusters: "Manual clusters",
  },
  de: {
    refreshed: (changed: number) => `${changed} Fall/Fälle mit Bewegung. Seite neu laden, um den neuen Trace zu sehen.`,
    noChange: "Keine Änderung seit dem letzten Stand.",
    saved: "Gespeichert.",
    logAdded: "Protokolleintrag hinzugefügt.",
    confirmRemoveTrace: "Diesen Trace aus dem Fall entfernen?",
    traceRemoved: "Trace entfernt.",
    confirmDeleteCase: "Den gesamten Fall löschen?",
    deleteFailed: "Löschen fehlgeschlagen",
    caseRef: (ref: string) => `Aktenzeichen ${ref}`,
    changed: "geändert",
    report: "Bericht",
    deleteCase: "Fall löschen",
    sharedOn: "Im Team geteilt.",
    sharedOff: "Teilen beendet.",
    shareLabel: "Im Team teilen (alle Mitglieder sehen und bearbeiten diesen Fall)",
    notes: "Notizen",
    autoRefreshOn: "Automatische Aktualisierung an.",
    autoRefreshOff: "Aus.",
    autoRefresh: "Automatisch aktualisieren",
    every: "alle",
    hours: "Stunden",
    checking: "Prüfe…",
    refreshNow: "Jetzt aktualisieren",
    lastRefresh: "zuletzt",
    refreshHint: "Bei Bewegung wird ein Protokolleintrag geschrieben und benachrichtigt.",
    addrShort: "Adr.",
    newTrace: "+ Neuer Trace",
    removeTrace: "Trace entfernen",
    logTitle: "Ermittlungsprotokoll",
    logPlaceholder: "Eintrag hinzufügen",
    unknownAuthor: "unbekannt",
    noEntries: "Noch keine Einträge.",
    manualClusters: "Manuelle Cluster",
  },
};

interface CaseTrace {
  id: string;
  name: string;
  start: string;
  chain: string;
  params: Record<string, unknown>;
  result: TraceResult;
  createdAt: string;
}

export interface CaseData {
  _id: string;
  name: string;
  notes: string;
  chain: string;
  start: string;
  shared: boolean;
  params: Record<string, unknown>;
  result?: TraceResult;
  traces: CaseTrace[];
  merges: string[][];
  log: { at: string; author: string; text: string }[];
  view?: GraphViewState;
  autoRefresh?: boolean;
  refreshIntervalHours?: number;
  lastRefreshAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Arbeitsbereich eines Falls: mehrere Traces, Notizen, Ermittlungsprotokoll,
 * manuelle Cluster-Zusammenführungen und gespeicherte Graph-Ansicht.
 */
export default function CaseWorkspace({
  data,
  canWrite,
  inTeam,
}: {
  data: CaseData;
  canWrite: boolean;
  inTeam: boolean;
}) {
  const t = useT(TXT);
  const c = useT(COMMON);
  const fmt = useFormatters();
  const router = useRouter();
  // Alte Fälle haben nur einen Snapshot in `result`
  const initialTraces: CaseTrace[] =
    data.traces?.length > 0
      ? data.traces
      : data.result
        ? [
            {
              id: "legacy",
              name: "Trace 1",
              start: data.start,
              chain: data.chain,
              params: data.params,
              result: data.result,
              createdAt: data.createdAt,
            },
          ]
        : [];

  const [traces, setTraces] = useState<CaseTrace[]>(initialTraces);
  const [activeId, setActiveId] = useState<string>(initialTraces[0]?.id ?? "");
  const [notes, setNotes] = useState(data.notes);
  const [name, setName] = useState(data.name);
  const [shared, setShared] = useState(data.shared);
  const [log, setLog] = useState(data.log || []);
  const [logText, setLogText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(initialTraces.length === 0);
  const [autoRefresh, setAutoRefresh] = useState(!!data.autoRefresh);
  const [interval, setIntervalHours] = useState(data.refreshIntervalHours ?? 24);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);

  async function refreshNow() {
    setRefreshBusy(true);
    setRefreshMsg(null);
    const res = await fetch(`/api/cases/refresh?id=${data._id}`, { method: "POST" });
    const j = await res.json();
    setRefreshBusy(false);
    setRefreshMsg(res.ok ? (j.changed ? t.refreshed(j.changed) : t.noChange) : j.error || c.error);
  }

  const active = traces.find((tr) => tr.id === activeId);

  async function patch(body: Record<string, unknown>, note?: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/cases/${data._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(j.error || c.error);
      return null;
    }
    setMsg(note ?? t.saved);
    if (j.case) {
      setTraces(j.case.traces || []);
      setLog(j.case.log || []);
    }
    return j.case as CaseData;
  }

  async function addLogEntry() {
    if (!logText.trim()) return;
    await patch({ addLog: logText.trim() }, t.logAdded);
    setLogText("");
  }

  async function removeTrace(id: string) {
    if (!confirm(t.confirmRemoveTrace)) return;
    const updated = await patch({ removeTraceId: id }, t.traceRemoved);
    if (updated) setActiveId(updated.traces?.[0]?.id ?? "");
  }

  async function deleteCase() {
    if (!confirm(t.confirmDeleteCase)) return;
    const res = await fetch(`/api/cases/${data._id}`, { method: "DELETE" });
    if (res.ok) router.push("/cases");
    else setMsg(t.deleteFailed);
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {canWrite ? (
            <input
              className="input max-w-sm text-lg font-semibold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== data.name && patch({ name })}
            />
          ) : (
            <h1 className="text-lg font-semibold">{name}</h1>
          )}
          <span className="text-xs text-subtle">
            {t.caseRef(shortHash(data._id, 6))} · {t.changed} {fmt.timestamp(data.updatedAt)}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link className="btn-secondary" href={`/cases/${data._id}/report`}>
              {t.report}
            </Link>
            {canWrite && (
              <button className="btn-secondary" onClick={deleteCase} disabled={busy}>
                {t.deleteCase}
              </button>
            )}
          </div>
        </div>
        {inTeam && canWrite && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => {
                setShared(e.target.checked);
                patch({ shared: e.target.checked }, e.target.checked ? t.sharedOn : t.sharedOff);
              }}
            />
            {t.shareLabel}
          </label>
        )}
        <div>
          <label className="label">{t.notes}</label>
          <textarea
            className="input"
            rows={3}
            value={notes}
            readOnly={!canWrite}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => canWrite && notes !== data.notes && patch({ notes })}
          />
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => {
                  setAutoRefresh(e.target.checked);
                  patch({ autoRefresh: e.target.checked }, e.target.checked ? t.autoRefreshOn : t.autoRefreshOff);
                }}
              />
              {t.autoRefresh}
            </label>
            <label className="flex items-center gap-1">
              {t.every}
              <input
                className="input w-20 py-1"
                type="number"
                min={1}
                max={720}
                value={interval}
                onChange={(e) => setIntervalHours(Number(e.target.value))}
                onBlur={() => interval !== data.refreshIntervalHours && patch({ refreshIntervalHours: interval })}
              />
              {t.hours}
            </label>
            <button className="btn-secondary" onClick={refreshNow} disabled={refreshBusy}>
              {refreshBusy ? t.checking : t.refreshNow}
            </button>
            {data.lastRefreshAt && (
              <span className="text-xs text-subtle">
                {t.lastRefresh} {fmt.timestamp(data.lastRefreshAt)}
              </span>
            )}
            {refreshMsg && <span className="text-xs text-muted">{refreshMsg}</span>}
            <span className="text-xs text-subtle">
              {t.refreshHint}
            </span>
          </div>
        )}
        {msg && <p className="text-xs text-muted">{msg}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {traces.map((tr) => (
              <button
                key={tr.id}
                className={`rounded-md border px-3 py-1 text-sm ${
                  tr.id === activeId ? "border-accent bg-accent text-black" : "border-border hover:bg-hover"
                }`}
                onClick={() => {
                  setActiveId(tr.id);
                  setShowNew(false);
                }}
              >
                {tr.name || shortHash(tr.start, 6)}
                <span className="ml-1 text-[10px] opacity-70">
                  {tr.result?.stats?.addresses ?? 0} {t.addrShort}
                </span>
              </button>
            ))}
            {canWrite && (
              <button
                className={`rounded-md border border-dashed px-3 py-1 text-sm ${showNew ? "border-accent text-brand" : "border-border"}`}
                onClick={() => {
                  setShowNew(true);
                  setActiveId("");
                }}
              >
                {t.newTrace}
              </button>
            )}
            {active && canWrite && traces.length > 1 && (
              <button className="btn-secondary ml-auto" onClick={() => removeTrace(active.id)} disabled={busy}>
                {t.removeTrace}
              </button>
            )}
          </div>

          {showNew || !active ? (
            <TraceView
              key="new"
              initialStart={data.start}
              initialChain={data.chain as ChainId}
              initialMerges={data.merges}
              loggedIn
              caseId={data._id}
              canWrite={canWrite}
            />
          ) : (
            <TraceView
              key={active.id}
              initialStart={active.start}
              initialChain={(active.chain || data.chain) as ChainId}
              initialResult={active.result}
              initialView={data.view || EMPTY_VIEW}
              initialMerges={data.merges}
              loggedIn
              caseId={data._id}
              canWrite={canWrite}
            />
          )}
        </div>

        <aside className="card h-fit space-y-3">
          <h2 className="font-semibold">{t.logTitle}</h2>
          {canWrite && (
            <div className="flex gap-2">
              <input
                className="input"
                placeholder={t.logPlaceholder}
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLogEntry()}
              />
              <button className="btn-secondary" onClick={addLogEntry} disabled={busy || !logText.trim()}>
                +
              </button>
            </div>
          )}
          <ul className="max-h-96 space-y-2 overflow-y-auto text-xs">
            {[...log].reverse().map((l, i) => (
              <li key={i} className="border-b border-border pb-1">
                <div className="text-subtle">
                  {fmt.timestamp(l.at)} · {l.author || t.unknownAuthor}
                </div>
                <div className="whitespace-pre-wrap">{l.text}</div>
              </li>
            ))}
            {!log.length && <li className="text-subtle">{t.noEntries}</li>}
          </ul>

          {data.merges?.length > 0 && (
            <div>
              <h3 className="font-semibold">{t.manualClusters}</h3>
              <ul className="mono space-y-1 text-[11px]">
                {data.merges.map((g, i) => (
                  <li key={i} className="truncate" title={g.join(", ")}>
                    {g.map((a) => shortHash(a, 5)).join(" + ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
