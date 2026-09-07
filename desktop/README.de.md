# Chainer Desktop

Die Chainer-Oberfläche als eigenständige Windows-Anwendung: dieselben Seiten,
dasselbe Layout, dieselben Farben wie die Web-Fassung — geschrieben in reinem
C++ auf Win32 mit Direct2D und DirectWrite. Keine Fremd-Frameworks, keine Lizenz
über das Windows-SDK hinaus.

*English version: [README.md](README.md)*

## Was es ist

Eine Anwendung, die auf dem eigenen Rechner läuft und die Blockchain-Daten
direkt bei den Quellen holt — ohne Server dazwischen:

* **Keine Anmeldung, keine Registrierung.** Es gibt kein Konto und keine
  Nutzerverwaltung.
* **Keine Datenbank.** Fälle, Beobachtungen, eigene Labels und die API-Keys
  stehen in einer lesbaren JSON-Datei unter `%LOCALAPPDATA%\Chainer\chainer.json`.
  Keys werden darin mit der Windows-Datenschutz-API (DPAPI) verschlüsselt und
  sind damit an das Windows-Konto gebunden.
* **Echte Daten.** Adressen, Transaktionen, Kurse und Labels kommen live von den
  angebundenen Diensten. Die Anwendung spricht direkt mit ihnen; abgefragte
  Adressen gehen an die eingeschalteten Quellen, die Ergebnisse bleiben hier.

Das Aussehen folgt `src/app/globals.css` und den Komponenten unter
`src/components` eins zu eins: dieselben Farbtoken für Hell- und Dunkelmodus,
dieselben Tailwind-Abstände (1 Einheit = 4 px), dieselben Schriftgrößen und
Zeilenhöhen. Eine Zeicheneinheit ist ein CSS-Pixel; auf einem Bildschirm mit
Skalierung sieht die Anwendung deshalb genauso aus wie der Browser bei
derselben Zoomstufe.

## Bauen

Vorausgesetzt wird Visual Studio 2022 (oder die Build Tools) mit der Arbeitslast
**Desktopentwicklung mit C++**.

```bat
build.bat
```

Ergebnis ist `build\Chainer.exe` — eine einzelne, in sich geschlossene Datei
(statisch gebundene Laufzeit, `/MT`).

Aus einer bereits geöffneten Entwickler-Eingabeaufforderung nutzt `build.bat`
die vorhandene Umgebung; sonst findet es Visual Studio selbst über `vswhere`.

## Datenquellen

Ohne Zugangsdaten nutzbar:

| Quelle | Ketten | Zweck |
| --- | --- | --- |
| mempool.space, Blockstream, litecoinspace | BTC, LTC | Adressen, Transaktionen, Outspends |
| Blockchain.com | BTC | Erreichbarkeit |
| Blockchair | BTC, LTC, DOGE, BCH | Adressen und Transaktionen (Key hebt das Limit an) |
| BlockCypher | BTC, LTC, DOGE | Ausweichquelle (Token hebt das Limit an) |
| Blockscout | ETH, Polygon, Arbitrum | Adressen und Transaktionen |
| TronGrid | TRX | Konten und Transaktionen (Key hebt das Limit an) |
| CoinGecko, Blockchain.com | alle | Kurse |
| OFAC-Sanktionsliste, Ransomwhere | BTC, LTC, BCH, ETH | Sanktions- und Ransomware-Listen |
| WalletExplorer, CryptoScamDB | BTC bzw. alle | Wallet-Cluster und Scam-Meldungen |

Mit eigenem Key: **Etherscan** (ein Key für alle EVM-Ketten), **Chainabuse**,
**Bitcoin Who's Who**. Die Keys werden unter *Quellen* eingetragen.

Fällt eine Quelle aus, geht die Anwendung zur nächsten in der Reihenfolge über.
Eine Quelle, die nicht antwortet, wird zwei Minuten lang übersprungen, damit ein
Trace nicht bei jeder Adresse erneut in die Zeitüberschreitung läuft. Die
Listenquellen (OFAC, Ransomwhere) werden heruntergeladen und sechs bzw.
vierundzwanzig Stunden lang unter `%LOCALAPPDATA%\Chainer\cache` behalten.

## Seiten

| Seite | Inhalt |
| --- | --- |
| Suche | Suchfeld mit Formaterkennung, die vier Schritte, Übersicht der Datenquellen |
| Trace | Parameterformular, Statistik, Warnbanner, Graph mit Seitenpanel, Verlauf, Muster, Warnungen, Forensik |
| Verbindung | Bidirektionale Wegsuche zwischen zwei Adressen |
| Massenprüfung | Bis zu 200 Adressen gegen die Meldelisten, CSV-Ausgabe |
| Fälle | Gespeicherte Traces |
| Aufträge | Die laufenden und zuletzt gelaufenen Hintergrundabfragen |
| Watchlist | Beobachtete Adressen; „Jetzt prüfen“ holt Saldo und Anzahl neu und vermerkt Änderungen |
| Labels | Eigene Labels: anlegen, bearbeiten, löschen, suchen |
| Quellen | Datenquellen mit Erreichbarkeitsprüfung, API-Keys, Ablageort, Sprache und Farbschema |
| API | Beschreibung der Web-Schnittstelle |
| Info | Version, Autor, Repository |
| Adresse | Saldo, Labels, Aktivitätsmuster, Transaktionsliste |
| Transaktion | Volumen, Gebühr, Zeit, Ein- und Ausgänge |

