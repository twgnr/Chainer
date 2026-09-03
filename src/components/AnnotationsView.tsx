"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CHAIN_LIST, type ChainId } from "@/lib/chains";
import { shortHash } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  COMMON,
  RISK_LABEL,
  RISK_NONE,
  SELECTABLE_CATEGORIES,
  type Category,
} from "@/lib/i18n/labels";

type Risk = "low" | "medium" | "high" | null;

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
  swap: "bg-teal-600/80 text-white",
  bridge: "bg-cyan-700/80 text-white",
  wallet: "bg-gray-600 text-white",
  custom: "bg-accent text-black",
  other: "bg-gray-700 text-fg-2",
};

const RISK_COLOR: Record<string, string> = {
  low: "text-emerald-400",
  medium: "text-amber-400",
  high: "text-red-400",
};

const TXT = {
  en: {
    titleNew: "Create a new label",
    titleEdit: "Edit label",
    addressPlaceholder: "bc1…",
    labelPlaceholder: "e.g. payout address of suspect A",
    notesPlaceholder: "Free text about the address, source of the information, case reference …",
    submitNew: "Create label",
    submitEdit: "Save changes",
    savedNew: "Label saved.",
    savedEdit: "Label updated.",
    required: "Address and name are required.",
    loadFailed: "Loading failed",
    saveFailed: "Saving failed",
    uniqueHint: "There is exactly one of your own labels per address and chain; saving again overwrites the existing one.",
    myLabels: "My labels",
    searchPlaceholder: "Search in address, name, note",
    countOf: (shown: number, total: number) => `${shown} of ${total}`,
    empty: "No labels of your own created yet.",
    noHits: "No matches for this search.",
    confirmDelete: "Really delete this label?",
    colShared: "Shared",
  },
  de: {
    titleNew: "Neues Label anlegen",
    titleEdit: "Label bearbeiten",
    addressPlaceholder: "bc1…",
    labelPlaceholder: "z. B. Auszahlungsadresse Verdächtiger A",
    notesPlaceholder: "Freitext zur Adresse, Quelle der Information, Aktenbezug …",
    submitNew: "Label anlegen",
    submitEdit: "Änderungen speichern",
    savedNew: "Label gespeichert.",
    savedEdit: "Label aktualisiert.",
    required: "Adresse und Bezeichnung sind Pflichtfelder.",
    loadFailed: "Laden fehlgeschlagen",
    saveFailed: "Speichern fehlgeschlagen",
    uniqueHint:
      "Pro Adresse und Chain gibt es genau ein eigenes Label; erneutes Speichern überschreibt das vorhandene.",
    myLabels: "Meine Labels",
    searchPlaceholder: "Suche in Adresse, Bezeichnung, Notiz",
    countOf: (shown: number, total: number) => `${shown} von ${total}`,
    empty: "Noch keine eigenen Labels angelegt.",
    noHits: "Keine Treffer für die Suche.",
    confirmDelete: "Label wirklich löschen?",
    colShared: "Geteilt",
  },
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
  const t = useT(TXT);
  const c = useT(COMMON);
  const categoryName = useT(CATEGORY_LABEL);
  const riskName = useT(RISK_LABEL);
  const riskNone = useT(RISK_NONE);
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
        setErr(json.error || t.loadFailed);
        return;
      }
      setErr(null);
      setItems(json.annotations ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.loadFailed);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.address.trim() || !form.label.trim()) {
      setErr(t.required);
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
        setErr(json.error || t.saveFailed);
        return;
      }
      setInfo(editId ? t.savedEdit : t.savedNew);
      setForm(EMPTY_FORM);
      setEditId(null);
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t.saveFailed);
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
    if (!confirm(t.confirmDelete)) return;
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
    return items.filter((a) => [a.address, a.label, a.notes].some((f) => (f ?? "").toLowerCase().includes(q)));
  }, [items, query]);

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card space-y-3">
        <h2 className="text-sm font-semibold">{editId ? t.titleEdit : t.titleNew}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="ann-chain">
              {c.chain}
            </label>
            <select
              id="ann-chain"
              className="input"
              value={form.chain}
              onChange={(e) => setForm({ ...form, chain: e.target.value as ChainId })}
            >
              {CHAIN_LIST.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name} ({ch.symbol})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="ann-address">
              {c.address}
            </label>
            <input
              id="ann-address"
              className="input mono"
              placeholder={t.addressPlaceholder}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              suppressHydrationWarning
            />
          </div>
          <div>
            <label className="label" htmlFor="ann-label">
              {c.label}
            </label>
            <input
              id="ann-label"
              className="input"
              placeholder={t.labelPlaceholder}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="ann-category">
              {c.category}
            </label>
            <select
              id="ann-category"
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
            >
              {SELECTABLE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryName[cat]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ann-risk">
              {c.risk}
            </label>
            <select
              id="ann-risk"
              className="input"
              value={form.risk}
              onChange={(e) => setForm({ ...form, risk: e.target.value as FormState["risk"] })}
            >
              <option value="">{riskNone}</option>
              <option value="low">{riskName.low}</option>
              <option value="medium">{riskName.medium}</option>
              <option value="high">{riskName.high}</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ann-notes">
            {c.note}
          </label>
          <textarea
            id="ann-notes"
            className="input min-h-24"
            placeholder={t.notesPlaceholder}
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
          {c.shareWithTeam}
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? c.saving : editId ? t.submitEdit : t.submitNew}
          </button>
          {editId && (
            <button type="button" className="btn-secondary" onClick={cancelEdit}>
              {c.cancel}
            </button>
          )}
          {info && <span className="text-xs text-emerald-400">{info}</span>}
          {err && <span className="text-xs text-yellow-400">{err}</span>}
        </div>
        <p className="text-xs text-subtle">{t.uniqueHint}</p>
      </form>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">{t.myLabels}</h2>
          <input
            className="input max-w-xs"
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            suppressHydrationWarning
          />
          <span className="text-xs text-subtle">{items ? t.countOf(filtered.length, items.length) : ""}</span>
        </div>

        {!items ? (
          <p className="text-subtle">{c.loading}</p>
        ) : !items.length ? (
          <p className="text-muted">{t.empty}</p>
        ) : !filtered.length ? (
          <p className="text-muted">{t.noHits}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-subtle">
                <tr>
                  <th className="py-1">{c.address}</th>
                  <th>{c.label}</th>
                  <th>{c.category}</th>
                  <th>{c.risk}</th>
                  <th>{t.colShared}</th>
                  <th>{c.note}</th>
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
                          className="mono text-xs hover:text-brand"
                          title={a.address}
                        >
                          {shortHash(a.address, 8)}
                        </Link>
                        <div className="text-[11px] text-subtle">{a.chain}</div>
                      </td>
                      <td className="py-2">{a.label}</td>
                      <td className="py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${CATEGORY_COLOR[cat]}`}>
                          {categoryName[cat]}
                        </span>
                      </td>
                      <td className={`py-2 text-xs ${a.risk ? RISK_COLOR[a.risk] : "text-subtle"}`}>
                        {a.risk ? riskName[a.risk] : "–"}
                      </td>
                      <td className="py-2 text-xs">
                        {a.shared ? (
                          <span className="text-brand">{c.shared}</span>
                        ) : (
                          <span className="text-subtle">{c.private}</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-muted" title={a.notes}>
                        {a.notes ? (a.notes.length > 60 ? `${a.notes.slice(0, 60)}…` : a.notes) : "–"}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button className="btn-secondary mr-1" onClick={() => edit(a)}>
                          {c.edit}
                        </button>
                        <button className="btn-secondary" onClick={() => remove(a._id)}>
                          {c.delete}
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
