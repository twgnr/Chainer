import AnnotationsView from "@/components/AnnotationsView";
import LoginRequired from "@/components/LoginRequired";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TXT = {
  en: {
    reason: "Your own labels are stored per user.",
    title: "Your own labels and notes",
    lead: "Here you give addresses your own names. Your labels appear everywhere in the app – on the address page, in the graph and in the history – marked as source “own”, and they take precedence over external databases.",
  },
  de: {
    reason: "Eigene Labels werden pro Nutzer gespeichert.",
    title: "Eigene Labels und Notizen",
    lead: "Hier vergibst du eigene Bezeichnungen für Adressen. Eigene Labels erscheinen überall in der App – auf der Adressseite, im Graph und im Verlauf – mit der Quelle „eigene“ und haben Vorrang vor externen Datenbanken.",
  },
};

export default async function AnnotationsPage() {
  const session = await getSession();
  const t = await getT(TXT);
  if (!session) return <LoginRequired reason={{ en: TXT.en.reason, de: TXT.de.reason }} />;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.lead}</p>
      </div>
      <AnnotationsView />
    </div>
  );
}
