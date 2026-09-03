import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Höchstzahl gespeicherter Sitzungen je Nutzer; ältere fallen heraus. */
export const MAX_SESSIONS = 20;

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: "" },
    /** Provider-ID -> verschlüsselter API-Key */
    apiKeys: { type: Map, of: String, default: {} },
    /** Provider-ID -> Konfiguration (Werte verschlüsselt, z. B. eigener Knoten) */
    providerConfig: { type: Map, of: Map, default: {} },
    /** Aktive Organisation (Team) */
    orgId: { type: Schema.Types.ObjectId, ref: "Org", default: null },
    /** Benachrichtigungskanäle für die Watchlist */
    notify: {
      email: { type: Boolean, default: true },
      telegramChatId: { type: String, default: "" },
      webhookUrl: { type: String, default: "" },
    },
    /**
     * Zähler für den Widerruf aller Sitzungen. Jedes Sitzungs-Token trägt den
     * Stand mit; wird der Zähler erhöht, sind alle alten Token ungültig.
     */
    tokenVersion: { type: Number, default: 0 },
    /** Bekannte Sitzungen (höchstens MAX_SESSIONS Einträge) */
    sessions: [
      {
        _id: false,
        id: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
        userAgent: { type: String, default: "" },
        ip: { type: String, default: "" },
      },
    ],
    /** Fehlgeschlagene Anmeldeversuche seit der letzten erfolgreichen Anmeldung */
    failedLogins: { type: Number, default: 0 },
    /** Konto ist bis zu diesem Zeitpunkt gesperrt */
    lockedUntil: { type: Date, default: null },
    /** E-Mail-Adresse wurde über den zugeschickten Link bestätigt */
    emailVerified: { type: Boolean, default: false },
    /** SHA-256 des Bestätigungstokens (leer, sobald bestätigt) */
    verifyTokenHash: { type: String, default: "" },
    /** Datenschutzmodus (Logik wird an anderer Stelle gebaut) */
    privacyMode: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

/** Eintrag im Sitzungsverzeichnis eines Nutzers */
export interface UserSessionEntry {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  userAgent: string;
  ip: string;
}

export const User: Model<UserDoc> = mongoose.models.User || mongoose.model<UserDoc>("User", UserSchema);
