import Link from "next/link";
import WatchlistView from "@/components/WatchlistView";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const session = await getSession();
  if (!session)
    return (
      <div className="card">
        Beobachtungen werden pro Nutzer gespeichert. Bitte{" "}
        <Link href="/login" className="text-accent">
          einloggen
        </Link>{" "}
        (benötigt MongoDB).
      </div>
    );
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Watchlist</h1>
      <WatchlistView />
    </div>
  );
}
