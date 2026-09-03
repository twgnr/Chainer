import TeamView from "@/components/TeamView";
import LoginRequired from "@/components/LoginRequired";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TXT = {
  en: { reason: "Teams are managed per user." },
  de: { reason: "Teams werden pro Nutzer verwaltet." },
};

export default async function TeamPage() {
  const session = await getSession();
  if (!session) return <LoginRequired reason={{ en: TXT.en.reason, de: TXT.de.reason }} />;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Team</h1>
      <TeamView />
    </div>
  );
}
