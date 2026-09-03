import ScreenView from "@/components/ScreenView";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TXT = {
  en: {
    title: "Bulk check",
    lead: (
      <>
        Check many addresses at once against every connected source: the OFAC sanctions list, Ransomwhere, GraphSense
        TagPacks, WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who&rsquo;s Who and your own labels. Paste addresses
        or upload a file – the results can be exported as CSV.
      </>
    ),
  },
  de: {
    title: "Massenprüfung",
    lead: (
      <>
        Viele Adressen auf einmal gegen alle angebundenen Quellen prüfen: OFAC-Sanktionsliste, Ransomwhere,
        GraphSense-TagPacks, WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who&rsquo;s Who und die eigenen Labels.
        Adressen einfügen oder eine Datei hochladen – die Ergebnisse lassen sich als CSV ausgeben.
      </>
    ),
  },
};

export default async function ScreenPage() {
  const session = await getSession();
  const t = await getT(TXT);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.lead}</p>
      </div>
      <ScreenView loggedIn={!!session} />
    </div>
  );
}
