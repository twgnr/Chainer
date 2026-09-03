"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CHAIN_LIST, chainMeta, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";
import { formatAmount, shortHash } from "@/lib/format";
import { categoryText } from "@/lib/trace/risk";
import type { AddressLabel } from "@/lib/providers/types";

/* --------------------------------- Typen --------------------------------- */

/** Anfrage an /api/screen */
interface ScreenRequest {
  addresses: string[];
  chain: ChainId;
  includeMedium: boolean;
  withBalance: boolean;
}

/** Einstufung einer Adresse als schädlich */
interface Verdict {
  label: string;
  category?: string;
  source: string;
  severity: "high" | "medium";
  details?: string;
  url?: string;
}

interface ScreenResult {
  address: string;
  valid: boolean;
  reason?: string;
  labels: AddressLabel[];
  verdict: Verdict | null;
  balanceSat?: number;
  txCount?: number;
  provider?: string;
  error?: string;
}

interface ScreenSummary {
  total: number;
  checked: number;
  flagged: number;
  high: number;
  medium: number;
  invalid: number;
  errors: number;
}

/** Antwort von /api/screen (im Fehlerfall nur `error`) */
interface ScreenResponse {
  chain: ChainId;
  results: ScreenResult[];
  summary: ScreenSummary;
  durationMs: number;
  error?: string;
}

/** Höchstzahl an Adressen pro Prüfung, muss zur API passen */
const MAX_ADDRESSES = 200;

/* ------------------------------ Hilfsmittel ------------------------------ */

/** Adressen aus einem Textblock lesen: Zeilenumbruch, Komma und Semikolon trennen */
function parseAddresses(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n\r,;]+/)) {
    const v = part.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Inhalt einer .txt/.csv-Datei lesen: je Zeile die erste Spalte, Kopfzeile überspringen */
function parseFile(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const rows: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^﻿/, "").trim();
    if (!line) continue;
    const first = line.split(/[,;\t]/)[0].trim().replace(/^"|"$/g, "");
    if (i === 0 && /^address$/i.test(first)) continue; // Kopfzeile überspringen
    if (first) rows.push(first);
  }
  return rows;
}

/** Sortierung: gemeldete Adressen zuerst (hoch vor mittel), danach der Rest */
function rank(r: ScreenResult): number {
  if (r.verdict?.severity === "high") return 0;
  if (r.verdict?.severity === "medium") return 1;
  if (!r.valid) return 3;
  if (r.error) return 4;
  return 2;
}

