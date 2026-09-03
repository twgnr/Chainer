"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AddressNodeData, TraceNode, TraceResult, TxNodeData } from "@/lib/trace/types";
import { formatAmount, formatDate, formatFiat, formatPercent, shortHash } from "@/lib/format";
import { clusterColor } from "./TraceGraph";

interface Party {
  address: string;
  valueSat: number;
  taintSat: number;
  riskSat: number;
  toRisk?: boolean;
  change?: boolean;
  token?: string;
  data?: AddressNodeData;
}

interface Row {
  node: TraceNode;
  tx: TxNodeData;
  from: Party[];
  to: Party[];
}

/**
 * Chronologischer Verlauf der Kette: jede Transaktion mit Sender- und
 * Empfängerseite, Beträgen zum damaligen Kurs, Taint-Anteil und Hinweisen.
 */
export default function TraceTimeline({
  result,
  showFiat,
  selectedId,
  onSelect,
}: {
  result: TraceResult;
  showFiat: boolean;
  selectedId: string | null;
  onSelect: (node: TraceNode | null) => void;
}) {
  const chain = result.params.chain;
  const [filter, setFilter] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyRisk, setOnlyRisk] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    const addr = (id: string) => byId.get(id)?.data as AddressNodeData | undefined;
    const party = (
      id: string,
      e: { valueSat: number; taintSat?: number; riskSat?: number; toRisk?: boolean; change?: boolean; token?: string },
    ): Party => ({
      address: id.slice(2),
      valueSat: e.valueSat,
      taintSat: e.taintSat ?? 0,
      riskSat: e.riskSat ?? 0,
      toRisk: e.toRisk,
      change: e.change,
      token: e.token,
      data: addr(id),
    });
    return result.nodes
      .filter((n): n is TraceNode & { data: TxNodeData } => n.data.type === "tx")
      .map((n) => ({
        node: n,
        tx: n.data,
        from: result.edges.filter((e) => e.target === n.id).map((e) => party(e.source, e)).sort((a, b) => b.valueSat - a.valueSat),
        to: result.edges.filter((e) => e.source === n.id).map((e) => party(e.target, e)).sort((a, b) => b.valueSat - a.valueSat),
      }))
      .sort((a, b) => (a.tx.blockTime ?? Infinity) - (b.tx.blockTime ?? Infinity) || a.tx.depth - b.tx.depth);
  }, [result]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyRisk && !r.tx.carriesRisk && !r.to.some((p) => p.toRisk)) return false;
      if (onlyFlagged && !r.tx.hints.length) return false;
      if (!f) return true;
      if (r.tx.txid.toLowerCase().includes(f)) return true;
      if (r.tx.hints.join(" ").toLowerCase().includes(f)) return true;
      return [...r.from, ...r.to].some(
        (p) => p.address.toLowerCase().includes(f) || (p.data?.labels || []).some((l) => l.label.toLowerCase().includes(f)),
      );
    });
  }, [rows, filter, onlyFlagged, onlyRisk]);

  const first = rows.find((r) => r.tx.blockTime)?.tx.blockTime;
  const last = [...rows].reverse().find((r) => r.tx.blockTime)?.tx.blockTime;
  const totalVolume = rows.reduce((s, r) => s + r.tx.totalOutSat, 0);
  const totalFees = rows.reduce((s, r) => s + (r.tx.feeSat || 0), 0);
  const showTaint = result.params.taintModel !== "none";

  const AddrCell = ({ p }: { p: Party }) => {
    const d = p.data;
    const label = d?.labels.find((l) => l.own || (l.source !== "chainer" && l.category !== "wallet"));
    const cc = clusterColor(d?.clusterId);
    const ratio = p.valueSat > 0 ? p.taintSat / p.valueSat : 0;
    return (
      <div className="flex items-center gap-1 whitespace-nowrap">
        {cc && (
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: cc }} title={`Cluster #${d?.clusterId}`} />
        )}
        {p.address === "coinbase" ? (
          <span className="text-green-400">⛏ Coinbase</span>
        ) : (
          <Link href={`/address/${p.address}?chain=${chain}`} className="mono text-xs hover:text-accent" title={p.address}>
            {shortHash(p.address, 6)}
          </Link>
        )}
        {label && (
          <span className={`truncate text-[10px] ${label.own ? "text-green-300" : "text-accent"}`} title={label.label}>
            {label.label}
          </span>
        )}
        {d?.isRiskSource && (
          <span className="rounded bg-red-700 px-1 text-[9px] text-white" title="Als schädlich gemeldete Adresse">
            &#9888; schädlich
          </span>
        )}
        {!d?.isRiskSource && p.riskSat > 0 && (
          <span
            className="rounded bg-orange-600 px-1 text-[9px] text-white"
            title="Dieser Fluss enthält Geld von einer als schädlich eingestuften Adresse"
          >
            &#9888; belastet
          </span>
        )}
        {p.toRisk && !d?.isRiskSource && (
          <span className="text-[10px] text-orange-300" title="Zahlung an eine schädliche Adresse">
            &#8594;&#9888;
          </span>
        )}
        {d?.risk === "high" && !d?.isRiskSource && (
          <span className="rounded bg-red-600 px-1 text-[9px] text-white">Risiko</span>
        )}
        <span className="ml-auto text-xs">
          {p.token ? `${p.token} ` : ""}
          {formatAmount(p.valueSat, chain, 5)}
        </span>
        {showTaint && ratio > 0.001 && (
          <span className="text-[10px] text-orange-300" title="Anteil aus der Startquelle">
            {formatPercent(ratio, 0)}
          </span>
        )}
        {p.change && (
          <span className="text-[10px] text-yellow-300" title="Wechselgeld-Verdacht">
            ⟲
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <b>{rows.length}</b> Transaktionen im Verlauf
        </span>
        <span>
          Zeitraum: {first ? formatDate(first) : "–"} → {last ? formatDate(last) : "–"}
        </span>
        <span>Volumen: {formatAmount(totalVolume, chain, 4)}</span>
        <span>Gebühren: {formatAmount(totalFees, chain, 6)}</span>
        <input
          className="input ml-auto w-56"
          placeholder="Filtern nach Adresse, TXID, Label…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          nur auffällige
        </label>
        <label className="flex items-center gap-1 text-xs text-red-300">
          <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} />
          nur belastete
        </label>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Hop</th>
              <th className="px-3 py-2">Zeit / Block</th>
              <th className="px-3 py-2">Transaktion</th>
              <th className="px-3 py-2">Von</th>
              <th className="px-3 py-2">Nach</th>
              <th className="px-3 py-2 text-right">Volumen</th>
              <th className="px-3 py-2">Hinweise</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.node.id}
                onClick={() => onSelect(selectedId === r.node.id ? null : r.node)}
                className={`cursor-pointer border-t border-border align-top hover:bg-white/5 ${
                  selectedId === r.node.id ? "bg-accent/10" : r.tx.carriesRisk ? "bg-red-950/30" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${r.tx.isStart ? "bg-accent text-black" : "bg-gray-700"}`}>
                    {r.tx.isStart ? "Start" : r.tx.depth}
                  </span>
                  {r.tx.peelingIndex && (
                    <div className="mt-1 text-[10px] text-orange-300" title="Position in der Peeling-Kette">
                      P{r.tx.peelingIndex}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-400">
                  <div>{formatDate(r.tx.blockTime)}</div>
                  <div>{r.tx.blockHeight ? `Block ${r.tx.blockHeight}` : "Mempool"}</div>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/tx/${r.tx.txid}?chain=${chain}`} className="mono text-xs hover:text-accent" title={r.tx.txid}>
                    {shortHash(r.tx.txid, 8)}
                  </Link>
                  <div className="text-[10px] text-gray-500">
                    {r.tx.inputCount} in → {r.tx.outputCount} out · Gebühr {formatAmount(r.tx.feeSat, chain, 6)}
                  </div>
                </td>
                <td className="min-w-[230px] px-3 py-2">
                  {r.from.map((p) => (
                    <AddrCell key={p.address} p={p} />
                  ))}
                  {!r.from.length && <span className="text-xs text-gray-500">außerhalb des Graphen</span>}
                </td>
                <td className="min-w-[230px] px-3 py-2">
                  {r.to.map((p) => (
                    <AddrCell key={p.address} p={p} />
                  ))}
                  {!r.to.length && <span className="text-xs text-gray-500">unter Mindestbetrag / kein Empfänger</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div>{formatAmount(r.tx.totalOutSat, chain, 5)}</div>
                  {showFiat && r.tx.priceEur !== undefined && (
                    <div className="text-[10px] text-gray-500" title="Wert zum Zeitpunkt der Transaktion">
                      damals {formatFiat(r.tx.totalOutSat, r.tx.priceEur, chain)}
                    </div>
                  )}
                  {showFiat && result.priceEur !== undefined && (
                    <div className="text-[10px] text-gray-600">heute {formatFiat(r.tx.totalOutSat, result.priceEur, chain)}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-[11px] text-yellow-300">
                  {r.tx.carriesRisk && (
                    <div className="font-semibold text-red-400">&#9888; Geld von schädlicher Adresse</div>
                  )}
                  {r.tx.hints.map((h, i) => (
                    <div key={i}>⚑ {h}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <p className="p-4 text-sm text-gray-500">Keine Transaktion passt zum Filter.</p>}
      </div>
    </div>
  );
}
