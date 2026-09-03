import Link from "next/link";
import JobsView from "@/components/JobsView";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const session = await getSession();
  if (!session)
    return (
      <div className="card">
        Hintergrund-Aufträge werden pro Nutzer gespeichert. Bitte{" "}
        <Link href="/login" className="text-accent">
          einloggen
        </Link>{" "}
        (benötigt MongoDB).
      </div>
    );
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Hintergrund-Aufträge</h1>
      <JobsView />
    </div>
  );
}
