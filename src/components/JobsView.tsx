"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "Wartet",
  running: "Läuft",
  done: "Fertig",
  error: "Fehler",
  cancelled: "Abgebrochen",
};

const STATUS_CLASS: Record<JobStatus, string> = {
  pending: "bg-gray-500/20 text-gray-300",
  running: "bg-accent/20 text-accent",
  done: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
  cancelled: "bg-yellow-500/20 text-yellow-400",
};

const TYPE_LABEL: Record<"trace" | "path", string> = { trace: "Trace", path: "Verbindung" };

/** Zeitstempel der API sind ISO-Strings und werden lokal formatiert */
function formatIso(iso?: string): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE");
}

/** Laufzeit eines Auftrags; bei laufenden Aufträgen bis jetzt */
function duration(job: JobSummary): string {
  if (!job.startedAt) return "–";
  const start = new Date(job.startedAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "–";
  const s = Math.round((end - start) / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default function JobsView() {
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
        setErr(json.error ?? "Laden fehlgeschlagen.");
        setLoaded(true);
        return;
      }
      setErr(null);
      setJobs(json.jobs ?? []);
      setLoaded(true);
    } catch {
      setErr("Netzwerkfehler beim Laden der Aufträge.");
      setLoaded(true);
    }
  }, []);

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
          setErr(json.error ?? "Aktion fehlgeschlagen.");
        } else {
          setErr(null);
          setMsg(json.cancelled ? "Auftrag wird abgebrochen." : "Auftrag gelöscht.");
          setDetail((d) => (d && d._id === id ? null : d));
        }
      } catch {
        setErr("Netzwerkfehler.");
      } finally {
        setBusy(null);
        await load();
      }
    },
    [load],
  );

  const openResult = useCallback(async (id: string) => {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const json: DetailResponse = await res.json();
      if (!res.ok || !json.job) {
        setErr(json.error ?? "Ergebnis konnte nicht geladen werden.");
      } else {
        setErr(null);
        setDetail(json.job);
      }
    } catch {
      setErr("Netzwerkfehler beim Laden des Ergebnisses.");
    } finally {
      setBusy(null);
    }
  }, []);

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
          name: job.name || "Auftrag",
          start: str(params.start),
          chain: str(params.chain) || "bitcoin",
          params,
          result: job.result,
        }),
      });
      const json: CreateCaseResponse = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Speichern fehlgeschlagen.");
      } else {
        setErr(null);
        setMsg("Als Fall gespeichert.");
      }
    } catch {
      setErr("Netzwerkfehler beim Speichern.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {err && <div className="card border-red-500/50 text-sm text-red-400">{err}</div>}
      {msg && <div className="card text-sm text-green-400">{msg}</div>}

      {loaded && jobs.length === 0 && !err && (
        <div className="card text-sm text-gray-400">
          Noch keine Aufträge. Lange Analysen lassen sich hier einstellen: Der Server arbeitet sie nacheinander im
          Hintergrund ab – auch wenn Sie die Seite verlassen. Das Ergebnis bleibt danach abrufbar und kann als Fall
          gespeichert oder als JSON heruntergeladen werden.
        </div>
      )}

      {jobs.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
              <tr className="border-b border-border">
                <th className="p-3">Name</th>
                <th className="p-3">Typ</th>
                <th className="p-3">Status</th>
                <th className="p-3">Fortschritt</th>
                <th className="p-3">Dauer</th>
                <th className="p-3">Zeitpunkte</th>
                <th className="p-3">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const p = j.progress ?? {};
                const offen = j.status === "pending" || j.status === "running";
                return (
                  <tr key={j._id} className="border-b border-border/60 align-top">
                    <td className="p-3 font-medium break-all">{j.name || "(ohne Name)"}</td>
                    <td className="p-3 text-gray-300">{TYPE_LABEL[j.type]}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[j.status]}`}>
                        {STATUS_LABEL[j.status]}
                      </span>
                      {j.error && <div className="mt-1 max-w-[22rem] text-xs text-red-400">{j.error}</div>}
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {p.phase && <div className="text-gray-300">{p.phase}</div>}
                      {p.message && <div>{p.message}</div>}
                      <div>
                        {p.nodes ?? 0} Knoten · {p.edges ?? 0} Kanten · {p.apiCalls ?? 0} Abfragen
                      </div>
                    </td>
                    <td className="p-3 text-xs text-gray-400">{duration(j)}</td>
                    <td className="p-3 text-xs text-gray-400">
                      <div>Erstellt: {formatIso(j.createdAt)}</div>
                      <div>Start: {formatIso(j.startedAt)}</div>
                      <div>Ende: {formatIso(j.finishedAt)}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {j.status === "done" && (
                          <button
                            className="btn-secondary"
                            disabled={busy === j._id}
                            onClick={() => void openResult(j._id)}
                          >
                            Ergebnis öffnen
                          </button>
                        )}
                        <button className="btn-secondary" disabled={busy === j._id} onClick={() => void remove(j._id)}>
                          {offen ? "Abbrechen" : "Löschen"}
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
            <h2 className="font-semibold">Ergebnis: {detail.name || TYPE_LABEL[detail.type]}</h2>
            <button className="btn-secondary ml-auto" onClick={() => setDetail(null)}>
              Schließen
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => downloadJson(detail)}>
              Als JSON herunterladen
            </button>
            {detail.type === "trace" && (
              <button className="btn" disabled={busy === detail._id} onClick={() => void saveAsCase(detail)}>
                Als Fall speichern
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Das vollständige Ergebnis kann sehr groß sein und wird deshalb nicht als Vorschau angezeigt.
          </p>
        </div>
      )}
    </div>
  );
}
