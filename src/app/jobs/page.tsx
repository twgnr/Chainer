import JobsView from "@/components/JobsView";
import LoginRequired from "@/components/LoginRequired";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TXT = {
  en: { reason: "Background jobs are stored per user.", title: "Background jobs" },
  de: { reason: "Hintergrund-Aufträge werden pro Nutzer gespeichert.", title: "Hintergrund-Aufträge" },
};

export default async function JobsPage() {
  const session = await getSession();
  const t = await getT(TXT);
  if (!session) return <LoginRequired reason={{ en: TXT.en.reason, de: TXT.de.reason }} />;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t.title}</h1>
      <JobsView />
    </div>
  );
}
