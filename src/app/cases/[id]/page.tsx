import mongoose from "mongoose";
import { notFound, redirect } from "next/navigation";
import CaseWorkspace from "@/components/CaseWorkspace";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Case } from "@/lib/models/Case";
import { migrateCase } from "@/lib/migrate";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!mongoose.isValidObjectId(id)) notFound();
  await connectDb();
  const settings = await getUserSettings(session);
  const or: Record<string, unknown>[] = [{ userId: session.userId }];
  if (settings.orgId) or.push({ orgId: settings.orgId, shared: true });
  const c = await Case.findOne({ _id: id, $or: or }).lean();
  if (!c) notFound();
  const canWrite = String(c.userId) === session.userId || (!!settings.orgId && settings.role !== "viewer" && c.shared);
  // Fälle aus älteren Ständen beim Anzeigen auf das aktuelle Schema heben
  const { data } = migrateCase(JSON.parse(JSON.stringify(c)) as Record<string, unknown>);
  return <CaseWorkspace data={data as never} canWrite={canWrite} inTeam={!!settings.orgId} />;
}
