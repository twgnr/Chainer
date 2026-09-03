# Chainer – Blockchain-Tracing

*[English version](README.md)*

Next.js/React-Anwendung, die Kryptowährungs-Adressen und -Transaktionen über mehrere **kostenlose**
Datenquellen analysiert und Geldflüsse als Graph zurückverfolgt.

## Funktionen

### Analyse
- **Suche** nach Adresse oder Transaktion: Saldo, Verlauf, Ein-/Ausgänge, Ausgabestatus, Wert zum damaligen Kurs.
- **Zwei Verfolgungsmodi**:
  - *adressbasiert* – alle Transaktionen einer Adresse,
  - *UTXO-genau* – nur die konkreten Coins über ihre Ausgabekette (auch bei Ausgängen ohne Adresse, etwa P2PK).
- **Richtung**: vorwärts (wohin flossen die Coins?), rückwärts (woher kamen sie?) oder beides.
- **Taint-Analyse** mit drei Modellen:
  | Modell | Verhalten bei 1 BTC verfolgt + 3 BTC sauber, Ausgänge 1 und 3 BTC |
  | --- | --- |
  | Haircut | anteilig: 0,25 und 0,75 BTC |
  | FIFO | Reihenfolge: 1,00 und 0,00 BTC |
  | Poison | alles verunreinigt: 1,00 und 3,00 BTC |
- **Herkunfts-Warnung**: jede Adresse im Graph, die in einer Sanktions-, Ransomware-, Betrugs- oder Darknet-Liste
  geführt wird, wird zur Quelle einer zweiten Verfolgung. Nachgelagerte Adressen zeigen dann, wie viel ihres
  Zuflusses von dort stammt und über welche Quelle. Zusätzlich werden Zahlungen *an* solche Adressen markiert.
  Optional lassen sich Mixer und Adressen mit mittlerem Risiko einbeziehen.
- **Heuristiken**: Common-Input-Clustering (Union-Find), Wechselgeld-Erkennung (Adresswiederverwendung, Skript-Typ,
  Rundheit des Betrags), CoinJoin-, Konsolidierungs- und Batch-Hinweise, Peeling-Ketten, Coinbase-Erkennung.
- **Zeitmuster**: Aktivität nach Wochentag und Stunde mit Schätzung der Zeitzone aus der ruhigsten Nachtphase.
- **Verhaltensbasierte Diensterkennung**: Batch-Auszahlungen, viele Gegenparteien, Sammeladressen, Cold Wallets.
- **Lightning**: erkennt Transaktionen, die einen Zahlungskanal öffnen oder schließen, samt beteiligter Knoten.
- **Historische Kurse**: Beträge in Euro zum Zeitpunkt der Transaktion, nicht nur zum heutigen Kurs.
- **Verbindungssuche**: findet Geldwege zwischen zwei Adressen. Gesucht wird gleichzeitig von beiden Seiten
  (bidirektionale Breitensuche), wahlweise nur in Flussrichtung oder in beide Richtungen. Umschlagplätze wie
  Börsen lassen sich überspringen, damit die gefundenen Wege aussagekräftig bleiben. Das Abfragebudget ist
  begrenzt und wird im Ergebnis ausgewiesen.
- **Massenprüfung**: bis zu 200 Adressen auf einmal einfügen oder als Datei hochladen und gegen alle Label-,
  Sanktions- und Missbrauchsquellen prüfen, mit Ergebnistabelle und CSV-Export.
- **Einzahlungsadressen erkennen**: Adressen, die Geld annehmen und praktisch alles an eine einzige Sammeladresse
  weiterreichen, sind Einzahlungsadressen eines Dienstes. Der Betreiber weiß, wem sie zugeteilt war, und ist damit
  der erfolgversprechendste Ansprechpartner für eine Auskunft.
- **Wallet-Fingerabdruck**: aus Version, Sperrzeit, Sequenznummern, BIP69-Sortierung und Skript-Typen wird eine
  Kurzform gebildet. Transaktionen mit gleicher Kurzform stammen wahrscheinlich aus derselben Wallet-Software und
  lassen sich auch ohne gemeinsame Eingänge verknüpfen.
