import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Org } from "@/lib/models/Org";
import { keyRotationConfigured, reencrypt } from "@/lib/crypto";
import { log } from "@/lib/logger";
import { errMsg, jsonError } from "@/lib/api";

/**
 * Verschlüsselt alle gespeicherten Zugangsdaten des Nutzers mit dem aktuellen
 * Schlüssel neu. Nach einem Wechsel von ENCRYPTION_KEY bleiben alte Werte über
 * ENCRYPTION_KEY_PREVIOUS lesbar; dieser Aufruf schreibt sie dauerhaft um,
 * sodass der alte Schlüssel danach entfernt werden kann.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB nicht konfiguriert", 503);
    const user = await User.findById(session.userId);
    if (!user) return jsonError("Nutzer nicht gefunden", 404);

    let changed = 0;
    let failed = 0;

    for (const [id, value] of user.apiKeys.entries()) {
      try {
        const r = reencrypt(value);
        if (r.changed) {
          user.apiKeys.set(id, r.value);
          changed++;
        }
      } catch {
        failed++;
      }
    }
    for (const [provider, fields] of user.providerConfig.entries()) {
      const typed = fields as Map<string, string>;
      const updated = new Map<string, string>(typed);
      for (const [k, v] of typed.entries()) {
        try {
          const r = reencrypt(v);
          if (r.changed) {
            updated.set(k, r.value);
            changed++;
          }
        } catch {
          failed++;
        }
      }
      user.providerConfig.set(provider, updated);
    }
    await user.save();

    // Geteilte Team-Keys nur durch den Eigentümer erneuern
    let orgChanged = 0;
    if (user.orgId) {
      const org = await Org.findOne({ _id: user.orgId, ownerId: user._id });
      if (org) {
        for (const [id, value] of org.apiKeys.entries()) {
          try {
            const r = reencrypt(value);
            if (r.changed) {
              org.apiKeys.set(id, r.value);
              orgChanged++;
            }
          } catch {
            failed++;
          }
        }
        if (orgChanged) await org.save();
      }
    }

    log.info("Schlüsselwechsel durchgeführt", { userId: session.userId, changed, orgChanged, failed });
    return NextResponse.json({
      ok: true,
      changed,
      orgChanged,
      failed,
      previousKeyConfigured: keyRotationConfigured(),
      hinweis:
        failed > 0
          ? "Einige Werte ließen sich mit keinem bekannten Schlüssel entschlüsseln und bleiben unverändert. Sie müssen neu eingegeben werden."
          : "Alle Werte sind jetzt mit dem aktuellen Schlüssel verschlüsselt. ENCRYPTION_KEY_PREVIOUS kann entfernt werden.",
    });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
