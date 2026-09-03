"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChainId } from "@/lib/chains";

interface Annotation {
  _id: string;
  label: string;
  category: string;
  risk: string | null;
  notes: string;
  shared: boolean;
}

const CATEGORIES: [string, string][] = [
  ["custom", "Eigene"],
  ["exchange", "Börse"],
  ["mixer", "Mixer"],
  ["scam", "Betrug"],
  ["sanctioned", "Sanktioniert"],
  ["ransomware", "Ransomware"],
  ["darknet", "Darknet"],
  ["gambling", "Glücksspiel"],
  ["mining", "Mining"],
  ["service", "Dienst"],
  ["wallet", "Wallet"],
  ["other", "Sonstiges"],
];

/** Eigenes Label anlegen und Adresse zur Watchlist hinzufügen. */
export default function AddressActions({
  address,
  chain,
  loggedIn,
}: {
  address: string;
  chain: ChainId;
  loggedIn: boolean;
}) {
  const [existing, setExisting] = useState<Annotation | null>(null);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("custom");
  const [risk, setRisk] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [shared, setShared] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loggedIn) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/annotations?address=${encodeURIComponent(address)}`);
        if (!res.ok) return;
        const j = await res.json();
        const a: Annotation | undefined = (j.annotations || [])[0];
        if (!a) return;
        setExisting(a);
        setLabel(a.label);
        setCategory(a.category);
        setRisk(a.risk || "");
        setNotes(a.notes);
        setShared(a.shared);
      } catch {
        /* ignorieren */
      }
    };
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [address, loggedIn]);

  if (!loggedIn) {
    return (
      <div className="card text-sm text-gray-400">
        <Link href="/login" className="text-accent">
          Einloggen
        </Link>{" "}
        für eigene Labels, Notizen und die Watchlist.
      </div>
    );
  }

  async function saveLabel(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain, address, label, category, risk: risk || null, notes, shared }),
    });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? "Label gespeichert." : j.error || "Fehler");
    if (res.ok && j.annotation) setExisting(j.annotation);
  }

  async function addWatch() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain, address, label, minValueSat: 0 }),
    });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? "Zur Watchlist hinzugefügt." : j.error || "Fehler");
  }

  return (
    <form onSubmit={saveLabel} className="card space-y-2 text-sm">
      <h2 className="font-semibold">{existing ? "Eigenes Label bearbeiten" : "Eigenes Label anlegen"}</h2>
      <div>
        <label className="label">Bezeichnung</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Kategorie</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Risiko</label>
          <select className="input" value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="">keins</option>
            <option value="low">niedrig</option>
            <option value="medium">mittel</option>
            <option value="high">hoch</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Notiz</label>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        Im Team teilen
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy}>
          Speichern
        </button>
        <button className="btn-secondary" type="button" onClick={addWatch} disabled={busy}>
          Beobachten
        </button>
        <Link className="btn-secondary" href="/watchlist">
          Watchlist
        </Link>
      </div>
      {msg && <p className="text-xs text-gray-400">{msg}</p>}
    </form>
  );
}
