import { fetchJson } from "../http";
import type { AddressLabel, IntelProvider } from "../types";

const ID = "chainabuse";

interface CaReport {
  id: string;
  scamCategory?: string;
  description?: string;
  createdAt?: string;
}

/**
 * Chainabuse (Nachfolger von BitcoinAbuse) – Meldungen zu Betrug/Erpressung.
 * Kostenloser API-Key nach Registrierung erforderlich.
 */
export const chainabuse: IntelProvider = {
  id: ID,
  name: "Chainabuse",
  url: "https://www.chainabuse.com",
  keyRequirement: "required",
  keyHint: "Kostenloser API-Key: https://www.chainabuse.com → Settings → API",
  rateLimit: "Free-Tier: 1000 Req/Tag",
  leaksQuery: true,
  async lookup(address, ctx): Promise<AddressLabel[]> {
    const key = ctx.keys[ID];
    if (!key) return [];
    const auth = Buffer.from(`${key}:${key}`).toString("base64");
    const reports = await fetchJson<CaReport[]>(
      ID,
      `https://api.chainabuse.com/v0/reports?address=${encodeURIComponent(address)}&includePrivate=false&page=1&perPage=10`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    if (!Array.isArray(reports) || !reports.length) return [];
    return [
      {
        source: ID,
        label: `${reports.length} Chainabuse-Meldung(en)`,
        category: "scam",
        risk: "high",
        url: `https://www.chainabuse.com/address/${encodeURIComponent(address)}`,
        details: reports
          .slice(0, 3)
          .map((r) => `${r.scamCategory || "?"}: ${(r.description || "").slice(0, 120)}`)
          .join(" | "),
      },
    ];
  },
};
