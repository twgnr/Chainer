import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM-Verschlüsselung für gespeicherte API-Keys und Zugangsdaten.
 *
 * Der Schlüssel wird aus ENCRYPTION_KEY (ersatzweise AUTH_SECRET) abgeleitet.
 * Für einen Schlüsselwechsel kann der alte Wert in ENCRYPTION_KEY_PREVIOUS
 * stehen bleiben: Beim Entschlüsseln wird er als Rückfall genutzt, sodass
 * bestehende Daten lesbar bleiben, bis sie neu verschlüsselt wurden.
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function currentSecret(): string {
  const secret = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("ENCRYPTION_KEY oder AUTH_SECRET muss gesetzt sein");
  return secret;
}

/** Alle Schlüssel, mit denen entschlüsselt werden darf: erst der aktuelle, dann der alte. */
function decryptionSecrets(): string[] {
  const out = [currentSecret()];
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (previous && previous !== out[0]) out.push(previous);
  // Wurde von AUTH_SECRET auf einen eigenen ENCRYPTION_KEY gewechselt, ist
  // AUTH_SECRET der bisherige Schlüssel.
  const auth = process.env.AUTH_SECRET;
  if (auth && !out.includes(auth)) out.push(auth);
  return out;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(currentSecret()), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

function decryptWith(payload: string, secret: string): string {
  const [ivB, tagB, encB] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}

export function decrypt(payload: string): string {
  let last: unknown;
  for (const secret of decryptionSecrets()) {
    try {
      return decryptWith(payload, secret);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Entschlüsselung fehlgeschlagen");
}

/**
 * Prüft, ob ein Wert noch mit dem aktuellen Schlüssel verschlüsselt ist.
 * Wird für den Schlüsselwechsel gebraucht.
 */
export function isCurrentKey(payload: string): boolean {
  try {
    decryptWith(payload, currentSecret());
    return true;
  } catch {
    return false;
  }
}

/** Verschlüsselt einen Wert neu mit dem aktuellen Schlüssel. */
export function reencrypt(payload: string): { value: string; changed: boolean } {
  if (isCurrentKey(payload)) return { value: payload, changed: false };
  return { value: encrypt(decrypt(payload)), changed: true };
}

export function maskKey(k: string): string {
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

/** Ist ein Wechsel des Schlüssels konfiguriert? */
export function keyRotationConfigured(): boolean {
  return !!process.env.ENCRYPTION_KEY_PREVIOUS;
}
