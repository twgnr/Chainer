import Link from "next/link";
import AnnotationsView from "@/components/AnnotationsView";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AnnotationsPage() {
  const session = await getSession();
  if (!session)
    return (
      <div className="card">
        Eigene Labels werden pro Nutzer gespeichert. Bitte{" "}
        <Link href="/login" className="text-accent">
          einloggen
        </Link>{" "}
        (benötigt MongoDB).
      </div>
    );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Eigene Labels und Notizen</h1>
        <p className="mt-1 text-sm text-gray-400">
          Hier vergibst du eigene Bezeichnungen für Adressen. Eigene Labels erscheinen überall in der App – auf der
          Adressseite, im Graph und im Verlauf – mit der Quelle „eigene“ und haben Vorrang vor externen Datenbanken.
        </p>
      </div>
      <AnnotationsView />
    </div>
  );
}
