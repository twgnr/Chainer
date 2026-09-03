"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHAIN_LIST, classifyChainInput, guessChain, type ChainId } from "@/lib/chains";

export default function SearchBox({ large = false }: { large?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [chain, setChain] = useState<ChainId | "auto">("auto");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    const target: ChainId | null = chain === "auto" ? guessChain(v) : chain;
    if (!target) {
      setErr("Format nicht erkannt. Bitte die Chain manuell wählen.");
      return;
    }
    const kind = classifyChainInput(v, target);
    if (kind === "address") router.push(`/address/${v}?chain=${target}`);
    else if (kind === "txid") router.push(`/tx/${v}?chain=${target}`);
    else setErr(`„${v}“ passt nicht zum Format einer ${target}-Adresse oder -Transaktion.`);
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex gap-2">
        <select
          className={`input w-auto ${large ? "py-3" : ""}`}
          value={chain}
          onChange={(e) => setChain(e.target.value as ChainId | "auto")}
        >
          <option value="auto">automatisch</option>
          {CHAIN_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.symbol}
            </option>
          ))}
        </select>
        <input
          className={`input mono ${large ? "py-3 text-base" : ""}`}
          placeholder="Adresse oder Transaktions-ID"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setErr(null);
          }}
          spellCheck={false}
        />
        <button className="btn" type="submit">
          Suchen
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </form>
  );
}
