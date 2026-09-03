import { fetchJson } from "../http";
import type { AddressLabel, IntelProvider } from "../types";

const ID = "cryptoscamdb";

interface CsdbResp {
  success: boolean;
  result?: {
    status?: string;
    type?: string;
    entries?: { name?: string; url?: string; category?: string; subcategory?: string; description?: string }[];
  };
}

/**
 * CryptoScamDB – Community-Datenbank bekannter Scam-Adressen. Kostenlos, ohne Key.
 */
export const cryptoScamDb: IntelProvider = {
  id: ID,
  name: "CryptoScamDB",
  url: "https://cryptoscamdb.org",
  keyRequirement: "none",
  rateLimit: "Fair use",
  leaksQuery: true,
  async lookup(address): Promise<AddressLabel[]> {
    const r = await fetchJson<CsdbResp>(ID, `https://api.cryptoscamdb.org/v1/check/${encodeURIComponent(address)}`);
    if (!r.success || !r.result?.entries?.length) return [];
    if (r.result.status && r.result.status !== "blocked") return [];
    return r.result.entries.slice(0, 5).map((e) => ({
      source: ID,
      label: e.name || e.category || "Scam-Meldung",
      category: "scam" as const,
      risk: "high" as const,
      url: e.url,
      details: [e.category, e.subcategory, e.description].filter(Boolean).join(" · "),
    }));
  },
};
