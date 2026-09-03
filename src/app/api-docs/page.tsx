import Link from "next/link";

export const metadata = {
  title: "API – Chainer",
  description: "Schnittstellenbeschreibung und Zugriffstoken für eigene Skripte",
};

interface Endpunkt {
  pfad: string;
  methode: string;
  zweck: string;
  auth: string;
}

/** Die Tabelle bildet die tatsächlich vorhandenen Routen unter src/app/api ab. */
const ENDPUNKTE: Endpunkt[] = [
  { pfad: "/api/address/{addr}", methode: "GET", zweck: "Adresse mit Saldo, Transaktionen, Labels und Zuflussrisiko", auth: "offen oder Token" },
  { pfad: "/api/tx/{txid}", methode: "GET", zweck: "Transaktion mit Ein- und Ausgängen, Lightning-Hinweise", auth: "offen oder Token" },
  { pfad: "/api/trace", methode: "POST", zweck: "Geldfluss verfolgen, vollständiger Graph als Antwort", auth: "offen oder Token" },
  { pfad: "/api/trace/stream", methode: "POST", zweck: "Wie /api/trace, aber zeilenweise als NDJSON mit Zwischenständen", auth: "offen oder Token" },
  { pfad: "/api/path", methode: "POST", zweck: "Verbindungen zwischen zwei Adressen suchen", auth: "offen oder Token" },
  { pfad: "/api/screen", methode: "POST", zweck: "Bis zu 200 Adressen gegen Meldelisten prüfen", auth: "offen oder Token" },
  { pfad: "/api/providers", methode: "GET", zweck: "Datenquellen, Chains und Zwischenspeicher", auth: "offen oder Token" },
  { pfad: "/api/price", methode: "GET", zweck: "Aktueller Kurs oder Kursreihe (from/to in Unix-Sekunden)", auth: "offen" },
  { pfad: "/api/health", methode: "GET", zweck: "Zustandsbericht für Überwachung und Betrieb", auth: "offen" },
  { pfad: "/api/openapi", methode: "GET", zweck: "Diese Schnittstelle als OpenAPI-3.1-Dokument", auth: "offen" },
  { pfad: "/api/cases", methode: "GET, POST", zweck: "Fälle auflisten und anlegen", auth: "Cookie" },
  { pfad: "/api/cases/{id}", methode: "GET, PATCH, DELETE", zweck: "Fall lesen, ändern, löschen", auth: "Cookie" },
  { pfad: "/api/annotations", methode: "GET, POST", zweck: "Eigene Labels auflisten, anlegen oder ändern", auth: "Cookie" },
  { pfad: "/api/annotations/{id}", methode: "DELETE", zweck: "Label löschen", auth: "Cookie" },
  { pfad: "/api/watch", methode: "GET, POST, PUT", zweck: "Beobachtungsliste lesen, ergänzen, Benachrichtigungen einstellen", auth: "Cookie" },
  { pfad: "/api/watch/{id}", methode: "PATCH, DELETE", zweck: "Eintrag ändern oder entfernen", auth: "Cookie" },
  { pfad: "/api/watch/check", methode: "GET, POST", zweck: "Beobachtete Adressen prüfen", auth: "Cookie oder CRON_SECRET" },
  { pfad: "/api/tokens", methode: "GET, POST", zweck: "Zugriffstoken auflisten und anlegen", auth: "nur Cookie" },
  { pfad: "/api/tokens/{id}", methode: "DELETE", zweck: "Zugriffstoken widerrufen", auth: "nur Cookie" },
];

const BEISPIEL = `curl -s -X POST https://<host>/api/trace \\
  -H "Authorization: Bearer chk_…" -H "Content-Type: application/json" \\
  -d '{"start":"1A1z…","chain":"bitcoin","maxDepth":2}'`;

