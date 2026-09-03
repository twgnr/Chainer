import { DEFAULT_LOCALE, type Locale } from "./locale";

/**
 * Übersetzung der Schnittstellenbeschreibung.
 *
 * Das OpenAPI-Dokument entsteht in `src/app/api/openapi/route.ts` als ein
 * großes, verschachteltes Objekt. Statt jede Beschreibung dort zu verdoppeln,
 * wird das fertige Dokument beim Ausliefern durchlaufen und jedes
 * beschreibende Feld übersetzt. Die Struktur des Dokuments bleibt damit an
 * einer Stelle, und ein neuer Endpunkt kann nicht versehentlich die Sprache
 * zerreißen — der Test `openapi.test.ts` prüft die Vollständigkeit.
 */

const EN: Record<string, string> = {
  /* Antworten und Parameter, die überall vorkommen */
  "Fehler mit deutschsprachiger Meldung im Feld „error“": "Error with a message in the “error” field",
  "Ratenbegrenzung überschritten (Kopfzeile „Retry-After“ beachten)":
    "Rate limit exceeded (mind the “Retry-After” header)",
  "Blockchain der Abfrage. Ohne Angabe wird Bitcoin verwendet.":
    "Blockchain of the query. Bitcoin is used when omitted.",
  "Startadresse oder Transaktions-ID": "Starting address or transaction ID",
  Blockchain: "Blockchain",
  "Adress- oder UTXO-Sicht": "Address or UTXO view",
  "Verfolgung vorwärts (Abflüsse), rückwärts (Herkunft) oder beides":
    "Trace forward (outflows), backward (origin) or both",
  "Verfahren zur Verteilung der Verschmutzung auf die Ausgänge":
    "Method for distributing the taint across the outputs",
  "Anzahl der verfolgten Ebenen": "Number of levels traced",
  "Transaktionen je Adresse": "Transactions per address",
  "Adressen je Transaktion": "Addresses per transaction",
  "Mindestbetrag in der kleinsten Einheit": "Minimum amount in the smallest unit",
  "Obergrenze für Knoten im Graph": "Upper limit for nodes in the graph",
  "Labels und Risikoeinstufung mitladen": "Load labels and risk classification as well",
  "Historische Kurse zu den Zeitpunkten laden": "Load historic rates for the respective times",
  "Lightning-Kanäle erkennen": "Detect Lightning channels",
  "Auch mittleres Risiko als Treffer werten": "Count medium risk as a hit too",
  "Manuell zusammengeführte Adress-Cluster": "Manually merged address clusters",
  "Adresse der gewählten Chain": "Address of the chosen chain",
  "Anzahl der Transaktionen (höchstens 100).": "Number of transactions (at most 100).",
  "Bevorzugte Datenquelle, etwa „mempool“ oder „blockchair“.":
    "Preferred data source, for instance “mempool” or “blockchair”.",
  "Transaktions-ID": "Transaction ID",
  "Bevorzugte Datenquelle": "Preferred data source",
  "Zeilenweise JSON-Objekte (application/x-ndjson)": "JSON objects line by line (application/x-ndjson)",
  'Wie /api/trace, sendet aber zeilenweise JSON (NDJSON) mit Zwischenständen. Jede Zeile enthält ein Feld „phase“; die letzte Zeile hat phase="done" und trägt das vollständige Ergebnis unter „result“.':
    'Like /api/trace, but sends JSON line by line (NDJSON) with intermediate states. Every line carries a “phase” field; the last line has phase="done" and holds the complete result under “result”.',
  Startadresse: "Start address",
  Zieladresse: "Destination address",
  "Suchtiefe je Richtung": "Search depth per direction",
  "Obergrenze für Abfragen": "Upper limit for queries",
  "Höchstzahl gefundener Wege": "Maximum number of paths found",
  "Nur in Flussrichtung suchen": "Search only in the direction of flow",
  "Sehr große Adressen (Börsen) überspringen": "Skip very large addresses (exchanges)",
  "Labels mitladen": "Load labels as well",
  "Zu prüfende Adressen": "Addresses to check",
  "Zusätzlich Saldo und Anzahl Transaktionen laden": "Also load balance and transaction count",
  "Mit „1“ werden die Quellen aktiv angefragt (langsam, eigenes Limit).":
    "With “1” the sources are actively queried (slow, with its own limit).",
  "Beginn der Kursreihe in Unix-Sekunden": "Start of the rate series in Unix seconds",
  "Ende der Kursreihe in Unix-Sekunden": "End of the rate series in Unix seconds",
  "Bezeichnung des Falls": "Name of the case",
  Notizen: "Notes",
  "Verwendete Trace-Parameter": "Trace parameters used",
  "Optionales Trace-Ergebnis": "Optional trace result",
  "Für das Team freigeben": "Share with the team",
  "Nur Labels zu dieser Adresse": "Only labels for this address",
  Anzeigename: "Display name",
  "Einordnung der Adresse": "Classification of the address",
  "Eigene Risikoeinstufung": "Your own risk classification",
  "Eigene Bezeichnung": "Your own name",
  "Erst ab diesem Betrag benachrichtigen": "Only notify from this amount upwards",
  "Benachrichtigung per E-Mail": "Notification by email",
  "Telegram-Chat-ID": "Telegram chat ID",
  "Adresse für einen Webhook-Aufruf": "Address for a webhook call",
  "Bezeichnung zur Wiedererkennung": "Name to recognise it by",
  "Rechte des Tokens": "Permissions of the token",
  "Gültigkeit in Tagen; ohne Angabe unbegrenzt": "Validity in days; unlimited when omitted",
  "ID des Tokens": "ID of the token",
  "Art des Auftrags": "Kind of job",
  Bezeichnung: "Name",
  "Parameter wie bei /api/trace beziehungsweise /api/path": "Parameters as for /api/trace or /api/path",
  "Dieser Server": "This server",

  /* Beschreibungen der Endpunkte */
  "Liefert Saldo und Kennzahlen der Adresse, die jüngsten Transaktionen, gefundene Labels, die Einstufung der Adresse selbst sowie eine Bewertung der direkten Zuflüsse.":
    "Returns the balance and key figures of the address, its most recent transactions, any labels found, the classification of the address itself and an assessment of its direct inflows.",
  "Liefert eine einzelne Transaktion mit Ein- und Ausgängen sowie Hinweisen auf Lightning-Kanäle.":
    "Returns a single transaction with its inputs and outputs and hints about Lightning channels.",
  "Verfolgt den Geldfluss ab einer Adresse oder Transaktion und liefert den vollständigen Graphen aus Knoten und Kanten samt Statistik. Der Aufruf kann mehrere Minuten dauern.":
    "Follows the flow of funds from an address or transaction and returns the complete graph of nodes and edges together with statistics. The call can take several minutes.",
  "Sucht mit einer beidseitigen Breitensuche Wege zwischen zwei Adressen derselben Chain.":
    "Searches for paths between two addresses of the same chain using a bidirectional breadth-first search.",
  "Prüft bis zu 200 Adressen gegen die hinterlegten Label- und Meldelisten und liefert je Adresse ein Urteil sowie eine Zusammenfassung.":
    "Checks up to 200 addresses against the configured label and reporting lists and returns a verdict per address plus a summary.",
  "Zeigt alle Datenquellen mit Schlüsselbedarf und Verfügbarkeit sowie die unterstützten Chains und den Zwischenspeicher.":
    "Shows every data source with its key requirement and availability, plus the supported chains and the cache.",
  "Liefert den aktuellen Kurs. Mit „from“ und „to“ (Unix-Sekunden) wird stattdessen eine Kursreihe geliefert.":
    "Returns the current rate. With “from” and “to” (Unix seconds) a rate series is returned instead.",
  "Zustand von Datenbank, Datenquellen, Zwischenspeicher und Benachrichtigungen. Ohne Anmeldung nutzbar; Status 503 bedeutet eingeschränkten Betrieb.":
    "State of the database, data sources, cache and notifications. Usable without signing in; status 503 means restricted operation.",
  "Liefert die eigenen und die im Team geteilten Fälle ohne die großen Trace-Ergebnisse. Nur mit Sitzungs-Cookie.":
    "Returns your own cases and those shared with the team, without the large trace results. Session cookie only.",
  "Legt einen Fall an, wahlweise samt erstem Trace-Ergebnis. Nur mit Sitzungs-Cookie.":
    "Creates a case, optionally together with a first trace result. Session cookie only.",
  "Liefert die eigenen und die im Team geteilten Labels, wahlweise gefiltert nach Adresse. Nur mit Sitzungs-Cookie.":
    "Returns your own labels and those shared with the team, optionally filtered by address. Session cookie only.",
  "Legt ein eigenes Label zu einer Adresse an oder aktualisiert das vorhandene. Nur mit Sitzungs-Cookie.":
    "Creates one of your own labels for an address, or updates the existing one. Session cookie only.",
  "Liefert die Beobachtungsliste mit ungelesenen Ereignissen sowie die Benachrichtigungseinstellungen. Nur mit Sitzungs-Cookie.":
    "Returns the watchlist with unread events and the notification settings. Session cookie only.",
  "Nimmt eine Adresse in die Beobachtungsliste auf oder aktualisiert einen vorhandenen Eintrag. Nur mit Sitzungs-Cookie.":
    "Adds an address to the watchlist or updates an existing entry. Session cookie only.",
  "Ändert die Benachrichtigungswege des Nutzers (E-Mail, Telegram, Webhook). Nur mit Sitzungs-Cookie.":
    "Changes the user's notification channels (email, Telegram, webhook). Session cookie only.",
  "Prüft die beobachteten Adressen auf neue Aktivität. Eingeloggte Nutzer prüfen ihre eigenen Adressen; ein Cron-Dienst prüft mit „Authorization: Bearer <CRON_SECRET>“ alle. Derselbe Ablauf ist auch als GET aufrufbar.":
    "Checks the watched addresses for new activity. Signed-in users check their own addresses; a cron service checks all of them with “Authorization: Bearer <CRON_SECRET>”. The same routine is also available as a GET.",
  "Liefert die eigenen Zugriffstoken mit Präfix, Rechten und Status – nie das Klartext-Token. Nur mit Sitzungs-Cookie.":
    "Returns your own access tokens with prefix, permissions and status – never the plaintext token. Session cookie only.",
  "Legt ein Zugriffstoken an und gibt es EINMALIG im Klartext zurück; gespeichert wird nur der Hashwert. Nur mit Sitzungs-Cookie – mit einem Token lassen sich keine weiteren Token verwalten.":
    "Creates an access token and returns it in plaintext EXACTLY ONCE; only its hash is stored. Session cookie only – a token cannot manage further tokens.",
  "Setzt ein Token dauerhaft auf widerrufen. Nur mit Sitzungs-Cookie.":
    "Permanently marks a token as revoked. Session cookie only.",
  "Liefert dieses Dokument als JSON nach OpenAPI 3.1.": "Returns this document as JSON following OpenAPI 3.1.",
  "Liefert die eigenen Aufträge ohne die großen Ergebnisse. Nur mit Sitzungs-Cookie.":
    "Returns your own jobs without the large results. Session cookie only.",
  "Stellt eine lang laufende Verfolgung oder Verbindungssuche in die Warteschlange; das Ergebnis wird später unter /api/jobs/{id} abgeholt. Nur mit Sitzungs-Cookie.":
    "Queues a long-running trace or connection search; the result is collected later from /api/jobs/{id}. Session cookie only.",

  /* Namen der Abschnitte */
  "Einzelne Adressen und Transaktionen": "Individual addresses and transactions",
  "Geldflussverfolgung und Verbindungssuche": "Tracing money flows and searching for connections",
  "Massenprüfung von Adressen": "Bulk checking of addresses",
  "Gespeicherte Ermittlungen": "Saved investigations",
  "Eigene Adressbeschriftungen": "Your own address labels",
  "Überwachte Adressen und Benachrichtigungen": "Watched addresses and notifications",
  "Lang laufende Aufgaben im Hintergrund": "Long-running background tasks",
  "Token für eigene Skripte": "Tokens for your own scripts",
  "Zustand, Kurse und Datenquellen": "Status, rates and data sources",

  /* Anmeldeverfahren */
  "Zugriffstoken der Form `chk_…`, gesendet als `Authorization: Bearer chk_…`.":
    "Access token of the form `chk_…`, sent as `Authorization: Bearer chk_…`.",
  "Dasselbe Zugriffstoken, wahlweise im Kopf `X-API-Key`.": "The same access token, alternatively in the `X-API-Key` header.",
  "Sitzungs-Cookie der Weboberfläche; für die Token-Verwaltung zwingend erforderlich.":
    "Session cookie of the web interface; mandatory for managing tokens.",

  /* Kurzformen der Endpunkte */
  "Adresse abfragen": "Query an address",
  "Transaktion abfragen": "Query a transaction",
  "Geldfluss verfolgen": "Trace the flow of funds",
  "Geldfluss verfolgen (Datenstrom)": "Trace the flow of funds (stream)",
  "Verbindung zwischen zwei Adressen suchen": "Search for a connection between two addresses",
  "Adressen in einem Durchgang prüfen": "Check addresses in one pass",
  "Datenquellen und Chains auflisten": "List data sources and chains",
  "Kurs abfragen": "Query the rate",
  Zustandsbericht: "Status report",
  "Eigene Fälle auflisten": "List your own cases",
  "Fall anlegen": "Create a case",
  "Eigene Labels auflisten": "List your own labels",
  "Label anlegen oder ändern": "Create or change a label",
  "Beobachtete Adressen auflisten": "List watched addresses",
  "Adresse beobachten": "Watch an address",
  "Benachrichtigungen einstellen": "Configure notifications",
  "Beobachtete Adressen prüfen": "Check the watched addresses",
  "Eigene Token auflisten": "List your own tokens",
  "Token anlegen": "Create a token",
  "Token widerrufen": "Revoke a token",
  "Diese Schnittstellenbeschreibung": "This interface description",
  "Hintergrund-Aufträge auflisten": "List background jobs",
  "Auftrag einstellen": "Queue a job",

  /* Titel und Antworttexte */
  "Schnittstelle zur Verfolgung von Geldflüssen auf öffentlichen Blockchains.":
    "Interface for tracing money flows on public blockchains.",
  "Chainer API": "Chainer API",
  "Adressdaten mit Transaktionen, Labels und Zuflussbewertung":
    "Address data with transactions, labels and inflow assessment",
  Transaktionsdaten: "Transaction data",
  "Graph mit „nodes“, „edges“, „stats“ und Warnungen": "Graph with “nodes”, “edges”, “stats” and warnings",
  "Gefundene Wege mit Zwischenstationen": "Paths found, including intermediate stops",
  "Ergebnisliste und Zusammenfassung": "Result list and summary",
  "Liste der Datenquellen": "List of data sources",
  "Kurs oder Kursreihe": "Rate or rate series",
  "Betrieb in Ordnung": "Operating normally",
  "Eingeschränkter Betrieb": "Restricted operation",
  "Liste der Fälle": "List of cases",
  "Angelegt, mit „id“": "Created, with “id”",
  "Liste der Labels": "List of labels",
  Gespeichert: "Saved",
  Beobachtungsliste: "Watchlist",
  "Prüfbericht mit geprüften Adressen und Ereignissen": "Check report with the addresses checked and the events",
  "Liste der Token": "List of tokens",
  "Angelegt; enthält im Feld „token“ das einmalig sichtbare Klartext-Token":
    "Created; the “token” field carries the plaintext token, visible this once only",
  Widerrufen: "Revoked",
  "OpenAPI-Dokument": "OpenAPI document",
  "Liste der Aufträge": "List of jobs",
  "Eingestellt, mit „id“": "Queued, with “id”",
};

