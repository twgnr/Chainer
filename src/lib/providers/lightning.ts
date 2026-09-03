import { fetchJson } from "./http";
import { memoPersist } from "../cache";
import type { ChainId } from "../chains";

/**
 * Lightning-Kanäle über die mempool.space-API. Erkennt, ob eine Transaktion
 * einen Zahlungskanal öffnet (Funding-Output) oder schließt (Ausgabe eines
 * Funding-Outputs). Kostenlos, ohne Key.
 */
export interface LightningChannel {
  id: string;
  shortId?: string;
  capacitySat: number;
  status: string;
  opened?: number;
  closed?: number;
  role: "funding" | "closing";
  nodes: { pubkey: string; alias?: string }[];
}

interface MempoolNode {
  public_key?: string;
  alias?: string;
}

interface MempoolChannel {
  id?: string;
  short_id?: string;
  capacity?: number;
  status?: number | string;
  closing_date?: string | null;
  created?: string | null;
  node_left?: MempoolNode;
  node_right?: MempoolNode;
}

/**
 * Die API liefert je angefragter Transaktion ein Objekt mit zwei Zuordnungen:
 * `outputs` enthält die von dieser Transaktion eröffneten Kanäle (Index = vout),
 * `inputs` die von ihr geschlossenen (Index = vin). Ohne Kanalbezug sind beide leer.
 */
interface MempoolTxChannels {
  inputs?: Record<string, MempoolChannel | null>;
  outputs?: Record<string, MempoolChannel | null>;
}

const ID = "lightning";
const BASE = "https://mempool.space/api/v1/lightning";

const statusText = (s: number | string | undefined) =>
  typeof s === "number" ? (["inaktiv", "aktiv", "geschlossen"][s] ?? String(s)) : (s ?? "unbekannt");

const unix = (v?: string | null) => (v ? Math.floor(new Date(v).getTime() / 1000) : undefined);

function toChannel(c: MempoolChannel, role: LightningChannel["role"]): LightningChannel | null {
  if (!c?.id) return null;
  return {
    id: c.id,
    shortId: c.short_id,
    capacitySat: c.capacity ?? 0,
    status: statusText(c.status),
    opened: unix(c.created),
    closed: unix(c.closing_date),
    role,
    nodes: [c.node_left, c.node_right]
      .filter((n): n is MempoolNode => !!n?.public_key)
      .map((n) => ({ pubkey: n.public_key!, alias: n.alias })),
  };
}

/** Kanäle, die von dieser Transaktion geöffnet oder geschlossen werden. */
export async function lightningForTx(txid: string, chain: ChainId): Promise<LightningChannel[]> {
  if (chain !== "bitcoin") return [];
  return memoPersist(`ln:tx:${txid}`, 12 * 60 * 60 * 1000, async () => {
    try {
      const res = await fetchJson<MempoolTxChannels[]>(ID, `${BASE}/channels/txids?txId[]=${encodeURIComponent(txid)}`);
      if (!Array.isArray(res) || !res.length) return [];
      const out: LightningChannel[] = [];
      for (const entry of res) {
        for (const c of Object.values(entry?.outputs ?? {})) {
          const ch = c && toChannel(c, "funding");
          if (ch) out.push(ch);
        }
        for (const c of Object.values(entry?.inputs ?? {})) {
          const ch = c && toChannel(c, "closing");
          if (ch) out.push(ch);
        }
      }
      return out;
    } catch {
      return [];
    }
  });
}

/** Kurzer Hinweistext für den Trace-Graph. */
export function lightningHint(channels: LightningChannel[]): string | null {
  if (!channels.length) return null;
  const c = channels[0];
  const alias = c.nodes
    .map((n) => n.alias || n.pubkey.slice(0, 8))
    .filter(Boolean)
    .join(" ↔ ");
  const what = c.role === "funding" ? "Lightning-Kanal geöffnet" : "Lightning-Kanal geschlossen";
  return `${what}${alias ? ` (${alias})` : ""}${channels.length > 1 ? ` und ${channels.length - 1} weitere` : ""}`;
}
