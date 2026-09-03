import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import type { Translations } from "@/lib/i18n/locale";

const TXT = {
  en: { please: "Please", login: "log in", needsDb: "(requires MongoDB)." },
  de: { please: "Bitte", login: "einloggen", needsDb: "(benötigt MongoDB)." },
};

/**
 * Hinweis für Seiten, die eine Anmeldung brauchen. `reason` beschreibt in
 * beiden Sprachen, warum – etwa „Fälle werden pro Nutzer gespeichert.“
 */
export default async function LoginRequired({ reason }: { reason: Translations<string> }) {
  const t = await getT(TXT);
  const why = await getT(reason);
  return (
    <div className="card">
      {why} {t.please}{" "}
      <Link href="/login" className="text-brand">
        {t.login}
      </Link>{" "}
      {t.needsDb}
    </div>
  );
}