/** Ein Feld für die CSV-Ausgabe absichern (Trennzeichen ist das Semikolon) */
function csvField(v: string | undefined): string {
  const s = (v ?? "").replace(/"/g, '""');
  return /[";\n\r]/.test(s) ? `"${s}"` : s;
}

/** Kurztext für die Statusspalte und den Export */
function statusText(r: ScreenResult): string {
  if (!r.valid) return r.reason ? `ungültig: ${r.reason}` : "ungültig";
  if (r.error) return `Fehler: ${r.error}`;
  return "geprüft";
}

/* ------------------------------- Komponente ------------------------------ */

export default function ScreenView({ loggedIn }: { loggedIn: boolean }) {
  const [text, setText] = useState("");
  const [chain, setChain] = useState<ChainId>(DEFAULT_CHAIN);
  const [includeMedium, setIncludeMedium] = useState(false);
  const [withBalance, setWithBalance] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ScreenResponse | null>(null);
  /** Merker, ob die angezeigte Prüfung mit Salden gelaufen ist */
  const [shownBalance, setShownBalance] = useState(false);

  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addresses = useMemo(() => parseAddresses(text), [text]);
  const tooMany = addresses.length > MAX_ADDRESSES;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = parseFile(await file.text());
      setText(rows.join("\n"));
      setErr(rows.length ? null : "In der Datei wurden keine Adressen gefunden.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Datei konnte nicht gelesen werden");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function run() {
    if (!addresses.length || tooMany || busy) return;
    setBusy(true);
    setErr(null);
    setData(null);
    const body: ScreenRequest = { addresses, chain, includeMedium, withBalance };
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ScreenResponse;
      if (!res.ok || json.error) {
        setErr(json.error || `Prüfung fehlgeschlagen (HTTP ${res.status})`);
      } else {
        setData(json);
        setShownBalance(withBalance);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Prüfung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return [...data.results]
      .filter((r) => (onlyFlagged ? !!r.verdict : true))
      .filter((r) =>
        q
          ? r.address.toLowerCase().includes(q) ||
            r.labels.some((l) => l.label.toLowerCase().includes(q) || l.source.toLowerCase().includes(q))
          : true,
      )
      .sort((a, b) => rank(a) - rank(b) || a.address.localeCompare(b.address));
  }, [data, onlyFlagged, search]);

  function exportCsv() {
    if (!data) return;
    const head = ["Adresse", "Chain", "Einstufung", "Kategorie", "Quelle", "Labels", "Saldo", "Status"];
    const lines = [head.join(";")];
    for (const r of visible) {
      lines.push(
        [
          csvField(r.address),
          csvField(chainMeta(data.chain).name),
          csvField(r.verdict ? (r.verdict.severity === "high" ? "hoch" : "mittel") : r.valid ? "unauffällig" : ""),
          csvField(r.verdict ? categoryText(r.verdict.category) : ""),
          csvField(r.verdict?.source ?? ""),
          csvField(r.labels.map((l) => `${l.label} (${l.source})`).join(" | ")),
          csvField(r.balanceSat === undefined ? "" : formatAmount(r.balanceSat, data.chain)),
          csvField(statusText(r)),
        ].join(";"),
      );
    }
    // UTF-8-BOM voranstellen, damit Tabellenprogramme die Umlaute richtig lesen
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `screening-${data.chain}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------ Eingabe ------------------------------ */}
      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="screen-addresses">
            Adressen (eine pro Zeile; Komma und Semikolon gelten ebenfalls als Trenner)
          </label>
          <textarea
            id="screen-addresses"
            className="input mono h-44 resize-y"
            placeholder={"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="screen-chain">
              Chain
            </label>
            <select
              id="screen-chain"
              className="input w-48"
              value={chain}
              onChange={(e) => setChain(e.target.value as ChainId)}
              disabled={busy}
            >
              {CHAIN_LIST.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="screen-file">
              Datei hochladen (.txt / .csv)
            </label>
            <input
              id="screen-file"
              ref={fileRef}
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              onChange={onFile}
              disabled={busy}
              className="text-sm text-gray-300 file:mr-3 file:rounded-md file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeMedium}
              onChange={(e) => setIncludeMedium(e.target.checked)}
              disabled={busy}
            />
            Mixer und mittleres Risiko einbeziehen
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withBalance}
              onChange={(e) => setWithBalance(e.target.checked)}
              disabled={busy}
            />
            Salden laden (langsamer)
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" onClick={run} disabled={busy || !addresses.length || tooMany}>
            {busy ? "Prüfung läuft …" : "Prüfen"}
          </button>
          <button className="btn-secondary" onClick={() => setText("")} disabled={busy || !text}>
            Leeren
          </button>
          <span className={`text-sm ${tooMany ? "text-red-400" : "text-gray-400"}`}>
            {addresses.length} Adresse{addresses.length === 1 ? "" : "n"} erkannt
            {tooMany ? ` – höchstens ${MAX_ADDRESSES} pro Prüfung` : ""}
          </span>
          {!loggedIn && (
            <span className="text-xs text-gray-500">
              Gastmodus: eigene Labels und persönliche API-Keys fließen erst nach dem Login ein.
            </span>
          )}
        </div>
      </div>

      {busy && (
        <div className="card text-sm text-gray-300">
          <span className="text-accent">●</span> {addresses.length} Adressen werden gegen alle Quellen geprüft. Das
          Ergebnis erscheint erst am Ende – je nach Anzahl kann das einige Minuten dauern. Bitte die Seite so lange
          geöffnet lassen.
        </div>
      )}

      {err && <div className="card border-red-500/50 text-sm text-red-300">{err}</div>}

      {/* ------------------------------ Ergebnis ----------------------------- */}
      {data && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-semibold">{data.summary.total} Einträge</span>
            <span className={data.summary.flagged ? "text-red-300" : "text-gray-400"}>
              {data.summary.flagged} gemeldet
            </span>
            <span className="text-gray-400">
              davon {data.summary.high} hoch / {data.summary.medium} mittel
            </span>
            <span className="text-gray-400">{data.summary.invalid} ungültig</span>
            <span className="text-gray-400">{data.summary.errors} Fehler</span>
            <span className="text-gray-500">
              Dauer {(data.durationMs / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s
            </span>
            <button className="btn-secondary ml-auto" onClick={exportCsv} disabled={!visible.length}>
              CSV exportieren
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
              nur gemeldete zeigen
            </label>
            <input
              className="input w-64"
              placeholder="Adresse oder Label suchen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="text-xs text-gray-500">
              {visible.length} von {data.results.length} sichtbar
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-3">Adresse</th>
                  <th className="py-2 pr-3">Einstufung</th>
                  <th className="py-2 pr-3">Kategorie</th>
                  <th className="py-2 pr-3">Quelle</th>
                  <th className="py-2 pr-3">Labels</th>
                  {shownBalance && <th className="py-2 pr-3">Saldo</th>}
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.address} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-3">
                      {r.valid ? (
                        <Link
                          href={`/address/${r.address}?chain=${data.chain}`}
                          title={r.address}
                          className="mono text-accent hover:underline"
                        >
                          {shortHash(r.address, 10)}
                        </Link>
                      ) : (
                        <span className="mono text-gray-400" title={r.address}>
                          {shortHash(r.address, 10)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.verdict ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            r.verdict.severity === "high" ? "bg-red-600 text-white" : "bg-orange-500/80 text-black"
                          }`}
                          title={r.verdict.details || r.verdict.label}
                        >
                          {r.verdict.severity === "high" ? "hoch" : "mittel"}
                        </span>
                      ) : (
                        <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-200">
                          {r.valid ? "unauffällig" : "–"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-300">{r.verdict ? categoryText(r.verdict.category) : "–"}</td>
                    <td className="py-2 pr-3 text-gray-400">{r.verdict?.source ?? "–"}</td>
                    <td className="py-2 pr-3">
                      {r.labels.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.labels.map((l, i) => (
                            <span
                              key={`${l.source}-${i}`}
                              className="rounded bg-panel px-1.5 py-0.5 text-xs text-gray-200 ring-1 ring-border"
                              title={`${l.source}${l.details ? ": " + l.details : ""}`}
                            >
                              {l.own ? "✎ " : ""}
                              {l.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">keine</span>
                      )}
                    </td>
                    {shownBalance && (
                      <td className="mono py-2 pr-3 whitespace-nowrap text-gray-300">
                        {r.balanceSat === undefined ? "–" : formatAmount(r.balanceSat, data.chain)}
                      </td>
                    )}
                    <td className="py-2 text-xs">
                      {!r.valid ? (
                        <span className="text-yellow-400">{r.reason || "ungültig"}</span>
                      ) : r.error ? (
                        <span className="text-red-400">{r.error}</span>
                      ) : (
                        <span className="text-gray-500">geprüft</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan={shownBalance ? 7 : 6} className="py-4 text-center text-sm text-gray-500">
                      Keine Einträge für diese Filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
