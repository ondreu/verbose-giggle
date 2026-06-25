import { useCallback, useEffect, useState } from "react";
import {
  adminAudit,
  adminBackupUrl,
  adminCreateBackup,
  adminDeleteBackup,
  adminDeleteCampaign,
  adminDeleteUser,
  adminExportCampaignUrl,
  adminGetServerSettings,
  adminGrantCredits,
  adminHealth,
  adminListBackups,
  adminListUsers,
  adminListVaults,
  adminOverview,
  adminSaveServerSettings,
  adminSetRole,
  adminSetVerified,
  adminUsage,
  type AdminCampaign,
  type AdminHealth,
  type AdminOverview,
  type AdminUsage,
  type AdminUser,
  type AuditEntry,
  type BackupInfo,
  type ServerSettings,
  type ServerSettingsPatch,
} from "../auth";
import { ProviderSettings } from "./ProviderSettings";

/**
 * Admin / dev panel (#57d, #57b), reached at /admin. Gated server-side: the
 * /api/admin/* endpoints return 403 to non-admins, so a non-admin sees "access
 * denied". Tabs cover users, global server settings, usage/cost, cross-tenant
 * campaign management, whole-vault backups, runtime health, and the audit log.
 */
type Tab = "overview" | "users" | "server" | "usage" | "vaults" | "backups" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Přehled" },
  { id: "users", label: "Uživatelé" },
  { id: "server", label: "Server" },
  { id: "usage", label: "Spotřeba" },
  { id: "vaults", label: "Kampaně" },
  { id: "backups", label: "Zálohy" },
  { id: "audit", label: "Audit" },
];

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onErr = useCallback((res: { ok: boolean; status?: number; error?: string }) => {
    if (res.ok) return false;
    if (res.status === 401 || res.status === 403) setDenied(true);
    else setError(res.error ?? "Akce selhala.");
    return true;
  }, []);

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

      <nav className="flex flex-wrap gap-1 border-b border-ink/15">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setError(null);
              setTab(t.id);
            }}
            className={`px-3 py-1.5 font-log text-sm ${
              tab === t.id ? "border-b-2 border-gold text-ink" : "text-ink/55 hover:text-ink/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="font-log text-sm text-blood">{error}</p>}

      {tab === "overview" && <OverviewTab onErr={onErr} />}
      {tab === "users" && <UsersTab onErr={onErr} />}
      {tab === "server" && <ServerTab onErr={onErr} />}
      {tab === "usage" && <UsageTab onErr={onErr} />}
      {tab === "vaults" && <VaultsTab onErr={onErr} />}
      {tab === "backups" && <BackupsTab onErr={onErr} />}
      {tab === "audit" && <AuditTab onErr={onErr} />}
    </Shell>
  );
}

type ErrHandler = (res: { ok: boolean; status?: number; error?: string }) => boolean;

// --- Overview + health -------------------------------------------------------

function OverviewTab({ onErr }: { onErr: ErrHandler }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);

  useEffect(() => {
    void (async () => {
      const [o, h] = await Promise.all([adminOverview(), adminHealth()]);
      if (o.ok) setOverview(o.data);
      else onErr(o);
      if (h.ok) setHealth(h.data);
      else onErr(h);
    })();
  }, [onErr]);

  return (
    <div className="flex flex-col gap-4">
      {overview && (
        <div className="flex flex-wrap gap-3">
          <Stat label="Uživatelů" value={overview.users} />
          <Stat label="Adminů" value={overview.admins} />
          <Stat label="Neověřených" value={overview.unverified} />
          {health && <Stat label="Aktivních sezení" value={health.activeSessions} />}
        </div>
      )}
      {health && (
        <section className="flex flex-col gap-2">
          <H2>Běh serveru</H2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-log text-sm text-ink/70 sm:grid-cols-3">
            <Row k="Node" v={health.node} />
            <Row k="Uptime" v={formatDuration(health.uptimeSec)} />
            <Row k="Spuštěn" v={new Date(health.startedAt).toLocaleString("cs-CZ")} />
            <Row k="Paměť (RSS)" v={formatBytes(health.memory.rss)} />
            <Row k="Heap" v={`${formatBytes(health.memory.heapUsed)} / ${formatBytes(health.memory.heapTotal)}`} />
            <Row k="Vault" v={health.vaultPath} />
            <Row k="LLM" v={`${health.providers.llm.provider} · ${health.providers.llm.model}${health.providers.llm.hasKey ? "" : " (bez klíče)"}`} />
            <Row k="Obrázky" v={health.providers.image.enabled ? health.providers.image.model ?? "zap." : "vyp."} />
            <Row k="TTS" v={health.providers.tts.engine} />
            <Row k="SMTP" v={health.auth.smtp ? "nastaveno" : "loguje se"} />
            <Row k="Kredity" v={health.credits.enabled ? "zapnuté" : "vypnuté"} />
            <Row k="Anonymní přístup" v={health.auth.allowAnonymous ? "ano" : "ne"} />
          </dl>
        </section>
      )}
    </div>
  );
}

// --- Users (carried over from #57d) -----------------------------------------

function UsersTab({ onErr }: { onErr: ErrHandler }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const refresh = useCallback(async () => {
    const u = await adminListUsers();
    if (u.ok) {
      setUsers(u.data.users);
      setTotal(u.data.total);
    } else onErr(u);
  }, [onErr]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (p: Promise<{ ok: boolean; status?: number; error?: string }>) => {
    onErr(await p);
    await refresh();
  };

  return (
    <section className="overflow-x-auto">
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
                  <button className="btn-link text-xs underline" onClick={() => act(adminSetRole(u.id, u.role === "admin" ? "user" : "admin"))}>
                    {u.role === "admin" ? "→ user" : "→ admin"}
                  </button>
                  <button className="btn-link text-xs underline" onClick={() => act(adminSetVerified(u.id, !u.emailVerified))}>
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
      {users && users.length < total && (
        <p className="mt-2 font-log text-xs text-ink/50">
          Zobrazeno {users.length} z {total}. Větší stránkování přibude později.
        </p>
      )}
    </section>
  );
}

// --- Server settings ---------------------------------------------------------

function ServerTab({ onErr }: { onErr: ErrHandler }) {
  const [s, setS] = useState<ServerSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    const r = await adminGetServerSettings();
    if (r.ok) setS(r.data);
    else onErr(r);
  }, [onErr]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: ServerSettingsPatch) => {
    setSaved(false);
    const r = await adminSaveServerSettings(patch);
    if (r.ok) {
      setS(r.data);
      setSaved(true);
    } else onErr(r);
  };

  if (!s) return <p className="font-log text-sm text-ink/50">Načítám…</p>;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <H2>Provoz účtů</H2>
        <Toggle label="Anonymní přístup (self-hosted)" checked={s.allowAnonymous} onChange={(v) => save({ allowAnonymous: v })} />
        {s.allowAnonymousPendingRestart && (
          <p className="font-log text-xs text-amber-400/90">
            ⚠ Změna přihlašování se projeví hned, ale izolace dat (sdílený vs. per-uživatel vault)
            se přepne až po restartu serveru.
          </p>
        )}
        <Toggle label="Registrace otevřená" checked={s.registrationEnabled} onChange={(v) => save({ registrationEnabled: v })} />
        <Toggle label="Vyžadovat ověřený e-mail při přihlášení" checked={s.requireVerifiedEmail} onChange={(v) => save({ requireVerifiedEmail: v })} />
        <Toggle label="Účtovat kredity (metering)" checked={s.creditsEnabled} onChange={(v) => save({ creditsEnabled: v })} />
      </section>

      <section className="flex flex-col gap-2">
        <H2>AI & ceník (per akce)</H2>
        <PricingEditor settings={s} onSave={(pricing) => save({ pricing })} />
      </section>

      <section className="flex flex-col gap-2">
        <H2>Poskytovatelé (AI, obrázky, TTS, SRD)</H2>
        <p className="font-log text-xs text-ink/50">
          Klíče a modely se ukládají do vaultu (settings.json), ne do .env — přežijí restart i nasazení.
        </p>
        <ProviderSettings />
      </section>

      {saved && <p className="font-log text-sm text-gold">Uloženo. Nastavení přežije i restart.</p>}
    </div>
  );
}

function PricingEditor({
  settings,
  onSave,
}: {
  settings: ServerSettings;
  onSave: (p: Partial<ServerSettings["pricing"]>) => void;
}) {
  const [draft, setDraft] = useState(settings.pricing);
  // Per-model rates as editable strings ("" = use default).
  const [models, setModels] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft(settings.pricing);
    const m: Record<string, string> = {};
    for (const id of settings.models) {
      const v = settings.pricing.perModelMessage[id];
      m[id] = v == null ? "" : String(v);
    }
    setModels(m);
  }, [settings]);

  const flat: { k: keyof ServerSettings["pricing"]; label: string }[] = [
    { k: "perMessage", label: "Kredity / zpráva (výchozí)" },
    { k: "perCampaign", label: "Kredity / generování kampaně" },
    { k: "perImage", label: "Kredity / obrázek" },
  ];
  const basis: { k: keyof ServerSettings["pricing"]; label: string }[] = [
    { k: "perThousandTtsChars", label: "Kredity / 1k znaků TTS" },
    { k: "perThousandPromptTokens", label: "Cost-basis / 1k vstup. tokenů" },
    { k: "perThousandCompletionTokens", label: "Cost-basis / 1k výstup. tokenů" },
  ];

  const save = () => {
    // Build the per-model map: only models with an explicit number.
    const perModelMessage: Record<string, number> = {};
    for (const [id, v] of Object.entries(models)) {
      const n = v.trim() === "" ? NaN : Number(v);
      if (Number.isFinite(n) && n >= 0) perModelMessage[id] = n;
    }
    onSave({ ...draft, perModelMessage });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {flat.map((f) => (
          <NumField key={f.k} label={f.label} value={draft[f.k] as number} onChange={(n) => setDraft({ ...draft, [f.k]: n })} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-log text-xs text-ink/55">Cena za zprávu podle modelu (prázdné = výchozí {draft.perMessage}):</p>
        {settings.models.map((id) => (
          <label key={id} className="flex items-center justify-between gap-2 font-log text-sm text-ink/70">
            <span className="truncate" title={id}>
              {id}
            </span>
            <input
              type="number"
              min={0}
              placeholder={String(draft.perMessage)}
              value={models[id] ?? ""}
              onChange={(e) => setModels({ ...models, [id]: e.target.value })}
              className="w-24 rounded border border-ink/25 bg-bg-crust px-2 py-1 text-right text-ink"
            />
          </label>
        ))}
        {settings.models.length === 0 && <p className="font-log text-xs italic text-ink/40">Žádné modely nenastaveny.</p>}
      </div>

      <details className="font-log text-sm text-ink/70">
        <summary className="cursor-pointer text-ink/55">TTS & token cost-basis</summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {basis.map((f) => (
            <NumField key={f.k} label={f.label} value={draft[f.k] as number} onChange={(n) => setDraft({ ...draft, [f.k]: n })} />
          ))}
        </div>
      </details>

      <button className="btn-link self-start text-sm underline" onClick={save}>
        Uložit ceník
      </button>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 font-log text-sm text-ink/70">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded border border-ink/25 bg-bg-crust px-2 py-1 text-right text-ink"
      />
    </label>
  );
}

// --- Usage / cost ------------------------------------------------------------

function UsageTab({ onErr }: { onErr: ErrHandler }) {
  const [u, setU] = useState<AdminUsage | null>(null);
  useEffect(() => {
    void (async () => {
      const r = await adminUsage();
      if (r.ok) setU(r.data);
      else onErr(r);
    })();
  }, [onErr]);
  if (!u) return <p className="font-log text-sm text-ink/50">Načítám…</p>;

  return (
    <div className="flex flex-col gap-4">
      {!u.creditsEnabled && <p className="font-log text-xs text-ink/50">Metering je vypnutý — data jsou jen z ručních grantů.</p>}
      <div className="flex flex-wrap gap-3">
        <Stat label="Utraceno" value={u.totals.spent} />
        <Stat label="Přiděleno" value={u.totals.granted} />
        <Stat label="Pohybů" value={u.totals.entries} />
      </div>

      <section className="flex flex-col gap-2">
        <H2>Podle důvodu</H2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/20 text-left font-log text-xs uppercase text-ink/50">
              <th className="py-1 pr-3">Důvod</th>
              <th className="py-1 pr-3">Utraceno</th>
              <th className="py-1 pr-3">Přiděleno</th>
              <th className="py-1 pr-3">Počet</th>
            </tr>
          </thead>
          <tbody>
            {u.byReason.map((r) => (
              <tr key={r.reason} className="border-b border-ink/10 font-log text-ink/75">
                <td className="py-1 pr-3">{r.reason}</td>
                <td className="py-1 pr-3">{r.spent}</td>
                <td className="py-1 pr-3">{r.granted}</td>
                <td className="py-1 pr-3">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <H2>Podle uživatele</H2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/20 text-left font-log text-xs uppercase text-ink/50">
              <th className="py-1 pr-3">Uživatel</th>
              <th className="py-1 pr-3">Zůstatek</th>
              <th className="py-1 pr-3">Utraceno</th>
              <th className="py-1 pr-3">Pohybů</th>
            </tr>
          </thead>
          <tbody>
            {u.byUser.map((r) => (
              <tr key={r.userId} className="border-b border-ink/10 font-log text-ink/75">
                <td className="py-1 pr-3">{r.email ?? r.userId}</td>
                <td className="py-1 pr-3">{r.balance}</td>
                <td className="py-1 pr-3">{r.spent}</td>
                <td className="py-1 pr-3">{r.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// --- Vaults / campaigns ------------------------------------------------------

function VaultsTab({ onErr }: { onErr: ErrHandler }) {
  const [rows, setRows] = useState<AdminCampaign[] | null>(null);
  const refresh = useCallback(async () => {
    const r = await adminListVaults();
    if (r.ok) setRows(r.data.campaigns);
    else onErr(r);
  }, [onErr]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink/20 text-left font-log text-xs uppercase text-ink/50">
            <th className="py-1 pr-3">Kampaň</th>
            <th className="py-1 pr-3">Vlastník</th>
            <th className="py-1 pr-3">Složka</th>
            <th className="py-1 pr-3">Velikost</th>
            <th className="py-1 pr-3">Akce</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((c) => (
            <tr key={`${c.scope}/${c.folder}`} className="border-b border-ink/10 font-log text-ink/75">
              <td className="py-1.5 pr-3">{c.name}</td>
              <td className="py-1.5 pr-3">{c.scope === "__shared__" ? "sdílený" : c.ownerEmail ?? c.scope}</td>
              <td className="py-1.5 pr-3 text-ink/50">{c.folder}</td>
              <td className="py-1.5 pr-3">{formatBytes(c.sizeBytes)}</td>
              <td className="py-1.5 pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a className="btn-link text-xs underline" href={adminExportCampaignUrl(c.scope, c.folder)}>
                    export
                  </a>
                  <button
                    className="btn-link text-xs text-blood underline"
                    onClick={async () => {
                      if (!confirm(`Smazat kampaň „${c.name}"? Tuto akci nelze vrátit.`)) return;
                      onErr(await adminDeleteCampaign(c.scope, c.folder));
                      await refresh();
                    }}
                  >
                    smazat
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {rows?.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 font-log text-sm italic text-ink/50">
                Žádné kampaně.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

// --- Backups -----------------------------------------------------------------

function BackupsTab({ onErr }: { onErr: ErrHandler }) {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const r = await adminListBackups();
    if (r.ok) setBackups(r.data.backups);
    else onErr(r);
  }, [onErr]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-3">
      <p className="font-log text-xs text-ink/55">
        Záloha sbalí celý vault (databáze účtů, kampaně, světy, nastavení) do ZIP uloženého ve vaultu — přežije i nasazení.
      </p>
      <button
        className="btn-gold self-start rounded px-3 py-1.5 text-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await adminCreateBackup();
          setBusy(false);
          if (!onErr(r)) await refresh();
        }}
      >
        {busy ? "Zálohuji…" : "Vytvořit zálohu"}
      </button>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink/20 text-left font-log text-xs uppercase text-ink/50">
            <th className="py-1 pr-3">Název</th>
            <th className="py-1 pr-3">Vytvořeno</th>
            <th className="py-1 pr-3">Velikost</th>
            <th className="py-1 pr-3">Akce</th>
          </tr>
        </thead>
        <tbody>
          {backups?.map((b) => (
            <tr key={b.name} className="border-b border-ink/10 font-log text-ink/75">
              <td className="py-1.5 pr-3">{b.name}</td>
              <td className="py-1.5 pr-3">{new Date(b.createdAt).toLocaleString("cs-CZ")}</td>
              <td className="py-1.5 pr-3">{formatBytes(b.sizeBytes)}</td>
              <td className="py-1.5 pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a className="btn-link text-xs underline" href={adminBackupUrl(b.name)}>
                    stáhnout
                  </a>
                  <button
                    className="btn-link text-xs text-blood underline"
                    onClick={async () => {
                      if (!confirm(`Smazat zálohu ${b.name}?`)) return;
                      onErr(await adminDeleteBackup(b.name));
                      await refresh();
                    }}
                  >
                    smazat
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {backups?.length === 0 && (
            <tr>
              <td colSpan={4} className="py-2 font-log text-sm italic text-ink/50">
                Zatím žádné zálohy.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// --- Audit -------------------------------------------------------------------

function AuditTab({ onErr }: { onErr: ErrHandler }) {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    void (async () => {
      const r = await adminAudit();
      if (r.ok) {
        setAudit(r.data.entries);
        setTotal(r.data.total);
      } else onErr(r);
    })();
  }, [onErr]);

  return (
    <ul className="flex flex-col gap-1 font-log text-xs text-ink/60">
      {audit.map((e) => (
        <li key={e.id}>
          <span className="text-ink/40">{new Date(e.createdAt).toLocaleString("cs-CZ")}</span>{" "}
          <span className="text-ink/80">{e.action}</span>
          {e.detail && <span> · {e.detail}</span>}
        </li>
      ))}
      {audit.length === 0 && <li className="italic">Zatím žádné záznamy.</li>}
      {audit.length < total && (
        <li className="text-ink/40">Zobrazeno {audit.length} z {total} (nejnovější).</li>
      )}
    </ul>
  );
}

// --- Small shared bits -------------------------------------------------------

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-sm uppercase tracking-wider text-ink/70">{children}</h2>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-ink/15 px-3 py-2">
      <div className="font-display text-xl text-ink">{value}</div>
      <div className="font-log text-xs uppercase tracking-wide text-ink/50">{label}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-ink/45">{k}</dt>
      <dd className="truncate text-ink/80" title={v}>
        {v}
      </dd>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 font-log text-sm text-ink/75">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-gold" />
      {label}
    </label>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-y-auto bg-bg-crust p-6 text-text">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">{children}</div>
    </div>
  );
}
