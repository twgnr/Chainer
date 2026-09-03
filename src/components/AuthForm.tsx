"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
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
    if (!res.ok) return setErr(json.error || "Fehler");
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{mode === "login" ? "Login" : "Registrieren"}</h1>
      <div>
        <label className="label">E-Mail</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="label">Passwort {mode === "register" && "(mind. 8 Zeichen)"}</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "register" ? 8 : 1} />
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className="btn w-full justify-center" disabled={busy}>
        {busy ? "…" : mode === "login" ? "Einloggen" : "Konto anlegen"}
      </button>
      <p className="text-center text-xs text-gray-500">
        {mode === "login" ? (
          <>
            Noch kein Konto? <Link href="/register" className="text-accent">Registrieren</Link>
            {" · "}
            <Link href="/reset" className="text-accent">Passwort vergessen?</Link>
          </>
        ) : (
          <>
            Schon registriert? <Link href="/login" className="text-accent">Login</Link>
          </>
        )}
      </p>
    </form>
  );
}
