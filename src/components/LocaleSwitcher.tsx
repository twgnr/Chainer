"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_NAME,
  type Locale,
} from "@/lib/i18n/locale";
import { useT } from "@/lib/i18n/provider";

const TXT = {
  en: { label: "Language" },
  de: { label: "Sprache" },
};

/**
 * Sprachauswahl. Die Wahl landet in einem Cookie und die Seite wird neu
 * angefordert, damit auch die auf dem Server gerenderten Teile die neue
 * Sprache verwenden.
 */
export default function LocaleSwitcher({ locale }: { locale: Locale }) {
  const t = useT(TXT);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="flex items-center gap-1" title={t.label}>
      <span className="sr-only">{t.label}</span>
      <span aria-hidden className="text-subtle">
        🌐
      </span>
      <select
        className="rounded-md border border-border bg-panel px-1.5 py-1 text-xs outline-none focus:border-accent"
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAME[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
