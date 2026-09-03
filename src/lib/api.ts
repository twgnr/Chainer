import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
