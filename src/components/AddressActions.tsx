"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChainId } from "@/lib/chains";
import { useT } from "@/lib/i18n/provider";
import { CATEGORY_LABEL, COMMON, RISK_LABEL, RISK_NONE, SELECTABLE_CATEGORIES } from "@/lib/i18n/labels";

interface Annotation {
  _id: string;
  label: string;
  category: string;
  risk: string | null;
  notes: string;
  shared: boolean;
}

const TXT = {
  en: {
    loginHint: "for your own labels, notes and the watchlist.",
    login: "Log in",
    titleNew: "Create your own label",
    titleEdit: "Edit your own label",
    saved: "Label saved.",
    watchAdded: "Added to the watchlist.",
    watch: "Watch",
    watchlist: "Watchlist",
  },
  de: {
    loginHint: "für eigene Labels, Notizen und die Watchlist.",
    login: "Einloggen",
    titleNew: "Eigenes Label anlegen",
    titleEdit: "Eigenes Label bearbeiten",
    saved: "Label gespeichert.",
    watchAdded: "Zur Watchlist hinzugefügt.",
    watch: "Beobachten",
    watchlist: "Watchlist",
  },
};

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
  const t = useT(TXT);
  const c = useT(COMMON);
  const categoryName = useT(CATEGORY_LABEL);
  const riskName = useT(RISK_LABEL);
  const riskNone = useT(RISK_NONE);
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
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [address, loggedIn]);

  if (!loggedIn) {
    return (
      <div className="card text-sm text-muted">
        <Link href="/login" className="text-brand">
          {t.login}
        </Link>{" "}
        {t.loginHint}
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
    setMsg(res.ok ? t.saved : j.error || c.error);
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
    setMsg(res.ok ? t.watchAdded : j.error || c.error);
  }

  return (
    <form onSubmit={saveLabel} className="card space-y-2 text-sm">
      <h2 className="font-semibold">{existing ? t.titleEdit : t.titleNew}</h2>
      <div>
        <label className="label">{c.label}</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{c.category}</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {SELECTABLE_CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {categoryName[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{c.risk}</label>
          <select className="input" value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="">{riskNone}</option>
            <option value="low">{riskName.low}</option>
            <option value="medium">{riskName.medium}</option>
            <option value="high">{riskName.high}</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">{c.note}</label>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        {c.shareWithTeam}
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy}>
          {c.save}
        </button>
        <button className="btn-secondary" type="button" onClick={addWatch} disabled={busy}>
          {t.watch}
        </button>
        <Link className="btn-secondary" href="/watchlist">
          {t.watchlist}
        </Link>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </form>
  );
}
