import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Erlaubte Rechte eines Zugriffstokens */
export const TOKEN_SCOPES = ["read", "trace", "write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/**
 * Zugriffstoken für Skripte und fremde Programme.
 *
 * Gespeichert wird ausschließlich der SHA-256-Hashwert des Tokens – das Klartext-Token
 * ist nur ein einziges Mal beim Anlegen sichtbar und lässt sich danach nicht wiederherstellen.
 */
const ApiTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Org", default: null },
    name: { type: String, required: true, trim: true },
    /** SHA-256 des Tokens in Hex */
    tokenHash: { type: String, required: true, unique: true, index: true },
    /** Erste Zeichen des Tokens zur Wiedererkennung in der Liste */
    prefix: { type: String, default: "" },
    scopes: { type: [String], enum: TOKEN_SCOPES, default: ["read", "trace"] },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type ApiTokenDoc = InferSchemaType<typeof ApiTokenSchema> & { _id: mongoose.Types.ObjectId };

export const ApiToken: Model<ApiTokenDoc> =
  mongoose.models.ApiToken || mongoose.model<ApiTokenDoc>("ApiToken", ApiTokenSchema);
