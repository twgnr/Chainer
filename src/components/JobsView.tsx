"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatters, useT } from "@/lib/i18n/provider";
import { COMMON } from "@/lib/i18n/labels";

interface JobProgress {
  phase?: string;
  message?: string;
  nodes?: number;
  edges?: number;
  apiCalls?: number;
}

type JobStatus = "pending" | "running" | "done" | "error" | "cancelled";

interface JobSummary {
  _id: string;
  type: "trace" | "path";
  name: string;
  status: JobStatus;
  params?: Record<string, unknown>;
  progress?: JobProgress;
  error?: string;
  attempts?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface JobFull extends JobSummary {
  result?: unknown;
}

interface ListResponse {
  jobs?: JobSummary[];
  error?: string;
}

interface DetailResponse {
  job?: JobFull;
  error?: string;
}

interface CreateCaseResponse {
  ok?: boolean;
  id?: string;
  error?: string;
}

const TXT = {
  en: {
    status: {
      pending: "Waiting",
      running: "Running",
      done: "Finished",
      error: "Error",
      cancelled: "Cancelled",
    },
    type: { trace: "Trace", path: "Connection" },
    loadFailed: "Loading failed.",
    networkErrorList: "Network error while loading the jobs.",
    actionFailed: "The action failed.",
    networkError: "Network error.",
    cancelling: "The job is being cancelled.",
    deleted: "Job deleted.",
    resultFailed: "The result could not be loaded.",
    networkErrorResult: "Network error while loading the result.",
    saveFailed: "Saving failed.",
    networkErrorSave: "Network error while saving.",
    savedAsCase: "Saved as a case.",
    jobFallbackName: "Job",
    empty: "No jobs yet. Long analyses can be queued here: the server works through them one after another in the background – even if you leave the page. The result stays available afterwards and can be saved as a case or downloaded as JSON.",
    colName: "Name",
    colType: "Type",
    colStatus: "Status",
    colProgress: "Progress",
    colDuration: "Duration",
    colTimes: "Times",
    colActions: "Actions",
    noName: "(no name)",
    counts: (nodes: number, edges: number, calls: number) =>
      `${nodes} nodes · ${edges} edges · ${calls} queries`,
    created: "Created:",
    started: "Started:",
    finished: "Finished:",
    openResult: "Open result",
    result: "Result:",
    downloadJson: "Download as JSON",
    saveAsCase: "Save as a case",
    tooLarge: "The full result can be very large and is therefore not shown as a preview.",
    minutes: (min: number, sec: number) => `${min} min ${sec} s`,
    seconds: (sec: number) => `${sec} s`,
  },
  de: {
    status: {
      pending: "Wartet",
      running: "Läuft",
      done: "Fertig",
      error: "Fehler",
      cancelled: "Abgebrochen",
    },
    type: { trace: "Trace", path: "Verbindung" },
    loadFailed: "Laden fehlgeschlagen.",
    networkErrorList: "Netzwerkfehler beim Laden der Aufträge.",
    actionFailed: "Aktion fehlgeschlagen.",
    networkError: "Netzwerkfehler.",
    cancelling: "Auftrag wird abgebrochen.",
    deleted: "Auftrag gelöscht.",
    resultFailed: "Ergebnis konnte nicht geladen werden.",
    networkErrorResult: "Netzwerkfehler beim Laden des Ergebnisses.",
    saveFailed: "Speichern fehlgeschlagen.",
    networkErrorSave: "Netzwerkfehler beim Speichern.",
    savedAsCase: "Als Fall gespeichert.",
    jobFallbackName: "Auftrag",
    empty: "Noch keine Aufträge. Lange Analysen lassen sich hier einstellen: Der Server arbeitet sie nacheinander im Hintergrund ab – auch wenn Sie die Seite verlassen. Das Ergebnis bleibt danach abrufbar und kann als Fall gespeichert oder als JSON heruntergeladen werden.",
    colName: "Name",
    colType: "Typ",
    colStatus: "Status",
    colProgress: "Fortschritt",
    colDuration: "Dauer",
    colTimes: "Zeitpunkte",
    colActions: "Aktionen",
    noName: "(ohne Name)",
    counts: (nodes: number, edges: number, calls: number) =>
      `${nodes} Knoten · ${edges} Kanten · ${calls} Abfragen`,
    created: "Erstellt:",
    started: "Start:",
    finished: "Ende:",
    openResult: "Ergebnis öffnen",
    result: "Ergebnis:",
    downloadJson: "Als JSON herunterladen",
    saveAsCase: "Als Fall speichern",
    tooLarge: "Das vollständige Ergebnis kann sehr groß sein und wird deshalb nicht als Vorschau angezeigt.",
    minutes: (min: number, sec: number) => `${min} min ${sec} s`,
    seconds: (sec: number) => `${sec} s`,
  },
} satisfies Record<string, { status: Record<JobStatus, string>; type: Record<"trace" | "path", string> } & Record<string, unknown>>;

const STATUS_CLASS: Record<JobStatus, string> = {
  pending: "bg-gray-500/20 text-fg-2",
  running: "bg-accent/20 text-brand",
  done: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
  cancelled: "bg-yellow-500/20 text-yellow-400",
};

/** Laufzeit eines Auftrags; bei laufenden Aufträgen bis jetzt */
function duration(job: JobSummary, t: { seconds: (s: number) => string; minutes: (m: number, s: number) => string }): string {
  if (!job.startedAt) return "–";
  const start = new Date(job.startedAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "–";
  const s = Math.round((end - start) / 1000);
  if (s < 60) return t.seconds(s);
  return t.minutes(Math.floor(s / 60), s % 60);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default function JobsView() {
  const t = useT(TXT);
  const c = useT(COMMON);
  const fmt = useFormatters();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobFull | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const json: ListResponse = await res.json();
      if (!res.ok) {
        setErr(json.error ?? t.loadFailed);
        setLoaded(true);
        return;
      }
      setErr(null);
      setJobs(json.jobs ?? []);
      setLoaded(true);
    } catch {
      setErr(t.networkErrorList);
      setLoaded(true);
    }
  }, [t]);

