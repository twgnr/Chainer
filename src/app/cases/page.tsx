import Link from "next/link";
import CasesList from "@/components/CasesList";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const session = await getSession();
  if (!session)
    return (
      <div className="card">
        Fälle werden pro Nutzer gespeichert. Bitte <Link href="/login" className="text-accent">einloggen</Link> (benötigt MongoDB).
      </div>
    );
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Gespeicherte Fälle</h1>
      <div className="card">
        <CasesList />
      </div>
    </div>
  );
}
