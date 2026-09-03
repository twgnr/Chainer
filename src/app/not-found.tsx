import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import { getT } from "@/lib/i18n/server";

const TXT = {
  en: {
    title: "Not found",
    lead: "This page does not exist, or the address or transaction ID does not match the format of the chosen chain.",
    home: "Start page",
  },
  de: {
    title: "Nicht gefunden",
    lead: "Die Seite existiert nicht, oder die angegebene Adresse beziehungsweise Transaktions-ID passt nicht zum Format der gewählten Chain.",
    home: "Startseite",
  },
};

export default async function NotFound() {
  const t = await getT(TXT);
  return (
    <div className="card mx-auto mt-10 max-w-xl space-y-4">
      <h1 className="text-lg font-semibold">{t.title}</h1>
      <p className="text-sm text-muted">{t.lead}</p>
      <SearchBox />
      <div className="flex gap-2">
        <Link className="btn-secondary" href="/">
          {t.home}
        </Link>
        <Link className="btn-secondary" href="/trace">
          Trace
        </Link>
      </div>
    </div>
  );
}
