import CasesList from "@/components/CasesList";
import LoginRequired from "@/components/LoginRequired";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TXT = {
  en: { reason: "Cases are stored per user.", title: "Saved cases" },
  de: { reason: "Fälle werden pro Nutzer gespeichert.", title: "Gespeicherte Fälle" },
};

export default async function CasesPage() {
  const session = await getSession();
  const t = await getT(TXT);
  if (!session) return <LoginRequired reason={{ en: TXT.en.reason, de: TXT.de.reason }} />;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t.title}</h1>
      <div className="card">
        <CasesList />
      </div>
    </div>
  );
}
