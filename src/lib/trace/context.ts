import type { ProviderContext } from "../providers/types";
import type { ChainId } from "../chains";

/**
 * Erzeugt aus einem bestehenden Kontext einen für eine andere Chain. Schlüssel,
 * Konfiguration und die Zuordnung zu Nutzer und Team bleiben erhalten; nur die
 * Chain wechselt. Wird für Cross-Chain-Abfragen gebraucht.
 */
export function contextForChain(ctx: ProviderContext, chain: ChainId): ProviderContext {
  return { ...ctx, chain };
}
