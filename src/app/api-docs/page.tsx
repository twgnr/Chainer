import Link from "next/link";
import { getT } from "@/lib/i18n/server";

const META = {
  en: { title: "API – Chainer", description: "Interface reference and access tokens for your own scripts" },
  de: { title: "API – Chainer", description: "Schnittstellenbeschreibung und Zugriffstoken für eigene Skripte" },
};

export async function generateMetadata() {
  return await getT(META);
}

interface Endpoint {
  path: string;
  method: string;
  purpose: string;
  auth: string;
}

const Var = ({ children }: { children: React.ReactNode }) => <span className="mono">{children}</span>;

const EXAMPLE = `curl -s -X POST https://<host>/api/trace \\
  -H "Authorization: Bearer chk_…" -H "Content-Type: application/json" \\
  -d '{"start":"1A1z…","chain":"bitcoin","maxDepth":2}'`;

/** Die Tabelle bildet die tatsächlich vorhandenen Routen unter src/app/api ab. */
const TXT = {
  en: {
    title: "Interface for your own scripts",
    lead: (
      <>
        Every endpoint returns JSON; errors appear in the <Var>error</Var> field. The machine-readable OpenAPI 3.1
        description lives at{" "}
        <Link href="/api/openapi" className="text-brand mono">
          /api/openapi
        </Link>
        .
      </>
    ),
    tokenTitle: "Creating and using a token",
    steps: [
      (
        <>
          Log in and create a token with a name and permissions under{" "}
          <Link href="/settings" className="text-brand">
            Settings
          </Link>
          , in the “Access tokens for scripts” section.
        </>
      ),
      (
        <>
          The token starts with <Var>chk_</Var> and is shown <strong>exactly once</strong> – only its hash is stored on
          the server.
        </>
      ),
      (
        <>
          Send it with every request as <Var>Authorization: Bearer chk_…</Var> or in the <Var>X-API-Key</Var> header.
        </>
      ),
      <>Revoke lost or exposed tokens in the settings and create a new one.</>,
    ],
    tokenNote:
      "For token requests your stored provider keys apply exactly as they do in the interface. Managing the tokens themselves requires the session cookie – a token cannot create further tokens.",
    manageTokens: "Manage tokens",
    openOpenapi: "Open the OpenAPI document",
    endpointsTitle: "Endpoints",
    colPath: "Path",
    colMethod: "Method",
    colPurpose: "Purpose",
    colAuth: "Authentication",
    endpointsNote:
      "“open or token” means: usable without signing in, and with a token your own provider keys apply as well. “Cookie” refers to being signed in to the web interface.",
    limitsTitle: "Limits and notes",
    limits: (
      <>
        The expensive endpoints are limited per source IP: <Var>trace</Var> 20, <Var>path</Var> 10, <Var>screen</Var> 5,{" "}
        <Var>address</Var> and <Var>tx</Var> 120 requests per minute each. Above that the server answers with status
        429 and a <Var>Retry-After</Var> header.
      </>
    ),
    streaming: (
      <>
        A trace can run for several minutes. For long runs use <Var>/api/trace/stream</Var>: the response is NDJSON,
        each line an intermediate state, and the last line carries <Var>phase=&quot;done&quot;</Var> with the result
        under <Var>result</Var>.
      </>
    ),
    chainNote: (
      <>
        The chain is chosen through the <Var>chain</Var> query parameter on GET requests and through the field of the
        same name in the JSON body on POST requests.
      </>
    ),
    endpoints: [
      { path: "/api/address/{addr}", method: "GET", purpose: "Address with balance, transactions, labels and inflow risk", auth: "open or token" },
      { path: "/api/tx/{txid}", method: "GET", purpose: "Transaction with inputs and outputs, Lightning hints", auth: "open or token" },
      { path: "/api/trace", method: "POST", purpose: "Follow the flow of funds, full graph in the response", auth: "open or token" },
      { path: "/api/trace/stream", method: "POST", purpose: "Like /api/trace, but line by line as NDJSON with intermediate states", auth: "open or token" },
      { path: "/api/path", method: "POST", purpose: "Search for connections between two addresses", auth: "open or token" },
      { path: "/api/screen", method: "POST", purpose: "Check up to 200 addresses against reporting lists", auth: "open or token" },
      { path: "/api/providers", method: "GET", purpose: "Data sources, chains and cache", auth: "open or token" },
      { path: "/api/price", method: "GET", purpose: "Current rate or rate series (from/to in Unix seconds)", auth: "open" },
      { path: "/api/health", method: "GET", purpose: "Status report for monitoring and operations", auth: "open" },
      { path: "/api/openapi", method: "GET", purpose: "This interface as an OpenAPI 3.1 document", auth: "open" },
      { path: "/api/cases", method: "GET, POST", purpose: "List and create cases", auth: "cookie" },
      { path: "/api/cases/{id}", method: "GET, PATCH, DELETE", purpose: "Read, change or delete a case", auth: "cookie" },
      { path: "/api/annotations", method: "GET, POST", purpose: "List, create or change your own labels", auth: "cookie" },
      { path: "/api/annotations/{id}", method: "DELETE", purpose: "Delete a label", auth: "cookie" },
      { path: "/api/watch", method: "GET, POST, PUT", purpose: "Read and extend the watchlist, configure notifications", auth: "cookie" },
      { path: "/api/watch/{id}", method: "PATCH, DELETE", purpose: "Change or remove an entry", auth: "cookie" },
      { path: "/api/watch/check", method: "GET, POST", purpose: "Check the watched addresses", auth: "cookie or CRON_SECRET" },
      { path: "/api/tokens", method: "GET, POST", purpose: "List and create access tokens", auth: "cookie only" },
      { path: "/api/tokens/{id}", method: "DELETE", purpose: "Revoke an access token", auth: "cookie only" },
    ] as Endpoint[],
  },
  de: {
    title: "Schnittstelle für eigene Skripte",
    lead: (
      <>
        Alle Endpunkte liefern JSON; Fehler stehen im Feld <Var>error</Var>. Die maschinenlesbare Beschreibung nach
        OpenAPI 3.1 liegt unter{" "}
        <Link href="/api/openapi" className="text-brand mono">
          /api/openapi
        </Link>
        .
      </>
    ),
    tokenTitle: "Token anlegen und benutzen",
    steps: [
      (
        <>
          Einloggen und unter{" "}
          <Link href="/settings" className="text-brand">
            Einstellungen
          </Link>{" "}
          im Abschnitt „Zugriffstoken für Skripte“ ein Token mit Namen und Rechten anlegen.
        </>
      ),
      (
        <>
          Das Token beginnt mit <Var>chk_</Var> und wird <strong>nur ein einziges Mal</strong> angezeigt – gespeichert
          wird serverseitig nur sein Hashwert.
        </>
      ),
      (
        <>
          Bei jeder Anfrage als <Var>Authorization: Bearer chk_…</Var> oder im Kopf <Var>X-API-Key</Var> mitsenden.
        </>
      ),
      <>Verlorene oder offengelegte Token in den Einstellungen widerrufen und ein neues anlegen.</>,
    ],
    tokenNote:
      "Bei Token-Anfragen greifen deine hinterlegten Provider-Keys genauso wie in der Oberfläche. Die Verwaltung der Token selbst verlangt das Sitzungs-Cookie – mit einem Token lassen sich keine weiteren Token anlegen.",
    manageTokens: "Token verwalten",
    openOpenapi: "OpenAPI-Dokument öffnen",
    endpointsTitle: "Endpunkte",
    colPath: "Pfad",
    colMethod: "Methode",
    colPurpose: "Zweck",
    colAuth: "Authentifizierung",
    endpointsNote:
      "„offen oder Token“ bedeutet: ohne Anmeldung nutzbar, mit Token gelten zusätzlich deine eigenen Provider-Keys. „Cookie“ steht für die Anmeldung in der Weboberfläche.",
    limitsTitle: "Grenzen und Hinweise",
    limits: (
      <>
        Die teuren Endpunkte sind je Absender-IP begrenzt: <Var>trace</Var> 20, <Var>path</Var> 10, <Var>screen</Var> 5,{" "}
        <Var>address</Var> und <Var>tx</Var> je 120 Anfragen pro Minute. Bei Überschreitung antwortet der Server mit
        Status 429 und der Kopfzeile <Var>Retry-After</Var>.
      </>
    ),
    streaming: (
      <>
        Ein Trace kann mehrere Minuten laufen. Für lange Läufe eignet sich <Var>/api/trace/stream</Var>: die Antwort
        ist NDJSON, jede Zeile ein Zwischenstand, die letzte Zeile enthält <Var>phase=&quot;done&quot;</Var> und das
        Ergebnis unter <Var>result</Var>.
      </>
    ),
    chainNote: (
      <>
        Die Chain wird bei GET-Abfragen über den Query-Parameter <Var>chain</Var> gewählt, bei POST-Abfragen über das
        gleichnamige Feld im JSON-Körper.
      </>
    ),
    endpoints: [
      { path: "/api/address/{addr}", method: "GET", purpose: "Adresse mit Saldo, Transaktionen, Labels und Zuflussrisiko", auth: "offen oder Token" },
      { path: "/api/tx/{txid}", method: "GET", purpose: "Transaktion mit Ein- und Ausgängen, Lightning-Hinweise", auth: "offen oder Token" },
      { path: "/api/trace", method: "POST", purpose: "Geldfluss verfolgen, vollständiger Graph als Antwort", auth: "offen oder Token" },
      { path: "/api/trace/stream", method: "POST", purpose: "Wie /api/trace, aber zeilenweise als NDJSON mit Zwischenständen", auth: "offen oder Token" },
      { path: "/api/path", method: "POST", purpose: "Verbindungen zwischen zwei Adressen suchen", auth: "offen oder Token" },
      { path: "/api/screen", method: "POST", purpose: "Bis zu 200 Adressen gegen Meldelisten prüfen", auth: "offen oder Token" },
      { path: "/api/providers", method: "GET", purpose: "Datenquellen, Chains und Zwischenspeicher", auth: "offen oder Token" },
      { path: "/api/price", method: "GET", purpose: "Aktueller Kurs oder Kursreihe (from/to in Unix-Sekunden)", auth: "offen" },
      { path: "/api/health", method: "GET", purpose: "Zustandsbericht für Überwachung und Betrieb", auth: "offen" },
      { path: "/api/openapi", method: "GET", purpose: "Diese Schnittstelle als OpenAPI-3.1-Dokument", auth: "offen" },
      { path: "/api/cases", method: "GET, POST", purpose: "Fälle auflisten und anlegen", auth: "Cookie" },
      { path: "/api/cases/{id}", method: "GET, PATCH, DELETE", purpose: "Fall lesen, ändern, löschen", auth: "Cookie" },
      { path: "/api/annotations", method: "GET, POST", purpose: "Eigene Labels auflisten, anlegen oder ändern", auth: "Cookie" },
      { path: "/api/annotations/{id}", method: "DELETE", purpose: "Label löschen", auth: "Cookie" },
      { path: "/api/watch", method: "GET, POST, PUT", purpose: "Beobachtungsliste lesen, ergänzen, Benachrichtigungen einstellen", auth: "Cookie" },
      { path: "/api/watch/{id}", method: "PATCH, DELETE", purpose: "Eintrag ändern oder entfernen", auth: "Cookie" },
      { path: "/api/watch/check", method: "GET, POST", purpose: "Beobachtete Adressen prüfen", auth: "Cookie oder CRON_SECRET" },
      { path: "/api/tokens", method: "GET, POST", purpose: "Zugriffstoken auflisten und anlegen", auth: "nur Cookie" },
      { path: "/api/tokens/{id}", method: "DELETE", purpose: "Zugriffstoken widerrufen", auth: "nur Cookie" },
    ] as Endpoint[],
  },
};

