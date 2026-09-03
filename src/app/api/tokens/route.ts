import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db";
import { createToken, listTokens } from "@/lib/apitoken";
import { TOKEN_SCOPES } from "@/lib/models/ApiToken";
import { errMsg, jsonError } from "@/lib/api";

/**
 * Verwaltung der Zugriffstoken für Skripte.
 *
 * Bewusst nur mit Sitzungs-Cookie nutzbar: mit einem Token dürfen keine weiteren
 * Token angelegt oder widerrufen werden.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB nicht konfiguriert", 503);
  try {
    return NextResponse.json({ tokens: await listTokens(session.userId), scopes: TOKEN_SCOPES });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const schema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(100),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1, "mindestens ein Recht auswählen").optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  if (!isDbConfigured()) return jsonError("MongoDB nicht konfiguriert", 503);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return jsonError("Ungültige Eingabe: " + parsed.error.issues.map((i) => i.message).join(", "));
  try {
    const d = parsed.data;
    const { token, id } = await createToken(session.userId, d.name, d.scopes ?? ["read", "trace"], d.expiresInDays);
    return NextResponse.json({
      ok: true,
      id,
      token,
      hinweis: "Dieses Token wird nur dieses eine Mal angezeigt und kann später nicht erneut abgerufen werden.",
    });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
