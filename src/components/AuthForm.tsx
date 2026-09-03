"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/provider";

const TXT = {
  en: {
    login: "Log in",
    register: "Sign up",
    email: "Email",
    password: "Password",
    minChars: "(at least 8 characters)",
    submitLogin: "Log in",
    submitRegister: "Create account",
    noAccount: "No account yet?",
    forgot: "Forgotten your password?",
    haveAccount: "Already registered?",
    error: "Error",
  },
  de: {
    login: "Login",
    register: "Registrieren",
    email: "E-Mail",
    password: "Passwort",
    minChars: "(mind. 8 Zeichen)",
    submitLogin: "Einloggen",
    submitRegister: "Konto anlegen",
    noAccount: "Noch kein Konto?",
    forgot: "Passwort vergessen?",
    haveAccount: "Schon registriert?",
    error: "Fehler",
  },
};

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useT(TXT);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(json.error || t.error);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{mode === "login" ? t.login : t.register}</h1>
      <div>
        <label className="label">{t.email}</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          suppressHydrationWarning
        />
      </div>
      <div>
        <label className="label">
          {t.password} {mode === "register" && t.minChars}
        </label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "register" ? 8 : 1}
          suppressHydrationWarning
        />
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className="btn w-full justify-center" disabled={busy}>
        {busy ? "…" : mode === "login" ? t.submitLogin : t.submitRegister}
      </button>
      <p className="text-center text-xs text-subtle">
        {mode === "login" ? (
          <>
            {t.noAccount}{" "}
            <Link href="/register" className="text-brand">
              {t.register}
            </Link>
            {" · "}
            <Link href="/reset" className="text-brand">
              {t.forgot}
            </Link>
          </>
        ) : (
          <>
            {t.haveAccount}{" "}
            <Link href="/login" className="text-brand">
              {t.login}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
