import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db";
import { revokeToken } from "@/lib/apitoken";
import { errMsg, jsonError } from "@/lib/api";

/** Widerruft ein eigenes Zugriffstoken; nur mit Sitzungs-Cookie erlaubt. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB nicht konfiguriert", 503);
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return jsonError("Ungültige ID");
  try {
    const ok = await revokeToken(session.userId, id);
    if (!ok) return jsonError("Token nicht gefunden", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
