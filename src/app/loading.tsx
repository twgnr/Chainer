import { getT } from "@/lib/i18n/server";

const TXT = {
  en: { loading: "Loading data from the sources…" },
  de: { loading: "Daten werden von den Quellen geladen…" },
};

export default async function Loading() {
  const t = await getT(TXT);
  return (
    <div className="flex items-center gap-3 p-8 text-sm text-muted">
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent" />
      {t.loading}
    </div>
  );
}
