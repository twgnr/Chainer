import { DEFAULT_LOCALE, type Locale } from "./locale";

/**
 * Übersetzung der Texte, die die Analyse selbst erzeugt: Transaktions-Hinweise,
 * Verhaltensmuster, Warnungen und Fortschrittsmeldungen.
 *
 * Diese Texte entstehen tief in `src/lib/trace` und `src/lib/providers`, weit
 * weg von der Oberfläche, und werden dort auf Deutsch formuliert. Statt eine
 * Sprache durch alle Schichten zu reichen, werden sie hier – unmittelbar vor
 * der Anzeige – übersetzt. Das hat einen zweiten Vorteil: die Oberfläche
 * erkennt Hinweisarten weiterhin am deutschen Originaltext (etwa
 * `hints.some((h) => h.includes("CoinJoin"))`), und diese Prüfungen bleiben
 * unabhängig von der gewählten Sprache gültig.
 *
 * Unbekannte Texte werden unverändert durchgereicht.
 */

const EXACT: Record<string, string> = {
  /* Transaktionsmuster */
  "Coinbase-Transaktion (Mining-Belohnung)": "Coinbase transaction (mining reward)",
  "Konsolidierung (viele Inputs → ein Output)": "Consolidation (many inputs → one output)",
  "Transaktion fehlgeschlagen (Gas verbraucht, kein Transfer)": "Transaction failed (gas spent, no transfer)",
  "Zahlung an eine als schädlich eingestufte Adresse": "Payment to an address classified as harmful",

  /* Wechselgeld-Begründungen */
  "Adresse wird wiederverwendet": "the address is reused",
  "gleicher Skript-Typ wie Eingänge": "same script type as the inputs",
  "unrunder Betrag": "non-round amount",

  /* Verhaltensmuster einer Adresse */
  "Batch-Auszahlungen (Börsen-typisch)": "Batch payouts (typical of exchanges)",
  "Sehr viele Gegenparteien (Dienst/Börse)": "Very many counterparties (service/exchange)",
  "Sammeladresse (Konsolidierung)": "Collection address (consolidation)",
  "Adresse mehrfach wiederverwendet": "Address reused several times",
  "Nur Eingänge (Sparadresse / Cold Wallet)": "Deposits only (savings address / cold wallet)",

  /* Knoten-Labels aus der Analyse */
  "Neu geschürfte Coins": "Newly mined coins",
  "Sehr aktive Adresse (nur Auszug)": "Very active address (excerpt only)",

  /* Fortschritt und Warnungen des Traces */
  "Abgebrochen.": "Cancelled.",
  "Taint-Analyse": "Taint analysis",
  "Cluster werden gebildet": "Building clusters",
  "Muster werden erkannt": "Detecting patterns",
  "Labels werden abgefragt": "Fetching labels",
  "Lightning-Kanäle werden geprüft": "Checking Lightning channels",
  "Herkunft wird bewertet": "Assessing the origin",
  "Dienste und Wallet-Merkmale werden erkannt": "Detecting services and wallet fingerprints",
  "einer als schädlich eingestuften Adresse": "an address classified as harmful",

  /* Zeitzonen-Regionen der Aktivitätsanalyse */
  "Nordamerika (Westküste)": "North America (west coast)",
  "Nordamerika (Ostküste)": "North America (east coast)",
  "Südamerika": "South America",
  "Westeuropa / Britische Inseln": "Western Europe / British Isles",
  "Mitteleuropa": "Central Europe",
  "Osteuropa / Russland": "Eastern Europe / Russia",
  "Südasien": "South Asia",
  "Südostasien": "South-east Asia",
  "Ostasien (China)": "East Asia (China)",
  "Ostasien (Japan/Korea)": "East Asia (Japan/Korea)",
  "Ozeanien": "Oceania",

  /* Wallet-Fingerabdruck */
  "Bitcoin Core (ohne Ersetzbarkeit)": "Bitcoin Core (without replaceability)",
  "Börsen-Batch oder ältere Wallet": "Exchange batch or older wallet",
  "ältere oder eigene Implementierung": "older or custom implementation",
  "nicht ersetzbar": "not replaceable",
  "Sperrzeit 0": "locktime 0",
  "Eingänge": "inputs",
  "Ausgänge": "outputs",

  /* Einzahlungsadressen */
  "Einmalig empfangen und vollständig an eine einzige Adresse weitergeleitet":
    "Received once and forwarded in full to a single address",
  "Empfangenes Geld wurde vollständig an eine einzige Adresse weitergereicht":
    "All money received was passed on to a single address",
  "Der Betreiber der Sammeladresse kann Auskunft geben, wem sie zugeteilt war.":
    "The operator of the collection address can say who it was assigned to.",

  /* Mixer- und Cross-Chain-Abgleich */
  "Kein Ausgang passt zu Betrag und Zeitfenster. Toleranz oder Fenster vergrößern.":
    "No output matches the amount and time window. Widen the tolerance or the window.",
  "Kein Eingang passt zu Betrag und Zeitfenster. Toleranz oder Fenster vergrößern.":
    "No deposit matches the amount and time window. Widen the tolerance or the window.",
  "Bei der Kandidatenadresse liegt im gewählten Zeitfenster kein Eingang.":
    "The candidate address has no deposit within the chosen time window.",
  "Kurs zum Zeitpunkt des Abgangs nicht verfügbar; der Abgleich erfolgt ohne Umrechnung.":
    "No rate available for the time of the outflow; the comparison runs without conversion.",
  "Die Spur endet hier auf dieser Chain; die Fortsetzung ist nur über eine Kandidatenadresse auf der Zielkette prüfbar.":
    "The trail ends here on this chain; it can only be continued through a candidate address on the destination chain.",
  "Start- und Zieladresse sind identisch.": "The start and destination address are the same.",

  /* Beschriftungen der Datenquellen (Registry) */
  "RPC-URL": "RPC URL",
  "RPC-Benutzer": "RPC user",
  "RPC-Passwort": "RPC password",
  "Protokoll (ssl oder tcp)": "Protocol (ssl or tcp)",
  "Basis-URL der API": "Base URL of the API",
  "Ethereum-RPC-URL": "Ethereum RPC URL",
  "Kostenloser Token unter https://accounts.blockcypher.com (erhöht das Limit deutlich)":
    "Free token at https://accounts.blockcypher.com (raises the limit considerably)",
  "Free-Tier ohne Key stark limitiert; Key unter https://blockchair.com/api/plans":
    "The free tier without a key is heavily limited; get a key at https://blockchair.com/api/plans",
  "Kostenloser API-Key: https://etherscan.io/myapikey": "Free API key: https://etherscan.io/myapikey",
  "Kostenloser API-Key: https://www.bitcoinwhoswho.com/api":
    "Free API key: https://www.bitcoinwhoswho.com/api",
  "Kostenloser API-Key: https://www.chainabuse.com → Settings → API":
    "Free API key: https://www.chainabuse.com → Settings → API",
  "Kostenloser API-Key erhöht das Limit: https://www.trongrid.io":
    "A free API key raises the limit: https://www.trongrid.io",
  "Liste wird einmal täglich geladen": "The list is fetched once a day",
  "Listen werden zweimal täglich geladen": "The lists are fetched twice a day",
  "Öffentlicher RPC, Ergebnis 24 h zwischengespeichert": "Public RPC, the result is cached for 24 h",
  "Adresse ist als Lösegeld-Zahlungsadresse gemeldet": "The address is reported as a ransom payment address",

  /* Antworten der API, die die Oberfläche unverändert anzeigt */
  "Falls ein Konto zu dieser E-Mail besteht, wurde ein Link zum Zurücksetzen verschickt.":
    "If an account exists for this email address, a reset link has been sent.",
  "Wir haben dir einen Bestätigungslink geschickt. Offene Team-Einladungen werden nach der Bestätigung eingelöst.":
    "We have sent you a confirmation link. Pending team invitations are redeemed once you confirm.",
  "E-Mail-Versand ist nicht eingerichtet – die Bestätigung entfällt.":
    "Email delivery is not configured – no confirmation is needed.",
  "Achtung: Der E-Mail-Versand ist auf diesem Server nicht eingerichtet (SMTP_HOST/SMTP_FROM fehlen). Es kann keine Nachricht zugestellt werden.":
    "Note: email delivery is not configured on this server (SMTP_HOST/SMTP_FROM are missing). No message can be delivered.",
  "Dieses Token wird nur dieses eine Mal angezeigt und kann später nicht erneut abgerufen werden.":
    "This token is shown this once only and cannot be retrieved again later.",
  "Einige Werte ließen sich mit keinem bekannten Schlüssel entschlüsseln und bleiben unverändert. Sie müssen neu eingegeben werden.":
    "Some values could not be decrypted with any known key and stay unchanged. They have to be entered again.",
  "Alle Werte sind jetzt mit dem aktuellen Schlüssel verschlüsselt. ENCRYPTION_KEY_PREVIOUS kann entfernt werden.":
    "All values are now encrypted with the current key. ENCRYPTION_KEY_PREVIOUS can be removed.",
  "Parameter des Falls sind unvollständig": "The parameters of the case are incomplete",
  "mindestens ein Recht auswählen": "select at least one permission",

  /* Meldungen der Datenquellen */
  "kein Knoten konfiguriert": "no node configured",
  "Adressabfragen (Bitcoin Core führt keinen Adressindex)":
    "address lookups (Bitcoin Core keeps no address index)",
  "Transaktion unvollständig": "the transaction is incomplete",

  /* Übergänge auf andere Chains */
  "Brücke": "bridge",
  "Tauschdienst": "swap service",
};