export default async function ApiDocsPage() {
  const t = await getT(TXT);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.lead}</p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">{t.tokenTitle}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-2">
          {t.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <pre className="mono overflow-x-auto rounded-md border border-border bg-background p-3 text-xs">{EXAMPLE}</pre>
        <p className="text-sm text-muted">{t.tokenNote}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="btn">
            {t.manageTokens}
          </Link>
          <Link href="/api/openapi" className="btn-secondary">
            {t.openOpenapi}
          </Link>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">{t.endpointsTitle}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">{t.colPath}</th>
                <th className="py-2 pr-3">{t.colMethod}</th>
                <th className="py-2 pr-3">{t.colPurpose}</th>
                <th className="py-2">{t.colAuth}</th>
              </tr>
            </thead>
            <tbody>
              {t.endpoints.map((e) => (
                <tr key={e.path} className="border-t border-border align-top">
                  <td className="mono py-2 pr-3 whitespace-nowrap">{e.path}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted">{e.method}</td>
                  <td className="py-2 pr-3">{e.purpose}</td>
                  <td className="py-2 text-muted">{e.auth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-subtle">{t.endpointsNote}</p>
      </div>

      <div className="card space-y-2 text-sm text-muted">
        <h2 className="font-semibold text-foreground">{t.limitsTitle}</h2>
        <p>{t.limits}</p>
        <p>{t.streaming}</p>
        <p>{t.chainNote}</p>
      </div>
    </div>
  );
}
