import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Watch } from "@/lib/models/Watch";
import { errMsg, jsonError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  active: z.boolean().optional(),
  label: z.string().max(200).optional(),
  minValueSat: z.number().int().min(0).optional(),
  markRead: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  try {
    await connectDb();
    const w = await Watch.findOne({ _id: id, userId: session.userId });
    if (!w) return jsonError("Nicht gefunden", 404);
    if (parsed.data.active !== undefined) w.active = parsed.data.active;
    if (parsed.data.label !== undefined) w.label = parsed.data.label;
    if (parsed.data.minValueSat !== undefined) w.minValueSat = parsed.data.minValueSat;
    if (parsed.data.markRead) w.events.forEach((e) => (e.read = true));
    await w.save();
    return NextResponse.json({ ok: true, watch: w });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  try {
    await connectDb();
    await Watch.deleteOne({ _id: id, userId: session.userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
