import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Eigene Labels und Notizen zu Adressen – privat oder im Team geteilt. */
const AnnotationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Org", default: null, index: true },
    chain: { type: String, required: true, default: "bitcoin" },
    /** Bezugsobjekt: Adresse oder Transaktion */
    kind: { type: String, enum: ["address", "tx"], default: "address" },
    /** Adresse oder Transaktions-ID, je nach `kind` */
    address: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        "exchange",
        "mixer",
        "scam",
        "sanctioned",
        "ransomware",
        "darknet",
        "gambling",
        "mining",
        "service",
        "swap",
        "bridge",
        "wallet",
        "custom",
        "other",
      ],
      default: "custom",
    },
    risk: { type: String, enum: ["low", "medium", "high", null], default: null },
    notes: { type: String, default: "" },
    shared: { type: Boolean, default: false },
  },
  { timestamps: true },
);

AnnotationSchema.index({ chain: 1, address: 1, userId: 1 }, { unique: true });

export type AnnotationDoc = InferSchemaType<typeof AnnotationSchema> & { _id: mongoose.Types.ObjectId };

export const Annotation: Model<AnnotationDoc> =
  mongoose.models.Annotation || mongoose.model<AnnotationDoc>("Annotation", AnnotationSchema);
