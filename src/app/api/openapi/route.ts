import { NextResponse } from "next/server";
import { CHAIN_LIST } from "@/lib/chains";
import { RULES } from "@/lib/ratelimit";

/**
 * Maschinenlesbare Schnittstellenbeschreibung nach OpenAPI 3.1.
 *
 * Sie beschreibt die öffentlichen Endpunkte grob (Parameter, Anfrage- und Antwortform)
 * und ist bewusst ohne vollständige Schemata gehalten – die Antworten enthalten je nach
 * Datenquelle unterschiedlich viele Felder.
 */

const chainIds = CHAIN_LIST.map((c) => c.id);

/** Freies Objekt ohne festgelegte Felder */
const freiesObjekt = { type: "object", additionalProperties: true };

function jsonBody(schema: Record<string, unknown>, example?: Record<string, unknown>) {
  return {
    required: true,
    content: { "application/json": { schema, ...(example ? { example } : {}) } },
  };
}

function ok(description: string, schema: Record<string, unknown> = { ...freiesObjekt }) {
  return { description, content: { "application/json": { schema } } };
}

const fehlerAntwort = {
  description: "Fehler mit deutschsprachiger Meldung im Feld „error“",
  content: {
    "application/json": {
      schema: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
    },
  },
};

const zuVieleAnfragen = { description: "Ratenbegrenzung überschritten (Kopfzeile „Retry-After“ beachten)" };

const chainParam = {
  name: "chain",
  in: "query",
  required: false,
  description: "Blockchain der Abfrage. Ohne Angabe wird Bitcoin verwendet.",
  schema: { type: "string", enum: chainIds, default: "bitcoin" },
};

const traceRequest = {
  type: "object",
  required: ["start"],
  properties: {
    start: { type: "string", description: "Startadresse oder Transaktions-ID" },
    chain: { type: "string", enum: chainIds, default: "bitcoin", description: "Blockchain" },
    mode: { type: "string", enum: ["address", "utxo"], description: "Adress- oder UTXO-Sicht" },
    direction: {
      type: "string",
      enum: ["forward", "backward", "both"],
      description: "Verfolgung vorwärts (Abflüsse), rückwärts (Herkunft) oder beides",
    },
    taintModel: {
      type: "string",
      enum: ["none", "haircut", "poison", "fifo"],
      description: "Verfahren zur Verteilung der Verschmutzung auf die Ausgänge",
    },
    maxDepth: { type: "integer", minimum: 1, maximum: 8, description: "Anzahl der verfolgten Ebenen" },
    maxTxPerAddress: { type: "integer", minimum: 1, maximum: 50, description: "Transaktionen je Adresse" },
    maxAddrPerTx: { type: "integer", minimum: 1, maximum: 50, description: "Adressen je Transaktion" },
    minValueSat: { type: "integer", minimum: 0, description: "Mindestbetrag in der kleinsten Einheit" },
    maxNodes: { type: "integer", minimum: 10, maximum: 2000, description: "Obergrenze für Knoten im Graph" },
    enrich: { type: "boolean", description: "Labels und Risikoeinstufung mitladen" },
    historicPrices: { type: "boolean", description: "Historische Kurse zu den Zeitpunkten laden" },
    lightning: { type: "boolean", description: "Lightning-Kanäle erkennen" },
    includeMediumRisk: { type: "boolean", description: "Auch mittleres Risiko als Treffer werten" },
    merges: {
      type: "array",
      description: "Manuell zusammengeführte Adress-Cluster",
      items: { type: "array", items: { type: "string" } },
    },
  },
};

