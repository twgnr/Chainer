"use client";

import { useCallback, useEffect, useState } from "react";

type Role = "owner" | "admin" | "member" | "viewer";

interface OrgMember {
  email: string;
  role: Role;
  addedAt: string;
}

interface OrgInvite {
  email: string;
  role: Role;
}

interface OrgApiKey {
  id: string;
  name: string;
  masked: string;
}

interface Org {
  id: string;
  name: string;
  role: Role;
  members: OrgMember[];
  invites: OrgInvite[];
  apiKeys: OrgApiKey[];
}

interface Membership {
  _id: string;
  name: string;
  members: number;
}

interface OrgResponse {
  org: Org | null;
  memberships: Membership[];
  error?: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  keyRequirement: "none" | "optional" | "required";
  keyHint?: string;
}

interface KeysResponse {
  providers: ProviderInfo[];
  error?: string;
}

/** Mögliche Rollen bei Einladung / Änderung (owner wird nicht vergeben) */
const ROLES: Role[] = ["admin", "member", "viewer"];

const ROLE_LABEL: Record<Role, string> = {
  owner: "Eigentümer",
  admin: "Administrator",
  member: "Mitglied",
  viewer: "Leser",
};

/** Body-Varianten des PATCH /api/org */
type OrgPatch =
  | { switchTo: string | null }
  | { name: string }
  | { invite: { email: string; role: Role } }
  | { removeMember: string }
  | { setRole: { email: string; role: Role } }
  | { apiKeys: Record<string, string> }
  | { leave: true };

