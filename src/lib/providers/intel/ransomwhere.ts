import { fetchJson, fetchText } from "../http";
import { memoPersist } from "../../cache";
import type { AddressLabel, IntelProvider } from "../types";

const ID = "ransomwhere";

interface RwEntry {
  address: string;
  family?: string;
  blockchain?: string;
}

/**
 * Ransomwhere – offener Datensatz gemeldeter Ransomware-Zahlungsadressen.
 *
 * Die direkte API (api.ransomwhe.re) verlangt inzwischen eine Authentifizierung.
 * Deshalb wird zuerst der frei zugängliche Spiegel des Datensatzes im
 * GraphSense-TagPack-Repository gelesen; ist die offene API erreichbar, wird sie
 * bevorzugt, weil sie aktueller ist.
 */
const MIRROR = "https://raw.githubusercontent.com/graphsense/graphsense-tagpacks/master/packs/ransomwhere.yaml";
const API = "https://api.ransomwhe.re/submittedAddresses";

/** Zeilenweiser Auszug der Adressen und Familien aus dem TagPack-YAML */
function parseMirror(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let address: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const a = /^-?\s*address:\s*(.+)$/.exec(line);
    if (a) {
      address = a[1].replace(/^["']|["']$/g, "").trim();
      continue;
    }
    const l = /^label:\s*(.+)$/.exec(line);
    if (l && address) {
      out[address] = l[1].replace(/^["']|["']$/g, "").trim();
      address = null;
    }
  }
  return out;
}

async function loadIndex(): Promise<Record<string, string>> {
  return memoPersist("ransomwhere-index", 24 * 60 * 60 * 1000, async () => {
    try {
      const res = await fetchJson<{ result?: RwEntry[] } | RwEntry[]>(ID, API, { timeoutMs: 30_000 });
      const list = Array.isArray(res) ? res : res.result || [];
      if (list.length) {
        const index: Record<string, string> = {};
        for (const e of list) if (e?.address) index[e.address] = e.family || "Ransomware";
        return index;
      }
    } catch {
      /* API nicht öffentlich erreichbar -> Spiegel verwenden */
    }
    return parseMirror(await fetchText(ID, MIRROR, 30_000));
  });
}

export const ransomwhere: IntelProvider = {
  id: ID,
  name: "Ransomwhere",
  url: "https://ransomwhe.re",
  keyRequirement: "none",
  rateLimit: "Liste wird einmal täglich geladen",
  chains: ["bitcoin"],
  async lookup(address, ctx): Promise<AddressLabel[]> {
    if (ctx.chain !== "bitcoin") return [];
    const index = await loadIndex();
    const family = index[address];
    if (!family) return [];
    return [
      {
        source: ID,
        label: `Ransomware: ${family}`,
        category: "ransomware",
        risk: "high",
        url: "https://ransomwhe.re",
        details: "Adresse ist als Lösegeld-Zahlungsadresse gemeldet",
      },
    ];
  },
};
