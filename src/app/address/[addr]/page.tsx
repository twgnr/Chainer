import Link from "next/link";
import { notFound } from "next/navigation";
import LabelBadges from "@/components/LabelBadges";
import AddressActions from "@/components/AddressActions";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import InflowRiskBanner from "@/components/InflowRiskBanner";
import { getRequestContext } from "@/lib/auth";
import { getAddress, getAddressTxs, lookupLabels } from "@/lib/providers/registry";
import { getBtcPrice, getPriceSeries, priceAt } from "@/lib/providers/price";
import { activityPattern } from "@/lib/trace/heuristics";
import { analyseInflowRisk } from "@/lib/trace/inflow";
import { classifyHarmful } from "@/lib/trace/risk";
import { formatAmount, formatDate, formatFiat, shortHash } from "@/lib/format";
import { chainMeta, isChainAddress, isChainId, DEFAULT_CHAIN, type ChainId } from "@/lib/chains";

export const dynamic = "force-dynamic";

export default async function AddressPage({
  params,
  searchParams,
}: {
  params: Promise<{ addr: string }>;
  searchParams: Promise<{ chain?: string }>;
}) {
  const { addr } = await params;
  const sp = await searchParams;
  const chain: ChainId = isChainId(sp.chain) ? sp.chain : DEFAULT_CHAIN;
  if (!isChainAddress(addr, chain)) notFound();
  const { ctx, session } = await getRequestContext({ chain });
  const meta = chainMeta(chain);

  const [info, txs, labels, price] = await Promise.all([
    getAddress(ctx, addr).catch((e: Error) => e),
    getAddressTxs(ctx, addr, 50).catch((e: Error) => e),
    lookupLabels(ctx, addr).catch(() => ({ labels: [], errors: [] })),
    getBtcPrice(chain).catch(() => null),
  ]);

  const txList = txs instanceof Error ? [] : txs.data;
  const times = txList.map((t) => t.blockTime ?? 0).filter(Boolean);
  const series = times.length
    ? await getPriceSeries(chain, Math.min(...times), Math.max(...times)).catch(() => [])
    : [];
  const activity = activityPattern(times);

  // Herkunftsprüfung: direkte Absender gegen die Label- und Sanktionsquellen
  const inflowRisk = txList.length
    ? await analyseInflowRisk(ctx, addr, txList).catch(() => null)
    : null;
  // Ist die Adresse selbst gemeldet?
  const ownVerdict = classifyHarmful(labels.labels, true);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Adresse</h1>
        <span className="rounded bg-panel px-2 py-0.5 text-xs text-accent">{meta.name}</span>
        <span className="mono break-all text-sm">{addr}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/trace?start=${addr}&chain=${chain}&direction=forward`} className="btn">
            Vorwärts verfolgen
          </Link>
          <Link href={`/trace?start=${addr}&chain=${chain}&direction=backward`} className="btn-secondary">
            Herkunft verfolgen
          </Link>
        </div>
      </div>

      {ownVerdict && (
        <div className="rounded-lg border border-red-600 bg-red-950/60 p-3">
          <h2 className="font-semibold text-red-300">
            &#9888; Diese Adresse ist als schädlich gemeldet: {ownVerdict.label}
          </h2>
          <p className="text-sm text-gray-300">
            Quelle: {ownVerdict.source}
            {ownVerdict.details ? ` · ${ownVerdict.details}` : ""}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {info instanceof Error ? (
          <div className="card col-span-4 text-red-300">{info.message}</div>
        ) : (
          <>
            <Stat
              label="Saldo"
              value={formatAmount(info.data.balanceSat, chain)}
              sub={formatFiat(info.data.balanceSat, price?.eur, chain)}
            />
            <Stat
              label="Empfangen"
              value={formatAmount(info.data.receivedSat, chain)}
              sub={formatFiat(info.data.receivedSat, price?.eur, chain)}
            />
            <Stat
              label="Gesendet"
              value={formatAmount(info.data.sentSat, chain)}
              sub={formatFiat(info.data.sentSat, price?.eur, chain)}
            />
            <Stat label="Transaktionen" value={String(info.data.txCount)} sub={`Quelle: ${info.data.provider}`} />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="card">
          <h2 className="mb-2 font-semibold">Labels & Risiko</h2>
          <LabelBadges labels={labels.labels} />
          {labels.errors.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Nicht erreichbar: {labels.errors.map((e) => e.provider).join(", ")}
            </p>
          )}
          <div className="mt-4">
            <h3 className="mb-1 text-sm font-semibold">Weitere Recherche</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <ExternalLink href={`https://bitcointalk.org/index.php?action=search2&search=${addr}`} label="Bitcointalk" />
              <ExternalLink href={`https://www.google.com/search?q=%22${addr}%22`} label="Google" />
              <ExternalLink href={`https://duckduckgo.com/?q=%22${addr}%22`} label="DuckDuckGo" />
              <ExternalLink href={`https://www.reddit.com/search/?q=%22${addr}%22`} label="Reddit" />
              <ExternalLink href={`https://www.bitcoinabuse.com/reports/${addr}`} label="BitcoinAbuse" />
              <ExternalLink href={explorerUrl(chain, addr)} label={`${meta.name}-Explorer`} />
            </div>
          </div>
        </div>
        <AddressActions address={addr} chain={chain} loggedIn={!!session} />
      </div>

      {inflowRisk && (
        <InflowRiskBanner risk={inflowRisk} chain={chain} priceEur={price?.eur} address={addr} />
      )}

      {activity.total > 3 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Aktivitätsmuster</h2>
          <ActivityHeatmap activity={activity} compact />
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">
          Transaktionen {!(txs instanceof Error) && `(${txList.length} neueste, Quelle: ${txs.provider})`}
        </h2>
        {txs instanceof Error ? (
          <p className="text-red-300">{txs.message}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-1">Transaktion</th>
                <th>Zeit</th>
                <th>Richtung</th>
                <th className="text-right">Betrag</th>
                <th className="text-right">Wert damals</th>
                <th className="text-right">Gegenseite</th>
              </tr>
            </thead>
            <tbody>
              {txList.map((tx) => {
                const inSum = tx.inputs.filter((i) => i.address === addr).reduce((s, i) => s + (i.valueSat || 0), 0);
                const outSum = tx.outputs.filter((o) => o.address === addr).reduce((s, o) => s + o.valueSat, 0);
                const net = outSum - inSum;
                const counter =
                  net < 0
                    ? tx.outputs.filter((o) => o.address && o.address !== addr).map((o) => o.address!)
                    : tx.inputs.filter((i) => i.address && i.address !== addr).map((i) => i.address!);
                const uniq = [...new Set(counter)];
                const then = priceAt(series, tx.blockTime);
                return (
                  <tr key={tx.txid} className="border-t border-border">
                    <td className="mono py-1.5">
                      <Link href={`/tx/${tx.txid}?chain=${chain}`} className="hover:text-accent">
                        {shortHash(tx.txid, 10)}
                      </Link>
                    </td>
                    <td className="text-gray-400">{formatDate(tx.blockTime)}</td>
                    <td>
                      {net >= 0 ? <span className="text-green-400">Eingang</span> : <span className="text-red-400">Ausgang</span>}
                    </td>
                    <td className={`text-right ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {formatAmount(Math.abs(net), chain)}
                    </td>
                    <td className="text-right text-xs text-gray-400">
                      {then ? formatFiat(Math.abs(net), then, chain) : "–"}
                    </td>
                    <td className="mono text-right text-xs">
                      {uniq.slice(0, 2).map((a) => (
                        <Link key={a} href={`/address/${a}?chain=${chain}`} className="block hover:text-accent">
                          {shortHash(a, 8)}
                        </Link>
                      ))}
                      {uniq.length > 2 && <span className="text-gray-500">+{uniq.length - 2} weitere</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function explorerUrl(chain: ChainId, addr: string) {
  const base = chainMeta(chain).explorer;
  return chain === "ethereum" ? `${base}/address/${addr}` : `${base}/address/${addr}`;
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="rounded border border-border px-2 py-1 hover:text-accent">
      {label} ↗
    </a>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}
