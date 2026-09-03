import type { AddressLabel, IntelProvider, ProviderContext } from "../types";

const ID = "eigene";

/**
 * Eigene Labels und Notizen aus der Datenbank: entweder vom Nutzer selbst oder
 * vom Team (Organisation) geteilt. Diese Quelle hat in der Anzeige Vorrang.
 */
export const ownAnnotations: IntelProvider = {
  id: ID,
  name: "Eigene Labels & Notizen",
  url: "/annotations",
  keyRequirement: "none",
  rateLimit: "lokale Datenbank",
  async lookup(address, ctx: ProviderContext): Promise<AddressLabel[]> {
    if (!ctx.userId && !ctx.orgId) return [];
    try {
      const { connectDb } = await import("../../db");
      const { Annotation } = await import("../../models/Annotation");
      if (!(await connectDb())) return [];
      const or: Record<string, unknown>[] = [];
      if (ctx.userId) or.push({ userId: ctx.userId });
      if (ctx.orgId) or.push({ orgId: ctx.orgId, shared: true });
      const docs = await Annotation.find({ chain: ctx.chain, address, $or: or }).limit(10).lean();
      return docs.map((d) => ({
        source: ID,
        label: d.label,
        category: d.category || "custom",
        risk: d.risk || undefined,
        details: [d.notes, d.shared ? "geteilt im Team" : "privat"].filter(Boolean).join(" · "),
        own: true,
      }));
    } catch {
      return [];
    }
  },
};
