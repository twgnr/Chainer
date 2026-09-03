import ScreenView from "@/components/ScreenView";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ScreenPage() {
  const session = await getSession();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Massenprüfung</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Viele Adressen auf einmal gegen alle angebundenen Quellen prüfen: OFAC-Sanktionsliste, Ransomwhere,
          GraphSense-TagPacks, WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who&rsquo;s Who und die eigenen Labels.
          Adressen einfügen oder eine Datei hochladen – die Ergebnisse lassen sich als CSV ausgeben.
        </p>
      </div>
      <ScreenView loggedIn={!!session} />
    </div>
  );
}
