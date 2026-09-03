import { DEFAULT_LOCALE, type Locale } from "./locale";
import { translateHint } from "./hints";

/**
 * Übersetzung der Fehlermeldungen der API.
 *
 * Die Meldungen stehen im Quelltext auf Deutsch, weil sie dort auch geworfen
 * werden. Diese Tabelle bildet sie auf Englisch ab, sodass keine einzige
 * Aufrufstelle angepasst werden muss. Fehlt eine Meldung hier, wird sie
 * unverändert durchgereicht.
 */
const EN: Record<string, string> = {
  "Nicht eingeloggt": "Not signed in",
  "Nicht gefunden": "Not found",
  "Nicht gefunden oder keine Berechtigung": "Not found, or not permitted",
  "Ungültige Eingabe": "Invalid input",
  "Ungültige ID": "Invalid ID",
  "Ungültige E-Mail-Adresse": "Invalid email address",
  "Ungültige Team-ID": "Invalid team ID",
  "Unbekannte Chain": "Unknown chain",
  "Keine Adressen gefunden": "No addresses found",
  "Keine gültige Transaktions-ID": "Not a valid transaction ID",
  "Keine Schreibrechte für diesen Fall": "No write permission for this case",
  "Fall nicht gefunden": "Case not found",
  "Auftrag nicht gefunden": "Job not found",
  "Nutzer nicht gefunden": "User not found",
  "Mitglied nicht gefunden": "Member not found",
  "Sitzung nicht gefunden": "Session not found",
  "Token nicht gefunden": "Token not found",
  "Token fehlt": "Token missing",
  "Bereits Mitglied": "Already a member",
  "Kein Mitglied dieses Teams": "Not a member of this team",
  "Kein aktives Team": "No active team",
  "Eigentümer können das Team nicht verlassen": "Owners cannot leave the team",
  "Eigentümer können nicht entfernt werden": "Owners cannot be removed",
  "Rolle des Eigentümers ist fest": "The owner’s role is fixed",
  "Nur Administratoren dürfen das Team verwalten": "Only administrators may manage the team",
  "Registrierung deaktiviert": "Registration is disabled",
  "E-Mail bereits registriert": "That email address is already registered",
  "E-Mail oder Passwort ungültig (mind. 8 Zeichen)": "Invalid email or password (at least 8 characters)",
  "Token fehlt oder Passwort zu kurz (mind. 8 Zeichen)":
    "Token missing, or password too short (at least 8 characters)",
  "Der Bestätigungslink ist ungültig oder wurde bereits benutzt.":
    "This confirmation link is invalid or has already been used.",
  "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.":
    "This link is invalid or has expired. Please request a new one.",
  "Start- und Zieladresse sind identisch": "The start and destination address are the same",
  "Ausgangs- und Zielkette sind identisch": "The source and destination chain are the same",
  "MongoDB nicht konfiguriert": "MongoDB is not configured",
  "MongoDB ist nicht konfiguriert (MONGODB_URI)": "MongoDB is not configured (MONGODB_URI)",
  "MongoDB ist nicht konfiguriert (MONGODB_URI fehlt)": "MongoDB is not configured (MONGODB_URI is missing)",
  "AUTH_SECRET ist nicht gesetzt": "AUTH_SECRET is not set",
};

/** Meldungen, die mit einem festen Text beginnen und variabel weitergehen. */
const PREFIXES: [string, string][] = [
  ["Ungültige Eingabe: ", "Invalid input: "],
  ["Ungültige Parameter: ", "Invalid parameters: "],
];

/** Meldungen mit eingesetzten Werten. */
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Keine gültige (.+)-Adresse$/, (m) => `Not a valid ${m[1]} address`],
  [/^„(.+)“ ist keine gültige (.+)-Adresse$/, (m) => `“${m[1]}” is not a valid ${m[2]} address`],
  [
    /^„(.+)“ ist keine gültige Adresse oder Transaktions-ID für (.+)$/,
    (m) => `“${m[1]}” is not a valid address or transaction ID for ${m[2]}`,
  ],
];

/**
 * Übersetzt eine im Quelltext deutsche Meldung in die gewählte Sprache.
 * Unbekannte Texte bleiben unverändert.
 */
export function translateMessage(message: string, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === "de") return message;
  const exact = EN[message];
  if (exact) return exact;
  for (const [de, en] of PREFIXES) {
    if (message.startsWith(de)) return en + message.slice(de.length);
  }
  for (const [re, build] of PATTERNS) {
    const m = message.match(re);
    if (m) return build(m);
  }
  // Fehler aus der Analyse und den Datenquellen stehen in der anderen Tabelle.
  return translateHint(message, locale);
}
