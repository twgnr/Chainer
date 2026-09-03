import mongoose from "mongoose";
import { notFound, redirect } from "next/navigation";
import CaseReport from "@/components/CaseReport";
import { getSession, getUserSettings } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Case } from "@/lib/models/Case";
import { migrateCase } from "@/lib/migrate";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
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
  // Mongoose-Dokument für die Client-Komponente serialisieren
  const { data } = migrateCase(JSON.parse(JSON.stringify(c)) as Record<string, unknown>);
  return <CaseReport data={data as never} author={session.email} />;
}
