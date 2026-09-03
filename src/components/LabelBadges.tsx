"use client";

import type { AddressLabel } from "@/lib/providers/types";
import { useT } from "@/lib/i18n/provider";

const colors: Record<string, string> = {
  sanctioned: "bg-red-600 text-white",
  ransomware: "bg-red-700 text-white",
  scam: "bg-red-500/80 text-white",
  darknet: "bg-purple-600/80 text-white",
  mixer: "bg-orange-500/80 text-black",
  gambling: "bg-pink-600/70 text-white",
  exchange: "bg-blue-500/80 text-white",
  mining: "bg-green-600/70 text-white",
  service: "bg-indigo-500/80 text-white",
  swap: "bg-teal-600/80 text-white",
  bridge: "bg-cyan-700/80 text-white",
  wallet: "bg-gray-600 text-white",
  custom: "bg-emerald-600 text-white",
  other: "bg-gray-700 text-fg-2",
};

const TXT = {
  en: { noLabels: "no labels known" },
  de: { noLabels: "keine Labels bekannt" },
};

export default function LabelBadges({ labels, compact = false }: { labels: AddressLabel[]; compact?: boolean }) {
  const t = useT(TXT);
  if (!labels.length) return compact ? null : <span className="text-xs text-subtle">{t.noLabels}</span>;
  // Eigene Labels zuerst, danach die riskantesten
  const order = { high: 0, medium: 1, low: 2, undefined: 3 } as Record<string, number>;
  const sorted = [...labels].sort(
    (a, b) => Number(!!b.own) - Number(!!a.own) || (order[String(a.risk)] ?? 3) - (order[String(b.risk)] ?? 3),
  );
  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map((l, i) => {
        const cls = colors[l.category || "other"] || colors.other;
        const content = (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${cls} ${l.own ? "ring-1 ring-green-300" : ""}`}
            title={`${l.source}${l.details ? ": " + l.details : ""}`}
          >
            {l.own ? "✎ " : ""}
            {l.label}
            {!compact && <span className="ml-1 opacity-70">· {l.source}</span>}
          </span>
        );
        return l.url && !compact ? (
          <a key={i} href={l.url} target="_blank" rel="noreferrer">
            {content}
          </a>
        ) : (
          <span key={i}>{content}</span>
        );
      })}
    </div>
  );
}
