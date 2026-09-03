import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Beobachtete Adresse mit Benachrichtigung bei neuer Aktivität. */
const WatchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Org", default: null, index: true },
    chain: { type: String, required: true, default: "bitcoin" },
    address: { type: String, required: true },
    label: { type: String, default: "" },
    active: { type: Boolean, default: true },
    /** Nur benachrichtigen, wenn der Betrag diese Schwelle erreicht (kleinste Einheit) */
    minValueSat: { type: Number, default: 0 },
    lastTxid: { type: String, default: "" },
    lastBalanceSat: { type: Number, default: null },
    lastCheckedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    /** Ungelesene Ereignisse für die Anzeige in der App */
    events: [
      {
        _id: false,
        at: { type: Date, default: Date.now },
        txid: { type: String, default: "" },
        text: { type: String, default: "" },
        deltaSat: { type: Number, default: 0 },
        read: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

WatchSchema.index({ chain: 1, address: 1, userId: 1 }, { unique: true });

export type WatchDoc = InferSchemaType<typeof WatchSchema> & { _id: mongoose.Types.ObjectId };

export const Watch: Model<WatchDoc> = mongoose.models.Watch || mongoose.model<WatchDoc>("Watch", WatchSchema);