- **Cross-Chain-Sprünge**: Tausch- und Brückendienste werden anhand der Labels erkannt und im Graph markiert. Auf
  der Transaktionsseite lässt sich prüfen, ob bei einer Kandidatenadresse auf der Zielkette ein Betrag eingegangen
  ist, der dem Abgang nach Kursumrechnung entspricht.
- **Mixer-Ausgänge korrelieren**: Auszahlungen eines Dienstes, die betrags- und zeitnah zu einer Einzahlung passen,
  werden als bewertete Kandidatenliste ausgegeben.
- **Mehrere Startpunkte**: mehrere Opferadressen gemeinsam verfolgen und sehen, wo die Wege zusammenlaufen.
- **Beweissicherung**: zu jeder Abfrage wird festgehalten, welche Quelle wann welche Daten geliefert hat, mit einem
  Prüfwert über die Rohdaten und einem Gesamtprüfwert über den ganzen Trace.

### Darstellung
- **Graph** mit Zoom, frei verschiebbaren Knoten, Pfad-Hervorhebung, Cluster-Einfärbung, Taint-Balken,
  Faltung ganzer Cluster zu einem Knoten, Ausblenden einzelner Knoten und Kommentaren.
- **Verlauf**: chronologische Tabelle aller Transaktionen mit Sendern, Empfängern, Labels, Taint-Anteil und Filter.
- **Muster**: Aktivitäts-Heatmap, Peeling-Ketten und verhaltensauffällige Adressen.
- **Warnungen**: eigener Reiter mit allen gemeldeten Adressen im Graph, den Empfängern ihres Geldes samt Anteil
  und Herkunftskette sowie den Zahlungen an gemeldete Adressen. Im Graph lassen sich belastete Flüsse rot
  hervorheben oder alles andere ausblenden; im Verlauf gibt es dafür einen eigenen Filter.
- **Live-Aufbau**: der Trace läuft als Datenstrom, Zwischenstände erscheinen sofort und lassen sich abbrechen.
- **Zeitachsen-Layout**: die waagerechte Achse ist die Zeit, sodass Abstände echten Zeiträumen entsprechen.
- **Forensik-Reiter**: Einzahlungsadressen, Cross-Chain-Übergänge, Wallet-Fingerabdrücke und der Datennachweis.

### Ermittlungs-Workflow
- **Fälle** mit mehreren Traces, Notizen, Ermittlungsprotokoll und gespeicherter Graph-Ansicht.
- **Eigene Labels und Notizen** je Adresse, privat oder im Team geteilt; sie haben Vorrang vor externen Datenbanken.
- **Manuelle Cluster-Korrektur**: Adressen zusammenführen, wenn die Automatik danebenliegt.
- **Watchlist** mit Benachrichtigung bei neuer Aktivität per E-Mail, Telegram oder Webhook. Kommt ein Zufluss von
  einer gemeldeten Adresse, enthält die Nachricht eine ausdrückliche Warnung mit Absender und Quelle.
- **Bericht** je Fall, druckbar als PDF, plus CSV- und JSON-Export.
- **Automatische Fallaktualisierung**: ein Fall wird in einem einstellbaren Abstand neu gerechnet; bei Bewegung
  entsteht ein Protokolleintrag und eine Benachrichtigung.
- **Notizen an Transaktionen**, nicht nur an Adressen.
- **Hintergrund-Aufträge**: lange Analysen werden eingestellt und vom Server nacheinander abgearbeitet, auch wenn
  man die Seite verlässt. Das hebt die Grenze, die sonst die Antwortzeit einer Anfrage setzt.
- **Zugriffstoken** für eigene Skripte, dazu eine Schnittstellenbeschreibung nach OpenAPI 3.1 unter `/api/openapi`
  und eine Übersicht unter `/api-docs`.
- **Gesamt-Export**: alle Fälle, Labels, Watchlist-Einträge und Einstellungen als eine JSON-Datei. Zugangsdaten sind
  darin nur maskiert enthalten, damit der Export weitergegeben werden kann.
