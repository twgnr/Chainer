import Link from "next/link";
import SearchBox from "@/components/SearchBox";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-xl space-y-4">
      <h1 className="text-lg font-semibold">Nicht gefunden</h1>
      <p className="text-sm text-gray-400">
        Die Seite existiert nicht, oder die angegebene Adresse beziehungsweise Transaktions-ID passt nicht zum Format
        der gewählten Chain.
      </p>
      <SearchBox />
      <div className="flex gap-2">
        <Link className="btn-secondary" href="/">
          Startseite
        </Link>
        <Link className="btn-secondary" href="/trace">
          Trace
        </Link>
      </div>
    </div>
  );
}
