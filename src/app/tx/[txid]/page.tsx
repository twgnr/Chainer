import Link from "next/link";
import { notFound } from "next/navigation";
import TxTools from "@/components/TxTools";
import { getRequestContext } from "@/lib/auth";
import { getTx } from "@/lib/providers/registry";
import { lightningForTx } from "@/lib/providers/lightning";
import { getPriceSeries, priceAt } from "@/lib/providers/price";
import { shortHash } from "@/lib/format";
import { chainMeta, isChainTxid, isChainId, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";
import { getFormatters, getLocale, getT } from "@/lib/i18n/server";
import { translateHint } from "@/lib/i18n/hints";

export const dynamic = "force-dynamic";

const TXT = {
  en: {
    heading: "Transaction",
    traceCoins: "Trace the coins",
    traceOrigin: "Trace the origin",
    status: "Status",
    failed: "Failed",
    confirmed: "Confirmed",
    block: (height: number) => ` · block ${height}`,
    unconfirmed: "Unconfirmed (mempool)",
    time: "Time",
    fee: "Fee",
    valueThen: "Value then",
    source: "Source",
    lightningTitle: "⚡ Lightning channel",
    channelOpened: "Channel opened",
    channelClosed: "Channel closed",
    capacity: "capacity",
    channelStatus: "status",
    inputs: (n: number) => `Inputs (${n})`,
    outputs: (n: number) => `Outputs (${n})`,
    coinbase: "⛏ Coinbase (newly mined)",
    unknown: "unknown",
    noRecipient: "no recipient",
    internal: "internal",
    spent: "spent →",
    unspent: "unspent",
  },
  de: {
    heading: "Transaktion",
    traceCoins: "Coins verfolgen",
    traceOrigin: "Herkunft verfolgen",
    status: "Status",
    failed: "Fehlgeschlagen",
    confirmed: "Bestätigt",
    block: (height: number) => ` · Block ${height}`,
    unconfirmed: "Unbestätigt (Mempool)",
    time: "Zeit",
    fee: "Gebühr",
    valueThen: "Wert damals",
    source: "Quelle",
    lightningTitle: "⚡ Lightning-Kanal",
    channelOpened: "Kanal geöffnet",
    channelClosed: "Kanal geschlossen",
    capacity: "Kapazität",
    channelStatus: "Status",
    inputs: (n: number) => `Eingänge (${n})`,
    outputs: (n: number) => `Ausgänge (${n})`,
    coinbase: "⛏ Coinbase (neu geschürft)",
    unknown: "unbekannt",
    noRecipient: "kein Empfänger",
    internal: "intern",
    spent: "ausgegeben →",
    unspent: "unausgegeben",
  },
};

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
  const t = await getT(TXT);
  const fmt = await getFormatters();

  const [r, lightning] = await Promise.all([getTx(ctx, txid).catch((e: Error) => e), lightningForTx(txid, chain)]);
  if (r instanceof Error) return <div className="card text-red-300">{translateHint(r.message, await getLocale())}</div>;
  const tx = r.data;
  const totalIn = tx.inputs.reduce((s, i) => s + (i.valueSat || 0), 0);
  const totalOut = tx.outputs.reduce((s, o) => s + o.valueSat, 0);
  const series = tx.blockTime ? await getPriceSeries(chain, tx.blockTime, tx.blockTime).catch(() => []) : [];
  const then = priceAt(series, tx.blockTime);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{t.heading}</h1>
        <span className="rounded bg-panel px-2 py-0.5 text-xs text-brand">{meta.name}</span>
        <span className="mono break-all text-sm">{tx.txid}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/trace?start=${tx.txid}&chain=${chain}&direction=forward&mode=utxo`} className="btn">
            {t.traceCoins}
          </Link>
          <Link href={`/trace?start=${tx.txid}&chain=${chain}&direction=backward`} className="btn-secondary">
            {t.traceOrigin}
          </Link>
        </div>
      </div>

      <div className="card grid gap-2 text-sm md:grid-cols-5">
        <div>
          <span className="label">{t.status}</span>
          {tx.failed ? (
            <span className="text-red-400">{t.failed}</span>
          ) : tx.confirmed ? (
            `${t.confirmed}${tx.blockHeight ? t.block(tx.blockHeight) : ""}`
          ) : (
            t.unconfirmed
          )}
        </div>
        <div>
          <span className="label">{t.time}</span>
          {fmt.date(tx.blockTime)}
        </div>
        <div>
          <span className="label">{t.fee}</span>
          {fmt.amount(tx.feeSat, chain)}{" "}
          {tx.size && tx.feeSat ? `(${fmt.number(tx.feeSat / tx.size, 1)} ${meta.unit}/B)` : ""}
        </div>
        <div>
          <span className="label">{t.valueThen}</span>
          {then ? fmt.fiat(totalOut, then, chain) : "–"}
        </div>
        <div>
          <span className="label">{t.source}</span>
          {tx.provider}
        </div>
      </div>

      {lightning.length > 0 && (
        <div className="card border-sky-500/50">
          <h2 className="mb-1 font-semibold text-sky-300">{t.lightningTitle}</h2>
          {lightning.map((c) => (
            <div key={c.id} className="text-sm">
              {c.role === "funding" ? t.channelOpened : t.channelClosed} · {t.capacity}{" "}
              {fmt.amount(c.capacitySat, chain)} · {t.channelStatus} {c.status}
              <div className="text-xs text-muted">
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
            {t.inputs(tx.inputs.length)} · {fmt.amount(totalIn, chain)}
          </h2>
          <ul className="space-y-1 text-sm">
            {tx.inputs.map((i, k) => (
              <li key={k} className="flex justify-between gap-2 border-t border-border py-1">
                {i.coinbase ? (
                  <span className="text-green-400">{t.coinbase}</span>
                ) : i.address ? (
                  <Link href={`/address/${i.address}?chain=${chain}`} className="mono text-xs hover:text-brand">
                    {shortHash(i.address, 12)}
                  </Link>
                ) : (
                  <span className="text-subtle">{t.unknown}</span>
                )}
                <span>{fmt.amount(i.valueSat, chain)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold">
            {t.outputs(tx.outputs.length)} · {fmt.amount(totalOut, chain)}
          </h2>
          <ul className="space-y-1 text-sm">
            {tx.outputs.map((o) => (
              <li key={o.n} className="flex justify-between gap-2 border-t border-border py-1">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-subtle">#{o.n}</span>
                  {o.address ? (
                    <Link href={`/address/${o.address}?chain=${chain}`} className="mono text-xs hover:text-brand">
                      {shortHash(o.address, 12)}
                    </Link>
                  ) : (
                    <span className="text-subtle">{o.scriptType || t.noRecipient}</span>
                  )}
                  {o.internal && <span className="text-[10px] text-subtle">{t.internal}</span>}
                </span>
                <span className="text-right">
                  {o.token ? (
                    <span className="text-cyan-300">
                      {o.token.amount} {o.token.symbol}
                    </span>
                  ) : (
                    fmt.amount(o.valueSat, chain)
                  )}
                  <div className="text-xs">
                    {o.spent === true && o.spentTxid ? (
                      <Link href={`/tx/${o.spentTxid}?chain=${chain}`} className="text-muted hover:text-brand">
                        {t.spent} {shortHash(o.spentTxid, 5)}
                      </Link>
                    ) : o.spent === false ? (
                      <span className="text-green-400">{t.unspent}</span>
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