/**
 * Beschreibungen mit eingesetzten Werten. Sie entstehen aus Vorlagen und
 * lassen sich nicht über eine feste Tabelle abbilden.
 */
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  // Der einleitende Beschreibungstext des Dokuments. Er wird aus mehreren
  // Zeilen zusammengesetzt und enthält die aktuellen Ratengrenzen.
  [
    /^Alle Antworten sind JSON;[\s\S]*je Absender-IP und Endpunkt \(([^)]+)\)[\s\S]*$/,
    (m) =>
      [
        "All responses are JSON; error messages appear in the “error” field.",
        "",
        "**Authentication:** The endpoints can be used with the session cookie of the web interface or with an access token.",
        "The token is created under “Settings” and sent as `Authorization: Bearer chk_…` or in the `X-API-Key` header.",
        "It always starts with `chk_` and is visible exactly once, when it is created.",
        "Managing the tokens themselves (`/api/tokens`) strictly requires the session cookie.",
        "Endpoints around cases, labels, watching and jobs are likewise reserved for the signed-in user.",
        "",
        `**Rate limiting:** per source IP and endpoint (${m[1]}). Above that the server answers with status 429,`,
        "the headers `Retry-After` and `X-RateLimit-Limit`, and a message in the “error” field.",
        "",
        "**Data sources:** Without API keys of your own, the limits of the public sources apply as well. Your own keys are",
        "stored encrypted with your account and used for token requests exactly as in the web interface.",
      ].join("\n"),
  ],
];

/** Übersetzt einen einzelnen beschreibenden Text. */
export function translateApiText(text: string, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === "de" || !text) return text;
  const exact = EN[text];
  if (exact) return exact;
  for (const [re, build] of PATTERNS) {
    const m = text.match(re);
    if (m) return build(m);
  }
  return text;
}

/** Felder, deren Inhalt Fließtext für Menschen ist. */
const TEXT_FIELDS = new Set(["description", "summary", "title"]);

/**
 * Läuft durch das fertige OpenAPI-Dokument und übersetzt jedes beschreibende
 * Feld. Alles andere — Pfade, Schlüsselnamen, Aufzählungswerte — bleibt
 * unangetastet.
 */
export function translateOpenApi<T>(doc: T, locale: Locale = DEFAULT_LOCALE): T {
  if (locale === "de") return doc;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = TEXT_FIELDS.has(k) && typeof val === "string" ? translateApiText(val, locale) : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(doc) as T;
}
