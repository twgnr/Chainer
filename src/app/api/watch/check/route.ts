import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkWatches } from "@/lib/watch";
import { errMsg, jsonError } from "@/lib/api";

export const maxDuration = 300;

/**
 * Prüft beobachtete Adressen auf neue Aktivität.
 *
 * - Eingeloggte Nutzer prüfen ihre eigenen Adressen.
 * - Ein externer Cron-Dienst prüft alle Adressen mit dem Header
 *   `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const isCron = !!secret && auth === `Bearer ${secret}`;
  const session = isCron ? null : await getSession();
  if (!isCron && !session) return jsonError("Nicht eingeloggt", 401);
  try {
    return NextResponse.json(await checkWatches(isCron ? {} : { userId: session!.userId }));
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