- **Schemaversionierung**: Fälle aus älteren Ständen werden beim Öffnen einmalig auf das aktuelle Format gehoben,
  fehlende Auswertungen bleiben leer statt Fehler zu erzeugen.
- **Teams**: Organisationen mit Rollen (Eigentümer, Admin, Mitglied, Betrachter), geteilte Fälle und API-Keys.

## Unterstützte Chains

Bitcoin, Litecoin, Dogecoin, Bitcoin Cash, Ethereum und Tron. Konto-basierte Chains werden auf dasselbe
Graph-Modell abgebildet, sodass Verfolgung, Taint und Darstellung identisch funktionieren; Token-Transfers
erscheinen als eigene Kanten. Tron ist besonders relevant, weil ein großer Teil des heutigen Stablecoin-Betrugs
über USDT-TRC20 läuft.

## Datenquellen

| Quelle | Typ | Chains | Key |
| --- | --- | --- | --- |
| Bitcoin Core (eigener Knoten) | Blockchain | BTC | nein, braucht `txindex=1` |
| Electrum-/ElectrumX-Server | Blockchain | BTC, LTC | nein |
| mempool.space | Blockchain (Esplora) | BTC | nein |
| Blockstream Esplora | Blockchain | BTC | nein |
| litecoinspace.org | Blockchain | LTC | nein |
| Blockchain.com | Blockchain | BTC | nein |
| BlockCypher | Blockchain | BTC, LTC, DOGE | optional |
| Blockchair | Blockchain | BTC, LTC, DOGE, BCH | optional (ohne Key oft IP-gesperrt) |
| Blockscout | Blockchain | ETH | nein |
| Etherscan | Blockchain | ETH | erforderlich |
| TronGrid | Blockchain | TRX | optional (ohne Key 3 Anfragen/s) |
| OFAC-Sanktionsliste | Sanktionen | BTC, LTC, BCH, ETH | nein |
| Stablecoin-Sperrlisten (Tether, Circle) | eingefrorene Adressen | ETH, TRX | nein |
| Ransomwhere | Ransomware | BTC | nein |
| GraphSense-TagPacks | Börsen, Mixer, Darknet, Mining | alle | nein |
| WalletExplorer | Cluster und Dienste | BTC | nein |
| CryptoScamDB | Betrugsmeldungen | alle | nein |
| Chainabuse | Missbrauchsmeldungen | alle | erforderlich (kostenlos) |
| Bitcoin Who's Who | Reputation, Web-Erwähnungen | BTC | erforderlich (kostenlos) |
| Eigene Labels | Nutzer und Team | alle | – |
| CoinGecko | Kurse, auch historisch | alle | nein |

Fällt eine Quelle aus (Rate-Limit, Ausfall), übernimmt automatisch die nächste. Eigene Infrastruktur wird
bevorzugt. Neue Quellen: `ChainProvider` beziehungsweise `IntelProvider` in `src/lib/providers/types.ts`
implementieren und in `src/lib/providers/registry.ts` eintragen.

## Installation

```bash
npm install
cp .env.example .env.local   # Werte anpassen; alles ist optional
npm run dev                  # http://localhost:3000
```

Produktivbetrieb: `npm run build && npm start`.

Ohne `MONGODB_URI` läuft alles im Gastmodus. Für Login, Fälle, Watchlist, Teams und den dauerhaften Cache
werden `MONGODB_URI` und `AUTH_SECRET` benötigt.

## Projektstruktur

