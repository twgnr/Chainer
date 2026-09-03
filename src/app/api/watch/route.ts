import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Watch } from "@/lib/models/Watch";
import { User } from "@/lib/models/User";
import { notifyChannelsAvailable } from "@/lib/notify";
import { isChainAddress, isChainId } from "@/lib/chains";
import { errMsg, jsonError } from "@/lib/api";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  try {
    await connectDb();
    const [watches, user] = await Promise.all([
      Watch.find({ userId: session.userId }).sort({ updatedAt: -1 }).lean(),
      User.findById(session.userId).lean(),
    ]);
    return NextResponse.json({
      watches,
      channels: notifyChannelsAvailable(),
      notify: user?.notify ?? { email: true, telegramChatId: "", webhookUrl: "" },
      intervalMinutes: Number(process.env.WATCH_INTERVAL_MINUTES || 0),
    });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const schema = z.object({
  chain: z.string().default("bitcoin"),
  address: z.string().trim().min(10),
  label: z.string().max(200).default(""),
  minValueSat: z.number().int().min(0).default(0),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  const d = parsed.data;
  if (!isChainId(d.chain)) return jsonError("Unbekannte Chain");
  if (!isChainAddress(d.address, d.chain)) return jsonError(`Keine gültige ${d.chain}-Adresse`);
  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB nicht konfiguriert", 503);
    const settings = await getUserSettings(session);
    const doc = await Watch.findOneAndUpdate(
      { chain: d.chain, address: d.address, userId: session.userId },
      {
        $set: { label: d.label, minValueSat: d.minValueSat, active: true, orgId: settings.orgId ?? null },
        $setOnInsert: { lastCheckedAt: null },
      },
      { upsert: true, new: true },
    );
    return NextResponse.json({ ok: true, watch: doc });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const notifySchema = z.object({
  email: z.boolean().optional(),
  telegramChatId: z.string().max(100).optional(),
  webhookUrl: z.string().max(500).optional(),
});

/** Benachrichtigungseinstellungen des Nutzers */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const parsed = notifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  try {
    await connectDb();
    const set: Record<string, unknown> = {};
    if (parsed.data.email !== undefined) set["notify.email"] = parsed.data.email;
    if (parsed.data.telegramChatId !== undefined) set["notify.telegramChatId"] = parsed.data.telegramChatId.trim();
    if (parsed.data.webhookUrl !== undefined) set["notify.webhookUrl"] = parsed.data.webhookUrl.trim();
    await User.updateOne({ _id: session.userId }, { $set: set });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
