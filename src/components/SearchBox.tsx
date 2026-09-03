"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHAIN_LIST, classifyChainInput, guessChain, type ChainId } from "@/lib/chains";
import { useT } from "@/lib/i18n/provider";

const TXT = {
  en: {
    auto: "auto-detect",
    placeholder: "Address or transaction ID",
    submit: "Search",
    unknownFormat: "Format not recognised. Please pick the chain manually.",
    mismatch: (v: string, chain: string) => `“${v}” does not match the format of a ${chain} address or transaction.`,
  },
  de: {
    auto: "automatisch",
    placeholder: "Adresse oder Transaktions-ID",
    submit: "Suchen",
    unknownFormat: "Format nicht erkannt. Bitte die Chain manuell wählen.",
    mismatch: (v: string, chain: string) => `„${v}“ passt nicht zum Format einer ${chain}-Adresse oder -Transaktion.`,
  },
};

export default function SearchBox({ large = false }: { large?: boolean }) {
  const t = useT(TXT);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [chain, setChain] = useState<ChainId | "auto">("auto");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    const target: ChainId | null = chain === "auto" ? guessChain(v) : chain;
    if (!target) {
      setErr(t.unknownFormat);
      return;
    }
    const kind = classifyChainInput(v, target);
    if (kind === "address") router.push(`/address/${v}?chain=${target}`);
    else if (kind === "txid") router.push(`/tx/${v}?chain=${target}`);
    else setErr(t.mismatch(v, target));
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex gap-2">
        <select
          className={`input w-auto ${large ? "py-3" : ""}`}
          value={chain}
          onChange={(e) => setChain(e.target.value as ChainId | "auto")}
        >
          <option value="auto">{t.auto}</option>
          {CHAIN_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.symbol}
            </option>
          ))}
        </select>
        <input
          className={`input mono ${large ? "py-3 text-base" : ""}`}
          placeholder={t.placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setErr(null);
          }}
          spellCheck={false}
          /* Passwortmanager-Erweiterungen hängen an Eingabefeldern eigene
             Attribute ein, bevor React hydriert; das darf keinen
             Hydrations-Fehler auslösen. */
          suppressHydrationWarning
        />
        <button className="btn" type="submit">
          {t.submit}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </form>
  );
}