```
src/app                    Seiten und API-Routen
src/components             React-Komponenten (Graph mit @xyflow/react + dagre, Formulare, Bericht)
src/lib/chains.ts          Chain-Definitionen und Formaterkennung
src/lib/providers          Datenquellen und Registry mit Fallback
src/lib/providers/intel    Label-, Risiko- und Sanktionsquellen
src/lib/trace/engine.ts    Verfolgung (adressbasiert und UTXO-genau)
src/lib/trace/taint.ts     Taint-Modelle
src/lib/trace/heuristics.ts Clustering, Wechselgeld, Peeling, Zeitmuster, Verhalten
src/lib/trace/risk.ts      Einstufung als schädlich, Grundlage der Herkunfts-Warnung
src/lib/trace/path.ts      Verbindungssuche zwischen zwei Adressen
src/lib/trace/inflow.ts    Prüfung der direkten Absender einer Adresse
src/lib/trace/deposit.ts   Erkennung von Einzahlungsadressen
src/lib/trace/fingerprint.ts Wallet-Fingerabdruck aus den Rohmerkmalen
src/lib/trace/crosschain.ts Tausch- und Brückendienste, Abgleich auf der Zielkette
src/lib/trace/mixer.ts     Korrelation von Mixer-Ausgängen
src/lib/i18n               Sprachauswahl, Übersetzung der Texte aus Analyse und API
src/lib/theme.ts           Hell-/Dunkelmodus
src/lib/evidence.ts        Beweissicherung der verwendeten Rohdaten
src/lib/jobs.ts            Warteschlange für Hintergrund-Aufträge
src/lib/apitoken.ts        Zugriffstoken für Skripte
src/lib/caseRefresh.ts     Automatische Fallaktualisierung
src/lib/logger.ts          Strukturierte Protokollierung mit Anfragekennung
src/lib/migrate.ts         Schemaversionierung gespeicherter Fälle
src/middleware.ts          Vergabe der Anfragekennung
src/lib/ratelimit.ts       Rate-Limit der teuren Endpunkte
src/lib/cache.ts           Zweistufiger Cache (Speicher und MongoDB)
src/lib/auth.ts            Session, Nutzer-Keys, Provider-Kontext
src/lib/watch.ts           Watchlist-Prüfung und Benachrichtigung
src/lib/models             Mongoose-Modelle (User, Org, Case, Annotation, Watch, CacheEntry)
src/instrumentation.ts     Optionaler Zeitgeber für die Watchlist
```

## API

| Route | Beschreibung |
| --- | --- |
| `GET /api/address/:addr?chain=` | Adressinfo, Transaktionen, Labels, Einstufung und Zuflüsse von gemeldeten Adressen |
| `GET /api/tx/:txid?chain=` | Transaktionsdetails inklusive Lightning-Kanal |
| `POST /api/trace` | Trace ausführen, vollständiges Ergebnis |
| `POST /api/trace/stream` | Trace als NDJSON-Datenstrom mit Zwischenständen |
| `POST /api/path` | Verbindung zwischen zwei Adressen suchen |
| `POST /api/screen` | Massenprüfung einer Adressliste |
| `POST /api/mixer` | Mixer-Ausgänge zu einer Einzahlung korrelieren |
| `POST /api/crosschain` | Übergang auf eine andere Chain abgleichen |
| `GET/POST /api/jobs`, `GET/DELETE /api/jobs/:id` | Hintergrund-Aufträge |
| `GET/POST /api/tokens`, `DELETE /api/tokens/:id` | Zugriffstoken |
| `POST /api/cases/refresh` | Fälle neu rechnen (Session oder `CRON_SECRET`) |
| `GET /api/openapi` | Schnittstellenbeschreibung (OpenAPI 3.1) |
| `GET /api/export` | Gesamt-Export aller eigenen Daten |
| `POST /api/settings/rekey` | Zugangsdaten mit dem aktuellen Schlüssel neu verschlüsseln |
| `GET /api/health` | Zustandsbericht für Überwachung |
| `GET /api/providers?chain=&ping=1` | Status und Erreichbarkeit der Quellen, Cache-Größe |
| `GET /api/price?chain=&from=&to=` | Aktueller Kurs oder Kursverlauf |
| `GET/POST/PATCH/DELETE /api/cases[/:id]` | Fälle mit Traces, Protokoll, Ansicht |
| `GET/POST /api/annotations`, `DELETE /api/annotations/:id` | Eigene Labels |
| `GET/POST/PUT /api/watch`, `PATCH/DELETE /api/watch/:id` | Watchlist und Benachrichtigungen |
| `POST /api/watch/check` | Prüfung auslösen (Session oder `CRON_SECRET`) |
| `GET/POST/PATCH /api/org` | Team, Mitglieder, Rollen, geteilte Keys |
| `GET/PUT /api/settings/keys` | Eigene API-Keys und Knoten-Konfiguration |
| `GET/DELETE /api/cache` | Cache-Statistik und Leeren |
| `POST /api/auth/register\|login\|logout`, `GET /api/auth/me` | Anmeldung |

