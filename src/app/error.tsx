"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[chainer]", error);
  }, [error]);

  return (
    <div className="card mx-auto mt-10 max-w-xl space-y-3">
      <h1 className="text-lg font-semibold text-red-300">Es ist ein Fehler aufgetreten</h1>
      <p className="text-sm text-gray-300">
        Häufigste Ursache ist eine nicht erreichbare oder ratenbegrenzte Datenquelle. Ein erneuter Versuch nutzt
        automatisch die nächste Quelle in der Kette.
      </p>
      <pre className="mono overflow-x-auto rounded border border-border bg-background p-2 text-xs text-gray-400">
        {error.message}
        {error.digest ? `\nKennung: ${error.digest}` : ""}
      </pre>
      <div className="flex gap-2">
        <button className="btn" onClick={reset}>
          Erneut versuchen
        </button>
        <Link className="btn-secondary" href="/">
          Zur Startseite
        </Link>
        <Link className="btn-secondary" href="/settings">
          Datenquellen prüfen
        </Link>
      </div>
    </div>
  );
}
