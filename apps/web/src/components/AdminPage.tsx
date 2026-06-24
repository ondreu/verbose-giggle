import { useCallback, useEffect, useState } from "react";
import {
  adminAudit,
  adminDeleteUser,
  adminGrantCredits,
  adminListUsers,
  adminOverview,
  adminSetRole,
  adminSetVerified,
  type AdminOverview,
  type AdminUser,
  type AuditEntry,
} from "../auth";

/**
 * Admin panel (#57d), reached at /admin. The page is gated server-side: the
 * /api/admin/* endpoints return 403 to non-admins, so a non-admin simply sees
 * "access denied". A standalone page rather than a Settings tab keeps the
 * surface clean. No client router — App renders this when the path is /admin.
 */
export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [u, o, a] = await Promise.all([adminListUsers(), adminOverview(), adminAudit()]);
    if (!u.ok) {
      if (u.status === 401 || u.status === 403) setDenied(true);
      else setError(u.error);
      return;
    }
    setUsers(u.data.users);
    if (o.ok) setOverview(o.data);
    if (a.ok) setAudit(a.data.entries);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p;
    if (!res.ok) setError(res.error ?? "Akce selhala.");
    else setError(null);
    await refresh();
  }

  if (denied) {
    return (
      <Shell>
        <p className="font-display text-lg text-ink/80">Přístup odepřen</p>
        <p className="font-body text-sm text-ink/60">Tato stránka je jen pro administrátory.</p>
        <a href="/" className="btn-link text-sm underline">
          Zpět do aplikace
        </a>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl">Admin</h1>
        <a href="/" className="btn-link ml-auto text-sm underline">
          Zpět do aplikace
        </a>
      </div>

      {overview && (
        <div className="flex gap-4 font-log text-sm text-ink/70">
          <span>Uživatelů: {overview.users}</span>
          <span>Adminů: {overview.admins}</span>
          <span>Neověřených: {overview.unverified}</span>
        </div>
      )}
      {error && <p className="font-log text-sm text-blood">{error}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wider text-ink/70">Uživatelé</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-left font-log text-xs uppercase text-ink/50">
                <th className="py-1 pr-3">E-mail</th>
                <th className="py-1 pr-3">Jméno</th>
                <th className="py-1 pr-3">Role</th>
                <th className="py-1 pr-3">Ověřen</th>
                <th className="py-1 pr-3">Kredity</th>
                <th className="py-1 pr-3">Akce</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-b border-ink/10">
                  <td className="py-1.5 pr-3">{u.email}</td>
                  <td className="py-1.5 pr-3">{u.displayName ?? "—"}</td>
                  <td className="py-1.5 pr-3">{u.role}</td>
                  <td className="py-1.5 pr-3">{u.emailVerified ? "ano" : "ne"}</td>
                  <td className="py-1.5 pr-3">{u.credits}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="btn-link text-xs underline"
                        onClick={() => act(adminSetRole(u.id, u.role === "admin" ? "user" : "admin"))}
                      >
                        {u.role === "admin" ? "→ user" : "→ admin"}
                      </button>
                      <button
                        className="btn-link text-xs underline"
                        onClick={() => act(adminSetVerified(u.id, !u.emailVerified))}
                      >
                        {u.emailVerified ? "zrušit ověření" : "ověřit"}
                      </button>
                      <button
                        className="btn-link text-xs underline"
                        onClick={() => {
                          const v = prompt(`Úprava kreditů pro ${u.email} (kladně přidá, záporně odečte):`, "100");
                          const amount = v == null ? NaN : Number(v);
                          if (Number.isInteger(amount) && amount !== 0) void act(adminGrantCredits(u.id, amount));
                        }}
                      >
                        kredity
                      </button>
                      <button
                        className="btn-link text-xs text-blood underline"
                        onClick={() => {
                          if (confirm(`Smazat uživatele ${u.email}?`)) void act(adminDeleteUser(u.id));
                        }}
                      >
                        smazat
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wider text-ink/70">Audit log</h2>
        <ul className="flex flex-col gap-1 font-log text-xs text-ink/60">
          {audit.map((e) => (
            <li key={e.id}>
              <span className="text-ink/40">{new Date(e.createdAt).toLocaleString("cs-CZ")}</span>{" "}
              <span className="text-ink/80">{e.action}</span>
              {e.detail && <span> · {e.detail}</span>}
            </li>
          ))}
          {audit.length === 0 && <li className="italic">Zatím žádné záznamy.</li>}
        </ul>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-y-auto bg-bg-crust p-6 text-text">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">{children}</div>
    </div>
  );
}
