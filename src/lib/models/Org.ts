import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

/** Rechte je Rolle: viewer darf nur lesen, member zusätzlich schreiben, admin verwalten. */
export const ROLE_RANK: Record<OrgRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

export function roleAtLeast(role: OrgRole | undefined, min: OrgRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

const OrgSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    members: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        email: { type: String, required: true, lowercase: true },
        role: { type: String, enum: ["owner", "admin", "member", "viewer"], default: "member" },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    /** Offene Einladungen (E-Mail-Adressen, die dem Team beim Login beitreten) */
    invites: [
      {
        _id: false,
        email: { type: String, required: true, lowercase: true },
        role: { type: String, enum: ["admin", "member", "viewer"], default: "member" },
        invitedAt: { type: Date, default: Date.now },
      },
    ],
    /** Geteilte API-Keys des Teams (verschlüsselt) */
    apiKeys: { type: Map, of: String, default: {} },
  },
  { timestamps: true },
);

export type OrgDoc = InferSchemaType<typeof OrgSchema> & { _id: mongoose.Types.ObjectId };

export const Org: Model<OrgDoc> = mongoose.models.Org || mongoose.model<OrgDoc>("Org", OrgSchema);
