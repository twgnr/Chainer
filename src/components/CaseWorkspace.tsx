"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import TraceView from "./TraceView";
import { EMPTY_VIEW, type GraphViewState } from "./TraceGraph";
import { shortHash } from "@/lib/format";
import type { ChainId } from "@/lib/chains";
import type { TraceResult } from "@/lib/trace/types";

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
    setRefreshMsg(
      res.ok
        ? j.changed
          ? `${j.changed} Fall/Fälle mit Bewegung. Seite neu laden, um den neuen Trace zu sehen.`
          : "Keine Änderung seit dem letzten Stand."
        : j.error || "Fehler",
    );
  }

  const active = traces.find((t) => t.id === activeId);

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
      setMsg(j.error || "Fehler");
      return null;
    }
    setMsg(note ?? "Gespeichert.");
    if (j.case) {
      setTraces(j.case.traces || []);
      setLog(j.case.log || []);
    }
    return j.case as CaseData;
  }

  async function addLogEntry() {
    if (!logText.trim()) return;
    await patch({ addLog: logText.trim() }, "Protokolleintrag hinzugefügt.");
    setLogText("");
  }

  async function removeTrace(id: string) {
    if (!confirm("Diesen Trace aus dem Fall entfernen?")) return;
    const updated = await patch({ removeTraceId: id }, "Trace entfernt.");
    if (updated) setActiveId(updated.traces?.[0]?.id ?? "");
  }

  async function deleteCase() {
    if (!confirm("Den gesamten Fall löschen?")) return;
    const res = await fetch(`/api/cases/${data._id}`, { method: "DELETE" });
    if (res.ok) router.push("/cases");
    else setMsg("Löschen fehlgeschlagen");
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
          <span className="text-xs text-gray-500">
            Aktenzeichen {shortHash(data._id, 6)} · geändert {new Date(data.updatedAt).toLocaleString("de-DE")}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link className="btn-secondary" href={`/cases/${data._id}/report`}>
              Bericht
            </Link>
            {canWrite && (
              <button className="btn-secondary" onClick={deleteCase} disabled={busy}>
                Fall löschen
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
                patch({ shared: e.target.checked }, e.target.checked ? "Im Team geteilt." : "Teilen beendet.");
              }}
            />
            Im Team teilen (alle Mitglieder sehen und bearbeiten diesen Fall)
          </label>
        )}
        <div>
          <label className="label">Notizen</label>
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
                  patch({ autoRefresh: e.target.checked }, e.target.checked ? "Automatische Aktualisierung an." : "Aus.");
                }}
              />
              Automatisch aktualisieren
            </label>
            <label className="flex items-center gap-1">
              alle
              <input
                className="input w-20 py-1"
                type="number"
                min={1}
                max={720}
                value={interval}
                onChange={(e) => setIntervalHours(Number(e.target.value))}
                onBlur={() => interval !== data.refreshIntervalHours && patch({ refreshIntervalHours: interval })}
              />
              Stunden
            </label>
            <button className="btn-secondary" onClick={refreshNow} disabled={refreshBusy}>
              {refreshBusy ? "Prüfe…" : "Jetzt aktualisieren"}
            </button>
            {data.lastRefreshAt && (
              <span className="text-xs text-gray-500">
                zuletzt {new Date(data.lastRefreshAt).toLocaleString("de-DE")}
              </span>
            )}
            {refreshMsg && <span className="text-xs text-gray-400">{refreshMsg}</span>}
            <span className="text-xs text-gray-500">
              Bei Bewegung wird ein Protokolleintrag geschrieben und benachrichtigt.
            </span>
          </div>
        )}
        {msg && <p className="text-xs text-gray-400">{msg}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {traces.map((t) => (
              <button
                key={t.id}
                className={`rounded-md border px-3 py-1 text-sm ${
                  t.id === activeId ? "border-accent bg-accent text-black" : "border-border hover:bg-white/5"
                }`}
                onClick={() => {
                  setActiveId(t.id);
                  setShowNew(false);
                }}
              >
                {t.name || shortHash(t.start, 6)}
                <span className="ml-1 text-[10px] opacity-70">{t.result?.stats?.addresses ?? 0} Adr.</span>
              </button>
            ))}
            {canWrite && (
              <button
                className={`rounded-md border border-dashed px-3 py-1 text-sm ${showNew ? "border-accent text-accent" : "border-border"}`}
                onClick={() => {
                  setShowNew(true);
                  setActiveId("");
                }}
              >
                + Neuer Trace
              </button>
            )}
            {active && canWrite && traces.length > 1 && (
              <button className="btn-secondary ml-auto" onClick={() => removeTrace(active.id)} disabled={busy}>
                Trace entfernen
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
          <h2 className="font-semibold">Ermittlungsprotokoll</h2>
          {canWrite && (
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="Eintrag hinzufügen"
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
                <div className="text-gray-500">
                  {new Date(l.at).toLocaleString("de-DE")} · {l.author || "unbekannt"}
                </div>
                <div className="whitespace-pre-wrap">{l.text}</div>
              </li>
            ))}
            {!log.length && <li className="text-gray-500">Noch keine Einträge.</li>}
          </ul>

          {data.merges?.length > 0 && (
            <div>
              <h3 className="font-semibold">Manuelle Cluster</h3>
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
