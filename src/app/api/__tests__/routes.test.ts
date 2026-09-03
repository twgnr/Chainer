import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anmelden,
  BTC_ADDRESS,
  BTC_ADDRESS_2,
  BTC_TXID,
  datenbankVerfuegbar,
  defaultMockState,
  getRequest,
  jsonRequest,
  routeParams,
  uniqueIp,
  type MockState,
} from "./helpers";

/**
 * Integrationstests der API-Routen.
 *
 * Die Route-Handler werden direkt mit einem `Request` aufgerufen. Alles, was
 * sonst ins Netz oder in eine Datenbank ginge, ist durch Ersatzmodule ersetzt;
 * geprüft werden Validierung, Berechtigungen, Fehlercodes und die Form der
 * Antworten.
 */

/** Gemeinsamer Zustand aller Ersatzmodule (vor den Importen angelegt). */
const state = vi.hoisted(() => ({}) as MockState);

vi.mock("@/lib/auth", async () => (await import("./helpers")).authMock(state));
vi.mock("@/lib/db", async () => (await import("./helpers")).dbMock(state));
vi.mock("@/lib/providers/registry", async () => (await import("./helpers")).registryMock(state));
vi.mock("@/lib/providers/price", async () => (await import("./helpers")).priceMock(state));
vi.mock("@/lib/providers/lightning", async () => (await import("./helpers")).lightningMock(state));
vi.mock("@/lib/trace/engine", async () => (await import("./helpers")).engineMock(state));
vi.mock("@/lib/trace/path", async () => (await import("./helpers")).pathMock(state));
vi.mock("@/lib/trace/inflow", async () => (await import("./helpers")).inflowMock(state));
vi.mock("@/lib/trace/mixer", async () => (await import("./helpers")).mixerMock(state));
vi.mock("@/lib/trace/crosschain", async () => (await import("./helpers")).crosschainMock(state));
vi.mock("@/lib/watch", async () => (await import("./helpers")).watchMock(state));
vi.mock("@/lib/caseRefresh", async () => (await import("./helpers")).caseRefreshMock(state));
vi.mock("@/lib/jobs", async () => (await import("./helpers")).jobsMock(state));
vi.mock("@/lib/cache", async () => (await import("./helpers")).cacheMock());

/** Antwortkörper als Objekt mit unbekannten Feldern */
type Body = Record<string, unknown>;

async function body(res: Response): Promise<Body> {
  return (await res.json()) as Body;
}

const gemerkteUmgebung = new Map<string, string | undefined>();

/** Setzt eine Umgebungsvariable und merkt sich den alten Wert. */
function setzeEnv(name: string, wert: string | undefined): void {
  if (!gemerkteUmgebung.has(name)) gemerkteUmgebung.set(name, process.env[name]);
  if (wert === undefined) delete process.env[name];
  else process.env[name] = wert;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(state, defaultMockState());
});

afterEach(() => {
  for (const [name, wert] of gemerkteUmgebung) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
  gemerkteUmgebung.clear();
});

/* ================= Validierung und Fehlercodes ================= */

describe("POST /api/trace", () => {
  it("antwortet auf einen leeren Rumpf mit 400 und deutscher Meldung", async () => {
    const { POST } = await import("@/app/api/trace/route");
    const res = await POST(jsonRequest("http://test/api/trace"));
    expect(res.status).toBe(400);
    expect(String((await body(res)).error)).toContain("Invalid parameters");
  });

  it("lehnt einen Startwert ab, der zur Chain nicht passt", async () => {
    const { POST } = await import("@/app/api/trace/route");
    // Bitcoin-Adresse, aber als Ethereum-Anfrage
    const res = await POST(jsonRequest("http://test/api/trace", { start: BTC_ADDRESS, chain: "ethereum" }));
    expect(res.status).toBe(400);
    expect(String((await body(res)).error)).toContain("is not a valid address or transaction ID");
  });

  it("liefert bei gültigen Parametern 200 und die erwarteten Felder", async () => {
    const { POST } = await import("@/app/api/trace/route");
    const res = await POST(jsonRequest("http://test/api/trace", { start: BTC_ADDRESS, chain: "bitcoin", maxDepth: 2 }));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b).toHaveProperty("nodes");
    expect(b).toHaveProperty("edges");
    expect(b).toHaveProperty("stats");
    expect(b).toHaveProperty("clusters");
    expect(Array.isArray(b.nodes)).toBe(true);
  });

  it("hängt bei evidence=true den Nachweis an", async () => {
    const { POST } = await import("@/app/api/trace/route");
    const res = await POST(jsonRequest("http://test/api/trace", { start: BTC_ADDRESS, evidence: true }));
    expect(res.status).toBe(200);
    expect(await body(res)).toHaveProperty("evidence");
  });
});

