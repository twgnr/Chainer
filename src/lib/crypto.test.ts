import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, isCurrentKey, keyRotationConfigured, maskKey, reencrypt } from "@/lib/crypto";

/**
 * Verschlüsselung der gespeicherten Zugangsdaten.
 *
 * Wichtig ist vor allem der Schlüsselwechsel: Werte, die mit dem alten
 * Schlüssel verschlüsselt wurden, müssen lesbar bleiben, solange dieser in
 * `ENCRYPTION_KEY_PREVIOUS` steht — sonst sind alle hinterlegten API-Keys der
 * Nutzer beim nächsten Wechsel verloren.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.ENCRYPTION_KEY = "schlüssel-eins-für-die-tests";
  delete process.env.ENCRYPTION_KEY_PREVIOUS;
  delete process.env.AUTH_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("encrypt / decrypt", () => {
  it("stellt den Klartext wieder her", () => {
    const plain = "geheimer-api-key-123";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("erzeugt bei jedem Aufruf einen anderen Chiffretext", () => {
    // Der Initialisierungsvektor ist zufällig; gleiche Eingabe darf nicht
    // zweimal dasselbe ergeben, sonst wären Gleichheiten ablesbar.
    const a = encrypt("gleicher wert");
    const b = encrypt("gleicher wert");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("kommt mit Umlauten und leerem Text zurecht", () => {
    for (const v of ["", "äöüß", "a".repeat(1000), "🔑 emoji"]) {
      expect(decrypt(encrypt(v))).toBe(v);
    }
  });

  it("weist einen veränderten Chiffretext ab", () => {
    // AES-GCM ist authentifiziert: eine Änderung muss auffallen.
    const payload = encrypt("unverfälscht");
    const [iv, tag, data] = payload.split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => decrypt([iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });

  it("weist einen fremden Schlüssel ab", () => {
    const payload = encrypt("nur mit dem richtigen Schlüssel");
    process.env.ENCRYPTION_KEY = "ein ganz anderer Schlüssel";
    expect(() => decrypt(payload)).toThrow();
  });

  it("verlangt überhaupt einen Schlüssel", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
  });
});

describe("Schlüsselwechsel", () => {
  it("liest Werte des alten Schlüssels weiter, solange er hinterlegt ist", () => {
    const payload = encrypt("alter bestand");
    process.env.ENCRYPTION_KEY = "der neue Schlüssel";
    process.env.ENCRYPTION_KEY_PREVIOUS = "schlüssel-eins-für-die-tests";
    expect(decrypt(payload)).toBe("alter bestand");
  });

  it("fällt auf AUTH_SECRET zurück, wenn erst später ein ENCRYPTION_KEY kam", () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.AUTH_SECRET = "früher nur das Sitzungsgeheimnis";
    const payload = encrypt("vor der Umstellung");

    process.env.ENCRYPTION_KEY = "jetzt ein eigener Schlüssel";
    expect(decrypt(payload)).toBe("vor der Umstellung");
  });

  it("erkennt, ob ein Wert schon dem aktuellen Schlüssel gehört", () => {
    const payload = encrypt("aktuell");
    expect(isCurrentKey(payload)).toBe(true);
    process.env.ENCRYPTION_KEY = "neuer Schlüssel";
    process.env.ENCRYPTION_KEY_PREVIOUS = "schlüssel-eins-für-die-tests";
    expect(isCurrentKey(payload)).toBe(false);
  });

  it("verschlüsselt nur das neu, was noch am alten Schlüssel hängt", () => {
    const alt = encrypt("wert aus der alten Zeit");
    process.env.ENCRYPTION_KEY = "neuer Schlüssel";
    process.env.ENCRYPTION_KEY_PREVIOUS = "schlüssel-eins-für-die-tests";

    const ersterLauf = reencrypt(alt);
    expect(ersterLauf.changed).toBe(true);
    expect(decrypt(ersterLauf.value)).toBe("wert aus der alten Zeit");
    expect(isCurrentKey(ersterLauf.value)).toBe(true);

    // Ein zweiter Lauf darf nichts mehr anfassen.
    const zweiterLauf = reencrypt(ersterLauf.value);
    expect(zweiterLauf.changed).toBe(false);
    expect(zweiterLauf.value).toBe(ersterLauf.value);
  });

  it("meldet, ob ein Wechsel überhaupt konfiguriert ist", () => {
    expect(keyRotationConfigured()).toBe(false);
    process.env.ENCRYPTION_KEY_PREVIOUS = "alt";
    expect(keyRotationConfigured()).toBe(true);
  });
});

describe("maskKey", () => {
  it("zeigt nur Anfang und Ende", () => {
    expect(maskKey("abcdefghijklmnop")).toBe("abcd…mnop");
  });

  it("verrät bei kurzen Werten gar nichts", () => {
    expect(maskKey("kurz")).toBe("••••");
    expect(maskKey("12345678")).toBe("••••");
  });
});
