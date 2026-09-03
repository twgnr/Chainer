import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Org, roleAtLeast, type OrgRole } from "@/lib/models/Org";
import { User } from "@/lib/models/User";
import { encrypt, maskKey } from "@/lib/crypto";
import { keyableProviders } from "@/lib/providers/registry";
import { errMsg, jsonError } from "@/lib/api";

async function currentOrg(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user?.orgId) return null;
  const org = await Org.findById(user.orgId);
  if (!org) return null;
  const role = org.members.find((m) => String(m.userId) === userId)?.role as OrgRole | undefined;
  return { org, role };
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  try {
    await connectDb();
    const cur = await currentOrg(session.userId);
    // Teams, in denen der Nutzer Mitglied ist
    const memberships = await Org.find({ "members.userId": session.userId }).select("name members").lean();
    if (!cur) return NextResponse.json({ org: null, memberships });
    const settings = await getUserSettings(session);
    return NextResponse.json({
      org: {
        id: String(cur.org._id),
        name: cur.org.name,
        role: cur.role,
        members: cur.org.members.map((m) => ({ email: m.email, role: m.role, addedAt: m.addedAt })),
        invites: cur.org.invites.map((i) => ({ email: i.email, role: i.role })),
        apiKeys: keyableProviders
          .filter((p) => settings.orgKeys[p.id])
          .map((p) => ({ id: p.id, name: p.name, masked: maskKey(settings.orgKeys[p.id]) })),
      },
      memberships,
    });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });

/** Neues Team anlegen; der Ersteller wird Eigentümer und wechselt in das Team. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  try {
    const db = await connectDb();
    if (!db) return jsonError("MongoDB nicht konfiguriert", 503);
    const org = await Org.create({
      name: parsed.data.name,
      ownerId: session.userId,
      members: [{ userId: session.userId, email: session.email, role: "owner" }],
    });
    await User.updateOne({ _id: session.userId }, { $set: { orgId: org._id } });
    return NextResponse.json({ ok: true, id: String(org._id) });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}

const patchSchema = z.object({
  /** Team wechseln */
  switchTo: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  invite: z.object({ email: z.string().email(), role: z.enum(["admin", "member", "viewer"]).default("member") }).optional(),
  removeMember: z.string().email().optional(),
  setRole: z.object({ email: z.string().email(), role: z.enum(["admin", "member", "viewer"]) }).optional(),
  /** Geteilte Team-Keys (leerer String löscht) */
  apiKeys: z.record(z.string(), z.string().max(500)).optional(),
  leave: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return jsonError("Nicht eingeloggt", 401);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Eingabe");
  const d = parsed.data;
  try {
    await connectDb();

    if (d.switchTo !== undefined) {
      if (d.switchTo === null) {
        await User.updateOne({ _id: session.userId }, { $set: { orgId: null } });
        return NextResponse.json({ ok: true });
      }
      if (!mongoose.isValidObjectId(d.switchTo)) return jsonError("Ungültige Team-ID");
      const target = await Org.findOne({ _id: d.switchTo, "members.userId": session.userId });
      if (!target) return jsonError("Kein Mitglied dieses Teams", 403);
      await User.updateOne({ _id: session.userId }, { $set: { orgId: target._id } });
      return NextResponse.json({ ok: true });
    }

    const cur = await currentOrg(session.userId);
    if (!cur) return jsonError("Kein aktives Team", 400);
    const { org, role } = cur;

    if (d.leave) {
      if (role === "owner") return jsonError("Eigentümer können das Team nicht verlassen", 400);
      org.set(
        "members",
        org.members.filter((m) => String(m.userId) !== session.userId),
      );
      await org.save();
      await User.updateOne({ _id: session.userId }, { $set: { orgId: null } });
      return NextResponse.json({ ok: true });
    }

    if (!roleAtLeast(role, "admin")) return jsonError("Nur Administratoren dürfen das Team verwalten", 403);

    if (d.name) org.name = d.name;

    if (d.invite) {
      const email = d.invite.email.toLowerCase();
      if (org.members.some((m) => m.email === email)) return jsonError("Bereits Mitglied", 409);
      const existing = await User.findOne({ email }).lean();
      if (existing) {
        // Nutzer existiert bereits -> direkt aufnehmen
        org.members.push({ userId: existing._id, email, role: d.invite.role, addedAt: new Date() });
      } else if (!org.invites.some((i) => i.email === email)) {
        org.invites.push({ email, role: d.invite.role, invitedAt: new Date() });
      }
    }

    if (d.removeMember) {
      const email = d.removeMember.toLowerCase();
      const member = org.members.find((m) => m.email === email);
      if (member?.role === "owner") return jsonError("Eigentümer können nicht entfernt werden", 400);
      org.set(
        "members",
        org.members.filter((m) => m.email !== email),
      );
      org.set(
        "invites",
        org.invites.filter((i) => i.email !== email),
      );
      if (member) await User.updateOne({ _id: member.userId, orgId: org._id }, { $set: { orgId: null } });
    }

    if (d.setRole) {
      const email = d.setRole.email.toLowerCase();
      const member = org.members.find((m) => m.email === email);
      if (!member) return jsonError("Mitglied nicht gefunden", 404);
      if (member.role === "owner") return jsonError("Rolle des Eigentümers ist fest", 400);
      member.role = d.setRole.role;
    }

    if (d.apiKeys) {
      const allowed = new Set(keyableProviders.map((p) => p.id));
      for (const [id, value] of Object.entries(d.apiKeys)) {
        if (!allowed.has(id)) continue;
        const v = value.trim();
        if (v) org.apiKeys.set(id, encrypt(v));
        else org.apiKeys.delete(id);
      }
    }

    await org.save();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(errMsg(e), 500);
  }
}
