import WatchlistView from "@/components/WatchlistView";
import LoginRequired from "@/components/LoginRequired";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TXT = {
  en: { reason: "Watches are stored per user." },
  de: { reason: "Beobachtungen werden pro Nutzer gespeichert." },
};

export default async function WatchlistPage() {
  const session = await getSession();
  if (!session) return <LoginRequired reason={{ en: TXT.en.reason, de: TXT.de.reason }} />;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Watchlist</h1>
      <WatchlistView />
    </div>
  );
}
