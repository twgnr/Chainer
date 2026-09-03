"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useT } from "@/lib/i18n/provider";

const TXT = {
  en: {
    title: "Something went wrong",
    lead: "The most common cause is a data source that is unreachable or rate-limited. Trying again automatically uses the next source in the chain.",
    id: "Reference",
    retry: "Try again",
    home: "Go to start page",
    sources: "Check data sources",
  },
  de: {
    title: "Es ist ein Fehler aufgetreten",
    lead: "Häufigste Ursache ist eine nicht erreichbare oder ratenbegrenzte Datenquelle. Ein erneuter Versuch nutzt automatisch die nächste Quelle in der Kette.",
    id: "Kennung",
    retry: "Erneut versuchen",
    home: "Zur Startseite",
    sources: "Datenquellen prüfen",
  },
};

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT(TXT);
  useEffect(() => {
    console.error("[chainer]", error);
  }, [error]);

  return (
    <div className="card mx-auto mt-10 max-w-xl space-y-3">
      <h1 className="text-lg font-semibold text-red-300">{t.title}</h1>
      <p className="text-sm text-fg-2">{t.lead}</p>
      <pre className="mono overflow-x-auto rounded border border-border bg-background p-2 text-xs text-muted">
        {error.message}
        {error.digest ? `\n${t.id}: ${error.digest}` : ""}
      </pre>
      <div className="flex gap-2">
        <button className="btn" onClick={reset}>
          {t.retry}
        </button>
        <Link className="btn-secondary" href="/">
          {t.home}
        </Link>
        <Link className="btn-secondary" href="/settings">
          {t.sources}
        </Link>
      </div>
    </div>
  );
}
