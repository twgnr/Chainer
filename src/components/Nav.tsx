"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/locale";
import type { Theme } from "@/lib/theme";
import { useT } from "@/lib/i18n/provider";
import LocaleSwitcher from "./LocaleSwitcher";
import ThemeToggle from "./ThemeToggle";

const TXT = {
  en: {
    links: {
      "/": "Search",
      "/trace": "Trace",
      "/path": "Connection",
      "/screen": "Bulk check",
      "/cases": "Cases",
      "/jobs": "Jobs",
      "/watchlist": "Watchlist",
      "/annotations": "Labels",
      "/team": "Team",
      "/settings": "Sources & keys",
      "/api-docs": "API",
    },
    guestHint: "Set MONGODB_URI and AUTH_SECRET to enable login",
    guestMode: "Guest mode (no database)",
    logout: "Log out",
    login: "Log in",
    register: "Sign up",
  },
  de: {
    links: {
      "/": "Suche",
      "/trace": "Trace",
      "/path": "Verbindung",
      "/screen": "Massenprüfung",
      "/cases": "Fälle",
      "/jobs": "Aufträge",
      "/watchlist": "Watchlist",
      "/annotations": "Labels",
      "/team": "Team",
      "/settings": "Quellen & Keys",
      "/api-docs": "API",
    },
    guestHint: "MONGODB_URI und AUTH_SECRET setzen, um Login zu aktivieren",
    guestMode: "Gastmodus (keine Datenbank)",
    logout: "Logout",
    login: "Login",
    register: "Registrieren",
  },
};

const HREFS = [
  "/",
  "/trace",
  "/path",
  "/screen",
  "/cases",
  "/jobs",
  "/watchlist",
  "/annotations",
  "/team",
  "/settings",
  "/api-docs",
] as const;

export default function Nav({
  email,
  dbConfigured,
  orgName,
  locale,
  theme,
}: {
  email: string | null;
  dbConfigured: boolean;
  orgName?: string;
  locale: Locale;
  theme: Theme;
}) {
  const t = useT(TXT);
  const path = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!email) return;
    const load = async () => {
      try {
        const res = await fetch("/api/watch");
        if (!res.ok) return;
        const j = await res.json();
        const n = (j.watches || []).reduce(
          (s: number, w: { events?: { read: boolean }[] }) => s + (w.events || []).filter((e) => !e.read).length,
          0,
        );
        setUnread(n);
      } catch {
        /* ignorieren */
      }
    };
    const t2 = setTimeout(load, 0);
    const i = setInterval(load, 120_000);
    return () => {
      clearTimeout(t2);
      clearInterval(i);
    };
  }, [email]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-panel print:hidden">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-3 py-3 sm:px-4">
        <Link href="/" className="text-lg font-bold">
          <span className="text-brand">⛓</span> Chainer
        </Link>
        <nav className="-mx-1 flex max-w-full gap-4 overflow-x-auto px-1 text-sm whitespace-nowrap">
          {HREFS.map((href) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "text-brand" : "text-fg-2 hover:text-foreground"}
            >
              {t.links[href]}
              {href === "/watchlist" && unread > 0 && (
                <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] text-black">{unread}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <LocaleSwitcher locale={locale} />
          <ThemeToggle theme={theme} />
          {!dbConfigured ? (
            <span className="text-xs text-subtle" title={t.guestHint}>
              {t.guestMode}
            </span>
          ) : email ? (
            <>
              <span className="text-muted">
                {email}
                {orgName && <span className="ml-1 text-brand">· {orgName}</span>}
              </span>
              <button onClick={logout} className="btn-secondary">
                {t.logout}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">
                {t.login}
              </Link>
              <Link href="/register" className="btn">
                {t.register}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
