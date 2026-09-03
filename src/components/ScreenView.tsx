"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CHAIN_LIST, chainMeta, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";
import { shortHash } from "@/lib/format";
import { categoryText } from "@/lib/trace/risk";
import type { AddressLabel } from "@/lib/providers/types";
import { useFormatters, useLocale, useT } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { translateHint } from "@/lib/i18n/hints";

const TXT = {
  en: {
    noAddressesInFile: "No addresses were found in the file.",
    fileUnreadable: "The file could not be read",
    checkFailedHttp: (status: number) => `The check failed (HTTP ${status})`,
    checkFailed: "The check failed",
    invalidWithReason: (reason: string) => `invalid: ${reason}`,
    invalid: "invalid",
    errorWith: (error: string) => `Error: ${error}`,
    checked: "checked",
    csvHead: ["Address", "Chain", "Classification", "Category", "Source", "Labels", "Balance", "Status"],
    high: "high",
    medium: "medium",
    clean: "unremarkable",
    addressesLabel: "Addresses (one per line; commas and semicolons also separate)",
    fileUpload: "Upload a file (.txt / .csv)",
    chain: "Chain",
    includeMedium: "Include mixers and medium risk",
    withBalance: "Load balances (slower)",
    running: "Check running …",
    check: "Check",
    clear: "Clear",
    detected: (n: number) => `${n} address${n === 1 ? "" : "es"} detected`,
    tooMany: (max: number) => ` – at most ${max} per check`,
    guestHint: "Guest mode: your own labels and personal API keys only apply once you are signed in.",
    progress: (n: number) =>
      `${n} addresses are being checked against every source. The result appears only at the end – depending on the number this can take a few minutes. Please keep the page open.`,
    entries: (n: number) => `${n} entries`,
    flagged: (n: number) => `${n} reported`,
    ofWhich: (high: number, medium: number) => `of which ${high} high / ${medium} medium`,
    invalidCount: (n: number) => `${n} invalid`,
    errorCount: (n: number) => `${n} errors`,
    duration: (s: string) => `Duration ${s} s`,
    exportCsv: "Export CSV",
    onlyFlagged: "show reported only",
    searchPlaceholder: "Search for an address or label …",
    visibleOf: (shown: number, total: number) => `${shown} of ${total} visible`,
    colAddress: "Address",
    colVerdict: "Classification",
    colCategory: "Category",
    colSource: "Source",
    colLabels: "Labels",
    colBalance: "Balance",
    colStatus: "Status",
    noLabels: "none",
    noRows: "No entries for these filters.",
  },
  de: {
    noAddressesInFile: "In der Datei wurden keine Adressen gefunden.",
    fileUnreadable: "Datei konnte nicht gelesen werden",
    checkFailedHttp: (status: number) => `Prüfung fehlgeschlagen (HTTP ${status})`,
    checkFailed: "Prüfung fehlgeschlagen",
    invalidWithReason: (reason: string) => `ungültig: ${reason}`,
    invalid: "ungültig",
    errorWith: (error: string) => `Fehler: ${error}`,
    checked: "geprüft",
    csvHead: ["Adresse", "Chain", "Einstufung", "Kategorie", "Quelle", "Labels", "Saldo", "Status"],
    high: "hoch",
    medium: "mittel",
    clean: "unauffällig",
    addressesLabel: "Adressen (eine pro Zeile; Komma und Semikolon gelten ebenfalls als Trenner)",
    fileUpload: "Datei hochladen (.txt / .csv)",
    chain: "Chain",
    includeMedium: "Mixer und mittleres Risiko einbeziehen",
    withBalance: "Salden laden (langsamer)",
    running: "Prüfung läuft …",
    check: "Prüfen",
    clear: "Leeren",
    detected: (n: number) => `${n} Adresse${n === 1 ? "" : "n"} erkannt`,
    tooMany: (max: number) => ` – höchstens ${max} pro Prüfung`,
    guestHint: "Gastmodus: eigene Labels und persönliche API-Keys fließen erst nach dem Login ein.",
    progress: (n: number) =>
      `${n} Adressen werden gegen alle Quellen geprüft. Das Ergebnis erscheint erst am Ende – je nach Anzahl kann das einige Minuten dauern. Bitte die Seite so lange geöffnet lassen.`,
    entries: (n: number) => `${n} Einträge`,
    flagged: (n: number) => `${n} gemeldet`,
    ofWhich: (high: number, medium: number) => `davon ${high} hoch / ${medium} mittel`,
    invalidCount: (n: number) => `${n} ungültig`,
    errorCount: (n: number) => `${n} Fehler`,
    duration: (s: string) => `Dauer ${s} s`,
    exportCsv: "CSV exportieren",
    onlyFlagged: "nur gemeldete zeigen",
    searchPlaceholder: "Adresse oder Label suchen …",
    visibleOf: (shown: number, total: number) => `${shown} von ${total} sichtbar`,
    colAddress: "Adresse",
    colVerdict: "Einstufung",
    colCategory: "Kategorie",
    colSource: "Quelle",
    colLabels: "Labels",
    colBalance: "Saldo",
    colStatus: "Status",
    noLabels: "keine",
    noRows: "Keine Einträge für diese Filter.",
  },
};

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
function statusText(r: ScreenResult, t: (typeof TXT)[Locale], locale: Locale): string {
  if (!r.valid) return r.reason ? t.invalidWithReason(translateHint(r.reason, locale)) : t.invalid;
  if (r.error) return t.errorWith(r.error);
  return t.checked;
}

/* ------------------------------- Komponente ------------------------------ */

