import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Gültigkeitsdauer eines Rücksetz-Tokens in Millisekunden (1 Stunde) */
export const RESET_TTL_MS = 60 * 60 * 1000;

const PasswordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** SHA-256 des Klartext-Tokens – der Klartext wird nie gespeichert */
    tokenHash: { type: String, required: true, unique: true },
    // TTL-Index: MongoDB räumt abgelaufene Token selbstständig weg
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    /** Zeitpunkt der Einlösung; danach ist das Token verbraucht */
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type PasswordResetDoc = InferSchemaType<typeof PasswordResetSchema> & { _id: mongoose.Types.ObjectId };

export const PasswordReset: Model<PasswordResetDoc> =
  mongoose.models.PasswordReset || mongoose.model<PasswordResetDoc>("PasswordReset", PasswordResetSchema);
