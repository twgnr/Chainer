"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  /** "request" fragt nach der E-Mail, "confirm" nach dem neuen Passwort */
  mode: "request" | "confirm";
  /** Token aus dem Link, nur im Modus "confirm" */
  token?: string;
}

/** Passwort vergessen: E-Mail anfordern oder neues Passwort setzen. */
export default function ResetForm({ mode, token }: Props) {
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
      setErr(json.error || "Fehler");
      return;
    }
    if (mode === "request") {
      setMsg(json.message || "Falls ein Konto besteht, wurde ein Link verschickt.");
      if (json.hinweis) setHinweis(json.hinweis as string);
      return;
    }
    setMsg("Passwort geändert. Du bist wieder angemeldet.");
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{mode === "request" ? "Passwort vergessen" : "Neues Passwort setzen"}</h1>

      {mode === "request" ? (
        <>
          <p className="text-sm text-gray-400">
            Gib deine E-Mail-Adresse an. Wir schicken dir einen Link, der eine Stunde lang gilt.
          </p>
          <div>
            <label className="label" htmlFor="reset-email">
              E-Mail
            </label>
            <input
              id="reset-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-400">Wähle ein neues Passwort mit mindestens 8 Zeichen.</p>
          <div>
            <label className="label" htmlFor="reset-password">
              Neues Passwort
            </label>
            <input
              id="reset-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
        </>
      )}

      {err && <p className="text-sm text-red-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {hinweis && <p className="text-sm text-yellow-400">{hinweis}</p>}

      <button className="btn w-full justify-center" disabled={busy}>
        {busy ? "…" : mode === "request" ? "Link anfordern" : "Passwort speichern"}
      </button>

      <p className="text-center text-xs text-gray-500">
        <Link href="/login" className="text-accent">
          Zurück zum Login
        </Link>
      </p>
    </form>
  );
}
