import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Annotation } from "@/lib/models/Annotation";
import { errMsg, jsonError } from "@/lib/api";

const CATEGORIES = [
  "exchange",
  "mixer",
  "scam",
  "sanctioned",
  "ransomware",
  "darknet",
  "gambling",
  "mining",
  "service",
  "wallet",
  "custom",
  "other",
] as const;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const sp = new URL(req.url).searchParams;
  const address = sp.get("address");
  const kind = sp.get("kind");
  try {
    await connectDb();
    const settings = await getUserSettings(session);
    const or: Record<string, unknown>[] = [{ userId: session.userId }];
    if (settings.orgId) or.push({ orgId: settings.orgId, shared: true });
    const filter: Record<string, unknown> = { $or: or };
    if (address) filter.address = address;
    if (kind === "address" || kind === "tx") filter.kind = kind;
    const items = await Annotation.find(filter).sort({ updatedAt: -1 }).limit(500).lean();
    return NextResponse.json({ annotations: items });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const schema = z.object({
  chain: z.string().default("bitcoin"),
  /** Bezugsobjekt: Adresse oder Transaktion */
  kind: z.enum(["address", "tx"]).default("address"),
  address: z.string().trim().min(10),
  label: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES).default("custom"),
  risk: z.enum(["low", "medium", "high"]).nullable().optional(),
  notes: z.string().max(5000).default(""),
  shared: z.boolean().default(false),
});

/** Legt ein eigenes Label an oder aktualisiert das vorhandene. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB nicht konfiguriert", 503);
    const settings = await getUserSettings(session);
    const d = parsed.data;
    const doc = await Annotation.findOneAndUpdate(
      { chain: d.chain, address: d.address, kind: d.kind, userId: session.userId },
      {
        $set: {
          kind: d.kind,
          label: d.label,
          category: d.category,
          risk: d.risk ?? null,
          notes: d.notes,
          shared: d.shared,
          orgId: settings.orgId ?? null,
        },
      },
      { upsert: true, new: true },
    );
    return NextResponse.json({ ok: true, annotation: doc });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
