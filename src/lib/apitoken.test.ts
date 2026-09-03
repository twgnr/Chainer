import { describe, expect, it } from "vitest";
import { hashToken, isTokenScope, tokenFromHeaderValues, tokenFromRequest, TOKEN_PREFIX } from "@/lib/apitoken";

/**
 * Zugriffstoken für Skripte.
 *
 * Geprüft werden die Teile, die ohne Datenbank auskommen: der Hashwert (nur er
 * wird gespeichert), die Rechteprüfung und das Herauslesen des Tokens aus den
 * Kopfzeilen. Gerade Letzteres entscheidet über den Zugang und darf nichts
 * durchlassen, was nicht wie ein Token aussieht.
 */

const TOKEN = `${TOKEN_PREFIX}0123456789abcdef0123456789abcdef01234567`;

describe("hashToken", () => {
  it("ist stabil und für verschiedene Token verschieden", () => {
    expect(hashToken(TOKEN)).toBe(hashToken(TOKEN));
    expect(hashToken(TOKEN)).not.toBe(hashToken(`${TOKEN}x`));
  });

  it("liefert einen SHA-256-Hexwert und nie das Token selbst", () => {
    const h = hashToken(TOKEN);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(TOKEN);
  });
});

describe("isTokenScope", () => {
  it("erkennt die vergebenen Rechte", () => {
    for (const s of ["read", "trace", "write"]) expect(isTokenScope(s)).toBe(true);
  });

  it("weist alles andere ab", () => {
    for (const s of ["admin", "", "READ", null, undefined, 42, {}]) expect(isTokenScope(s)).toBe(false);
  });
});

describe("tokenFromHeaderValues", () => {
  it("liest das Token aus dem Authorization-Kopf", () => {
    expect(tokenFromHeaderValues(`Bearer ${TOKEN}`, null)).toBe(TOKEN);
  });

  it("nimmt Bearer in beliebiger Schreibweise und mit Leerraum", () => {
    expect(tokenFromHeaderValues(`bearer   ${TOKEN}`, null)).toBe(TOKEN);
    expect(tokenFromHeaderValues(`  BEARER ${TOKEN}  `, null)).toBe(TOKEN);
  });

  it("liest das Token ersatzweise aus X-API-Key", () => {
    expect(tokenFromHeaderValues(null, TOKEN)).toBe(TOKEN);
    expect(tokenFromHeaderValues(null, `  ${TOKEN}  `)).toBe(TOKEN);
  });

  it("bevorzugt den Authorization-Kopf", () => {
    const other = `${TOKEN_PREFIX}ffffffffffffffffffffffffffffffffffffffff`;
    expect(tokenFromHeaderValues(`Bearer ${TOKEN}`, other)).toBe(TOKEN);
  });

  it("weist alles ohne das erwartete Präfix ab", () => {
    // Ein fremdes Bearer-Token (etwa ein JWT) darf hier nicht durchrutschen.
    expect(tokenFromHeaderValues("Bearer eyJhbGciOiJIUzI1NiJ9.abc.def", null)).toBeNull();
    expect(tokenFromHeaderValues(null, "sk-live-geheim")).toBeNull();
    expect(tokenFromHeaderValues("Basic dXNlcjpwYXNz", null)).toBeNull();
    expect(tokenFromHeaderValues(TOKEN, null)).toBeNull(); // ohne "Bearer"
  });

  it("kommt mit fehlenden Kopfzeilen zurecht", () => {
    expect(tokenFromHeaderValues(null, null)).toBeNull();
    expect(tokenFromHeaderValues("", "")).toBeNull();
    expect(tokenFromHeaderValues("Bearer", null)).toBeNull();
    expect(tokenFromHeaderValues("Bearer ", null)).toBeNull();
  });
});

describe("tokenFromRequest", () => {
  it("liest beide Kopfzeilen einer echten Anfrage", () => {
    const auth = new Request("http://test/", { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(tokenFromRequest(auth)).toBe(TOKEN);

    const key = new Request("http://test/", { headers: { "x-api-key": TOKEN } });
    expect(tokenFromRequest(key)).toBe(TOKEN);

    expect(tokenFromRequest(new Request("http://test/"))).toBeNull();
  });
});
