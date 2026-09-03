import { NextResponse, type NextRequest } from "next/server";

/**
 * Vergibt jeder Anfrage eine Kennung, sofern noch keine mitgeliefert wurde, und
 * gibt sie in der Antwort zurück. Damit lässt sich ein Fehlerbild eines Nutzers
 * eindeutig einer Protokollzeile zuordnen.
 */
export function middleware(req: NextRequest) {
  const existing = req.headers.get("x-request-id");
  const id = existing && existing.length <= 64 ? existing : crypto.randomUUID();

  const headers = new Headers(req.headers);
  headers.set("x-request-id", id);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", id);
  return res;
}

export const config = {
  // Statische Dateien und Bilder brauchen keine Kennung
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