export default function ScreenView({ loggedIn }: { loggedIn: boolean }) {
  const t = useT(TXT);
  const locale = useLocale();
  const fmt = useFormatters();
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
      setErr(rows.length ? null : t.noAddressesInFile);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t.fileUnreadable);
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
        setErr(json.error || t.checkFailedHttp(res.status));
      } else {
        setData(json);
        setShownBalance(withBalance);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.checkFailed);
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
    const head = t.csvHead;
    const lines = [head.join(";")];
    for (const r of visible) {
      lines.push(
        [
          csvField(r.address),
          csvField(chainMeta(data.chain).name),
          csvField(r.verdict ? (r.verdict.severity === "high" ? t.high : t.medium) : r.valid ? t.clean : ""),
          csvField(r.verdict ? categoryText(r.verdict.category, locale) : ""),
          csvField(r.verdict?.source ?? ""),
          csvField(r.labels.map((l) => `${translateHint(l.label, locale)} (${l.source})`).join(" | ")),
          csvField(r.balanceSat === undefined ? "" : fmt.amount(r.balanceSat, data.chain)),
          csvField(statusText(r, t, locale)),
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
            {t.addressesLabel}
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
              {t.chain}
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
              {t.fileUpload}
            </label>
            <input
              id="screen-file"
              ref={fileRef}
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              onChange={onFile}
              disabled={busy}
              className="text-sm text-fg-2 file:mr-3 file:rounded-md file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeMedium}
              onChange={(e) => setIncludeMedium(e.target.checked)}
              disabled={busy}
            />
            {t.includeMedium}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withBalance}
              onChange={(e) => setWithBalance(e.target.checked)}
              disabled={busy}
            />
            {t.withBalance}
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" onClick={run} disabled={busy || !addresses.length || tooMany}>
            {busy ? t.running : t.check}
          </button>
          <button className="btn-secondary" onClick={() => setText("")} disabled={busy || !text}>
            {t.clear}
          </button>
          <span className={`text-sm ${tooMany ? "text-red-400" : "text-muted"}`}>
            {t.detected(addresses.length)}
            {tooMany ? t.tooMany(MAX_ADDRESSES) : ""}
          </span>
          {!loggedIn && (
            <span className="text-xs text-subtle">
              {t.guestHint}
            </span>
          )}
        </div>
      </div>

      {busy && (
        <div className="card text-sm text-fg-2">
          <span className="text-brand">●</span> {t.progress(addresses.length)}
        </div>
      )}

      {err && <div className="card border-red-500/50 text-sm text-red-300">{err}</div>}

      {/* ------------------------------ Ergebnis ----------------------------- */}
      {data && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-semibold">{t.entries(data.summary.total)}</span>
            <span className={data.summary.flagged ? "text-red-300" : "text-muted"}>
              {t.flagged(data.summary.flagged)}
            </span>
            <span className="text-muted">
              {t.ofWhich(data.summary.high, data.summary.medium)}
            </span>
            <span className="text-muted">{t.invalidCount(data.summary.invalid)}</span>
            <span className="text-muted">{t.errorCount(data.summary.errors)}</span>
            <span className="text-subtle">
              {t.duration(fmt.number(data.durationMs / 1000, 1))}
            </span>
            <button className="btn-secondary ml-auto" onClick={exportCsv} disabled={!visible.length}>
              {t.exportCsv}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
              {t.onlyFlagged}
            </label>
            <input
              className="input w-64"
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="text-xs text-subtle">
              {t.visibleOf(visible.length, data.results.length)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">{t.colAddress}</th>
                  <th className="py-2 pr-3">{t.colVerdict}</th>
                  <th className="py-2 pr-3">{t.colCategory}</th>
                  <th className="py-2 pr-3">{t.colSource}</th>
                  <th className="py-2 pr-3">{t.colLabels}</th>
                  {shownBalance && <th className="py-2 pr-3">{t.colBalance}</th>}
                  <th className="py-2">{t.colStatus}</th>
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
                          className="mono text-brand hover:underline"
                        >
                          {shortHash(r.address, 10)}
                        </Link>
                      ) : (
                        <span className="mono text-muted" title={r.address}>
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
                          {r.verdict.severity === "high" ? t.high : t.medium}
                        </span>
                      ) : (
                        <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-fg-2">
                          {r.valid ? t.clean : "–"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-fg-2">{r.verdict ? categoryText(r.verdict.category, locale) : "–"}</td>
                    <td className="py-2 pr-3 text-muted">{r.verdict?.source ?? "–"}</td>
                    <td className="py-2 pr-3">
                      {r.labels.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.labels.map((l, i) => (
                            <span
                              key={`${l.source}-${i}`}
                              className="rounded bg-panel px-1.5 py-0.5 text-xs text-fg-2 ring-1 ring-border"
                              title={`${l.source}${l.details ? ": " + translateHint(l.details, locale) : ""}`}
                            >
                              {l.own ? "✎ " : ""}
                              {translateHint(l.label, locale)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-subtle">{t.noLabels}</span>
                      )}
                    </td>
                    {shownBalance && (
                      <td className="mono py-2 pr-3 whitespace-nowrap text-fg-2">
                        {r.balanceSat === undefined ? "–" : fmt.amount(r.balanceSat, data.chain)}
                      </td>
                    )}
                    <td className="py-2 text-xs">
                      {!r.valid ? (
                        <span className="text-yellow-400">{r.reason ? translateHint(r.reason, locale) : t.invalid}</span>
                      ) : r.error ? (
                        <span className="text-red-400">{r.error}</span>
                      ) : (
                        <span className="text-subtle">{t.checked}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan={shownBalance ? 7 : 6} className="py-4 text-center text-sm text-subtle">
                      {t.noRows}
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
