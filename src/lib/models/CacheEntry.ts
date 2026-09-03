import mongoose, { Schema, type Model } from "mongoose";

export interface CacheEntryDoc {
  _id: string;
  value: unknown;
  expiresAt: Date;
}

const CacheEntrySchema = new Schema<CacheEntryDoc>(
  {
    _id: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    // TTL-Index: MongoDB löscht abgelaufene Einträge selbstständig
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false, _id: false },
);

export const CacheEntry: Model<CacheEntryDoc> =
  mongoose.models.CacheEntry || mongoose.model<CacheEntryDoc>("CacheEntry", CacheEntrySchema);
