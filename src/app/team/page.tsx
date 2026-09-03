import Link from "next/link";
import TeamView from "@/components/TeamView";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getSession();
  if (!session)
    return (
      <div className="card">
        Teams werden pro Nutzer verwaltet. Bitte{" "}
        <Link href="/login" className="text-accent">
          einloggen
        </Link>{" "}
        (benötigt MongoDB).
      </div>
    );
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Team</h1>
      <TeamView />
    </div>
  );
}
