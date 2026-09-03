import type { Translations } from "./locale";

/**
 * Texte der Benachrichtigungen (E-Mail, Telegram, Webhook) und der
 * automatischen Fallaktualisierung.
 *
 * Diese Texte entstehen außerhalb einer Anfrage — der Zeitgeber oder ein
 * Cron-Dienst stößt sie an. Es gibt also kein Cookie und keinen
 * `Accept-Language`-Kopf, aus dem sich die Sprache ablesen ließe. Sie kommt
 * deshalb aus dem Feld `locale` am Nutzer, das beim Umschalten in der
 * Oberfläche mitgeschrieben wird.
 */

export const WATCH_TEXT: Translations<{
  subject: (label: string) => string;
  incoming: string;
  outgoing: string;
  unconfirmed: string;
  riskWarning: (hits: string) => string;
  riskShort: string;
  sender: (address: string, label: string, source: string) => string;
  body: (dir: string, target: string, amount: string, balance: string, txid: string) => string;
  event: (dir: string, pending: string, amount: string, short: string, risk: string) => string;
}> = {
  en: {
    subject: (label) => `Chainer: activity on ${label}`,
    incoming: "Incoming",
    outgoing: "Outgoing",
    unconfirmed: " (not yet confirmed)",
    riskWarning: (hits) => `\n\nWARNING: the sender is reported as harmful:\n${hits}`,
    riskShort: " ⚠ from a harmful address",
    sender: (address, label, source) => `${address} – ${label} (source: ${source})`,
    body: (dir, target, amount, balance, txid) =>
      `${dir} on ${target}\nAmount: ${amount}\nNew balance: ${balance}\nTransaction: ${txid}`,
    event: (dir, pending, amount, short, risk) => `${dir}${pending} ${amount} (${short})${risk}`,
  },
  de: {
    subject: (label) => `Chainer: Bewegung bei ${label}`,
    incoming: "Eingang",
    outgoing: "Ausgang",
    unconfirmed: " (noch unbestätigt)",
    riskWarning: (hits) => `\n\nWARNUNG: Der Absender ist als schädlich gemeldet:\n${hits}`,
    riskShort: " ⚠ von schädlicher Adresse",
    sender: (address, label, source) => `${address} – ${label} (Quelle: ${source})`,
    body: (dir, target, amount, balance, txid) =>
      `${dir} auf ${target}\nBetrag: ${amount}\nNeuer Saldo: ${balance}\nTransaktion: ${txid}`,
    event: (dir, pending, amount, short, risk) => `${dir}${pending} ${amount} (${short})${risk}`,
  },
};

export const CASE_TEXT: Translations<{
  subject: (name: string) => string;
  newTxs: (n: number) => string;
  newAddresses: (n: number) => string;
  newRiskSources: (n: number) => string;
  logEntry: (parts: string) => string;
  traceName: (date: string) => string;
  systemAuthor: string;
  riskLine: (list: string) => string;
  volume: (amount: string) => string;
}> = {
  en: {
    subject: (name) => `Chainer: movement in case ${name}`,
    newTxs: (n) => `${n} new transaction${n === 1 ? "" : "s"}`,
    newAddresses: (n) => `${n} new address${n === 1 ? "" : "es"}`,
    newRiskSources: (n) => `${n} new harmful address${n === 1 ? "" : "es"}`,
    logEntry: (parts) => `Automatic refresh: ${parts}.`,
    traceName: (date) => `Refresh ${date}`,
    systemAuthor: "System",
    riskLine: (list) => `New harmful addresses: ${list}\n`,
    volume: (amount) => `Volume in the graph: ${amount}`,
  },
  de: {
    subject: (name) => `Chainer: Bewegung im Fall ${name}`,
    newTxs: (n) => `${n} neue Transaktion(en)`,
    newAddresses: (n) => `${n} neue Adresse(n)`,
    newRiskSources: (n) => `${n} neue schädliche Adresse(n)`,
    logEntry: (parts) => `Automatische Aktualisierung: ${parts}.`,
    traceName: (date) => `Aktualisierung ${date}`,
    systemAuthor: "System",
    riskLine: (list) => `Neue schädliche Adressen: ${list}\n`,
    volume: (amount) => `Volumen im Graph: ${amount}`,
  },
};

/** E-Mails der Anmeldung; sie laufen innerhalb einer Anfrage. */
export const AUTH_MAIL: Translations<{
  verifySubject: string;
  verifyText: string;
  resetSubject: string;
}> = {
  en: {
    verifySubject: "Chainer: confirm your email address",
    verifyText: "Please confirm your email address with this link.",
    resetSubject: "Chainer: reset your password",
  },
  de: {
    verifySubject: "Chainer: E-Mail bestätigen",
    verifyText: "Bitte bestätige deine E-Mail-Adresse mit diesem Link.",
    resetSubject: "Chainer: Passwort zurücksetzen",
  },
};
