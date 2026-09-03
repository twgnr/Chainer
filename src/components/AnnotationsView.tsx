"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CHAIN_LIST, type ChainId } from "@/lib/chains";
import { shortHash } from "@/lib/format";

/** Kategorien exakt wie in der API und im Datenmodell */
const CATEGORIES = [
  "exchange",
  "mixer",
  "scam",
  "sanctioned",
  "ransomware",
  "darknet",
  "gambling",
  "mining",
  "service",
  "wallet",
  "custom",
  "other",
] as const;

type Category = (typeof CATEGORIES)[number];
type Risk = "low" | "medium" | "high" | null;

/** Deutsche Beschriftungen der Kategorien */
const CATEGORY_LABEL: Record<Category, string> = {
  exchange: "Börse",
  mixer: "Mixer",
  scam: "Betrug",
  sanctioned: "Sanktioniert",
  ransomware: "Ransomware",
  darknet: "Darknet",
  gambling: "Glücksspiel",
  mining: "Mining",
  service: "Dienst",
  wallet: "Wallet",
  custom: "Eigene",
  other: "Sonstiges",
};

/** Farbige Abzeichen je Kategorie */
const CATEGORY_COLOR: Record<Category, string> = {
  exchange: "bg-blue-500/80 text-white",
  mixer: "bg-orange-500/80 text-black",
  scam: "bg-red-500/80 text-white",
  sanctioned: "bg-red-600 text-white",
  ransomware: "bg-rose-700 text-white",
  darknet: "bg-purple-600/80 text-white",
  gambling: "bg-emerald-600/80 text-white",
  mining: "bg-amber-600/80 text-black",
  service: "bg-indigo-500/80 text-white",
  wallet: "bg-gray-600 text-white",
  custom: "bg-accent text-black",
  other: "bg-gray-700 text-gray-200",
};

const RISK_LABEL: Record<string, string> = {
  low: "niedrig",
  medium: "mittel",
  high: "hoch",
};

const RISK_COLOR: Record<string, string> = {
  low: "text-emerald-400",
  medium: "text-amber-400",
  high: "text-red-400",
};

interface Annotation {
  _id: string;
  chain: string;
  address: string;
  label: string;
  category: Category;
  risk: Risk;
  notes: string;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  chain: ChainId;
  address: string;
  label: string;
  category: Category;
  risk: "" | "low" | "medium" | "high";
  notes: string;
  shared: boolean;
}

const EMPTY_FORM: FormState = {
  chain: "bitcoin",
  address: "",
  label: "",
  category: "custom",
  risk: "",
  notes: "",
  shared: false,
};

function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

function isChain(v: string): v is ChainId {
  return CHAIN_LIST.some((c) => c.id === v);
}

