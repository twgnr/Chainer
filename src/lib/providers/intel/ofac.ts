import { fetchText } from "../http";
import type { AddressLabel, IntelProvider } from "../types";
import { memoPersist } from "../../cache";
import type { ChainId } from "../../chains";

const ID = "ofac";

// Community-gepflegte Listen der OFAC-SDN-Krypto-Adressen (täglich aktualisiert, MIT-Lizenz)
const BASE =
  "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_";

const FILES: Partial<Record<ChainId, string>> = {
  bitcoin: "XBT.txt",
  litecoin: "LTC.txt",
  "bitcoin-cash": "BCH.txt",
  ethereum: "ETH.txt",
};

/**
 * Die Liste wird als Array persistiert (ein Set überlebt die JSON-Serialisierung
 * in der Datenbank nicht) und beim Lesen in ein Set umgewandelt.
 */
async function loadList(chain: ChainId): Promise<Set<string>> {
  const file = FILES[chain];
  if (!file) return new Set();
  const arr = await memoPersist(`ofac-list:${chain}`, 6 * 60 * 60 * 1000, async () => {
    const txt = await fetchText(ID, BASE + file, 20_000);
    return txt
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  });
  return new Set(chain === "ethereum" ? arr.map((a) => a.toLowerCase()) : arr);
}

/**
 * OFAC-Sanktionsliste (US Treasury SDN). Kostenlos, ohne Key.
 */
export const ofac: IntelProvider = {
  id: ID,
  name: "OFAC-Sanktionsliste",
  url: "https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses",
  keyRequirement: "none",
  rateLimit: "Liste wird alle 6 Stunden geladen",
  chains: ["bitcoin", "litecoin", "bitcoin-cash", "ethereum"],
  async lookup(address, ctx): Promise<AddressLabel[]> {
    const list = await loadList(ctx.chain);
    const needle = ctx.chain === "ethereum" ? address.toLowerCase() : address;
    if (!list.has(needle)) return [];
    return [
      {
        source: ID,
        label: "OFAC-sanktioniert",
        category: "sanctioned",
        risk: "high",
        url: "https://sanctionssearch.ofac.treas.gov/",
        details: "Adresse steht auf der SDN-Liste des US-Finanzministeriums",
      },
    ];
  },
};
