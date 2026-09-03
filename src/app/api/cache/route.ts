import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cacheClear, cacheStats } from "@/lib/cache";
import { errMsg, jsonError } from "@/lib/api";

export async function GET() {
  return NextResponse.json(await cacheStats());
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  try {
    await cacheClear();
    return NextResponse.json({ ok: true, ...(await cacheStats()) });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
