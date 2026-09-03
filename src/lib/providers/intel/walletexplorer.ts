import { fetchJson } from "../http";
import type { AddressLabel, IntelProvider } from "../types";

const ID = "walletexplorer";

interface WeResp {
  found: boolean;
  label?: string;
  wallet_id?: string;
  address?: string;
}

/**
 * WalletExplorer.com – Wallet-Clustering & Service-Labels (Börsen, Pools, Mixer …).
 * Kostenlose JSON-API, ohne Key.
 */
export const walletExplorer: IntelProvider = {
  id: ID,
  name: "WalletExplorer",
  url: "https://www.walletexplorer.com",
  keyRequirement: "none",
  rateLimit: "Fair use",
  chains: ["bitcoin"],
  leaksQuery: true,
  async lookup(address, ctx): Promise<AddressLabel[]> {
    if (ctx.chain !== "bitcoin") return [];
    const r = await fetchJson<WeResp>(
      ID,
      `https://www.walletexplorer.com/api/1/address-lookup?address=${encodeURIComponent(address)}&caller=chainer`,
    );
    if (!r.found) return [];
    const label = r.label || r.wallet_id;
    if (!label) return [];
    const named = !!r.label;
    const lower = label.toLowerCase();
    let category: AddressLabel["category"] = named ? "service" : "wallet";
    if (/mix|tumbl|blender|wasabi|joinmarket/.test(lower)) category = "mixer";
    else if (/exchange|btc-e|bitstamp|kraken|binance|coinbase|bitfinex|poloniex|huobi|okex|okcoin|localbitcoins/.test(lower))
      category = "exchange";
    return [
      {
        source: ID,
        label,
        category,
        risk: category === "mixer" ? "high" : "low",
        url: `https://www.walletexplorer.com/wallet/${encodeURIComponent(label)}`,
        details: named ? "Bekannter Dienst laut WalletExplorer" : `Wallet-Cluster ${label}`,
      },
    ];
  },
};