  // Erstes Laden bewusst verzögert, damit im Effekt nichts synchron gesetzt wird
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const active = useMemo(() => jobs.some((j) => j.status === "pending" || j.status === "running"), [jobs]);

  // Nur solange etwas offen ist, wird regelmäßig nachgeladen
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(i);
  }, [active, load]);

  const remove = useCallback(
    async (id: string) => {
      setBusy(id);
      setMsg(null);
      try {
        const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
        const json: { error?: string; cancelled?: boolean } = await res.json();
        if (!res.ok) {
          setErr(json.error ?? t.actionFailed);
        } else {
          setErr(null);
          setMsg(json.cancelled ? t.cancelling : t.deleted);
          setDetail((d) => (d && d._id === id ? null : d));
        }
      } catch {
        setErr(t.networkError);
      } finally {
        setBusy(null);
        await load();
      }
    },
    [load, t],
  );

  const openResult = useCallback(async (id: string) => {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const json: DetailResponse = await res.json();
      if (!res.ok || !json.job) {
        setErr(json.error ?? t.resultFailed);
      } else {
        setErr(null);
        setDetail(json.job);
      }
    } catch {
      setErr(t.networkErrorResult);
    } finally {
      setBusy(null);
    }
  }, [t]);

  function downloadJson(job: JobFull) {
    const blob = new Blob([JSON.stringify(job.result ?? null, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.type}-${job._id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveAsCase(job: JobFull) {
    const params = (job.params ?? {}) as Record<string, unknown>;
    setBusy(job._id);
    setMsg(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: job.name || t.jobFallbackName,
          start: str(params.start),
          chain: str(params.chain) || "bitcoin",
          params,
          result: job.result,
        }),
      });
      const json: CreateCaseResponse = await res.json();
      if (!res.ok) {
        setErr(json.error ?? t.saveFailed);
      } else {
        setErr(null);
        setMsg(t.savedAsCase);
      }
    } catch {
      setErr(t.networkErrorSave);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {err && <div className="card border-red-500/50 text-sm text-red-400">{err}</div>}
      {msg && <div className="card text-sm text-green-400">{msg}</div>}

      {loaded && jobs.length === 0 && !err && (
        <div className="card text-sm text-muted">
{t.empty}
        </div>
      )}

      {jobs.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="p-3">{t.colName}</th>
                <th className="p-3">{t.colType}</th>
                <th className="p-3">{t.colStatus}</th>
                <th className="p-3">{t.colProgress}</th>
                <th className="p-3">{t.colDuration}</th>
                <th className="p-3">{t.colTimes}</th>
                <th className="p-3">{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const p = j.progress ?? {};
                const open = j.status === "pending" || j.status === "running";
                return (
                  <tr key={j._id} className="border-b border-border/60 align-top">
                    <td className="p-3 font-medium break-all">{j.name || t.noName}</td>
                    <td className="p-3 text-fg-2">{t.type[j.type]}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[j.status]}`}>
                        {t.status[j.status]}
                      </span>
                      {j.error && <div className="mt-1 max-w-[22rem] text-xs text-red-400">{j.error}</div>}
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {p.phase && <div className="text-fg-2">{p.phase}</div>}
                      {p.message && <div>{p.message}</div>}
                      <div>
                        {t.counts(p.nodes ?? 0, p.edges ?? 0, p.apiCalls ?? 0)}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted">{duration(j, t)}</td>
                    <td className="p-3 text-xs text-muted">
                      <div>
                        {t.created} {fmt.timestamp(j.createdAt)}
                      </div>
                      <div>
                        {t.started} {fmt.timestamp(j.startedAt)}
                      </div>
                      <div>
                        {t.finished} {fmt.timestamp(j.finishedAt)}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {j.status === "done" && (
                          <button
                            className="btn-secondary"
                            disabled={busy === j._id}
                            onClick={() => void openResult(j._id)}
                          >
                            {t.openResult}
                          </button>
                        )}
                        <button className="btn-secondary" disabled={busy === j._id} onClick={() => void remove(j._id)}>
                          {open ? c.cancel : c.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">
              {t.result} {detail.name || t.type[detail.type]}
            </h2>
            <button className="btn-secondary ml-auto" onClick={() => setDetail(null)}>
              {c.close}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => downloadJson(detail)}>
              {t.downloadJson}
            </button>
            {detail.type === "trace" && (
              <button className="btn" disabled={busy === detail._id} onClick={() => void saveAsCase(detail)}>
                {t.saveAsCase}
              </button>
            )}
          </div>
          <p className="text-xs text-muted">
{t.tooLarge}
          </p>
        </div>
      )}
    </div>
  );
}