export default function ApiDocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Schnittstelle für eigene Skripte</h1>
        <p className="mt-1 text-sm text-gray-400">
          Alle Endpunkte liefern JSON; Fehler stehen im Feld <span className="mono">error</span>. Die maschinenlesbare
          Beschreibung nach OpenAPI 3.1 liegt unter{" "}
          <Link href="/api/openapi" className="text-accent mono">
            /api/openapi
          </Link>
          .
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Token anlegen und benutzen</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-300">
          <li>
            Einloggen und unter{" "}
            <Link href="/settings" className="text-accent">
              Einstellungen
            </Link>{" "}
            im Abschnitt „Zugriffstoken für Skripte“ ein Token mit Namen und Rechten anlegen.
          </li>
          <li>
            Das Token beginnt mit <span className="mono">chk_</span> und wird{" "}
            <strong>nur ein einziges Mal</strong> angezeigt – gespeichert wird serverseitig nur sein Hashwert.
          </li>
          <li>
            Bei jeder Anfrage als <span className="mono">Authorization: Bearer chk_…</span> oder im Kopf{" "}
            <span className="mono">X-API-Key</span> mitsenden.
          </li>
          <li>Verlorene oder offengelegte Token in den Einstellungen widerrufen und ein neues anlegen.</li>
        </ol>
        <pre className="mono overflow-x-auto rounded-md border border-border bg-background p-3 text-xs">{BEISPIEL}</pre>
        <p className="text-sm text-gray-400">
          Bei Token-Anfragen greifen deine hinterlegten Provider-Keys genauso wie in der Oberfläche. Die Verwaltung der
          Token selbst verlangt das Sitzungs-Cookie – mit einem Token lassen sich keine weiteren Token anlegen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="btn">
            Token verwalten
          </Link>
          <Link href="/api/openapi" className="btn-secondary">
            OpenAPI-Dokument öffnen
          </Link>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Endpunkte</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">Pfad</th>
                <th className="py-2 pr-3">Methode</th>
                <th className="py-2 pr-3">Zweck</th>
                <th className="py-2">Authentifizierung</th>
              </tr>
            </thead>
            <tbody>
              {ENDPUNKTE.map((e) => (
                <tr key={e.pfad} className="border-t border-border align-top">
                  <td className="mono py-2 pr-3 whitespace-nowrap">{e.pfad}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-400">{e.methode}</td>
                  <td className="py-2 pr-3">{e.zweck}</td>
                  <td className="py-2 text-gray-400">{e.auth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          „offen oder Token“ bedeutet: ohne Anmeldung nutzbar, mit Token gelten zusätzlich deine eigenen Provider-Keys.
          „Cookie“ steht für die Anmeldung in der Weboberfläche.
        </p>
      </div>

      <div className="card space-y-2 text-sm text-gray-400">
        <h2 className="font-semibold text-foreground">Grenzen und Hinweise</h2>
        <p>
          Die teuren Endpunkte sind je Absender-IP begrenzt: <span className="mono">trace</span> 20,{" "}
          <span className="mono">path</span> 10, <span className="mono">screen</span> 5,{" "}
          <span className="mono">address</span> und <span className="mono">tx</span> je 120 Anfragen pro Minute. Bei
          Überschreitung antwortet der Server mit Status 429 und der Kopfzeile <span className="mono">Retry-After</span>.
        </p>
        <p>
          Ein Trace kann mehrere Minuten laufen. Für lange Läufe eignet sich{" "}
          <span className="mono">/api/trace/stream</span>: die Antwort ist NDJSON, jede Zeile ein Zwischenstand, die
          letzte Zeile enthält <span className="mono">phase=&quot;done&quot;</span> und das Ergebnis unter{" "}
          <span className="mono">result</span>.
        </p>
        <p>
          Die Chain wird bei GET-Abfragen über den Query-Parameter <span className="mono">chain</span> gewählt, bei
          POST-Abfragen über das gleichnamige Feld im JSON-Körper.
        </p>
      </div>
    </div>
  );
}
