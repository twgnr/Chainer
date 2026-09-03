"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatters, useLocale, useT } from "@/lib/i18n/provider";
import { COMMON } from "@/lib/i18n/labels";
import { translateHint } from "@/lib/i18n/hints";

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

const ROLE_LABEL = {
  en: { owner: "Owner", admin: "Administrator", member: "Member", viewer: "Reader" },
  de: { owner: "Eigentümer", admin: "Administrator", member: "Mitglied", viewer: "Leser" },
} satisfies Record<string, Record<Role, string>>;

const TXT = {
  en: {
    loadFailed: "Loading failed.",
    networkError: "Network error while loading the team data.",
    actionFailed: "The action failed.",
    createFailed: "The team could not be created.",
    created: "Team created.",
    inviteSaved: "Invitation saved.",
    keySaved: "API key saved.",
    switched: "Switched team.",
    noTeamActive: "No team active any more.",
    left: "Left the team.",
    roleChanged: "Role changed.",
    memberRemoved: "Member removed.",
    inviteRemoved: "Invitation removed.",
    keyDeleted: "Key deleted.",
    lead: "Teams pool investigative work: team keys apply to every member who has not stored a key of their own, and shared cases are visible to all team members.",
    createTeam: "Create a team",
    teamName: "Team name",
    teamNamePlaceholder: "e.g. Investigation group North",
    memberships: "Existing memberships",
    memberCount: (n: number) => `${n} member${n === 1 ? "" : "s"}`,
    switchInto: "Switch into it",
    yourRole: "Your role:",
    switchTeam: "Switch team",
    noTeam: "No team",
    leaveTeam: "Leave the team",
    confirmLeave: "Really leave this team?",
    adminsOnly: "Only administrators may manage the team.",
    members: "Members",
    colEmail: "Email",
    colRole: "Role",
    colJoined: "Joined",
    roleOf: (email: string) => `Role of ${email}`,
    confirmRemove: (email: string) => `Really remove ${email}?`,
    remove: "Remove",
    inviteTitle: "Invite a member",
    inviteLead:
      "If the email address is already registered, that person becomes a member straight away. Otherwise they join the team automatically as soon as they register with this address.",
    invite: "Invite",
    openInvites: "Open invitations",
    sharedKeys: "Shared API keys",
    sharedKeysLead: "These keys are used for every member who has not stored a key of their own.",
    noTeamKeys: "No team keys stored yet.",
    provider: "Provider",
    apiKey: "API key",
    keyPlaceholder: "Enter key (empty = delete)",
    noProviders: "No providers with key support available.",
  },
  de: {
    loadFailed: "Laden fehlgeschlagen.",
    networkError: "Netzwerkfehler beim Laden der Teamdaten.",
    actionFailed: "Aktion fehlgeschlagen.",
    createFailed: "Team konnte nicht angelegt werden.",
    created: "Team angelegt.",
    inviteSaved: "Einladung gespeichert.",
    keySaved: "API-Key gespeichert.",
    switched: "Team gewechselt.",
    noTeamActive: "Kein Team mehr aktiv.",
    left: "Team verlassen.",
    roleChanged: "Rolle geändert.",
    memberRemoved: "Mitglied entfernt.",
    inviteRemoved: "Einladung entfernt.",
    keyDeleted: "Key gelöscht.",
    lead: "Teams bündeln Ermittlungsarbeit: Hinterlegte Team-Keys gelten für alle Mitglieder, die keinen eigenen Key gespeichert haben, und geteilte Fälle sind für alle Teammitglieder sichtbar.",
    createTeam: "Team anlegen",
    teamName: "Teamname",
    teamNamePlaceholder: "z. B. Ermittlungsgruppe Nord",
    memberships: "Vorhandene Mitgliedschaften",
    memberCount: (n: number) => `${n} Mitglieder`,
    switchInto: "Hineinwechseln",
    yourRole: "Deine Rolle:",
    switchTeam: "Team wechseln",
    noTeam: "Kein Team",
    leaveTeam: "Team verlassen",
    confirmLeave: "Team wirklich verlassen?",
    adminsOnly: "Nur Administratoren dürfen das Team verwalten.",
    members: "Mitglieder",
    colEmail: "E-Mail",
    colRole: "Rolle",
    colJoined: "Beigetreten",
    roleOf: (email: string) => `Rolle von ${email}`,
    confirmRemove: (email: string) => `${email} wirklich entfernen?`,
    remove: "Entfernen",
    inviteTitle: "Mitglied einladen",
    inviteLead:
      "Ist die E-Mail-Adresse bereits registriert, wird die Person sofort Mitglied. Andernfalls tritt sie dem Team automatisch bei, sobald sie sich mit dieser Adresse registriert.",
    invite: "Einladen",
    openInvites: "Offene Einladungen",
    sharedKeys: "Geteilte API-Keys",
    sharedKeysLead: "Diese Keys werden für alle Mitglieder verwendet, die keinen eigenen Key hinterlegt haben.",
    noTeamKeys: "Noch keine Team-Keys hinterlegt.",
    provider: "Provider",
    apiKey: "API-Key",
    keyPlaceholder: "Key eingeben (leer = löschen)",
    noProviders: "Keine Provider mit Key-Unterstützung verfügbar.",
  },
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
  const t = useT(TXT);
  const c = useT(COMMON);
  const fmt = useFormatters();
  const locale = useLocale();
  const roleName = useT(ROLE_LABEL);
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
        setErr(orgJson.error ?? t.loadFailed);
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
      setErr(t.networkError);
    }
  }, [t]);

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
    if (!res.ok) setErr(json.error ?? t.actionFailed);
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
    if (!res.ok) setErr(json.error ?? t.createFailed);
    else {
      setNewName("");
      setMsg(t.created);
      await load();
    }
    setBusy(false);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    await patch({ invite: { email: inviteEmail.trim(), role: inviteRole } }, t.inviteSaved);
    setInviteEmail("");
  }

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyProvider) return;
    await patch({ apiKeys: { [keyProvider]: keyValue.trim() } }, t.keySaved);
    setKeyValue("");
  }

  if (err && !data) return <div className="card text-yellow-400">{err}</div>;
  if (!data) return <p className="text-subtle">{c.loading}</p>;

  const org = data.org;
  const canManage = org?.role === "owner" || org?.role === "admin";

  return (
    <div className="space-y-4">
      <div className="card text-sm text-muted">
{t.lead}
      </div>

      {err && <div className="card text-yellow-400">{err}</div>}
      {msg && <div className="card text-sm text-fg-2">{msg}</div>}

      {!org ? (
        <>
          <form onSubmit={createOrg} className="card space-y-3">
            <h2 className="font-semibold">{t.createTeam}</h2>
            <div>
              <label className="label" htmlFor="org-name">
                {t.teamName}
              </label>
              <input
                id="org-name"
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.teamNamePlaceholder}
                required
                disabled={busy}
              />
            </div>
            <button className="btn" disabled={busy}>
              {t.createTeam}
            </button>
          </form>

          {data.memberships.length > 0 && (
            <div className="card space-y-2">
              <h2 className="font-semibold">{t.memberships}</h2>
              <ul className="space-y-1">
                {data.memberships.map((m) => (
                  <li key={m._id} className="flex items-center justify-between border-t border-border py-2 text-sm">
                    <span>
                      {m.name} <span className="text-subtle">({t.memberCount(m.members)})</span>
                    </span>
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => patch({ switchTo: m._id }, t.switched)}
                    >
                      {t.switchInto}
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
                <p className="text-xs text-subtle">{t.yourRole} {roleName[org.role]}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {data.memberships.length > 1 && (
                  <select
                    className="input w-auto"
                    value={org.id}
                    onChange={(e) => patch({ switchTo: e.target.value }, t.switched)}
                    disabled={busy}
                    aria-label={t.switchTeam}
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
                  onClick={() => patch({ switchTo: null }, t.noTeamActive)}
                >
                  {t.noTeam}
                </button>
                {org.role !== "owner" && (
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(t.confirmLeave)) patch({ leave: true }, t.left);
                    }}
                  >
                    {t.leaveTeam}
                  </button>
                )}
              </div>
            </div>
            {!canManage && <p className="text-sm text-yellow-400">{t.adminsOnly}</p>}
          </div>

          <div className="card">
            <h2 className="mb-2 font-semibold">{t.members}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-subtle">
                  <tr>
                    <th className="py-1">{t.colEmail}</th>
                    <th>{t.colRole}</th>
                    <th>{t.colJoined}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {org.members.map((m) => (
                    <tr key={m.email} className="border-t border-border">
                      <td className="py-2">{m.email}</td>
                      <td>
                        {m.role === "owner" || !canManage ? (
                          <span className="text-muted">{roleName[m.role]}</span>
                        ) : (
                          <select
                            className="input w-auto"
                            value={m.role}
                            disabled={busy}
                            aria-label={t.roleOf(m.email)}
                            onChange={(e) =>
                              patch({ setRole: { email: m.email, role: e.target.value as Role } }, t.roleChanged)
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {roleName[r]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="text-muted">
                        {fmt.timestamp(m.addedAt)}
                      </td>
                      <td className="text-right">
                        {canManage && m.role !== "owner" && (
                          <button
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(t.confirmRemove(m.email)))
                                patch({ removeMember: m.email }, t.memberRemoved);
                            }}
                          >
                            {t.remove}
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
              <h2 className="font-semibold">{t.inviteTitle}</h2>
              <p className="text-sm text-muted">
{t.inviteLead}
              </p>
              <div className="grid gap-3 md:grid-cols-[1fr_200px]">
                <div>
                  <label className="label" htmlFor="invite-email">
                    {t.colEmail}
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
                    {t.colRole}
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
                        {roleName[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="btn" disabled={busy}>
                {t.invite}
              </button>

              {org.invites.length > 0 && (
                <div className="pt-2">
                  <h3 className="mb-1 text-xs uppercase tracking-wide text-subtle">{t.openInvites}</h3>
                  <ul className="space-y-1">
                    {org.invites.map((inv) => (
                      <li key={inv.email} className="flex items-center justify-between border-t border-border py-2">
                        <span className="text-sm">
                          {inv.email} <span className="text-subtle">({roleName[inv.role]})</span>
                        </span>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => patch({ removeMember: inv.email }, t.inviteRemoved)}
                        >
                          {t.remove}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          )}

          <div className="card space-y-3">
            <h2 className="font-semibold">{t.sharedKeys}</h2>
            <p className="text-sm text-muted">
{t.sharedKeysLead}
            </p>
            {!org.apiKeys.length ? (
              <p className="text-sm text-subtle">{t.noTeamKeys}</p>
            ) : (
              <ul className="space-y-1">
                {org.apiKeys.map((k) => (
                  <li key={k.id} className="flex items-center justify-between border-t border-border py-2 text-sm">
                    <span>
                      {k.name} <span className="mono text-xs text-subtle">{k.masked}</span>
                    </span>
                    {canManage && (
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => patch({ apiKeys: { [k.id]: "" } }, t.keyDeleted)}
                      >
                        {c.delete}
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
                      {t.provider}
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
                      {t.apiKey}
                    </label>
                    <input
                      id="key-value"
                      className="input mono"
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      placeholder={t.keyPlaceholder}
                      autoComplete="off"
                      disabled={busy}
                    />
                    {providers.find((p) => p.id === keyProvider)?.keyHint && (
                      <p className="mt-1 text-xs text-subtle">
                        {translateHint(providers.find((p) => p.id === keyProvider)?.keyHint ?? "", locale)}
                      </p>
                    )}
                  </div>
                  <button className="btn" disabled={busy}>
                    {c.save}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-subtle">{t.noProviders}</p>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
