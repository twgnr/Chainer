import { NextResponse } from "next/server";
import { getLocale } from "./i18n/server";
import { translateMessage } from "./i18n/messages";

/**
 * Fehlerantwort der API.
 *
 * Die Meldungen stehen im Quelltext auf Deutsch und werden hier in die
 * Sprache der Anfrage übersetzt (Cookie, sonst `Accept-Language`), damit die
 * Oberfläche sie unverändert anzeigen kann.
 */
export async function jsonError(message: string, status = 400) {
  const locale = await getLocale().catch(() => "en" as const);
  return NextResponse.json({ error: translateMessage(message, locale) }, { status });
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
