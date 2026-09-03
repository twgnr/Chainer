import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models/User";
import { encrypt, maskKey } from "@/lib/crypto";
import { envKeySet, keyableProviders } from "@/lib/providers/registry";
import { keyRotationConfigured } from "@/lib/crypto";
import { errMsg, jsonError } from "@/lib/api";

/** Konfigurierbare Provider mit maskierten Nutzer-Keys und Konfiguration */
export async function GET() {
  const session = await getSession();
  const settings = await getUserSettings(session);

  return NextResponse.json({
    loggedIn: !!session,
    org: settings.orgId ? { id: settings.orgId, name: settings.orgName, role: settings.role } : null,
    privacyMode: settings.privacyMode === true,
    privacyForcedByEnv: process.env.PRIVACY_MODE === "true",
    keyRotationConfigured: keyRotationConfigured(),
    providers: keyableProviders.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      chains: p.chains,
      keyRequirement: p.keyRequirement,
      keyHint: p.keyHint,
      rateLimit: p.rateLimit,
      configFields: p.configFields,
      userKey: settings.userKeys[p.id] ? maskKey(settings.userKeys[p.id]) : null,
      orgKey: settings.orgKeys[p.id] ? maskKey(settings.orgKeys[p.id]) : null,
      envKey: envKeySet[p.id] || false,
      config: Object.fromEntries(
        Object.entries(settings.config[p.id] || {}).map(([k, v]) => [
          k,
          p.configFields?.find((f) => f.key === k)?.secret ? maskKey(v) : v,
        ]),
      ),
    })),
  });
}

const schema = z.object({
  keys: z.record(z.string(), z.string().max(500)).optional(),
  config: z.record(z.string(), z.record(z.string(), z.string().max(500))).optional(),
  /** Nur Quellen nutzen, die die gesuchte Adresse nicht weitergeben */
  privacyMode: z.boolean().optional(),
});

/**
 * Speichert Keys und Provider-Konfiguration verschlüsselt.
 * Leerer String löscht den jeweiligen Eintrag.
 */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  const allowed = new Map(keyableProviders.map((p) => [p.id, p]));
  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB nicht konfiguriert", 503);
    const user = await User.findById(session.userId);
    if (!user) return jsonError("Nutzer nicht gefunden", 404);

    for (const [id, value] of Object.entries(parsed.data.keys || {})) {
      if (!allowed.has(id)) continue;
      const v = value.trim();
      if (v) user.apiKeys.set(id, encrypt(v));
      else user.apiKeys.delete(id);
    }

    for (const [id, fields] of Object.entries(parsed.data.config || {})) {
      const meta = allowed.get(id);
      if (!meta?.configFields) continue;
      const valid = new Set(meta.configFields.map((f) => f.key));
      const current = new Map(user.providerConfig.get(id) ?? []);
      for (const [k, raw] of Object.entries(fields)) {
        if (!valid.has(k)) continue;
        const v = raw.trim();
        if (v) current.set(k, encrypt(v));
        else current.delete(k);
      }
      if (current.size) user.providerConfig.set(id, current);
      else user.providerConfig.delete(id);
    }

    if (parsed.data.privacyMode !== undefined) user.privacyMode = parsed.data.privacyMode;

    await user.save();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
