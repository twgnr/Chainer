import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Ein gespeicherter Trace innerhalb eines Falls */
const TraceSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: "" },
    start: { type: String, required: true },
    chain: { type: String, default: "bitcoin" },
    params: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/** Manuell gesetzter Eintrag im Ermittlungsprotokoll */
const LogSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    author: { type: String, default: "" },
    text: { type: String, required: true },
  },
  { _id: false },
);

const CaseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Schemaversion der gespeicherten Ergebnisse (siehe src/lib/migrate.ts) */
    schemaVersion: { type: Number, default: 2 },
    orgId: { type: Schema.Types.ObjectId, ref: "Org", default: null, index: true },
    shared: { type: Boolean, default: false },
    name: { type: String, required: true, trim: true },
    notes: { type: String, default: "" },
    chain: { type: String, default: "bitcoin" },
    start: { type: String, required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    /** Snapshot des zuletzt gespeicherten Trace-Ergebnisses (Rückwärtskompatibilität) */
    result: { type: Schema.Types.Mixed },
    /** Mehrere Traces je Fall */
    traces: { type: [TraceSchema], default: [] },
    /** Manuell zusammengeführte Adress-Cluster */
    merges: { type: [[String]], default: [] },
    /** Ermittlungsprotokoll */
    log: { type: [LogSchema], default: [] },
    /** Gespeicherte Graph-Ansicht: Positionen, ausgeblendete Knoten, Kommentare */
    view: { type: Schema.Types.Mixed, default: {} },
    /** Fall regelmäßig neu rechnen und Änderungen melden */
    autoRefresh: { type: Boolean, default: false },
    refreshIntervalHours: { type: Number, default: 24 },
    lastRefreshAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type CaseDoc = InferSchemaType<typeof CaseSchema> & { _id: mongoose.Types.ObjectId };

export const Case: Model<CaseDoc> = mongoose.models.Case || mongoose.model<CaseDoc>("Case", CaseSchema);
