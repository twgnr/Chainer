import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Fortschritt eines laufenden Auftrags, wird vom Worker regelmäßig aktualisiert */
const ProgressSchema = new Schema(
  {
    phase: { type: String, default: "" },
    message: { type: String, default: "" },
    nodes: { type: Number, default: 0 },
    edges: { type: Number, default: 0 },
    apiCalls: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Ein Hintergrund-Auftrag (Trace oder Verbindungssuche).
 *
 * Lange Analysen sprengen die Antwortzeit einer HTTP-Anfrage. Sie werden daher
 * hier eingestellt und vom Worker nacheinander abgearbeitet; das Ergebnis bleibt
 * abrufbar, auch wenn der Nutzer die Seite verlassen hat.
 */
const JobSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Org", default: null },
    type: { type: String, enum: ["trace", "path"], required: true },
    name: { type: String, default: "" },
    /** Eingabeparameter, wie sie an runTrace bzw. findPaths gehen */
    params: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["pending", "running", "done", "error", "cancelled"],
      default: "pending",
      index: true,
    },
    progress: { type: ProgressSchema, default: () => ({}) },
    /** Vollständiges Ergebnis; wird in Listen bewusst nicht mitgeladen */
    result: { type: Schema.Types.Mixed },
    error: { type: String, default: "" },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    attempts: { type: Number, default: 0 },
    /** Lebenszeichen des Workers, erkennt hängengebliebene Aufträge */
    heartbeatAt: { type: Date },
  },
  { timestamps: true },
);

export type JobDoc = InferSchemaType<typeof JobSchema> & { _id: mongoose.Types.ObjectId };

export const Job: Model<JobDoc> = mongoose.models.Job || mongoose.model<JobDoc>("Job", JobSchema);
