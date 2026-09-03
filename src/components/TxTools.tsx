"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAmount, formatDate, formatPercent, shortHash } from "@/lib/format";
import { CHAIN_LIST, chainMeta, type ChainId } from "@/lib/chains";

interface Annotation {
  _id: string;
  label: string;
  notes: string;
  shared: boolean;
}

interface MixerCandidate {
  txid: string;
  address: string;
  valueSat: number;
  blockTime?: number;
  deltaSat: number;
  deltaHours: number;
  score: number;
}
interface MixerResponse {
  candidates: MixerCandidate[];
  examined: number;
  warnings: string[];
}

interface CrossChainMatch {
  txid: string;
  blockTime?: number;
  receivedSat: number;
  expectedSat: number;
  deltaPercent: number;
  deltaMinutes: number;
  score: number;
  token?: string;
}
interface CrossChainResponse {
  valueEur?: number;
  expectedSat?: number;
  matches: CrossChainMatch[];
  examined: number;
  warnings: string[];
}

/**
 * Werkzeuge zu einer Transaktion: eigene Notiz, Korrelation von Mixer-Ausgängen
 * und Abgleich eines Übergangs auf eine andere Chain.
 */
export default function TxTools({
  txid,
  chain,
  loggedIn,
  blockTime,
  outputs,
}: {
  txid: string;
  chain: ChainId;
  loggedIn: boolean;
  blockTime?: number;
  /** Empfänger dieser Transaktion, als Vorauswahl für die Werkzeuge */
  outputs: { address: string; valueSat: number }[];
}) {
  const meta = chainMeta(chain);
  const biggest = [...outputs].sort((a, b) => b.valueSat - a.valueSat)[0];

  /* ---------------- Eigene Notiz ---------------- */
  const [note, setNote] = useState("");
  const [label, setLabel] = useState("");
  const [shared, setShared] = useState(false);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/annotations?address=${encodeURIComponent(txid)}&kind=tx`);
        if (!res.ok) return;
        const j = await res.json();
        const a: Annotation | undefined = (j.annotations || [])[0];
        if (!a) return;
        setLabel(a.label);
        setNote(a.notes);
        setShared(a.shared);
      } catch {
        /* ignorieren */
      }
    };
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [txid, loggedIn]);

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    setNoteMsg(null);
    const res = await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain, kind: "tx", address: txid, label, category: "custom", notes: note, shared }),
    });
    const j = await res.json();
    setNoteMsg(res.ok ? "Notiz gespeichert." : j.error || "Fehler");
  }

  /* ---------------- Mixer-Korrelation ---------------- */
  const [mixerAddress, setMixerAddress] = useState(biggest?.address ?? "");
  const [amount, setAmount] = useState(String(biggest?.valueSat ?? 0));
  const [windowHours, setWindowHours] = useState(72);
  const [tolerance, setTolerance] = useState(5);
  const [mixer, setMixer] = useState<MixerResponse | null>(null);
  const [mixerBusy, setMixerBusy] = useState(false);
  const [mixerErr, setMixerErr] = useState<string | null>(null);

  async function runMixer(e: React.FormEvent) {
    e.preventDefault();
    setMixerBusy(true);
    setMixerErr(null);
    setMixer(null);
    try {
      const res = await fetch("/api/mixer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mixerAddress,
          amountSat: Number(amount),
          afterTime: blockTime ?? Math.floor(Date.now() / 1000),
          chain,
          windowHours,
          tolerance: tolerance / 100,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setMixer(j);
    } catch (err) {
      setMixerErr(err instanceof Error ? err.message : String(err));
    } finally {
      setMixerBusy(false);
    }
  }

  /* ---------------- Cross-Chain-Abgleich ---------------- */
  const [toChain, setToChain] = useState<ChainId>(chain === "bitcoin" ? "ethereum" : "bitcoin");
  const [candidate, setCandidate] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(120);
  const [ccTolerance, setCcTolerance] = useState(5);
  const [cc, setCc] = useState<CrossChainResponse | null>(null);
  const [ccBusy, setCcBusy] = useState(false);
  const [ccErr, setCcErr] = useState<string | null>(null);

  async function runCrossChain(e: React.FormEvent) {
    e.preventDefault();
    setCcBusy(true);
    setCcErr(null);
    setCc(null);
    try {
      const res = await fetch("/api/crosschain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChain: chain,
          toChain,
          amountSat: Number(amount),
          atTime: blockTime ?? Math.floor(Date.now() / 1000),
          candidateAddress: candidate,
          windowMinutes,
          tolerance: ccTolerance / 100,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setCc(j);
    } catch (err) {
      setCcErr(err instanceof Error ? err.message : String(err));
    } finally {
      setCcBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Notiz */}
      <form onSubmit={saveNote} className="card space-y-2 text-sm">
        <h2 className="font-semibold">Eigene Notiz zur Transaktion</h2>
        {!loggedIn ? (
          <p className="text-gray-400">
            <Link href="/login" className="text-accent">
              Einloggen
            </Link>{" "}
            für Notizen an Transaktionen.
          </p>
        ) : (
          <>
            <div>
              <label className="label">Bezeichnung</label>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required />
            </div>
            <div>
              <label className="label">Notiz</label>
              <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              Im Team teilen
            </label>
            <button className="btn">Speichern</button>
            {noteMsg && <p className="text-xs text-gray-400">{noteMsg}</p>}
          </>
        )}
      </form>

      {/* Mixer */}
      <form onSubmit={runMixer} className="card space-y-2 text-sm">
        <h2 className="font-semibold">Mixer-Ausgänge korrelieren</h2>
        <p className="text-xs text-gray-400">
          Sucht Auszahlungen eines Dienstes, die betrags- und zeitnah zu dieser Zahlung passen. Ergebnis ist eine
          Kandidatenliste, keine Zuordnung.
        </p>
        <div>
          <label className="label">Adresse des Dienstes</label>
          <input className="input mono" value={mixerAddress} onChange={(e) => setMixerAddress(e.target.value)} required />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label">Betrag ({meta.unit})</label>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Fenster (h)</label>
            <input className="input" type="number" min={1} max={720} value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Toleranz (%)</label>
            <input className="input" type="number" min={0} max={50} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
          </div>
        </div>
        <button className="btn" disabled={mixerBusy || !mixerAddress}>
          {mixerBusy ? "Suche…" : "Kandidaten suchen"}
        </button>
        {mixerErr && <p className="text-xs text-red-400">{mixerErr}</p>}
        {mixer && (
          <div className="space-y-1">
            <p className="text-xs text-gray-400">
              {mixer.candidates.length} Kandidat(en) aus {mixer.examined} geprüften Ausgängen
            </p>
            {mixer.warnings.map((w, i) => (
              <p key={i} className="text-xs text-yellow-400">
                {w}
              </p>
            ))}
            <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
              {mixer.candidates.map((c, i) => (
                <li key={`${c.txid}-${i}`} className="flex items-center gap-2 border-t border-border py-1">
                  <span className="w-9 shrink-0 text-accent">{formatPercent(c.score, 0)}</span>
                  <Link href={`/address/${c.address}?chain=${chain}`} className="mono hover:text-accent">
                    {shortHash(c.address, 5)}
                  </Link>
                  <span className="ml-auto">{formatAmount(c.valueSat, chain, 5)}</span>
                  <span className="text-gray-500">+{c.deltaHours.toFixed(1)} h</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      {/* Cross-Chain */}
      <form onSubmit={runCrossChain} className="card space-y-2 text-sm">
        <h2 className="font-semibold">Übergang auf andere Chain prüfen</h2>
        <p className="text-xs text-gray-400">
          Rechnet den Betrag über den damaligen Kurs um und prüft, ob bei einer Kandidatenadresse auf der Zielkette
          ein passender Eingang liegt. Eine vollständige Suche über eine fremde Kette ist ohne eigenen Index nicht
          möglich.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Zielkette</label>
            <select className="input" value={toChain} onChange={(e) => setToChain(e.target.value as ChainId)}>
              {CHAIN_LIST.filter((c) => c.id !== chain).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Toleranz (%)</label>
            <input className="input" type="number" min={0} max={50} value={ccTolerance} onChange={(e) => setCcTolerance(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="label">Kandidatenadresse auf der Zielkette</label>
          <input className="input mono" value={candidate} onChange={(e) => setCandidate(e.target.value)} required />
        </div>
        <div>
          <label className="label">Zeitfenster (Minuten)</label>
          <input className="input" type="number" min={1} max={10080} value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))} />
        </div>
        <button className="btn" disabled={ccBusy || !candidate}>
          {ccBusy ? "Prüfe…" : "Abgleich starten"}
        </button>
        {ccErr && <p className="text-xs text-red-400">{ccErr}</p>}
        {cc && (
          <div className="space-y-1">
            {cc.expectedSat !== undefined && (
              <p className="text-xs text-gray-400">
                Erwartet: {formatAmount(cc.expectedSat, toChain, 6)}
                {cc.valueEur !== undefined &&
                  ` (${cc.valueEur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })})`}
              </p>
            )}
            {cc.warnings.map((w, i) => (
              <p key={i} className="text-xs text-yellow-400">
                {w}
              </p>
            ))}
            <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
              {cc.matches.map((m) => (
                <li key={m.txid} className="flex items-center gap-2 border-t border-border py-1">
                  <span className="w-9 shrink-0 text-accent">{formatPercent(m.score, 0)}</span>
                  <Link href={`/tx/${m.txid}?chain=${toChain}`} className="mono hover:text-accent">
                    {shortHash(m.txid, 5)}
                  </Link>
                  <span className="ml-auto">
                    {m.token ? `${m.token} ` : ""}
                    {formatAmount(m.receivedSat, toChain, 6)}
                  </span>
                  <span className="text-gray-500">
                    {formatPercent(m.deltaPercent, 1)} · +{m.deltaMinutes.toFixed(0)} min
                  </span>
                </li>
              ))}
            </ul>
            {!cc.matches.length && <p className="text-xs text-gray-500">Kein passender Eingang gefunden.</p>}
          </div>
        )}
      </form>
    </div>
  );
}

export function TxToolsHint({ blockTime }: { blockTime?: number }) {
  return (
    <p className="text-xs text-gray-500">
      Bezugszeitpunkt für beide Werkzeuge: {formatDate(blockTime)}
    </p>
  );
}
