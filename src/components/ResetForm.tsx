"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale, useT } from "@/lib/i18n/provider";
import { translateHint } from "@/lib/i18n/hints";

interface Props {
  /** "request" fragt nach der E-Mail, "confirm" nach dem neuen Passwort */
  mode: "request" | "confirm";
  /** Token aus dem Link, nur im Modus "confirm" */
  token?: string;
}

const TXT = {
  en: {
    titleRequest: "Forgotten password",
    titleConfirm: "Set a new password",
    leadRequest: "Enter your email address. We will send you a link that is valid for one hour.",
    leadConfirm: "Choose a new password with at least 8 characters.",
    email: "Email",
    newPassword: "New password",
    submitRequest: "Request link",
    submitConfirm: "Save password",
    sent: "If an account exists, a link has been sent.",
    changed: "Password changed. You are signed in again.",
    error: "Error",
    back: "Back to login",
  },
  de: {
    titleRequest: "Passwort vergessen",
    titleConfirm: "Neues Passwort setzen",
    leadRequest: "Gib deine E-Mail-Adresse an. Wir schicken dir einen Link, der eine Stunde lang gilt.",
    leadConfirm: "Wähle ein neues Passwort mit mindestens 8 Zeichen.",
    email: "E-Mail",
    newPassword: "Neues Passwort",
    submitRequest: "Link anfordern",
    submitConfirm: "Passwort speichern",
    sent: "Falls ein Konto besteht, wurde ein Link verschickt.",
    changed: "Passwort geändert. Du bist wieder angemeldet.",
    error: "Fehler",
    back: "Zurück zum Login",
  },
};

/** Passwort vergessen: E-Mail anfordern oder neues Passwort setzen. */
export default function ResetForm({ mode, token }: Props) {
  const t = useT(TXT);
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    setHinweis(null);
    const url = mode === "request" ? "/api/auth/reset" : "/api/auth/reset/confirm";
    const body = mode === "request" ? { email } : { token: token || "", password };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(json.error || t.error);
      return;
    }
    if (mode === "request") {
      setMsg(json.message ? translateHint(json.message as string, locale) : t.sent);
      if (json.hinweis) setHinweis(translateHint(json.hinweis as string, locale));
      return;
    }
    setMsg(t.changed);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{mode === "request" ? t.titleRequest : t.titleConfirm}</h1>

      {mode === "request" ? (
        <>
          <p className="text-sm text-muted">{t.leadRequest}</p>
          <div>
            <label className="label" htmlFor="reset-email">
              {t.email}
            </label>
            <input
              id="reset-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              suppressHydrationWarning
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{t.leadConfirm}</p>
          <div>
            <label className="label" htmlFor="reset-password">
              {t.newPassword}
            </label>
            <input
              id="reset-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              suppressHydrationWarning
            />
          </div>
        </>
      )}

      {err && <p className="text-sm text-red-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {hinweis && <p className="text-sm text-yellow-400">{hinweis}</p>}

      <button className="btn w-full justify-center" disabled={busy}>
        {busy ? "…" : mode === "request" ? t.submitRequest : t.submitConfirm}
      </button>

      <p className="text-center text-xs text-subtle">
        <Link href="/login" className="text-brand">
          {t.back}
        </Link>
      </p>
    </form>
  );
}