export default function TeamView() {
  const [data, setData] = useState<OrgResponse | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulare
  const [newName, setNewName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [keyProvider, setKeyProvider] = useState("");
  const [keyValue, setKeyValue] = useState("");

  const load = useCallback(async () => {
    try {
      const [orgRes, keysRes] = await Promise.all([fetch("/api/org"), fetch("/api/settings/keys")]);
      const orgJson: OrgResponse = await orgRes.json();
      if (!orgRes.ok) {
        setErr(orgJson.error ?? "Laden fehlgeschlagen.");
        return;
      }
      setErr(null);
      setData(orgJson);
      if (keysRes.ok) {
        const keysJson: KeysResponse = await keysRes.json();
        const usable = (keysJson.providers ?? []).filter((p) => p.keyRequirement !== "none");
        setProviders(usable);
        setKeyProvider((prev) => prev || usable[0]?.id || "");
      }
    } catch {
      setErr("Netzwerkfehler beim Laden der Teamdaten.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function patch(body: OrgPatch, okMsg?: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: { error?: string } = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error ?? "Aktion fehlgeschlagen.");
    else {
      if (okMsg) setMsg(okMsg);
      await load();
    }
    setBusy(false);
  }

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json: { error?: string } = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error ?? "Team konnte nicht angelegt werden.");
    else {
      setNewName("");
      setMsg("Team angelegt.");
      await load();
    }
    setBusy(false);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    await patch({ invite: { email: inviteEmail.trim(), role: inviteRole } }, "Einladung gespeichert.");
    setInviteEmail("");
  }

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyProvider) return;
    await patch({ apiKeys: { [keyProvider]: keyValue.trim() } }, "API-Key gespeichert.");
    setKeyValue("");
  }

  if (err && !data) return <div className="card text-yellow-400">{err}</div>;
  if (!data) return <p className="text-gray-500">Lade…</p>;

  const org = data.org;
  const canManage = org?.role === "owner" || org?.role === "admin";

  return (
    <div className="space-y-4">
      <div className="card text-sm text-gray-400">
        Teams bündeln Ermittlungsarbeit: Hinterlegte Team-Keys gelten für alle Mitglieder, die keinen eigenen Key
        gespeichert haben, und geteilte Fälle sind für alle Teammitglieder sichtbar.
      </div>

      {err && <div className="card text-yellow-400">{err}</div>}
      {msg && <div className="card text-sm text-gray-300">{msg}</div>}

      {!org ? (
        <>
          <form onSubmit={createOrg} className="card space-y-3">
            <h2 className="font-semibold">Team anlegen</h2>
            <div>
              <label className="label" htmlFor="org-name">
                Teamname
              </label>
              <input
                id="org-name"
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="z. B. Ermittlungsgruppe Nord"
                required
                disabled={busy}
              />
            </div>
            <button className="btn" disabled={busy}>
              Team anlegen
            </button>
          </form>

          {data.memberships.length > 0 && (
            <div className="card space-y-2">
              <h2 className="font-semibold">Vorhandene Mitgliedschaften</h2>
              <ul className="space-y-1">
                {data.memberships.map((m) => (
                  <li key={m._id} className="flex items-center justify-between border-t border-border py-2 text-sm">
                    <span>
                      {m.name} <span className="text-gray-500">({m.members} Mitglieder)</span>
                    </span>
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => patch({ switchTo: m._id }, "Team gewechselt.")}
                    >
                      Hineinwechseln
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">{org.name}</h2>
                <p className="text-xs text-gray-500">Deine Rolle: {ROLE_LABEL[org.role]}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {data.memberships.length > 1 && (
                  <select
                    className="input w-auto"
                    value={org.id}
                    onChange={(e) => patch({ switchTo: e.target.value }, "Team gewechselt.")}
                    disabled={busy}
                    aria-label="Team wechseln"
                  >
                    {data.memberships.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => patch({ switchTo: null }, "Kein Team mehr aktiv.")}
                >
                  Kein Team
                </button>
                {org.role !== "owner" && (
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("Team wirklich verlassen?")) patch({ leave: true }, "Team verlassen.");
                    }}
                  >
                    Team verlassen
                  </button>
                )}
              </div>
            </div>
            {!canManage && <p className="text-sm text-yellow-400">Nur Administratoren dürfen das Team verwalten.</p>}
          </div>

          <div className="card">
            <h2 className="mb-2 font-semibold">Mitglieder</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-1">E-Mail</th>
                    <th>Rolle</th>
                    <th>Beigetreten</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {org.members.map((m) => (
                    <tr key={m.email} className="border-t border-border">
                      <td className="py-2">{m.email}</td>
                      <td>
                        {m.role === "owner" || !canManage ? (
                          <span className="text-gray-400">{ROLE_LABEL[m.role]}</span>
                        ) : (
                          <select
                            className="input w-auto"
                            value={m.role}
                            disabled={busy}
                            aria-label={`Rolle von ${m.email}`}
                            onChange={(e) =>
                              patch({ setRole: { email: m.email, role: e.target.value as Role } }, "Rolle geändert.")
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="text-gray-400">
                        {m.addedAt ? new Date(m.addedAt).toLocaleString("de-DE") : "–"}
                      </td>
                      <td className="text-right">
                        {canManage && m.role !== "owner" && (
                          <button
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`${m.email} wirklich entfernen?`))
                                patch({ removeMember: m.email }, "Mitglied entfernt.");
                            }}
                          >
                            Entfernen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {canManage && (
            <form onSubmit={invite} className="card space-y-3">
              <h2 className="font-semibold">Mitglied einladen</h2>
              <p className="text-sm text-gray-400">
                Ist die E-Mail-Adresse bereits registriert, wird die Person sofort Mitglied. Andernfalls tritt sie dem
                Team automatisch bei, sobald sie sich mit dieser Adresse registriert.
              </p>
              <div className="grid gap-3 md:grid-cols-[1fr_200px]">
                <div>
                  <label className="label" htmlFor="invite-email">
                    E-Mail
                  </label>
                  <input
                    id="invite-email"
                    className="input"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="person@example.com"
                    required
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="invite-role">
                    Rolle
                  </label>
                  <select
                    id="invite-role"
                    className="input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    disabled={busy}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="btn" disabled={busy}>
                Einladen
              </button>

              {org.invites.length > 0 && (
                <div className="pt-2">
                  <h3 className="mb-1 text-xs uppercase tracking-wide text-gray-500">Offene Einladungen</h3>
                  <ul className="space-y-1">
                    {org.invites.map((inv) => (
                      <li key={inv.email} className="flex items-center justify-between border-t border-border py-2">
                        <span className="text-sm">
                          {inv.email} <span className="text-gray-500">({ROLE_LABEL[inv.role]})</span>
                        </span>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => patch({ removeMember: inv.email }, "Einladung entfernt.")}
                        >
                          Entfernen
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          )}

          <div className="card space-y-3">
            <h2 className="font-semibold">Geteilte API-Keys</h2>
            <p className="text-sm text-gray-400">
              Diese Keys werden für alle Mitglieder verwendet, die keinen eigenen Key hinterlegt haben.
            </p>
            {!org.apiKeys.length ? (
              <p className="text-sm text-gray-500">Noch keine Team-Keys hinterlegt.</p>
            ) : (
              <ul className="space-y-1">
                {org.apiKeys.map((k) => (
                  <li key={k.id} className="flex items-center justify-between border-t border-border py-2 text-sm">
                    <span>
                      {k.name} <span className="mono text-xs text-gray-500">{k.masked}</span>
                    </span>
                    {canManage && (
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => patch({ apiKeys: { [k.id]: "" } }, "Key gelöscht.")}
                      >
                        Löschen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canManage &&
              (providers.length ? (
                <form onSubmit={saveKey} className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                  <div>
                    <label className="label" htmlFor="key-provider">
                      Provider
                    </label>
                    <select
                      id="key-provider"
                      className="input"
                      value={keyProvider}
                      onChange={(e) => setKeyProvider(e.target.value)}
                      disabled={busy}
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="key-value">
                      API-Key
                    </label>
                    <input
                      id="key-value"
                      className="input mono"
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      placeholder="Key eingeben (leer = löschen)"
                      autoComplete="off"
                      disabled={busy}
                    />
                    {providers.find((p) => p.id === keyProvider)?.keyHint && (
                      <p className="mt-1 text-xs text-gray-500">
                        {providers.find((p) => p.id === keyProvider)?.keyHint}
                      </p>
                    )}
                  </div>
                  <button className="btn" disabled={busy}>
                    Speichern
                  </button>
                </form>
              ) : (
                <p className="text-sm text-gray-500">Keine Provider mit Key-Unterstützung verfügbar.</p>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
