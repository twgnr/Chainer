import { fetchText } from "../http";
import { memoPersist } from "../../cache";
import type { AddressLabel, IntelProvider, LabelCategory } from "../types";
import type { ChainId } from "../../chains";

const ID = "tagpacks";

/**
 * GraphSense-TagPacks und eigene Tag-Listen.
 *
 * Unterstützt werden das YAML-Format der GraphSense-TagPacks sowie einfache
 * CSV- und JSON-Listen. Die Quellen werden über die Umgebungsvariable
 * TAGPACK_URLS (kommagetrennt) konfiguriert; ohne Konfiguration wird die
 * folgende Auswahl öffentlicher TagPacks geladen.
 */
const REPO = "https://raw.githubusercontent.com/graphsense/graphsense-tagpacks/master/packs/";

const DEFAULT_PACKS = [
  "exchange-wallets-binance.yaml",
  "exchange-wallets-bitfinexcom.yaml",
  "exchange-wallets-bybit.yaml",
  "exchange-wallets-cryptocom.yaml",
  "exchange-wallets-huobi.yaml",
  "exchange-wallets-kucoin.yaml",
  "exchange-wallets-okx.yaml",
  "hacks.yaml",
  "hydra.yaml",
  "lazarus.yaml",
  "blender_io.yaml",
  "sinbad_io.yaml",
  "tornado_cash.yaml",
  "mixing_fc2021.yaml",
  "wasabi_collector.yaml",
  "samourai.yaml",
  "miners.yaml",
  "ofac.yaml",
  "ponzi_scheme.yaml",
  "plustoken.yaml",
  "sextortion_talos.yaml",
  "twitter_hack_scam.yaml",
  "usdt_blacklist.yaml",
  "ransomware.yaml",
];

export interface TagEntry {
  label: string;
  category?: LabelCategory;
  source?: string;
}

function urls(): string[] {
  const env = process.env.TAGPACK_URLS?.trim();
  if (env)
    return env
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
  return DEFAULT_PACKS.map((p) => REPO + p);
}

const CATEGORY_MAP: Record<string, LabelCategory> = {
  exchange: "exchange",
  exchanges: "exchange",
  mixing_service: "mixer",
  mixer: "mixer",
  tumbler: "mixer",
  coinjoin: "mixer",
  darknet_market: "darknet",
  darknet: "darknet",
  market: "darknet",
  gambling: "gambling",
  miner: "mining",
  mining: "mining",
  mining_pool: "mining",
  ransomware: "ransomware",
  scam: "scam",
  sextortion: "scam",
  ponzi_scheme: "scam",
  phishing: "scam",
  hack: "scam",
  theft: "scam",
  sanctions: "sanctioned",
  sanctioned: "sanctioned",
  wallet_service: "service",
  service: "service",
  payment_processor: "service",
  hosted_wallet: "service",
  bridge: "service",
  defi: "service",
};

function mapCategory(raw: string | undefined, fallback: LabelCategory | undefined): LabelCategory | undefined {
  if (!raw) return fallback;
  return CATEGORY_MAP[raw.toLowerCase().replace(/[\s-]/g, "_")] || fallback;
}

/** Währungskürzel der TagPacks auf die unterstützten Chains abbilden */
const CURRENCY_TO_CHAIN: Record<string, ChainId> = {
  BTC: "bitcoin",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  DOGE: "dogecoin",
  ETH: "ethereum",
};

const key = (chain: string, address: string) => `${chain}|${address}`;

/**
 * Minimaler Parser für das TagPack-YAML-Schema. Bewusst nur die flache Struktur
 * `tags: - address: … label: … currency: …`, damit keine YAML-Abhängigkeit nötig ist.
 */
