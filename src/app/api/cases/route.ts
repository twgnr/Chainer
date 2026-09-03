import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Case } from "@/lib/models/Case";
import { errMsg, jsonError } from "@/lib/api";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  try {
    await connectDb();
    const settings = await getUserSettings(session);
    const or: Record<string, unknown>[] = [{ userId: session.userId }];
    if (settings.orgId) or.push({ orgId: settings.orgId, shared: true });
    const cases = await Case.find({ $or: or })
      .select("-result -traces.result -view")
      .sort({ updatedAt: -1 })
      .lean();
    return NextResponse.json({
      cases: cases.map((c) => ({ ...c, own: String(c.userId) === session.userId })),
    });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  notes: z.string().max(20000).optional().default(""),
  chain: z.string().default("bitcoin"),
  start: z.string().trim().min(10),
  params: z.record(z.string(), z.unknown()).default({}),
  result: z.unknown().optional(),
  shared: z.boolean().default(false),
});

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
    const c = await Case.create({
      ...d,
      userId: session.userId,
      orgId: settings.orgId ?? null,
      traces: d.result
        ? [
            {
              id: randomUUID(),
              name: "Trace 1",
              start: d.start,
              chain: d.chain,
              params: d.params,
              result: d.result,
              createdAt: new Date(),
            },
          ]
        : [],
      log: [{ at: new Date(), author: session.email, text: "Fall angelegt" }],
    });
    return NextResponse.json({ ok: true, id: c._id.toString() });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
