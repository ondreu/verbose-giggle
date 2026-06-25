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
  adminLogs,
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
  type ModelPoolEntry,
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
type Tab = "overview" | "users" | "server" | "usage" | "vaults" | "backups" | "audit" | "logs";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Přehled" },
  { id: "users", label: "Uživatelé" },
  { id: "server", label: "Server" },
  { id: "usage", label: "Spotřeba" },
  { id: "vaults", label: "Kampaně" },
  { id: "backups", label: "Zálohy" },
  { id: "audit", label: "Audit" },
  { id: "logs", label: "Logy" },
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
        <p className="font-display text-lg text-text">Přístup odepřen</p>
        <p className="font-body text-sm text-subtext1">Tato stránka je jen pro administrátory.</p>
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

      <nav className="flex flex-wrap gap-1 border-b border-surface1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setError(null);
              setTab(t.id);
            }}
            className={`px-3 py-1.5 font-log text-sm ${
              tab === t.id ? "border-b-2 border-gold text-text" : "text-subtext1 hover:text-text"
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
      {tab === "logs" && <LogsTab onErr={onErr} />}
    </Shell>
  );
}

type ErrHandler = (res: { ok: boolean; status?: number; error?: string }) => boolean;

/** Rows per page in the admin lists (#59h). */
const PAGE_SIZE = 50;

/**
 * Prev/next pager for a server-paginated list (#59h). Shows "X–Y of total" and
 * disables the edges. Hidden entirely when everything fits on one page.
 */
function Pager({
  offset,
  count,
  total,
  onPage,
}: {
  offset: number;
  count: number;
  total: number;
  onPage: (offset: number) => void;
}) {
  if (total <= PAGE_SIZE && offset === 0) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + count;
  return (
    <div className="mt-2 flex items-center gap-3 font-log text-xs text-subtext1">
      <button
        className="btn-link underline disabled:opacity-40 disabled:no-underline"
        disabled={offset === 0}
        onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))}
      >
        ‹ předchozí
      </button>
      <span>
        {from}–{to} z {total}
      </span>
      <button
        className="btn-link underline disabled:opacity-40 disabled:no-underline"
        disabled={to >= total}
        onClick={() => onPage(offset + PAGE_SIZE)}
      >
        další ›
      </button>
    </div>
  );
}

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
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-log text-sm text-subtext1 sm:grid-cols-3">
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
  const [offset, setOffset] = useState(0);
  const refresh = useCallback(async () => {
    const u = await adminListUsers({ limit: PAGE_SIZE, offset });
    if (u.ok) {
      setUsers(u.data.users);
      setTotal(u.data.total);
    } else onErr(u);
  }, [onErr, offset]);
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
          <tr className="border-b border-surface1 text-left font-log text-xs uppercase text-subtext0">
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
            <tr key={u.id} className="border-b border-surface1">
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
      {users && <Pager offset={offset} count={users.length} total={total} onPage={setOffset} />}
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

  if (!s) return <p className="font-log text-sm text-subtext0">Načítám…</p>;

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
        <H2>Model pool</H2>
        <p className="font-log text-xs text-subtext1">
          Nabídka modelů pro hráče — vše přes OpenRouter chat-completions. Cena za zprávu se
          promítne do účtování; inteligence a cena (★ 1–5) se ukazují hráči v přepínači modelů.
        </p>
        <ModelPoolEditor settings={s} onSave={(modelPool) => save({ modelPool })} />
      </section>

      <section className="flex flex-col gap-2">
        <H2>AI & ceník (per akce)</H2>
        <PricingEditor settings={s} onSave={(pricing) => save({ pricing })} />
      </section>

      <section className="flex flex-col gap-2">
        <H2>Poskytovatelé (AI, obrázky, TTS, SRD)</H2>
        <p className="font-log text-xs text-subtext0">
          Klíče a modely se ukládají do vaultu (settings.json), ne do .env — přežijí restart i nasazení.
        </p>
        <ProviderSettings />
      </section>

      {saved && <p className="font-log text-sm text-gold">Uloženo. Nastavení přežije i restart.</p>}
    </div>
  );
}

/** Clickable 1–5 star rating input. */
function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex" role="radiogroup" aria-label="hodnocení">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          title={`${n}/5`}
          onClick={() => onChange(n)}
          className={`px-0.5 text-base leading-none ${n <= value ? "text-gold" : "text-subtext0"} hover:text-gold`}
        >
          {n <= value ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}

/**
 * Operator-managed model pool editor (#56g): rows of { name, slug, credits/msg,
 * intelligence ★, price ★ }. All models route through the OpenRouter
 * chat-completions URL — only the slug differs.
 */
function ModelPoolEditor({
  settings,
  onSave,
}: {
  settings: ServerSettings;
  onSave: (pool: ModelPoolEntry[]) => void;
}) {
  const [rows, setRows] = useState<ModelPoolEntry[]>(settings.modelPool);
  useEffect(() => setRows(settings.modelPool), [settings]);

  const update = (i: number, patch: Partial<ModelPoolEntry>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows(rows.filter((_, j) => j !== i));
  const add = () =>
    setRows([
      ...rows,
      { name: "", model: "", perMessage: settings.pricing.perMessage, intelligence: 3, price: 3, tooltip: "" },
    ]);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-surface1 text-left font-log text-xs uppercase text-subtext0">
              <th className="py-1 pr-2">Jméno</th>
              <th className="py-1 pr-2">Adresa modelu (OpenRouter)</th>
              <th className="py-1 pr-2">Kr./zpráva</th>
              <th className="py-1 pr-2">Inteligence</th>
              <th className="py-1 pr-2">Cena</th>
              <th className="py-1 pr-2">Tooltip</th>
              <th className="py-1 pr-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-surface1">
                <td className="py-1 pr-2">
                  <input
                    value={r.name}
                    placeholder="DeepSeek Flash"
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="w-32 rounded border border-surface2 bg-bg-crust px-2 py-1 text-text"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={r.model}
                    placeholder="deepseek/deepseek-v4-flash"
                    onChange={(e) => update(i, { model: e.target.value })}
                    className="w-56 rounded border border-surface2 bg-bg-crust px-2 py-1 font-log text-text"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    min={0}
                    value={r.perMessage}
                    onChange={(e) => update(i, { perMessage: Number(e.target.value) })}
                    className="w-20 rounded border border-surface2 bg-bg-crust px-2 py-1 text-right text-text"
                  />
                </td>
                <td className="py-1 pr-2">
                  <StarRating value={r.intelligence} onChange={(n) => update(i, { intelligence: n })} />
                </td>
                <td className="py-1 pr-2">
                  <StarRating value={r.price} onChange={(n) => update(i, { price: n })} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={r.tooltip ?? ""}
                    maxLength={280}
                    placeholder="Rychlý a levný; ideální na průzkum."
                    onChange={(e) => update(i, { tooltip: e.target.value })}
                    className="w-56 rounded border border-surface2 bg-bg-crust px-2 py-1 text-text"
                  />
                </td>
                <td className="py-1 pr-2">
                  <button className="btn-link text-xs text-blood underline" onClick={() => remove(i)}>
                    smazat
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-2 font-log text-sm italic text-subtext0">
                  Žádné modely. Přidej první níže.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-link text-sm underline" onClick={add}>
          + přidat model
        </button>
        <button
          className="btn-link text-sm underline"
          onClick={() => onSave(rows.filter((r) => r.model.trim()))}
        >
          Uložit model pool
        </button>
      </div>
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
        <p className="font-log text-xs text-subtext1">Cena za zprávu podle modelu (prázdné = výchozí {draft.perMessage}):</p>
        {settings.models.map((id) => (
          <label key={id} className="flex items-center justify-between gap-2 font-log text-sm text-subtext1">
            <span className="truncate" title={id}>
              {id}
            </span>
            <input
              type="number"
              min={0}
              placeholder={String(draft.perMessage)}
              value={models[id] ?? ""}
              onChange={(e) => setModels({ ...models, [id]: e.target.value })}
              className="w-24 rounded border border-surface2 bg-bg-crust px-2 py-1 text-right text-text"
            />
          </label>
        ))}
        {settings.models.length === 0 && <p className="font-log text-xs italic text-subtext0">Žádné modely nenastaveny.</p>}
      </div>

      <details className="font-log text-sm text-subtext1">
        <summary className="cursor-pointer text-subtext1">TTS & token cost-basis</summary>
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
    <label className="flex items-center justify-between gap-2 font-log text-sm text-subtext1">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded border border-surface2 bg-bg-crust px-2 py-1 text-right text-text"
      />
    </label>
  );
}

// --- Usage / cost ------------------------------------------------------------

function UsageTab({ onErr }: { onErr: ErrHandler }) {
  const [u, setU] = useState<AdminUsage | null>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    void (async () => {
      const r = await adminUsage({ limit: PAGE_SIZE, offset });
      if (r.ok) setU(r.data);
      else onErr(r);
    })();
  }, [onErr, offset]);
  if (!u) return <p className="font-log text-sm text-subtext0">Načítám…</p>;

  return (
    <div className="flex flex-col gap-4">
      {!u.creditsEnabled && <p className="font-log text-xs text-subtext0">Metering je vypnutý — data jsou jen z ručních grantů.</p>}
      <div className="flex flex-wrap gap-3">
        <Stat label="Utraceno" value={u.totals.spent} />
        <Stat label="Přiděleno" value={u.totals.granted} />
        <Stat label="Pohybů" value={u.totals.entries} />
      </div>

      <section className="flex flex-col gap-2">
        <H2>Podle důvodu</H2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-surface1 text-left font-log text-xs uppercase text-subtext0">
              <th className="py-1 pr-3">Důvod</th>
              <th className="py-1 pr-3">Utraceno</th>
              <th className="py-1 pr-3">Přiděleno</th>
              <th className="py-1 pr-3">Počet</th>
            </tr>
          </thead>
          <tbody>
            {u.byReason.map((r) => (
              <tr key={r.reason} className="border-b border-surface1 font-log text-text">
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
            <tr className="border-b border-surface1 text-left font-log text-xs uppercase text-subtext0">
              <th className="py-1 pr-3">Uživatel</th>
              <th className="py-1 pr-3">Zůstatek</th>
              <th className="py-1 pr-3">Utraceno</th>
              <th className="py-1 pr-3">Pohybů</th>
            </tr>
          </thead>
          <tbody>
            {u.byUser.map((r) => (
              <tr key={r.userId} className="border-b border-surface1 font-log text-text">
                <td className="py-1 pr-3">{r.email ?? r.userId}</td>
                <td className="py-1 pr-3">{r.balance}</td>
                <td className="py-1 pr-3">{r.spent}</td>
                <td className="py-1 pr-3">{r.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager offset={offset} count={u.byUser.length} total={u.byUserTotal} onPage={setOffset} />
      </section>
    </div>
  );
}

// --- Vaults / campaigns ------------------------------------------------------

function VaultsTab({ onErr }: { onErr: ErrHandler }) {
  const [rows, setRows] = useState<AdminCampaign[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const refresh = useCallback(async () => {
    const r = await adminListVaults({ limit: PAGE_SIZE, offset });
    if (r.ok) {
      setRows(r.data.campaigns);
      setTotal(r.data.total);
    } else onErr(r);
  }, [onErr, offset]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-surface1 text-left font-log text-xs uppercase text-subtext0">
            <th className="py-1 pr-3">Kampaň</th>
            <th className="py-1 pr-3">Vlastník</th>
            <th className="py-1 pr-3">Složka</th>
            <th className="py-1 pr-3">Velikost</th>
            <th className="py-1 pr-3">Akce</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((c) => (
            <tr key={`${c.scope}/${c.folder}`} className="border-b border-surface1 font-log text-text">
              <td className="py-1.5 pr-3">{c.name}</td>
              <td className="py-1.5 pr-3">{c.scope === "__shared__" ? "sdílený" : c.ownerEmail ?? c.scope}</td>
              <td className="py-1.5 pr-3 text-subtext0">{c.folder}</td>
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
              <td colSpan={5} className="py-2 font-log text-sm italic text-subtext0">
                Žádné kampaně.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows && <Pager offset={offset} count={rows.length} total={total} onPage={setOffset} />}
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
      <p className="font-log text-xs text-subtext1">
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
          <tr className="border-b border-surface1 text-left font-log text-xs uppercase text-subtext0">
            <th className="py-1 pr-3">Název</th>
            <th className="py-1 pr-3">Vytvořeno</th>
            <th className="py-1 pr-3">Velikost</th>
            <th className="py-1 pr-3">Akce</th>
          </tr>
        </thead>
        <tbody>
          {backups?.map((b) => (
            <tr key={b.name} className="border-b border-surface1 font-log text-text">
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
              <td colSpan={4} className="py-2 font-log text-sm italic text-subtext0">
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
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    void (async () => {
      const r = await adminAudit({ limit: PAGE_SIZE, offset });
      if (r.ok) {
        setAudit(r.data.entries);
        setTotal(r.data.total);
      } else onErr(r);
    })();
  }, [onErr, offset]);

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1 font-log text-xs text-subtext1">
        {audit.map((e) => (
          <li key={e.id}>
            <span className="text-subtext0">{new Date(e.createdAt).toLocaleString("cs-CZ")}</span>{" "}
            <span className="text-text">{e.action}</span>
            {e.detail && <span> · {e.detail}</span>}
          </li>
        ))}
        {audit.length === 0 && <li className="italic font-log text-xs text-subtext1">Zatím žádné záznamy.</li>}
      </ul>
      <Pager offset={offset} count={audit.length} total={total} onPage={setOffset} />
    </div>
  );
}

/** One pino log line, reduced to time + level + message for display. */
function formatLogLine(raw: string): { time: string; level: string; msg: string } {
  try {
    const o = JSON.parse(raw) as { time?: number; level?: number; msg?: string };
    const levels: Record<number, string> = { 10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal" };
    return {
      time: o.time ? new Date(o.time).toLocaleTimeString("cs-CZ") : "",
      level: o.level ? levels[o.level] ?? String(o.level) : "",
      msg: o.msg ?? raw,
    };
  } catch {
    return { time: "", level: "", msg: raw };
  }
}

const LEVEL_COLOR: Record<string, string> = {
  warn: "text-amber-400",
  error: "text-blood",
  fatal: "text-blood",
};

function LogsTab({ onErr }: { onErr: ErrHandler }) {
  const [lines, setLines] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const refresh = useCallback(async () => {
    const r = await adminLogs();
    if (r.ok) {
      setLines(r.data.lines);
      setAvailable(r.data.available);
    } else onErr(r);
  }, [onErr]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!available) {
    return <p className="font-log text-sm text-subtext0">Prohlížeč logů není v tomto nasazení dostupný.</p>;
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-log text-xs text-subtext0">Posledních {lines.length} řádků (nejnovější dole).</p>
        <button className="btn-link text-xs underline" onClick={() => void refresh()}>
          Obnovit
        </button>
      </div>
      <pre className="max-h-[60vh] overflow-auto rounded border border-surface1 bg-black/30 p-2 font-log text-xs leading-relaxed">
        {lines.length === 0 && <span className="text-subtext0">Zatím žádné logy.</span>}
        {lines.map((raw, i) => {
          const l = formatLogLine(raw);
          return (
            <div key={i}>
              <span className="text-subtext0">{l.time}</span>{" "}
              <span className={LEVEL_COLOR[l.level] ?? "text-subtext1"}>{l.level}</span>{" "}
              <span className="text-text">{l.msg}</span>
            </div>
          );
        })}
      </pre>
    </section>
  );
}

// --- Small shared bits -------------------------------------------------------

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-sm uppercase tracking-wider text-subtext1">{children}</h2>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-surface1 px-3 py-2">
      <div className="font-display text-xl text-text">{value}</div>
      <div className="font-log text-xs uppercase tracking-wide text-subtext0">{label}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-subtext0">{k}</dt>
      <dd className="truncate text-text" title={v}>
        {v}
      </dd>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 font-log text-sm text-text">
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