## Betrieb

### Oberflächensprache und Farbschema

Die Oberfläche gibt es auf **Englisch** (Standard) und **Deutsch**; das Farbschema lässt sich auf hell, dunkel oder
„wie das Betriebssystem" stellen. Beides wird in der Kopfzeile gewählt und in einem Cookie abgelegt, sodass der
Server die Seite gleich in der richtigen Sprache und im richtigen Modus ausliefert. Ohne Cookie richtet sich die
Sprache nach dem Kopf `Accept-Language`, sonst nach Englisch.

### Docker

```bash
export AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose up -d
```

Das mitgelieferte `docker-compose.yml` startet die Anwendung zusammen mit einer MongoDB. Der Container nutzt die
Standalone-Ausgabe von Next.js, läuft als unprivilegierter Nutzer und bringt eine Zustandsprüfung mit. Alle
Umgebungsvariablen aus `.env.example` lassen sich durchreichen.

### Datenschutz

Jede Abfrage bei einer öffentlichen Quelle verrät dieser Quelle, wonach gesucht wird. Der Datenschutzmodus
beschränkt die Anwendung auf Quellen, die das Ermittlungsziel nicht weitergeben: eigenen Knoten, Electrum sowie
Listen, die vollständig heruntergeladen und lokal geprüft werden (Sanktionen, Ransomware, TagPacks). Er lässt sich
je Nutzer in den Einstellungen setzen oder serverweit über `PRIVACY_MODE=true` erzwingen. Ohne eigene Infrastruktur
bleiben dabei keine Blockchain-Quellen übrig; das steht auch in der Oberfläche.

### Schlüsselwechsel

Wird `ENCRYPTION_KEY` geändert, bleiben bestehende Zugangsdaten nur lesbar, wenn der alte Wert in
`ENCRYPTION_KEY_PREVIOUS` steht. In den Einstellungen verschlüsselt „Jetzt neu verschlüsseln" alle eigenen Werte
mit dem neuen Schlüssel; danach kann der alte Eintrag entfernt werden.

### Protokollierung

Jede Anfrage bekommt eine Kennung, die als Kopfzeile `x-request-id` zurückkommt und in allen Protokollzeilen
derselben Anfrage steht. Im Betrieb wird jede Zeile als JSON ausgegeben, in der Entwicklung lesbar. Die Stufe
steuert `LOG_LEVEL` (debug, info, warn, error).

### Zustand und Schutz

- `GET /api/health` liefert Status, Datenbankverbindung, Cache-Größe und verfügbare Benachrichtigungskanäle.
  Der Endpunkt antwortet mit 503, wenn eine konfigurierte Datenbank nicht erreichbar ist.
- Die teuren Endpunkte sind ratenbegrenzt (Trace 20, Verbindungssuche 10, Massenprüfung 5, Adresse und
  Transaktion je 120 Anfragen pro Minute und Absender). Bei Überschreitung kommt Status 429 mit `Retry-After`.
  Abschaltbar über `RATE_LIMIT_DISABLED=true`, etwa hinter einem eigenen Reverse-Proxy.

## Tests

```bash
npm test          # einmalig
npm run test:watch
```

Die Tests decken drei Ebenen ab und greifen weder auf das Netz noch auf die Datenbank zu:

- **Logik**: Taint-Modelle, Wechselgeld-, Peeling- und Einzahlungserkennung, Zeitmuster, Risikoeinstufung,
  Wallet-Fingerabdruck, Adressformate, Formatierung, Übersetzung der Texte aus Analyse und API, TagPack-Parser,
  Cache, Zuflussanalyse, Beweissicherung, Migration und Protokollierung.