export default function AnnotationsView() {
  const [items, setItems] = useState<Annotation[] | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/annotations");
      const json: { annotations?: Annotation[]; error?: string } = await res.json();
      if (!res.ok) {
        setErr(json.error || "Laden fehlgeschlagen");
        return;
      }
      setErr(null);
      setItems(json.annotations ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.address.trim() || !form.label.trim()) {
      setErr("Adresse und Bezeichnung sind Pflichtfelder.");
      return;
    }
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: form.chain,
          address: form.address.trim(),
          label: form.label.trim(),
          category: form.category,
          risk: form.risk === "" ? null : form.risk,
          notes: form.notes,
          shared: form.shared,
        }),
      });
      const json: { error?: string } = await res.json();
      if (!res.ok) {
        setErr(json.error || "Speichern fehlgeschlagen");
        return;
      }
      setInfo(editId ? "Label aktualisiert." : "Label gespeichert.");
      setForm(EMPTY_FORM);
      setEditId(null);
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function edit(a: Annotation) {
    setEditId(a._id);
    setInfo(null);
    setForm({
      chain: isChain(a.chain) ? a.chain : "bitcoin",
      address: a.address,
      label: a.label,
      category: isCategory(a.category) ? a.category : "custom",
      risk: a.risk ?? "",
      notes: a.notes ?? "",
      shared: Boolean(a.shared),
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!confirm("Label wirklich löschen?")) return;
    await fetch(`/api/annotations/${id}`, { method: "DELETE" });
    if (editId === id) {
      setEditId(null);
      setForm(EMPTY_FORM);
    }
    await load();
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setInfo(null);
  }

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) =>
      [a.address, a.label, a.notes].some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }, [items, query]);

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card space-y-3">
        <h2 className="text-sm font-semibold">{editId ? "Label bearbeiten" : "Neues Label anlegen"}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="ann-chain">
              Chain
            </label>
            <select
              id="ann-chain"
              className="input"
              value={form.chain}
              onChange={(e) => setForm({ ...form, chain: e.target.value as ChainId })}
            >
              {CHAIN_LIST.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="ann-address">
              Adresse
            </label>
            <input
              id="ann-address"
              className="input mono"
              placeholder="bc1…"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="ann-label">
              Bezeichnung
            </label>
            <input
              id="ann-label"
              className="input"
              placeholder="z. B. Auszahlungsadresse Verdächtiger A"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="ann-category">
              Kategorie
            </label>
            <select
              id="ann-category"
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ann-risk">
              Risiko
            </label>
            <select
              id="ann-risk"
              className="input"
              value={form.risk}
              onChange={(e) => setForm({ ...form, risk: e.target.value as FormState["risk"] })}
            >
              <option value="">keins</option>
              <option value="low">niedrig</option>
              <option value="medium">mittel</option>
              <option value="high">hoch</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ann-notes">
            Notiz
          </label>
          <textarea
            id="ann-notes"
            className="input min-h-24"
            placeholder="Freitext zur Adresse, Quelle der Information, Aktenbezug …"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.shared}
            onChange={(e) => setForm({ ...form, shared: e.target.checked })}
          />
          Im Team teilen
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Speichere…" : editId ? "Änderungen speichern" : "Label anlegen"}
          </button>
          {editId && (
            <button type="button" className="btn-secondary" onClick={cancelEdit}>
              Abbrechen
            </button>
          )}
          {info && <span className="text-xs text-emerald-400">{info}</span>}
          {err && <span className="text-xs text-yellow-400">{err}</span>}
        </div>
        <p className="text-xs text-gray-500">
          Pro Adresse und Chain gibt es genau ein eigenes Label; erneutes Speichern überschreibt das vorhandene.
        </p>
      </form>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">Meine Labels</h2>
          <input
            className="input max-w-xs"
            placeholder="Suche in Adresse, Bezeichnung, Notiz"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="text-xs text-gray-500">
            {items ? `${filtered.length} von ${items.length}` : ""}
          </span>
        </div>

        {!items ? (
          <p className="text-gray-500">Lade…</p>
        ) : !items.length ? (
          <p className="text-gray-400">Noch keine eigenen Labels angelegt.</p>
        ) : !filtered.length ? (
          <p className="text-gray-400">Keine Treffer für die Suche.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-1">Adresse</th>
                  <th>Bezeichnung</th>
                  <th>Kategorie</th>
                  <th>Risiko</th>
                  <th>Geteilt</th>
                  <th>Notiz</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const cat = isCategory(a.category) ? a.category : "other";
                  return (
                    <tr key={a._id} className="border-t border-border align-top">
                      <td className="py-2">
                        <Link
                          href={`/address/${a.address}?chain=${a.chain}`}
                          className="mono text-xs hover:text-accent"
                          title={a.address}
                        >
                          {shortHash(a.address, 8)}
                        </Link>
                        <div className="text-[11px] text-gray-500">{a.chain}</div>
                      </td>
                      <td className="py-2">{a.label}</td>
                      <td className="py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${CATEGORY_COLOR[cat]}`}>
                          {CATEGORY_LABEL[cat]}
                        </span>
                      </td>
                      <td className={`py-2 text-xs ${a.risk ? RISK_COLOR[a.risk] : "text-gray-500"}`}>
                        {a.risk ? RISK_LABEL[a.risk] : "–"}
                      </td>
                      <td className="py-2 text-xs">
                        {a.shared ? <span className="text-accent">geteilt</span> : <span className="text-gray-500">privat</span>}
                      </td>
                      <td className="py-2 text-xs text-gray-400" title={a.notes}>
                        {a.notes ? (a.notes.length > 60 ? `${a.notes.slice(0, 60)}…` : a.notes) : "–"}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button className="btn-secondary mr-1" onClick={() => edit(a)}>
                          Bearbeiten
                        </button>
                        <button className="btn-secondary" onClick={() => remove(a._id)}>
                          Löschen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
