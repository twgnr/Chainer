import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { refreshCases } from "@/lib/caseRefresh";
import { errMsg, jsonError } from "@/lib/api";

export const maxDuration = 300;

/**
 * Stößt die Neuberechnung gespeicherter Fälle an.
 *
 * - Eingeloggte Nutzer aktualisieren ihre eigenen Fälle (oder einen bestimmten
 *   über `?id=`).
 * - Ein externer Cron-Dienst aktualisiert alle fälligen Fälle mit dem Header
 *   `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const isCron = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  const session = isCron ? null : await getSession();
  if (!isCron && !session) return jsonError("Nicht eingeloggt", 401);
  const id = new URL(req.url).searchParams.get("id") || undefined;
  try {
    return NextResponse.json(await refreshCases(isCron ? {} : { userId: session!.userId, caseId: id }));
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