export function parseTagPackYaml(text: string, fallbackTitle: string): Record<string, TagEntry> {
  const out: Record<string, TagEntry> = {};
  const lines = text.split(/\r?\n/);
  let title = fallbackTitle;
  let defaultCategory: LabelCategory | undefined;
  let cur: { address?: string; label?: string; category?: string; currency?: string } | null = null;

  const clean = (v: string) => v.replace(/^["']|["']$/g, "").trim();

  const flush = () => {
    if (cur?.address) {
      const chain = CURRENCY_TO_CHAIN[(cur.currency || "BTC").toUpperCase()];
      if (chain) {
        const addr = chain === "ethereum" ? cur.address.toLowerCase() : cur.address;
        out[key(chain, addr)] = {
          label: cur.label || title,
          category: mapCategory(cur.category, defaultCategory),
          source: title,
        };
      }
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Kopffelder des Pakets (nicht eingerückt, kein Listeneintrag)
    const top = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(line);
    if (top && !/^\s/.test(line)) {
      flush();
      const [, k, value] = top;
      const v = clean(value);
      if (k === "title" && v) title = v;
      // `category` und `abuse` bestimmen beide die Standardkategorie des Pakets
      if ((k === "category" || k === "abuse") && v) defaultCategory = mapCategory(v, defaultCategory);
      continue;
    }

    const item = /^\s*-\s*([A-Za-z_][\w]*):\s*(.*)$/.exec(line);
    if (item) {
      flush();
      cur = {};
      const [, k, value] = item;
      const v = clean(value);
      if (k === "address") cur.address = v;
      else if (k === "label") cur.label = v;
      else if (k === "category" || k === "abuse") cur.category = v;
      else if (k === "currency") cur.currency = v;
      continue;
    }

    const field = /^\s+([A-Za-z_][\w]*):\s*(.*)$/.exec(line);
    if (field && cur) {
      const [, k, value] = field;
      const v = clean(value);
      if (k === "address") cur.address = v;
      else if (k === "label") cur.label = v;
      else if (k === "category" || k === "abuse") cur.category = v;
      else if (k === "currency") cur.currency = v;
    }
  }
  flush();
  return out;
}

/** CSV mit Kopfzeile (address,label,category[,currency]) oder JSON-Array/Objekt */
export function parseGeneric(text: string, title: string): Record<string, TagEntry> {
  const out: Record<string, TagEntry> = {};
  const add = (addr: unknown, label: unknown, cat: unknown, cur: unknown) => {
    if (typeof addr !== "string" || !addr) return;
    const chain = CURRENCY_TO_CHAIN[String(cur || "BTC").toUpperCase()] || "bitcoin";
    out[key(chain, chain === "ethereum" ? addr.toLowerCase() : addr)] = {
      label: typeof label === "string" && label ? label : title,
      category: mapCategory(typeof cat === "string" ? cat : undefined, undefined),
      source: title,
    };
  };
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const json: unknown = JSON.parse(trimmed);
      if (Array.isArray(json)) {
        for (const e of json) {
          if (e && typeof e === "object") {
            const o = e as Record<string, unknown>;
            add(o.address ?? o.addr, o.label ?? o.name ?? o.owner ?? o.family, o.category ?? o.type, o.currency ?? o.blockchain);
          }
        }
      } else if (json && typeof json === "object") {
        for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
          if (typeof v === "string") add(k, v, undefined, undefined);
          else if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            add(k, o.label ?? o.name, o.category ?? o.type, o.currency);
          }
        }
      }
    } catch {
      /* kein gültiges JSON */
    }
    return out;
  }
  const lines = trimmed.split(/\r?\n/);
  const header = lines[0]?.toLowerCase() ?? "";
  const hasHeader = header.includes("address");
  const cols = hasHeader ? header.split(/[,;]/).map((c) => c.trim()) : ["address", "label", "category"];
  const idx = (name: string, fallback: number) => (cols.indexOf(name) >= 0 ? cols.indexOf(name) : fallback);
  const iA = idx("address", 0);
  const iL = idx("label", 1);
  const iC = cols.indexOf("category");
  const iCur = cols.indexOf("currency");
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const parts = line.split(/[,;]/).map((p) => p.trim().replace(/^"|"$/g, ""));
    add(parts[iA], parts[iL], iC >= 0 ? parts[iC] : undefined, iCur >= 0 ? parts[iCur] : undefined);
  }
  return out;
}

export async function loadPacks(list = urls()): Promise<Record<string, TagEntry>> {
  return memoPersist(`tagpacks:${list.join("|")}`, 12 * 60 * 60 * 1000, async () => {
    const merged: Record<string, TagEntry> = {};
    // Nacheinander in Blöcken laden, um GitHub nicht zu überlasten
    const BATCH = 6;
    for (let i = 0; i < list.length; i += BATCH) {
      const results = await Promise.allSettled(
        list.slice(i, i + BATCH).map(async (u) => {
          const text = await fetchText(ID, u, 30_000);
          const name = decodeURIComponent(u.split("/").pop() || "TagPack").replace(/\.(ya?ml|csv|json)$/i, "");
          return /\.ya?ml$/i.test(u) ? parseTagPackYaml(text, name) : parseGeneric(text, name);
        }),
      );
      for (const r of results) if (r.status === "fulfilled") Object.assign(merged, r.value);
    }
    return merged;
  });
}

export const tagpacks: IntelProvider = {
  id: ID,
  name: "GraphSense-TagPacks",
  url: "https://github.com/graphsense/graphsense-tagpacks",
  keyRequirement: "none",
  rateLimit: "Listen werden zweimal täglich geladen",
  async lookup(address, ctx): Promise<AddressLabel[]> {
    const packs = await loadPacks();
    const needle = ctx.chain === "ethereum" ? address.toLowerCase() : address;
    const hit = packs[key(ctx.chain, needle)];
    if (!hit) return [];
    const risky: LabelCategory[] = ["mixer", "darknet", "ransomware", "scam", "sanctioned"];
    return [
      {
        source: ID,
        label: hit.label,
        category: hit.category || "service",
        risk: hit.category && risky.includes(hit.category) ? "high" : "low",
        url: "https://github.com/graphsense/graphsense-tagpacks",
        details: hit.source ? `TagPack: ${hit.source}` : undefined,
      },
    ];
  },
};

/** Anzahl geladener Tags – für die Statusanzeige */
export async function tagpackSize(): Promise<number> {
  return Object.keys(await loadPacks()).length;
}