describe("POST /api/path", () => {
  it("lehnt identische Start- und Zieladresse ab", async () => {
    const { POST } = await import("@/app/api/path/route");
    const res = await POST(jsonRequest("http://test/api/path", { from: BTC_ADDRESS, to: BTC_ADDRESS }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("The start and destination address are the same");
  });

  it("lehnt eine ungültige Adresse ab", async () => {
    const { POST } = await import("@/app/api/path/route");
    const res = await POST(jsonRequest("http://test/api/path", { from: "keineadresse123", to: BTC_ADDRESS_2 }));
    expect(res.status).toBe(400);
    expect(String((await body(res)).error)).toContain("is not a valid bitcoin address");
  });

  it("liefert bei zwei gültigen Adressen 200 mit Wegen und Graph", async () => {
    const { POST } = await import("@/app/api/path/route");
    const res = await POST(jsonRequest("http://test/api/path", { from: BTC_ADDRESS, to: BTC_ADDRESS_2 }));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b).toHaveProperty("paths");
    expect(b).toHaveProperty("graph");
    expect(b.found).toBe(false);
  });
});

describe("POST /api/screen", () => {
  it("lehnt mehr als 200 Adressen ab", async () => {
    const { POST } = await import("@/app/api/screen/route");
    const adressen = Array.from({ length: 201 }, (_, i) => `adresse-${i}`);
    const res = await POST(jsonRequest("http://test/api/screen", { addresses: adressen }));
    expect(res.status).toBe(400);
    expect(String((await body(res)).error)).toContain("Too many addresses");
  });

  it("beantwortet eine leere Liste mit einer verständlichen Meldung", async () => {
    const { POST } = await import("@/app/api/screen/route");
    const res = await POST(jsonRequest("http://test/api/screen", { addresses: [] }));
    expect(res.status).toBe(400);
    expect(String((await body(res)).error)).toContain("mindestens eine Adresse angeben");
  });

  it("meldet eine Liste aus lauter Leerzeichen als „keine Adressen gefunden“", async () => {
    const { POST } = await import("@/app/api/screen/route");
    const res = await POST(jsonRequest("http://test/api/screen", { addresses: ["  ", ""] }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("No addresses found");
  });

  it("führt ungültige Adressen als valid:false statt als Fehler", async () => {
    const { POST } = await import("@/app/api/screen/route");
    const res = await POST(jsonRequest("http://test/api/screen", { addresses: [BTC_ADDRESS, "voelligerunsinn"] }));
    expect(res.status).toBe(200);
    const b = await body(res);
    const ergebnisse = b.results as { address: string; valid: boolean; reason?: string }[];
    expect(ergebnisse).toHaveLength(2);
    expect(ergebnisse[0].valid).toBe(true);
    expect(ergebnisse[1].valid).toBe(false);
    expect(String(ergebnisse[1].reason)).toContain("keine gültige Adresse");
    expect(b.summary).toMatchObject({ total: 2, checked: 1, invalid: 1, errors: 0 });
  });
});

describe("GET /api/address/{addr}", () => {
  it("lehnt eine unsinnige Adresse mit 400 ab", async () => {
    const { GET } = await import("@/app/api/address/[addr]/route");
    const res = await GET(getRequest("http://test/api/address/unsinn"), routeParams({ addr: "unsinn" }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Not a valid bitcoin address");
  });

  it("liefert bei einer gültigen Adresse 200 mit info, txs und labels", async () => {
    const { GET } = await import("@/app/api/address/[addr]/route");
    const res = await GET(
      getRequest(`http://test/api/address/${BTC_ADDRESS}`),
      routeParams({ addr: BTC_ADDRESS }),
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b).toHaveProperty("info");
    expect(b).toHaveProperty("txs");
    expect(b).toHaveProperty("labels");
    expect(b.chain).toBe("bitcoin");
    expect((b.info as { address: string }).address).toBe(BTC_ADDRESS);
  });
});

describe("GET /api/tx/{txid}", () => {
  it("lehnt eine ungültige Transaktions-ID mit 400 ab", async () => {
    const { GET } = await import("@/app/api/tx/[txid]/route");
    const res = await GET(getRequest("http://test/api/tx/abc"), routeParams({ txid: "abc" }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Not a valid transaction ID");
  });

  it("liefert bei gültiger ID 200 mit der Transaktion", async () => {
    const { GET } = await import("@/app/api/tx/[txid]/route");
    const res = await GET(getRequest(`http://test/api/tx/${BTC_TXID}`), routeParams({ txid: BTC_TXID }));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect((b.tx as { txid: string }).txid).toBe(BTC_TXID);
    expect(b).toHaveProperty("lightning");
  });
});

describe("POST /api/mixer", () => {
  it("lehnt fehlende Pflichtfelder mit 400 ab", async () => {
    const { POST } = await import("@/app/api/mixer/route");
    const res = await POST(jsonRequest("http://test/api/mixer", {}));
    expect(res.status).toBe(400);
    expect(String((await body(res)).error)).toContain("Invalid parameters");
  });

  it("lehnt eine ungültige Mixer-Adresse ab", async () => {
    const { POST } = await import("@/app/api/mixer/route");
    const res = await POST(
      jsonRequest("http://test/api/mixer", {
        mixerAddress: "keineadresse123",
        amountSat: 100000,
        afterTime: 1_700_000_000,
      }),
    );
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Not a valid bitcoin address");
  });
});

describe("POST /api/crosschain", () => {
  it("lehnt fehlende Pflichtfelder mit 400 ab", async () => {
    const { POST } = await import("@/app/api/crosschain/route");
    const res = await POST(jsonRequest("http://test/api/crosschain", {}));
    expect(res.status).toBe(400);
    expect(String((await body(res)).error)).toContain("Invalid parameters");
  });

  it("lehnt gleiche Ausgangs- und Zielkette ab", async () => {
    const { POST } = await import("@/app/api/crosschain/route");
    const res = await POST(
      jsonRequest("http://test/api/crosschain", {
        fromChain: "bitcoin",
        toChain: "bitcoin",
        amountSat: 100000,
        atTime: 1_700_000_000,
        candidateAddress: BTC_ADDRESS,
      }),
    );
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("The source and destination chain are the same");
  });
});

/* ================= Berechtigungen ================= */

describe("Berechtigungen ohne Anmeldung", () => {
  it("GET /api/cases liefert 401", async () => {
    const { GET } = await import("@/app/api/cases/route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await body(res)).error).toBe("Not signed in");
  });

  it("POST /api/cases liefert 401", async () => {
    const { POST } = await import("@/app/api/cases/route");
    const res = await POST(jsonRequest("http://test/api/cases", { name: "Fall", start: BTC_ADDRESS }));
    expect(res.status).toBe(401);
  });

  it("GET /api/annotations liefert 401", async () => {
    const { GET } = await import("@/app/api/annotations/route");
    const res = await GET(getRequest("http://test/api/annotations"));
    expect(res.status).toBe(401);
  });

  it("POST /api/annotations liefert 401", async () => {
    const { POST } = await import("@/app/api/annotations/route");
    const res = await POST(jsonRequest("http://test/api/annotations", { address: BTC_ADDRESS, label: "Test" }));
    expect(res.status).toBe(401);
  });

  it("GET /api/watch liefert 401", async () => {
    const { GET } = await import("@/app/api/watch/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET /api/jobs liefert 401", async () => {
    const { GET } = await import("@/app/api/jobs/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST /api/jobs liefert 401", async () => {
    const { POST } = await import("@/app/api/jobs/route");
    const res = await POST(jsonRequest("http://test/api/jobs", { type: "trace", params: { start: BTC_ADDRESS } }));
    expect(res.status).toBe(401);
  });

  it("GET /api/tokens liefert 401", async () => {
    const { GET } = await import("@/app/api/tokens/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET /api/org liefert 401", async () => {
    const { GET } = await import("@/app/api/org/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("Angemeldet, aber ohne Datenbank", () => {
  beforeEach(() => {
    anmelden(state);
    datenbankVerfuegbar(state, false);
  });

  it("POST /api/cases liefert 503", async () => {
    const { POST } = await import("@/app/api/cases/route");
    const res = await POST(jsonRequest("http://test/api/cases", { name: "Fall", start: BTC_ADDRESS }));
    expect(res.status).toBe(503);
    expect((await body(res)).error).toBe("MongoDB is not configured");
  });

  it("POST /api/annotations liefert 503", async () => {
    const { POST } = await import("@/app/api/annotations/route");
    const res = await POST(jsonRequest("http://test/api/annotations", { address: BTC_ADDRESS, label: "Test" }));
    expect(res.status).toBe(503);
  });

  it("POST /api/watch liefert 503", async () => {
    const { POST } = await import("@/app/api/watch/route");
    const res = await POST(jsonRequest("http://test/api/watch", { address: BTC_ADDRESS, chain: "bitcoin" }));
    expect(res.status).toBe(503);
  });

  it("GET /api/jobs liefert 503", async () => {
    const { GET } = await import("@/app/api/jobs/route");
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("GET /api/tokens liefert 503", async () => {
    const { GET } = await import("@/app/api/tokens/route");
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("POST /api/watch weist eine ungültige Adresse schon vor der Datenbank ab", async () => {
    const { POST } = await import("@/app/api/watch/route");
    const res = await POST(jsonRequest("http://test/api/watch", { address: "keineadresse123" }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Not a valid bitcoin address");
  });
});

describe("Cron-Endpunkte", () => {
  it("POST /api/watch/check akzeptiert das Cron-Geheimnis ohne Sitzung", async () => {
    setzeEnv("CRON_SECRET", "geheim-123");
    const { POST } = await import("@/app/api/watch/check/route");
    const res = await POST(
      jsonRequest("http://test/api/watch/check", undefined, { headers: { authorization: "Bearer geheim-123" } }),
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ checked: 0, changed: 0 });
  });

  it("POST /api/watch/check liefert ohne Sitzung und ohne Geheimnis 401", async () => {
    setzeEnv("CRON_SECRET", undefined);
    const { POST } = await import("@/app/api/watch/check/route");
    const res = await POST(jsonRequest("http://test/api/watch/check"));
    expect(res.status).toBe(401);
    expect((await body(res)).error).toBe("Not signed in");
  });

  it("POST /api/watch/check lehnt ein falsches Geheimnis ab", async () => {
    setzeEnv("CRON_SECRET", "geheim-123");
    const { POST } = await import("@/app/api/watch/check/route");
    const res = await POST(
      jsonRequest("http://test/api/watch/check", undefined, { headers: { authorization: "Bearer falsch" } }),
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/cases/refresh akzeptiert das Cron-Geheimnis ohne Sitzung", async () => {
    setzeEnv("CRON_SECRET", "geheim-123");
    const { POST } = await import("@/app/api/cases/refresh/route");
    const res = await POST(
      jsonRequest("http://test/api/cases/refresh", undefined, { headers: { authorization: "Bearer geheim-123" } }),
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ checked: 0, refreshed: 0 });
  });

  it("POST /api/cases/refresh liefert ohne Sitzung und ohne Geheimnis 401", async () => {
    setzeEnv("CRON_SECRET", undefined);
    const { POST } = await import("@/app/api/cases/refresh/route");
    const res = await POST(jsonRequest("http://test/api/cases/refresh"));
    expect(res.status).toBe(401);
  });

  it("POST /api/cases/refresh läuft auch für einen angemeldeten Nutzer", async () => {
    setzeEnv("CRON_SECRET", undefined);
    anmelden(state);
    const { POST } = await import("@/app/api/cases/refresh/route");
    const res = await POST(jsonRequest("http://test/api/cases/refresh"));
    expect(res.status).toBe(200);
  });
});

/* ================= Rate-Limit ================= */

describe("Rate-Limit", () => {
  it("antwortet nach dem Überschreiten der Grenze mit 429 und den passenden Kopfzeilen", async () => {
    setzeEnv("RATE_LIMIT_DISABLED", undefined);
    const { POST } = await import("@/app/api/path/route");
    const ip = uniqueIp();
    const rufe = () => POST(jsonRequest("http://test/api/path", { from: BTC_ADDRESS, to: BTC_ADDRESS_2 }, { ip }));

    let letzte: Response | null = null;
    // Grenze für /api/path: 10 Anfragen pro Minute
    for (let i = 0; i < 11; i++) letzte = await rufe();

    expect(letzte).not.toBeNull();
    const res = letzte as Response;
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(String((await body(res)).error)).toContain("Zu viele Anfragen");
  });

  it("trennt die Absender über x-forwarded-for", async () => {
    setzeEnv("RATE_LIMIT_DISABLED", undefined);
    const { POST } = await import("@/app/api/path/route");
    const ipA = uniqueIp();
    for (let i = 0; i < 11; i++) {
      await POST(jsonRequest("http://test/api/path", { from: BTC_ADDRESS, to: BTC_ADDRESS_2 }, { ip: ipA }));
    }
    // Ein anderer Absender hat sein eigenes Kontingent
    const res = await POST(
      jsonRequest("http://test/api/path", { from: BTC_ADDRESS, to: BTC_ADDRESS_2 }, { ip: uniqueIp() }),
    );
    expect(res.status).toBe(200);
  });

  it("schaltet das Limit mit RATE_LIMIT_DISABLED=true ab", async () => {
    setzeEnv("RATE_LIMIT_DISABLED", "true");
    const { POST } = await import("@/app/api/path/route");
    const ip = uniqueIp();
    for (let i = 0; i < 15; i++) {
      const res = await POST(jsonRequest("http://test/api/path", { from: BTC_ADDRESS, to: BTC_ADDRESS_2 }, { ip }));
      expect(res.status).toBe(200);
    }
  });
});

/* ================= Offene Endpunkte ================= */

describe("Offene Endpunkte", () => {
  it("GET /api/health liefert 200 mit status, database und providers", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.status).toBe("ok");
    expect(b).toHaveProperty("database");
    expect(b).toHaveProperty("providers");
    expect(b.database).toMatchObject({ configured: false, connected: null });
  });

  it("GET /api/openapi liefert ein Dokument nach OpenAPI 3", async () => {
    const { GET } = await import("@/app/api/openapi/route");
    const res = await GET(getRequest("http://test/api/openapi"));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(String(b.openapi).startsWith("3.")).toBe(true);
    expect(Object.keys(b.paths as Record<string, unknown>).length).toBeGreaterThan(0);
    expect(b.paths).toHaveProperty("/api/trace");
  });

  it("GET /api/price liefert den Kurs", async () => {
    const { GET } = await import("@/app/api/price/route");
    const res = await GET(getRequest("http://test/api/price"));
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ chain: "bitcoin", eur: 50_000 });
  });

  it("GET /api/price liefert bei from/to eine Kursreihe", async () => {
    const { GET } = await import("@/app/api/price/route");
    const res = await GET(getRequest("http://test/api/price?from=1700000000&to=1700003600"));
    expect(res.status).toBe(200);
    expect(Array.isArray((await body(res)).series)).toBe(true);
  });

  it("GET /api/providers liefert die Quellen als Liste", async () => {
    const { GET } = await import("@/app/api/providers/route");
    const res = await GET(getRequest("http://test/api/providers"));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(Array.isArray(b.providers)).toBe(true);
    expect((b.providers as { id: string }[])[0].id).toBe("mempool");
    expect(Array.isArray(b.chains)).toBe(true);
  });
});