- **Umwandlung der Anbieterdaten**: aufgezeichnete echte Antworten in `src/lib/providers/__fixtures__/` werden durch
  die Provider geschickt und das Ergebnis geprüft. Ändert ein Anbieter sein Format, fällt es hier auf. Neu
  aufzeichnen mit `npm run fixtures`.
- **API-Routen**: Validierung, Berechtigungen, Fehlercodes und Ratenbegrenzung aller Endpunkte mit ausgetauschten
  Providern.

## Hintergrunddienste

Drei Dienste laufen optional im Serverprozess, jeweils nur mit Datenbank:

```bash
JOB_POLL_SECONDS=5                  # Warteschlange für lange Analysen (immer aktiv, wenn eine Datenbank da ist)
WATCH_INTERVAL_MINUTES=15           # Watchlist prüfen
CASE_REFRESH_INTERVAL_MINUTES=360   # Fälle neu rechnen
```

Bei mehreren Instanzen besser einen externen Cron-Dienst auf `/api/watch/check` und `/api/cases/refresh` mit
`CRON_SECRET` einrichten.

## Automatische Watchlist-Prüfung

Zwei Wege, in `.env.local` zu konfigurieren:

```bash
WATCH_INTERVAL_MINUTES=15        # eingebauter Zeitgeber, für eine einzelne Instanz
```

```bash
CRON_SECRET=<zufälliger Wert>    # externer Cron-Dienst:
# curl -X POST https://<host>/api/watch/check -H "Authorization: Bearer <CRON_SECRET>"
```

## Hinweise

- Alle Heuristiken – Clustering, Wechselgeld, Taint, Herkunfts-Warnung – liefern **Wahrscheinlichkeitsaussagen,
  keine Beweise**. Dass Geld über mehrere Schritte von einer gemeldeten Adresse stammt, belegt keine Beteiligung
  des Empfängers; Börsen und Zahlungsdienste erhalten laufend Mittel gemischter Herkunft.
- Die kostenlosen Zugänge sind rate-limitiert. Ergebnisse werden zwischengespeichert: bestätigte Transaktionen
  30 Tage, Sanktions- und Label-Listen 6 bis 24 Stunden, Kursverläufe 12 Stunden. Mit MongoDB überlebt der
  Cache Neustarts.
- Der kostenlose CoinGecko-Zugang liefert Kurshistorien nur für die letzten 365 Tage; ältere Transaktionen
  erscheinen ohne damaligen Wert.
- Sehr aktive Adressen (Börsen) werden ab Tiefe 1 nicht weiter expandiert, damit der Graph lesbar bleibt.
- Der Wallet-Fingerabdruck braucht Rohmerkmale, die derzeit nur die Esplora-Schnittstellen liefern
  (mempool.space, Blockstream, litecoinspace).
- Eine vollständige Suche über eine fremde Chain ist ohne eigenen Index nicht möglich. Der Cross-Chain-Abgleich
  prüft deshalb eine angegebene Kandidatenadresse und liefert eine bewertete Einschätzung, keine Zuordnung.
- Die Token-Verträge von Tether und Circle führen teilweise ihre eigene Adresse auf der Sperrliste. Diese
  Selbsteinträge werden ausgefiltert, weil sie sonst einen Fehlalarm erzeugen.
- Sitzungen lassen sich einzeln oder für alle Geräte widerrufen. Nach dem Zurücksetzen eines Passworts werden alle
  bestehenden Sitzungen ungültig.
- Nach fünf Fehlversuchen wird ein Konto vorübergehend gesperrt; die Sperre verlängert sich bei weiteren Versuchen
  bis auf eine Stunde. Die Fehlermeldung verrät dabei nicht, ob es die E-Mail-Adresse gibt.
- Gespeicherte API-Keys und Knoten-Zugangsdaten werden mit AES-256-GCM verschlüsselt abgelegt.
- Benachrichtigungs-E-Mails und das OpenAPI-Dokument liegen bislang nur auf Deutsch vor.