const traceBeispiel = { start: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", chain: "bitcoin", maxDepth: 2 };

function bauePfade(mitJobs: boolean): Record<string, unknown> {
  const paths: Record<string, unknown> = {
    "/api/address/{addr}": {
      get: {
        tags: ["Abfragen"],
        summary: "Adresse abfragen",
        description:
          "Liefert Saldo und Kennzahlen der Adresse, die jüngsten Transaktionen, gefundene Labels, die Einstufung der Adresse selbst sowie eine Bewertung der direkten Zuflüsse.",
        parameters: [
          {
            name: "addr",
            in: "path",
            required: true,
            description: "Adresse der gewählten Chain",
            schema: { type: "string" },
          },
          chainParam,
          {
            name: "limit",
            in: "query",
            description: "Anzahl der Transaktionen (höchstens 100).",
            schema: { type: "integer", default: 50, maximum: 100 },
          },
          {
            name: "provider",
            in: "query",
            description: "Bevorzugte Datenquelle, etwa „mempool“ oder „blockchair“.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": ok("Adressdaten mit Transaktionen, Labels und Zuflussbewertung"),
          "400": fehlerAntwort,
          "429": zuVieleAnfragen,
          "502": fehlerAntwort,
        },
      },
    },
    "/api/tx/{txid}": {
      get: {
        tags: ["Abfragen"],
        summary: "Transaktion abfragen",
        description:
          "Liefert eine einzelne Transaktion mit Ein- und Ausgängen sowie Hinweisen auf Lightning-Kanäle.",
        parameters: [
          { name: "txid", in: "path", required: true, description: "Transaktions-ID", schema: { type: "string" } },
          chainParam,
          { name: "provider", in: "query", description: "Bevorzugte Datenquelle", schema: { type: "string" } },
        ],
        responses: {
          "200": ok("Transaktionsdaten"),
          "400": fehlerAntwort,
          "429": zuVieleAnfragen,
          "502": fehlerAntwort,
        },
      },
    },
    "/api/trace": {
      post: {
        tags: ["Verfolgung"],
        summary: "Geldfluss verfolgen",
        description:
          "Verfolgt den Geldfluss ab einer Adresse oder Transaktion und liefert den vollständigen Graphen aus Knoten und Kanten samt Statistik. Der Aufruf kann mehrere Minuten dauern.",
        requestBody: jsonBody({ ...traceRequest }, traceBeispiel),
        responses: {
          "200": ok("Graph mit „nodes“, „edges“, „stats“ und Warnungen"),
          "400": fehlerAntwort,
          "429": zuVieleAnfragen,
          "502": fehlerAntwort,
        },
      },
    },
    "/api/trace/stream": {
      post: {
        tags: ["Verfolgung"],
        summary: "Geldfluss verfolgen (Datenstrom)",
        description:
          'Wie /api/trace, sendet aber zeilenweise JSON (NDJSON) mit Zwischenständen. Jede Zeile enthält ein Feld „phase“; die letzte Zeile hat phase="done" und trägt das vollständige Ergebnis unter „result“.',
        requestBody: jsonBody({ ...traceRequest }, traceBeispiel),
        responses: {
          "200": {
            description: "Zeilenweise JSON-Objekte (application/x-ndjson)",
            content: { "application/x-ndjson": { schema: { type: "string" } } },
          },
          "400": fehlerAntwort,
          "429": zuVieleAnfragen,
        },
      },
    },
    "/api/path": {
      post: {
        tags: ["Verfolgung"],
        summary: "Verbindung zwischen zwei Adressen suchen",
        description: "Sucht mit einer beidseitigen Breitensuche Wege zwischen zwei Adressen derselben Chain.",
        requestBody: jsonBody(
          {
            type: "object",
            required: ["from", "to"],
            properties: {
              from: { type: "string", description: "Startadresse" },
              to: { type: "string", description: "Zieladresse" },
              chain: { type: "string", enum: ["bitcoin", "litecoin", "dogecoin", "bitcoin-cash", "ethereum"] },
              maxDepth: { type: "integer", minimum: 1, maximum: 5, description: "Suchtiefe je Richtung" },
              maxTxPerAddress: { type: "integer", minimum: 1, maximum: 30 },
              maxAddrPerTx: { type: "integer", minimum: 1, maximum: 30 },
              minValueSat: { type: "integer", minimum: 0 },
              maxApiCalls: { type: "integer", minimum: 10, maximum: 500, description: "Obergrenze für Abfragen" },
              maxPaths: { type: "integer", minimum: 1, maximum: 20, description: "Höchstzahl gefundener Wege" },
              directed: { type: "boolean", description: "Nur in Flussrichtung suchen" },
              skipHubs: { type: "boolean", description: "Sehr große Adressen (Börsen) überspringen" },
              enrich: { type: "boolean", description: "Labels mitladen" },
            },
          },
          {
            from: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
            to: "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97",
            chain: "bitcoin",
            maxDepth: 3,
          },
        ),
        responses: {
          "200": ok("Gefundene Wege mit Zwischenstationen"),
          "400": fehlerAntwort,
          "429": zuVieleAnfragen,
          "502": fehlerAntwort,
        },
      },
    },
    "/api/screen": {
      post: {
        tags: ["Prüfung"],
        summary: "Adressen in einem Durchgang prüfen",
        description:
          "Prüft bis zu 200 Adressen gegen die hinterlegten Label- und Meldelisten und liefert je Adresse ein Urteil sowie eine Zusammenfassung.",
        requestBody: jsonBody(
          {
            type: "object",
            required: ["addresses"],
            properties: {
              addresses: {
                type: "array",
                items: { type: "string" },
                maxItems: 200,
                description: "Zu prüfende Adressen",
              },
              chain: { type: "string", enum: ["bitcoin", "litecoin", "dogecoin", "bitcoin-cash", "ethereum"] },
              includeMedium: { type: "boolean", description: "Auch mittleres Risiko als Treffer werten" },
              withBalance: { type: "boolean", description: "Zusätzlich Saldo und Anzahl Transaktionen laden" },
            },
          },
          { addresses: ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"], chain: "bitcoin", withBalance: true },
        ),
        responses: {
          "200": ok("Ergebnisliste und Zusammenfassung"),
          "400": fehlerAntwort,
          "429": zuVieleAnfragen,
        },
      },
    },
    "/api/providers": {
      get: {
        tags: ["Betrieb"],
        summary: "Datenquellen und Chains auflisten",
        description:
          "Zeigt alle Datenquellen mit Schlüsselbedarf und Verfügbarkeit sowie die unterstützten Chains und den Zwischenspeicher.",
        parameters: [
          chainParam,
          {
            name: "ping",
            in: "query",
            description: "Mit „1“ werden die Quellen aktiv angefragt (langsam, eigenes Limit).",
            schema: { type: "string", enum: ["1"] },
          },
        ],
        responses: { "200": ok("Liste der Datenquellen"), "429": zuVieleAnfragen },
      },
    },
    "/api/price": {
      get: {
        tags: ["Betrieb"],
        summary: "Kurs abfragen",
        description:
          "Liefert den aktuellen Kurs. Mit „from“ und „to“ (Unix-Sekunden) wird stattdessen eine Kursreihe geliefert.",
        parameters: [
          chainParam,
          {
            name: "from",
            in: "query",
            description: "Beginn der Kursreihe in Unix-Sekunden",
            schema: { type: "integer" },
          },
          { name: "to", in: "query", description: "Ende der Kursreihe in Unix-Sekunden", schema: { type: "integer" } },
        ],
        responses: { "200": ok("Kurs oder Kursreihe"), "502": fehlerAntwort },
      },
    },
    "/api/health": {
      get: {
        tags: ["Betrieb"],
        summary: "Zustandsbericht",
        description:
          "Zustand von Datenbank, Datenquellen, Zwischenspeicher und Benachrichtigungen. Ohne Anmeldung nutzbar; Status 503 bedeutet eingeschränkten Betrieb.",
        security: [],
        responses: { "200": ok("Betrieb in Ordnung"), "503": ok("Eingeschränkter Betrieb") },
      },
    },
    "/api/cases": {
      get: {
        tags: ["Fälle"],
        summary: "Eigene Fälle auflisten",
        description:
          "Liefert die eigenen und die im Team geteilten Fälle ohne die großen Trace-Ergebnisse. Nur mit Sitzungs-Cookie.",
        responses: { "200": ok("Liste der Fälle"), "401": fehlerAntwort },
      },
      post: {
        tags: ["Fälle"],
        summary: "Fall anlegen",
        description: "Legt einen Fall an, wahlweise samt erstem Trace-Ergebnis. Nur mit Sitzungs-Cookie.",
        requestBody: jsonBody(
          {
            type: "object",
            required: ["name", "start"],
            properties: {
              name: { type: "string", description: "Bezeichnung des Falls" },
              notes: { type: "string", description: "Notizen" },
              chain: { type: "string", enum: chainIds, default: "bitcoin" },
              start: { type: "string", description: "Startadresse oder Transaktions-ID" },
              params: { ...freiesObjekt, description: "Verwendete Trace-Parameter" },
              result: { ...freiesObjekt, description: "Optionales Trace-Ergebnis" },
              shared: { type: "boolean", description: "Für das Team freigeben" },
            },
          },
          {
            name: "Betrugsfall 2026-01",
            chain: "bitcoin",
            start: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
            shared: false,
          },
        ),
        responses: {
          "200": ok("Angelegt, mit „id“"),
          "400": fehlerAntwort,
          "401": fehlerAntwort,
          "503": fehlerAntwort,
        },
      },
    },
    "/api/annotations": {
      get: {
        tags: ["Labels"],
        summary: "Eigene Labels auflisten",
        description:
          "Liefert die eigenen und die im Team geteilten Labels, wahlweise gefiltert nach Adresse. Nur mit Sitzungs-Cookie.",
        parameters: [
          {
            name: "address",
            in: "query",
            description: "Nur Labels zu dieser Adresse",
            schema: { type: "string" },
          },
        ],
        responses: { "200": ok("Liste der Labels"), "401": fehlerAntwort },
      },
      post: {
        tags: ["Labels"],
        summary: "Label anlegen oder ändern",
        description:
          "Legt ein eigenes Label zu einer Adresse an oder aktualisiert das vorhandene. Nur mit Sitzungs-Cookie.",
        requestBody: jsonBody(
          {
            type: "object",
            required: ["address", "label"],
            properties: {
              chain: { type: "string", enum: chainIds, default: "bitcoin" },
              address: { type: "string" },
              label: { type: "string", description: "Anzeigename" },
              category: {
                type: "string",
                enum: [
                  "exchange",
                  "mixer",
                  "scam",
                  "sanctioned",
                  "ransomware",
                  "darknet",
                  "gambling",
                  "mining",
                  "service",
                  "wallet",
                  "custom",
                  "other",
                ],
                description: "Einordnung der Adresse",
              },
              risk: { type: "string", enum: ["low", "medium", "high"], description: "Eigene Risikoeinstufung" },
              notes: { type: "string", description: "Notizen" },
              shared: { type: "boolean", description: "Für das Team freigeben" },
            },
          },
          {
            chain: "bitcoin",
            address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
            label: "Genesis",
            category: "other",
            shared: true,
          },
        ),
        responses: {
          "200": ok("Gespeichert"),
          "400": fehlerAntwort,
          "401": fehlerAntwort,
          "503": fehlerAntwort,
        },
      },
    },
    "/api/watch": {
      get: {
        tags: ["Beobachtung"],
        summary: "Beobachtete Adressen auflisten",
        description:
          "Liefert die Beobachtungsliste mit ungelesenen Ereignissen sowie die Benachrichtigungseinstellungen. Nur mit Sitzungs-Cookie.",
        responses: { "200": ok("Beobachtungsliste"), "401": fehlerAntwort },
      },
      post: {
        tags: ["Beobachtung"],
        summary: "Adresse beobachten",
        description:
          "Nimmt eine Adresse in die Beobachtungsliste auf oder aktualisiert einen vorhandenen Eintrag. Nur mit Sitzungs-Cookie.",
        requestBody: jsonBody(
          {
            type: "object",
            required: ["address"],
            properties: {
              chain: { type: "string", enum: chainIds, default: "bitcoin" },
              address: { type: "string" },
              label: { type: "string", description: "Eigene Bezeichnung" },
              minValueSat: { type: "integer", minimum: 0, description: "Erst ab diesem Betrag benachrichtigen" },
            },
          },
          { chain: "bitcoin", address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", label: "Verdächtig", minValueSat: 100000 },
        ),
        responses: {
          "200": ok("Gespeichert"),
          "400": fehlerAntwort,
          "401": fehlerAntwort,
          "503": fehlerAntwort,
        },
      },
      put: {
        tags: ["Beobachtung"],
        summary: "Benachrichtigungen einstellen",
        description: "Ändert die Benachrichtigungswege des Nutzers (E-Mail, Telegram, Webhook). Nur mit Sitzungs-Cookie.",
        requestBody: jsonBody(
          {
            type: "object",
            properties: {
              email: { type: "boolean", description: "Benachrichtigung per E-Mail" },
              telegramChatId: { type: "string", description: "Telegram-Chat-ID" },
              webhookUrl: { type: "string", description: "Adresse für einen Webhook-Aufruf" },
            },
          },
          { email: true, telegramChatId: "", webhookUrl: "" },
        ),
        responses: { "200": ok("Gespeichert"), "400": fehlerAntwort, "401": fehlerAntwort },
      },
    },
    "/api/watch/check": {
      post: {
        tags: ["Beobachtung"],
        summary: "Beobachtete Adressen prüfen",
        description:
          "Prüft die beobachteten Adressen auf neue Aktivität. Eingeloggte Nutzer prüfen ihre eigenen Adressen; ein Cron-Dienst prüft mit „Authorization: Bearer <CRON_SECRET>“ alle. Derselbe Ablauf ist auch als GET aufrufbar.",
        responses: { "200": ok("Prüfbericht mit geprüften Adressen und Ereignissen"), "401": fehlerAntwort },
      },
    },
    "/api/tokens": {
      get: {
        tags: ["Zugriffstoken"],
        summary: "Eigene Token auflisten",
        description:
          "Liefert die eigenen Zugriffstoken mit Präfix, Rechten und Status – nie das Klartext-Token. Nur mit Sitzungs-Cookie.",
        responses: { "200": ok("Liste der Token"), "401": fehlerAntwort, "503": fehlerAntwort },
      },
      post: {
        tags: ["Zugriffstoken"],
        summary: "Token anlegen",
        description:
          "Legt ein Zugriffstoken an und gibt es EINMALIG im Klartext zurück; gespeichert wird nur der Hashwert. Nur mit Sitzungs-Cookie – mit einem Token lassen sich keine weiteren Token verwalten.",
        requestBody: jsonBody(
          {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string", description: "Bezeichnung zur Wiedererkennung" },
              scopes: {
                type: "array",
                items: { type: "string", enum: ["read", "trace", "write"] },
                description: "Rechte des Tokens",
              },
              expiresInDays: {
                type: "integer",
                minimum: 1,
                maximum: 3650,
                description: "Gültigkeit in Tagen; ohne Angabe unbegrenzt",
              },
            },
          },
          { name: "Auswertungsskript", scopes: ["read", "trace"], expiresInDays: 90 },
        ),
        responses: {
          "200": ok("Angelegt; enthält im Feld „token“ das einmalig sichtbare Klartext-Token"),
          "400": fehlerAntwort,
          "401": fehlerAntwort,
          "503": fehlerAntwort,
        },
      },
    },
    "/api/tokens/{id}": {
      delete: {
        tags: ["Zugriffstoken"],
        summary: "Token widerrufen",
        description: "Setzt ein Token dauerhaft auf widerrufen. Nur mit Sitzungs-Cookie.",
        parameters: [
          { name: "id", in: "path", required: true, description: "ID des Tokens", schema: { type: "string" } },
        ],
        responses: {
          "200": ok("Widerrufen"),
          "400": fehlerAntwort,
          "401": fehlerAntwort,
          "404": fehlerAntwort,
        },
      },
    },
    "/api/openapi": {
      get: {
        tags: ["Betrieb"],
        summary: "Diese Schnittstellenbeschreibung",
        description: "Liefert dieses Dokument als JSON nach OpenAPI 3.1.",
        security: [],
        responses: { "200": ok("OpenAPI-Dokument") },
      },
    },
  };

  if (mitJobs) {
    paths["/api/jobs"] = {
      get: {
        tags: ["Aufträge"],
        summary: "Hintergrund-Aufträge auflisten",
        description: "Liefert die eigenen Aufträge ohne die großen Ergebnisse. Nur mit Sitzungs-Cookie.",
        responses: { "200": ok("Liste der Aufträge"), "401": fehlerAntwort, "503": fehlerAntwort },
      },
      post: {
        tags: ["Aufträge"],
        summary: "Auftrag einstellen",
        description:
          "Stellt eine lang laufende Verfolgung oder Verbindungssuche in die Warteschlange; das Ergebnis wird später unter /api/jobs/{id} abgeholt. Nur mit Sitzungs-Cookie.",
        requestBody: jsonBody(
          {
            type: "object",
            required: ["type", "params"],
            properties: {
              type: { type: "string", enum: ["trace", "path"], description: "Art des Auftrags" },
              name: { type: "string", description: "Bezeichnung" },
              params: { ...freiesObjekt, description: "Parameter wie bei /api/trace beziehungsweise /api/path" },
            },
          },
          { type: "trace", name: "Nachtlauf", params: traceBeispiel },
        ),
        responses: {
          "200": ok("Eingestellt, mit „id“"),
          "400": fehlerAntwort,
          "401": fehlerAntwort,
          "429": zuVieleAnfragen,
          "503": fehlerAntwort,
        },
      },
    };
  }

  return paths;
}

/** Prüft, ob die Auftrags-Endpunkte vorhanden sind (sie entstehen parallel). */
async function jobsVorhanden(): Promise<boolean> {
  try {
    await import("@/lib/jobs");
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const server = `${url.protocol}//${url.host}`;
  const limits = Object.entries(RULES)
    .map(([name, r]) => `${name}: ${r.limit} je ${Math.round(r.windowMs / 1000)} s`)
    .join(", ");

  const doc = {
    openapi: "3.1.0",
    info: {
      title: "Chainer API",
      version: process.env.npm_package_version ?? "0.1.0",
      summary: "Schnittstelle zur Verfolgung von Geldflüssen auf öffentlichen Blockchains.",
      description: [
        "Alle Antworten sind JSON; Fehlermeldungen stehen im Feld „error“ und sind deutschsprachig.",
        "",
        "**Anmeldung:** Die Endpunkte lassen sich mit dem Sitzungs-Cookie der Weboberfläche oder mit einem Zugriffstoken nutzen.",
        "Das Token wird unter „Einstellungen“ angelegt und als `Authorization: Bearer chk_…` oder im Kopf `X-API-Key` gesendet.",
        "Es beginnt immer mit `chk_` und ist nur beim Anlegen ein einziges Mal sichtbar.",
        "Die Verwaltung der Token selbst (`/api/tokens`) verlangt zwingend das Sitzungs-Cookie.",
        "Endpunkte rund um Fälle, Labels, Beobachtung und Aufträge sind ebenfalls dem angemeldeten Nutzer vorbehalten.",
        "",
        `**Ratenbegrenzung:** je Absender-IP und Endpunkt (${limits}). Bei Überschreitung antwortet der Server mit Status 429,`,
        "den Kopfzeilen `Retry-After` und `X-RateLimit-Limit` sowie einer Meldung im Feld „error“.",
        "",
        "**Datenquellen:** Ohne eigene API-Keys gelten zusätzlich die Grenzen der öffentlichen Quellen. Eigene Keys werden",
        "verschlüsselt beim Nutzerkonto hinterlegt und bei Token-Anfragen genauso verwendet wie in der Weboberfläche.",
      ].join("\n"),
    },
    servers: [{ url: server, description: "Dieser Server" }],
    tags: [
      { name: "Abfragen", description: "Einzelne Adressen und Transaktionen" },
      { name: "Verfolgung", description: "Geldflussverfolgung und Verbindungssuche" },
      { name: "Prüfung", description: "Massenprüfung von Adressen" },
      { name: "Fälle", description: "Gespeicherte Ermittlungen" },
      { name: "Labels", description: "Eigene Adressbeschriftungen" },
      { name: "Beobachtung", description: "Überwachte Adressen und Benachrichtigungen" },
      { name: "Aufträge", description: "Lang laufende Aufgaben im Hintergrund" },
      { name: "Zugriffstoken", description: "Token für eigene Skripte" },
      { name: "Betrieb", description: "Zustand, Kurse und Datenquellen" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Zugriffstoken der Form `chk_…`, gesendet als `Authorization: Bearer chk_…`.",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Dasselbe Zugriffstoken, wahlweise im Kopf `X-API-Key`.",
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "chainer_session",
          description: "Sitzungs-Cookie der Weboberfläche; für die Token-Verwaltung zwingend erforderlich.",
        },
      },
    },
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }, { sessionCookie: [] }],
    paths: bauePfade(await jobsVorhanden()),
  };

  return NextResponse.json(doc, { headers: { "Cache-Control": "public, max-age=300" } });
}