/** Feste Anfänge, deren Rest unverändert bleibt (Fehlermeldungen, IDs). */
const PREFIXES: [string, string][] = [
  ["Labels: ", "Labels: "],
  ["Coins verfolgt: ", "Coins traced: "],
];

/**
 * Muster mit eingesetzten Werten. Reihenfolge zählt: das erste passende Muster
 * gewinnt.
 */
const PATTERNS: [RegExp, (m: RegExpMatchArray, tr: (s: string) => string) => string][] = [
  [/^Keine passende Datenquelle für (.+) verfügbar$/, (m) => `No suitable data source available for ${m[1]}`],
  [/^nicht unterstützt: (.+)$/, (m, tr) => `not supported: ${tr(m[1])}`],
  [/^Zeitüberschreitung beim Verbinden mit (.+)$/, (m) => `Timed out while connecting to ${m[1]}`],
  [/^Zeitüberschreitung bei (.+)$/, (m) => `Timed out on ${m[1]}`],
  [/^ungültiges Base58-Zeichen: (.+)$/, (m) => `invalid Base58 character: ${m[1]}`],
  [/^ungültige Prüfsumme: (.+)$/, (m) => `invalid checksum: ${m[1]}`],
  [/^Adresse gehört nicht zu (.+): (.+)$/, (m) => `The address does not belong to ${m[1]}: ${m[2]}`],
  [/^ungültige Adresse: (.+)$/, (m) => `invalid address: ${m[1]}`],
  [/^falsche Prüfsummen-Variante \(bech32\/bech32m\): (.+)$/, (m) => `wrong checksum variant (bech32/bech32m): ${m[1]}`],
  [/^ungültige Witness-Länge: (.+)$/, (m) => `invalid witness length: ${m[1]}`],
  [/^ungültiges Witness-Programm: (.+)$/, (m) => `invalid witness program: ${m[1]}`],
  [/^ungültige Adresslänge: (.+)$/, (m) => `invalid address length: ${m[1]}`],
  [/^unerwartete Antwort für (.+)$/, (m) => `unexpected response for ${m[1]}`],
  [/^(\d+) Web-Erwähnung\(en\)$/, (m) => `${m[1]} web mention(s)`],
  [/^(.+), Höhe (\d+)$/, (m) => `${m[1]}, height ${m[2]}`],
  [
    /^Zu viele Adressen: (\d+)\. Es sind höchstens (\d+) Adressen pro Prüfung möglich\.$/,
    (m) => `Too many addresses: ${m[1]}. At most ${m[2]} addresses can be checked at once.`,
  ],
  [/^keine gültige Adresse für (.+)$/, (m) => `not a valid address for ${m[1]}`],
  [
    /^Dieser Fall wurde mit Schemaversion (\d+) gespeichert und beim Öffnen auf Version (\d+) gehoben\.(.*)$/,
    (m) => `This case was saved with schema version ${m[1]} and lifted to version ${m[2]} when opened.${m[3]}`,
  ],
  [
    /^Common-Input-Ownership: (\d+) Eingangsadressen vermutlich gleicher Besitzer$/,
    (m) => `Common input ownership: ${m[1]} input addresses, probably the same owner`,
  ],
  [/^Möglicher CoinJoin \((\d+) gleich große Outputs\)$/, (m) => `Possible CoinJoin (${m[1]} equally sized outputs)`],
  [
    /^Batch-Auszahlung \((\d+) Outputs, typisch für Börsen\)$/,
    (m) => `Batch payout (${m[1]} outputs, typical of exchanges)`,
  ],
  [/^Beginn einer Peeling-Kette über (\d+) Schritte$/, (m) => `Start of a peeling chain over ${m[1]} steps`],
  [
    /^Output #(\d+) vermutlich Wechselgeld \((.+)\)$/,
    (m, tr) => `Output #${m[1]} is probably change (${tr(m[2])})`,
  ],
  [/^Bewegt Geld von (.+)$/, (m, tr) => `Moves money from ${tr(m[1])}`],
  [/^Ausgang ohne Adresse \((.+)\)$/, (m) => `Output without an address (${m[1] === "Skript" ? "script" : m[1]})`],
  [/^Knotenlimit \((\d+)\) erreicht – Graph unvollständig\.$/, (m) => `Node limit (${m[1]}) reached – the graph is incomplete.`],
  [/^Coins verfolgt: (\d+) Transaktionen$/, (m) => `Coins traced: ${m[1]} transactions`],
  [/^Startpunkt (.+) konnte nicht geladen werden\.$/, (m) => `Starting point ${m[1]} could not be loaded.`],
  [/^Kein Startpunkt konnte geladen werden\. (.*)$/, (m, tr) => `No starting point could be loaded. ${tr(m[1])}`],
  [/^Transaktion (.+…): (.+)$/, (m) => `Transaction ${m[1]}: ${m[2]}`],
  [/^Outspends (.+…): (.+)$/, (m) => `Outspends ${m[1]}: ${m[2]}`],
  [/^Sperrzeit gesetzt \((\d+)\)$/, (m) => `locktime set (${m[1]})`],
  [/^Sequenz 0x(.+)$/, (m) => `sequence 0x${m[1]}`],
  [/^Version (\d+)$/, (m) => `version ${m[1]}`],
  [/^Ausgangstypen: (.+)$/, (m) => `output types: ${m[1]}`],
  [
    /^BIP69-Sortierung \((.+)\)$/,
    (m) => `BIP69 ordering (${m[1].split(" und ").map((x) => EXACT[x] ?? x).join(" and ")})`,
  ],
  [
    /^(\d+) Weiterleitungen, alle an dieselbe Adresse$/,
    (m) => `${m[1]} forwards, all to the same address`,
  ],
  [
    /^Vermutlich Einzahlungsadresse( von .+)?: (.+)\. (.+)$/,
    (m, tr) =>
      `Probably a deposit address${m[1] ? m[1].replace(/^ von /, " of ") : ""}: ${tr(m[2])}. ${tr(m[3])}`,
  ],
  [
    /^Lightning-Kanal (geöffnet|geschlossen)(.*)$/,
    (m) => `Lightning channel ${m[1] === "geöffnet" ? "opened" : "closed"}${m[2].replace(/ und (\d+) weitere$/, " and $1 more")}`,
  ],
  [
    /^Übergang auf eine andere Chain möglich: (.+) \((.+), erkannt über (.+)\)\. (.*)$/,
    (m, tr) => `Possible move to another chain: ${m[1]} (${tr(m[2])}, detected through ${m[3]}). ${tr(m[4])}`,
  ],
  [
    /^Nur die neuesten (\d+) Transaktionen des Dienstes wurden geprüft; ältere Auszahlungen fehlen möglicherweise\.$/,
    (m) => `Only the ${m[1]} most recent transactions of the service were checked; older payouts may be missing.`,
  ],
  [
    /^Transaktionen des Dienstes nicht abrufbar: (.+)$/,
    (m) => `The transactions of the service could not be fetched: ${m[1]}`,
  ],
  [/^Zielkette nicht abrufbar: (.+)$/, (m) => `The destination chain could not be fetched: ${m[1]}`],
  [/^Kursabfrage fehlgeschlagen: (.+)$/, (m) => `The rate lookup failed: ${m[1]}`],
];

/**
 * Übersetzt einen von der Analyse erzeugten Text in die gewählte Sprache.
 * Deutsche Anzeige lässt ihn unverändert.
 */
export function translateHint(text: string, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === "de" || !text) return text;
  const tr = (s: string) => translateHint(s, locale);
  const exact = EXACT[text];
  if (exact) return exact;
  for (const [re, build] of PATTERNS) {
    const m = text.match(re);
    if (m) return build(m, tr);
  }
  for (const [de, en] of PREFIXES) {
    if (text.startsWith(de)) return en + text.slice(de.length);
  }
  return text;
}

/** Bequemlichkeit für Listen von Hinweisen oder Warnungen. */
export function translateHints(texts: string[] | undefined, locale: Locale = DEFAULT_LOCALE): string[] {
  if (!texts?.length) return texts ?? [];
  return texts.map((t) => translateHint(t, locale));
}
