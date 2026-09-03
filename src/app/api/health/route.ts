import { NextResponse } from "next/server";
import { cacheStats } from "@/lib/cache";
import { isDbConfigured } from "@/lib/db";
import { dataProviders, intelProviders } from "@/lib/providers/registry";
import { notifyChannelsAvailable } from "@/lib/notify";

/**
 * Zustandsbericht für Überwachung und Betrieb. Bewusst ohne Abfragen an externe
 * Quellen, damit der Aufruf schnell und billig bleibt.
 */
export async function GET() {
  const dbConfigured = isDbConfigured();
  let dbConnected: boolean | null = null;
  if (dbConfigured) {
    try {
      const { connectDb } = await import("@/lib/db");
      dbConnected = !!(await connectDb());
    } catch {
      dbConnected = false;
    }
  }
  const cache = await cacheStats().catch(() => ({ memory: 0, persistent: null }));

  const healthy = !dbConfigured || dbConnected === true;
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSeconds: Math.round(process.uptime()),
      database: { configured: dbConfigured, connected: dbConnected, authEnabled: !!process.env.AUTH_SECRET },
      providers: { data: dataProviders.length, intel: intelProviders.length },
      cache,
      notifications: notifyChannelsAvailable(),
      watchInterval: Number(process.env.WATCH_INTERVAL_MINUTES || 0),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