Sprache (Deutsch/Englisch) und Farbschema (hell/dunkel/System) werden in der
Kopfleiste umgeschaltet, genau wie auf der Webseite; beides wird gemerkt.

## Wie der Trace arbeitet

**Adressbasiert** (Vorgabe): Breitensuche über die Provider-Schnittstellen. Von
der Startadresse werden die Transaktionen geladen, daraus entstehen Adress- und
Transaktionsknoten, und die Gegenseiten bilden die nächste Ebene — vorwärts
entlang der Ausgänge, rückwärts entlang der Eingänge, oder beides.

**UTXO-genau**: verfolgt nicht die Adresse, sondern die konkreten Coins. Jeder
Ausgang wird einzeln weiterverfolgt: wohin wurde genau dieser Ausgang
ausgegeben? Dazu fragt die Anwendung die Outspends der Transaktion ab und lädt
die ausgebende Transaktion. Ein Ausgang, der noch niemandem weitergereicht
wurde, wird als *noch nicht ausgegeben* vermerkt. Startet man mit einer
Transaktion, gelten deren Ausgänge als Anfang; startet man mit einer Adresse,
werden die Ausgänge verfolgt, die an sie zahlen. Weil Konto-Ketten (EVM, Tron)
keine unverbrauchten Ausgänge kennen, steht der Modus dort nicht zur Wahl.

Tiefe, Transaktionen je Adresse, Adressen je Transaktion, Mindestbetrag und
Knotenobergrenze begrenzen den Lauf in beiden Modi.

### Taint-Modelle

Nach dem Durchlauf wird verteilt, wie viel des Geldes aus der Startquelle
stammt. Die Transaktionen werden dazu chronologisch abgearbeitet:

| Modell | Regel |
| --- | --- |
| **Haircut** (anteilig) | Jeder Ausgang erbt den Anteil der gesamten Transaktion. Konservativ und weit verbreitet, verwässert aber über viele Hops. |
| **FIFO** (Reihenfolge) | „First in, first out“: Eingänge werden der Reihe nach den Ausgängen zugeordnet. Entspricht der Rechtsprechung in mehreren Ländern (Clayton's Case). |
| **Poison** (streng) | Sobald eine Transaktion belastetes Geld enthält, gelten alle ihre Ausgänge als vollständig belastet. |
| **keins** | Keine Taint-Rechnung. Die Herkunftswarnung nutzt dann Haircut. |

Das Ergebnis steht an jeder Kante und jedem Knoten: Betrag und Anteil aus der
Quelle, dazu die Summe, die an den Endpunkten des Graphen liegen bleibt. Für die
Herkunftswarnung läuft dieselbe Rechnung ein zweites Mal, diesmal ausgehend von
allen als schädlich gemeldeten Adressen — mit den Adressen, aus denen das Geld
stammt, und dem Betrag, der direkt an eine solche Adresse ging.

Danach werden Labels geladen und Cluster über die gemeinsame Eingangsheuristik
gebildet. Jede Abfrage landet im Protokoll der Beweissicherung: Zeitpunkt,
Statuscode und die SHA-256-Prüfsumme der Antwort, dazu eine Gesamtprüfsumme
über alle Einträge.

Alle Abfragen laufen in Hintergrund-Threads; die Oberfläche bleibt bedienbar und
ein laufender Trace lässt sich abbrechen.

## Aufbau der Quellen

```
src/
  main.cpp        Fenster, Direct2D, Nachrichtenschleife
  gfx.*           Zeichnen auf Direct2D/DirectWrite (Farben, Schrift, Befehlsliste)
  theme.*         Die Farbtoken aus globals.css samt Tailwind-Palette
  ui.*            Bausteine: Karten, Knöpfe, Eingaben, Auswahl, Ankreuzfelder, Layout
  app.*           Kopfleiste, Inhalt, Fußzeile, Wegwahl
  format.cpp      Zahlen, Beträge und Zeiten wie Intl sie setzt (en-GB / de-DE)
  net.*           HTTP über WinHTTP, Hintergrundaufträge, Beweissicherung (SHA-256)
  providers.*     Die Datenquellen und die Erkennung von Adressen und Transaktions-IDs
  live.cpp        Abfragen, Trace-Suche, Wegsuche, Massenprüfung, Watchlist-Prüfung
  taint.*         Die Taint-Modelle (Haircut, FIFO, Poison)
  widgets.cpp     Gemeinsame Bausteine, Trace-Graph, Aktivitätsmuster
  trace_panel.cpp Das Seitenpanel des Graphen
  pages_a.cpp     Suche, Trace, Verbindung, Massenprüfung
  pages_b.cpp     Fälle, Aufträge, Watchlist, Labels
  pages_c.cpp     Quellen, API, Info, Adresse, Transaktion
  store.*         JSON lesen/schreiben, DPAPI-Verschlüsselung, lokale Ablage
  export.cpp      JSON- und CSV-Ausgabe, Adressliste einlesen
  demo.cpp        Liste der Datenquellen und der leere Anfangszustand
```

## Schriften

Die Web-Fassung lädt *Geist* über `next/font`. Ist Geist lokal installiert, wird
sie genommen; sonst weicht die Anwendung auf Inter, Segoe UI Variable Text oder
Segoe UI aus, bei der dicktengleichen Schrift auf Geist Mono, JetBrains Mono,
Cascadia Mono oder Consolas.

## Lizenz und Urheberrecht

Copyright (c) by Tobias Wagner (twgnr) · <https://github.com/twgnr/Chainer>
