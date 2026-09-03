import { fetchJson } from "../http";
import type { AddressLabel, IntelProvider } from "../types";

const ID = "bitcoinwhoswho";

interface BwwResponse {
  status?: string;
  message?: string;
  scam_alert?: { count?: number; alerts?: { description?: string; date?: string }[] };
  website_appearances?: { url?: string; title?: string }[];
  tag?: string;
}

/**
 * Bitcoin Who's Who – Reputationsdaten, Scam-Meldungen und Web-Erwähnungen
 * zu Bitcoin-Adressen. Kostenloser API-Key nach Registrierung.
 */
export const bitcoinWhosWho: IntelProvider = {
  id: ID,
  name: "Bitcoin Who's Who",
  url: "https://www.bitcoinwhoswho.com",
  keyRequirement: "required",
  keyHint: "Kostenloser API-Key: https://www.bitcoinwhoswho.com/api",
  rateLimit: "Free-Tier: begrenzte Abfragen pro Tag",
  leaksQuery: true,
  chains: ["bitcoin"],
  async lookup(address, ctx): Promise<AddressLabel[]> {
    const key = ctx.keys[ID];
    if (!key || ctx.chain !== "bitcoin") return [];
    const r = await fetchJson<BwwResponse>(
      ID,
      `https://www.bitcoinwhoswho.com/api/scam/${encodeURIComponent(key)}/${encodeURIComponent(address)}`,
    );
    const labels: AddressLabel[] = [];
    const alerts = r.scam_alert?.alerts || [];
    if (alerts.length) {
      labels.push({
        source: ID,
        label: `${alerts.length} Scam-Meldung(en)`,
        category: "scam",
        risk: "high",
        url: `https://www.bitcoinwhoswho.com/address/${address}`,
        details: alerts
          .slice(0, 3)
          .map((a) => `${a.date || ""} ${a.description || ""}`.trim())
          .join(" | "),
      });
    }
    if (r.tag) {
      labels.push({
        source: ID,
        label: r.tag,
        category: "service",
        risk: "low",
        url: `https://www.bitcoinwhoswho.com/address/${address}`,
      });
    }
    const sites = r.website_appearances || [];
    if (sites.length) {
      labels.push({
        source: ID,
        label: `${sites.length} Web-Erwähnung(en)`,
        category: "other",
        url: `https://www.bitcoinwhoswho.com/address/${address}`,
        details: sites
          .slice(0, 3)
          .map((s) => s.title || s.url || "")
          .filter(Boolean)
          .join(" | "),
      });
    }
    return labels;
  },
};
