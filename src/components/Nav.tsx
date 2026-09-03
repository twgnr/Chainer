"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Suche" },
  { href: "/trace", label: "Trace" },
  { href: "/path", label: "Verbindung" },
  { href: "/screen", label: "Massenprüfung" },
  { href: "/cases", label: "Fälle" },
  { href: "/jobs", label: "Aufträge" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/annotations", label: "Labels" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Quellen & Keys" },
  { href: "/api-docs", label: "API" },
];

export default function Nav({
  email,
  dbConfigured,
  orgName,
}: {
  email: string | null;
  dbConfigured: boolean;
  orgName?: string;
}) {
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
    const t = setTimeout(load, 0);
    const i = setInterval(load, 120_000);
    return () => {
      clearTimeout(t);
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
          <span className="text-accent">⛓</span> Chainer
        </Link>
        <nav className="-mx-1 flex max-w-full gap-4 overflow-x-auto px-1 text-sm whitespace-nowrap">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={path === l.href ? "text-accent" : "text-gray-300 hover:text-white"}
            >
              {l.label}
              {l.href === "/watchlist" && unread > 0 && (
                <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] text-black">{unread}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {!dbConfigured ? (
            <span className="text-xs text-gray-500" title="MONGODB_URI und AUTH_SECRET setzen, um Login zu aktivieren">
              Gastmodus (keine Datenbank)
            </span>
          ) : email ? (
            <>
              <span className="text-gray-400">
                {email}
                {orgName && <span className="ml-1 text-accent">· {orgName}</span>}
              </span>
              <button onClick={logout} className="btn-secondary">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">
                Login
              </Link>
              <Link href="/register" className="btn">
                Registrieren
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
