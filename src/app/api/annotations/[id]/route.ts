import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Annotation } from "@/lib/models/Annotation";
import { errMsg, jsonError } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  try {
    await connectDb();
    await Annotation.deleteOne({ _id: id, userId: session.userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
