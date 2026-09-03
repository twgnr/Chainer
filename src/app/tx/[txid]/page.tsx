import Link from "next/link";
import { notFound } from "next/navigation";
import TxTools from "@/components/TxTools";
import { getRequestContext } from "@/lib/auth";
import { getTx } from "@/lib/providers/registry";
import { lightningForTx } from "@/lib/providers/lightning";
import { getPriceSeries, priceAt } from "@/lib/providers/price";
import { formatAmount, formatDate, formatFiat, shortHash } from "@/lib/format";
import { chainMeta, isChainTxid, isChainId, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";

export const dynamic = "force-dynamic";

export default async function TxPage({
  params,
  searchParams,
}: {
  params: Promise<{ txid: string }>;
  searchParams: Promise<{ chain?: string }>;
}) {
  const { txid } = await params;
  const sp = await searchParams;
  const chain: ChainId = isChainId(sp.chain) ? sp.chain : DEFAULT_CHAIN;
  if (!isChainTxid(txid, chain)) notFound();
  const { ctx, session } = await getRequestContext({ chain });
  const meta = chainMeta(chain);

  const [r, lightning] = await Promise.all([getTx(ctx, txid).catch((e: Error) => e), lightningForTx(txid, chain)]);
  if (r instanceof Error) return <div className="card text-red-300">{r.message}</div>;
  const tx = r.data;
  const totalIn = tx.inputs.reduce((s, i) => s + (i.valueSat || 0), 0);
  const totalOut = tx.outputs.reduce((s, o) => s + o.valueSat, 0);
  const series = tx.blockTime ? await getPriceSeries(chain, tx.blockTime, tx.blockTime).catch(() => []) : [];
  const then = priceAt(series, tx.blockTime);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Transaktion</h1>
        <span className="rounded bg-panel px-2 py-0.5 text-xs text-accent">{meta.name}</span>
        <span className="mono break-all text-sm">{tx.txid}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/trace?start=${tx.txid}&chain=${chain}&direction=forward&mode=utxo`} className="btn">
            Coins verfolgen
          </Link>
          <Link href={`/trace?start=${tx.txid}&chain=${chain}&direction=backward`} className="btn-secondary">
            Herkunft verfolgen
          </Link>
        </div>
      </div>

      <div className="card grid gap-2 text-sm md:grid-cols-5">
        <div>
          <span className="label">Status</span>
          {tx.failed ? (
            <span className="text-red-400">Fehlgeschlagen</span>
          ) : tx.confirmed ? (
            `Bestätigt${tx.blockHeight ? ` · Block ${tx.blockHeight}` : ""}`
          ) : (
            "Unbestätigt (Mempool)"
          )}
        </div>
        <div>
          <span className="label">Zeit</span>
          {formatDate(tx.blockTime)}
        </div>
        <div>
          <span className="label">Gebühr</span>
          {formatAmount(tx.feeSat, chain)}{" "}
          {tx.size && tx.feeSat ? `(${(tx.feeSat / tx.size).toFixed(1)} ${meta.unit}/B)` : ""}
        </div>
        <div>
          <span className="label">Wert damals</span>
          {then ? formatFiat(totalOut, then, chain) : "–"}
        </div>
        <div>
          <span className="label">Quelle</span>
          {tx.provider}
        </div>
      </div>

      {lightning.length > 0 && (
        <div className="card border-sky-500/50">
          <h2 className="mb-1 font-semibold text-sky-300">⚡ Lightning-Kanal</h2>
          {lightning.map((c) => (
            <div key={c.id} className="text-sm">
              {c.role === "funding" ? "Kanal geöffnet" : "Kanal geschlossen"} · Kapazität{" "}
              {formatAmount(c.capacitySat, chain)} · Status {c.status}
              <div className="text-xs text-gray-400">
                {c.nodes.map((n) => n.alias || shortHash(n.pubkey, 8)).join(" ↔ ")}
                {c.shortId ? ` · ${c.shortId}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <TxTools
        txid={tx.txid}
        chain={chain}
        loggedIn={!!session}
        blockTime={tx.blockTime}
        outputs={tx.outputs
          .filter((o) => o.address)
          .map((o) => ({ address: o.address as string, valueSat: o.valueSat }))}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold">
            Eingänge ({tx.inputs.length}) · {formatAmount(totalIn, chain)}
          </h2>
          <ul className="space-y-1 text-sm">
            {tx.inputs.map((i, k) => (
              <li key={k} className="flex justify-between gap-2 border-t border-border py-1">
                {i.coinbase ? (
                  <span className="text-green-400">⛏ Coinbase (neu geschürft)</span>
                ) : i.address ? (
                  <Link href={`/address/${i.address}?chain=${chain}`} className="mono text-xs hover:text-accent">
                    {shortHash(i.address, 12)}
                  </Link>
                ) : (
                  <span className="text-gray-500">unbekannt</span>
                )}
                <span>{formatAmount(i.valueSat, chain)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold">
            Ausgänge ({tx.outputs.length}) · {formatAmount(totalOut, chain)}
          </h2>
          <ul className="space-y-1 text-sm">
            {tx.outputs.map((o) => (
              <li key={o.n} className="flex justify-between gap-2 border-t border-border py-1">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">#{o.n}</span>
                  {o.address ? (
                    <Link href={`/address/${o.address}?chain=${chain}`} className="mono text-xs hover:text-accent">
                      {shortHash(o.address, 12)}
                    </Link>
                  ) : (
                    <span className="text-gray-500">{o.scriptType || "kein Empfänger"}</span>
                  )}
                  {o.internal && <span className="text-[10px] text-gray-500">intern</span>}
                </span>
                <span className="text-right">
                  {o.token ? (
                    <span className="text-cyan-300">
                      {o.token.amount} {o.token.symbol}
                    </span>
                  ) : (
                    formatAmount(o.valueSat, chain)
                  )}
                  <div className="text-xs">
                    {o.spent === true && o.spentTxid ? (
                      <Link href={`/tx/${o.spentTxid}?chain=${chain}`} className="text-gray-400 hover:text-accent">
                        ausgegeben → {shortHash(o.spentTxid, 5)}
                      </Link>
                    ) : o.spent === false ? (
                      <span className="text-green-400">unausgegeben</span>
                    ) : null}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
