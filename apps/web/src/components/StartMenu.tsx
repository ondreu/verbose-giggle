import { useEffect, useState } from "react";
import { useGame, type CampaignInfo } from "../store/store";
import { Icon } from "./Icon";
import { CharacterCreate } from "./CharacterCreate";
import { CampaignManager } from "./CampaignManager";

/**
 * First-run / home screen (#2, restructured per the #47 wireframes into a
 * persistent left-nav + content pane). The sidebar switches between Kampaně
 * (continue / pick / manage), Nová kampaň (the create options) and Zálohy
 * (snapshots), with Nastavení anchored at the bottom. Entering play is still
 * `setView("play")`.
 */
type Section = "campaigns" | "new" | "backups";

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "campaigns", label: "Kampaně", icon: "compass" },
  { id: "new", label: "Nová kampaň", icon: "plus" },
  { id: "backups", label: "Zálohy", icon: "archive" },
];

export function StartMenu({ onSettings }: { onSettings: () => void }) {
  const campaign = useGame((s) => s.campaign);
  const listCampaigns = useGame((s) => s.listCampaigns);
  const listSnapshots = useGame((s) => s.listSnapshots);

  useEffect(() => {
    void listCampaigns();
    void listSnapshots();
  }, [listCampaigns, listSnapshots]);

  const [section, setSection] = useState<Section>(campaign ? "campaigns" : "new");
  const [createChar, setCreateChar] = useState(false);

  return (
    <div className="relative z-10 min-h-full overflow-y-auto">
      {createChar && <CharacterCreate onClose={() => setCreateChar(false)} />}
      <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 px-5 py-8 lg:py-10">
        <header className="flex items-center gap-3">
          <Icon name="d20" size={34} className="flicker text-gold" />
          <div>
            <h1 className="font-display text-3xl tracking-wide text-text">Pán jeskyně</h1>
            <p className="font-body text-subtext0">Samostatně hostovaný AI vypravěč pro D&amp;D 5e</p>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[14rem_1fr]">
          {/* Left navigation rail — horizontal tabs on narrow screens. */}
          <nav className="flex flex-row flex-wrap gap-1.5 lg:flex-col">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setSection(n.id)}
                className={`flex items-center gap-2.5 rounded-sm border px-3.5 py-2.5 text-left font-display text-sm tracking-wide transition-colors ${
                  section === n.id
                    ? "nav-glow border-gold/50 bg-gold/10 text-gold"
                    : "border-surface1 bg-bg-mantle/40 text-subtext1 hover:border-gold/30 hover:text-text"
                }`}
              >
                <Icon name={n.icon} size={16} />
                {n.label}
              </button>
            ))}
            <div className="hidden flex-1 lg:block" />
            <button
              onClick={onSettings}
              className="flex items-center gap-2.5 rounded-sm border border-surface1 bg-bg-mantle/40 px-3.5 py-2.5 text-left font-display text-sm tracking-wide text-subtext1 transition-colors hover:border-gold/30 hover:text-text"
            >
              <Icon name="gear" size={16} />
              Nastavení
            </button>
          </nav>

          {/* Content pane */}
          <div className="min-w-0">
            {section === "campaigns" && (
              <CampaignsSection onPlay={() => setCreateChar(true)} />
            )}
            {section === "new" && <NewCampaignSection />}
            {section === "backups" && <RollbackPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Kampaně ─────────────────────────────────────────────────────────────── */

function CampaignsSection({ onPlay }: { onPlay: () => void }) {
  const campaign = useGame((s) => s.campaign);
  const campaigns = useGame((s) => s.campaigns);
  const setView = useGame((s) => s.setView);
  const selectCampaign = useGame((s) => s.selectCampaign);
  const generateCampaignMap = useGame((s) => s.generateCampaignMap);
  const busy = useGame((s) => s.busy);
  const [mapMsg, setMapMsg] = useState<string | null>(null);
  const [manage, setManage] = useState<CampaignInfo | null>(null);
  const active = campaigns.find((c) => c.active);

  if (campaigns.length === 0 && !campaign) {
    return (
      <section className="panel flex flex-col items-center gap-3 p-8 text-center">
        <Icon name="compass" size={28} className="text-subtext0" />
        <p className="font-body text-subtext1">
          Zatím nemáš žádnou kampaň. Vytvoř si novou v sekci <strong>Nová kampaň</strong>.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {manage && <CampaignManager campaign={manage} onClose={() => setManage(null)} />}

      {/* Continue the active campaign — the primary action. */}
      {campaign && (
        <section className="panel flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="font-log text-[10px] uppercase tracking-wider text-subtext0">Pokračovat</div>
            <div className="truncate font-display text-xl text-text">{campaign.name}</div>
            <div className="font-log text-xs text-subtext0">
              {active ? `${active.party} postav v družině` : "aktivní kampaň"}
            </div>
          </div>
          <button
            className="btn-ghost text-sm"
            onClick={async () => {
              setMapMsg(null);
              const r = await generateCampaignMap();
              setMapMsg(r.ok ? "Mapa vygenerována." : r.error ?? "Generování selhalo.");
            }}
            disabled={busy}
            title="Vygenerovat AI mapu světa (volitelné, vyžaduje konfiguraci obrázků)"
          >
            <Icon name="camera" size={14} /> {busy ? "Generuji…" : "Mapa (AI)"}
          </button>
          <button className="btn-ghost text-sm" onClick={onPlay}>
            <Icon name="scroll" size={14} /> Nová postava
          </button>
          <button className="btn-gold px-5 py-2.5 text-sm" onClick={() => setView("play")}>
            Hrát
          </button>
        </section>
      )}
      {mapMsg && <p className="-mt-3 px-1 font-log text-xs text-subtext0">{mapMsg}</p>}

      {/* Every campaign in the vault */}
      <section className="panel p-4">
        <h2 className="panel-title mb-3 pb-1">Všechny kampaně</h2>
        <ul className="flex flex-col gap-1.5">
          {campaigns.map((c) => (
            <li
              key={c.folder}
              className={`hover-lift flex items-center gap-3 rounded-sm border px-3 py-2 ${
                c.active ? "border-gold/50 bg-gold/5" : "border-surface1 bg-bg-mantle/40"
              }`}
            >
              <Icon name="compass" size={15} className={c.active ? "text-gold" : "text-subtext0"} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-body text-text">{c.name}</div>
                <div className="font-log text-[10px] text-subtext0">
                  {c.folder} · {c.party} postav
                </div>
              </div>
              {c.active ? (
                <button className="btn-gold px-3 py-1.5 text-[12px]" onClick={() => setView("play")}>
                  Hrát
                </button>
              ) : (
                <button className="btn-ghost text-[11px]" disabled={busy} onClick={() => void selectCampaign(c.folder)}>
                  otevřít
                </button>
              )}
              <button
                className="btn-ghost text-[11px]"
                onClick={() => setManage(c)}
                title="Spravovat: procházet soubory, export, smazat"
              >
                spravovat
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ── Nová kampaň ─────────────────────────────────────────────────────────── */

type NewMode = "empty" | "ai" | "template" | "import";

const NEW_OPTIONS: { id: NewMode; title: string; desc: string; icon: string; ready: boolean }[] = [
  { id: "empty", title: "Nová prázdná kampaň", desc: "Začni s čistým světem a postav si ho po svém.", icon: "scroll", ready: true },
  { id: "ai", title: "Nová AI generovaná kampaň", desc: "AI postaví svět, NPC i úvodní úkol podle tvého zadání.", icon: "flame", ready: true },
  { id: "template", title: "Kampaň ze šablony", desc: "Vyber si připravený scénář a rovnou hraj.", icon: "document", ready: true },
  { id: "import", title: "Importovat složku kampaně", desc: "Načti existující vault složku z disku.", icon: "upload", ready: false },
];

function NewCampaignSection() {
  const [mode, setMode] = useState<NewMode | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {NEW_OPTIONS.map((o) => {
        const open = mode === o.id;
        return (
          <section key={o.id} className={`panel overflow-hidden ${open ? "" : "hover-lift"}`}>
            <button
              className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-gold/5 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setMode(open ? null : o.id)}
              disabled={!o.ready}
            >
              <Icon name={o.icon} size={18} className={o.ready ? "text-gold" : "text-subtext0"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-display text-text">
                  {o.title}
                  {!o.ready && (
                    <span className="rounded-sm border border-surface2 px-1.5 font-log text-[9px] uppercase tracking-wider text-subtext0">
                      připravujeme
                    </span>
                  )}
                </div>
                <div className="font-body text-sm text-subtext0">{o.desc}</div>
              </div>
              {o.ready && (
                <Icon
                  name="plus"
                  size={16}
                  className={`shrink-0 text-subtext0 transition-transform ${open ? "rotate-45" : ""}`}
                />
              )}
            </button>
            {open && o.ready && (
              <div className="border-t border-surface1 px-4 pb-4 pt-3">
                {o.id === "empty" ? (
                  <EmptyCampaignForm />
                ) : o.id === "template" ? (
                  <TemplateForm />
                ) : (
                  <ForgeForm />
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function EmptyCampaignForm() {
  const createCampaign = useGame((s) => s.createCampaign);
  const selectCampaign = useGame((s) => s.selectCampaign);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async () => {
    if (!name.trim() || working) return;
    setWorking(true);
    setError(null);
    const res = await createCampaign({ name, startingLocationName: start || undefined });
    setWorking(false);
    if (!res.ok) {
      setError(res.error ?? "Nepodařilo se vytvořit kampaň");
      return;
    }
    setName("");
    setStart("");
    if (res.folder) void selectCampaign(res.folder);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="font-log text-[11px] uppercase tracking-wider text-subtext0">Název kampaně</label>
      <input
        className="settings-input bg-bg-crust text-text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="např. Stíny nad Tří Řekami"
        autoFocus
      />
      <label className="font-log text-[11px] uppercase tracking-wider text-subtext0">Výchozí lokace (volitelné)</label>
      <input
        className="settings-input bg-bg-crust text-text"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        placeholder="Domovská osada"
      />
      {error && <p className="font-log text-xs text-blood">{error}</p>}
      <div className="mt-1 flex justify-end">
        <button className="btn-gold px-4 py-2 text-sm" disabled={!name.trim() || working} onClick={() => void submit()}>
          {working ? "…" : "Vytvořit a otevřít"}
        </button>
      </div>
    </div>
  );
}

interface TemplateInfo {
  folder: string;
  name: string;
  party: number;
  world?: string;
}

/** Pick a built-in template scenario and instantiate it into a fresh, persistent campaign (#3). */
function TemplateForm() {
  const createFromTemplate = useGame((s) => s.createFromTemplate);
  const busy = useGame((s) => s.busy);
  const [templates, setTemplates] = useState<TemplateInfo[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates(Array.isArray(d.templates) ? d.templates : []))
      .catch(() => setTemplates([]));
  }, []);

  const submit = async () => {
    if (!selected || working) return;
    setWorking(true);
    setError(null);
    const res = await createFromTemplate({ template: selected, name: name.trim() || undefined });
    setWorking(false);
    if (!res.ok) {
      setError(res.error ?? "Vytvoření kampaně ze šablony selhalo");
      return;
    }
    // Server emits `reload`; the new campaign becomes active.
    setName("");
    setSelected(null);
  };

  if (templates === null) {
    return <p className="font-body text-sm italic text-subtext0">Načítám šablony…</p>;
  }
  if (templates.length === 0) {
    return <p className="font-body text-sm italic text-subtext0">Žádné vestavěné šablony nejsou k dispozici.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-body text-sm text-subtext0">
        Vyber připravený scénář. Vznikne tvoje vlastní kopie, která se ukládá samostatně — postup se
        nikdy neztratí ani po restartu serveru.
      </p>
      <ul className="flex flex-col gap-1.5">
        {templates.map((t) => (
          <li key={t.folder}>
            <button
              onClick={() => setSelected(t.folder)}
              className={`hover-lift flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors ${
                selected === t.folder ? "border-gold/60 bg-gold/10" : "border-surface1 bg-bg-mantle/40 hover:border-gold/30"
              }`}
            >
              <Icon name="document" size={15} className={selected === t.folder ? "text-gold" : "text-subtext0"} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-body text-text">{t.name}</div>
                <div className="font-log text-[10px] text-subtext0">
                  {t.party} postav{t.world ? ` · svět ${t.world}` : ""}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <>
          <label className="font-log text-[11px] uppercase tracking-wider text-subtext0">Název kopie (volitelné)</label>
          <input
            className="settings-input bg-bg-crust text-text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={templates.find((t) => t.folder === selected)?.name ?? "Název kampaně"}
          />
        </>
      )}
      {error && <p className="font-log text-xs text-blood">{error}</p>}
      <div className="mt-1 flex justify-end">
        <button
          className="btn-gold px-4 py-2 text-sm"
          disabled={!selected || working || busy}
          onClick={() => void submit()}
        >
          {working ? "…" : "Vytvořit a hrát"}
        </button>
      </div>
    </div>
  );
}

function ForgeForm() {
  const [name, setName] = useState("");
  const [premise, setPremise] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [detail, setDetail] = useState<"sparse" | "normal" | "rich">("normal");
  const [worlds, setWorlds] = useState<{ id: string; name: string }[]>([]);
  const [world, setWorld] = useState("");
  const [worldShared, setWorldShared] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ phase: string; msg: string }[]>([]);

  // Load the vault's shared worlds the first time the wizard opens (#49).
  useEffect(() => {
    if (worlds.length > 0) return;
    void fetch("/api/worlds")
      .then((r) => (r.ok ? r.json() : { worlds: [] }))
      .then((d) => setWorlds(Array.isArray(d.worlds) ? d.worlds : []))
      .catch(() => setWorlds([]));
  }, [worlds.length]);

  const submit = async () => {
    if (!name.trim() || working) return;
    setWorking(true);
    setError(null);
    setProgress([]);

    let res: Response;
    try {
      res = await fetch("/api/campaigns/forge/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          premise: premise || undefined,
          length,
          detail,
          world: world || undefined,
          world_shared: world ? worldShared : undefined,
          sandbox: sandbox || undefined,
          select: true,
        }),
      });
    } catch {
      setError("Připojení k serveru selhalo");
      setWorking(false);
      return;
    }

    if (!res.ok || !res.body) {
      setError("Server vrátil chybu");
      setWorking(false);
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });

      // Parse SSE events: chunks separated by \n\n
      const chunks = buf.split("\n\n");
      buf = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const evMatch = chunk.match(/^event: (\w+)/m);
        const datMatch = chunk.match(/^data: (.+)/m);
        if (!datMatch) continue;
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(datMatch[1]!) as Record<string, unknown>;
        } catch {
          continue;
        }

        const evType = evMatch?.[1] ?? "message";
        if (evType === "progress") {
          setProgress((prev) => [...prev, { phase: String(data.phase ?? ""), msg: String(data.msg ?? "") }]);
        } else if (evType === "done") {
          setWorking(false);
          setName("");
          setPremise("");
          setProgress([]);
        } else if (evType === "error") {
          setError(String(data.error ?? "Stavba kampaně selhala"));
          setWorking(false);
        }
      }
    }
    // Fallback: if stream closed without a done event
    if (working) setWorking(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        className="settings-input bg-bg-crust text-text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Název kampaně"
        autoFocus
        disabled={working}
      />
      <textarea
        className="settings-input min-h-[4.5rem] resize-y bg-bg-crust text-text"
        value={premise}
        onChange={(e) => setPremise(e.target.value)}
        placeholder="Námět (volitelné) — téma, tón, zápletka, postavy… nech prázdné a AI vymyslí vše."
        disabled={working}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="font-log text-[10px] uppercase tracking-wider text-subtext0">Délka</label>
          <select
            className="settings-input bg-bg-crust text-text"
            value={length}
            onChange={(e) => setLength(e.target.value as typeof length)}
            disabled={working}
          >
            <option value="short">Krátká (3 lokace)</option>
            <option value="medium">Střední (5 lokací)</option>
            <option value="long">Dlouhá (8 lokací)</option>
          </select>
        </div>
        <div>
          <label className="font-log text-[10px] uppercase tracking-wider text-subtext0">Detail</label>
          <select
            className="settings-input bg-bg-crust text-text"
            value={detail}
            onChange={(e) => setDetail(e.target.value as typeof detail)}
            disabled={working}
          >
            <option value="sparse">Stručný</option>
            <option value="normal">Běžný</option>
            <option value="rich">Bohatý</option>
          </select>
        </div>
      </div>

      {/* Shared-world picker (#49): build the campaign inside an existing world. */}
      {worlds.length > 0 && (
        <div>
          <label className="font-log text-[10px] uppercase tracking-wider text-subtext0">Svět</label>
          <select
            className="settings-input bg-bg-crust text-text"
            value={world}
            onChange={(e) => setWorld(e.target.value)}
            disabled={working}
          >
            <option value="">— samostatná kampaň (vlastní svět) —</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {world && (
            <label className="mt-1.5 flex items-start gap-2 font-body text-xs text-subtext0">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={worldShared}
                onChange={(e) => setWorldShared(e.target.checked)}
                disabled={working}
              />
              <span>
                Sdílet stav světa s ostatními kampaněmi — co tahle družina ve světě změní (postup frakcí,
                události), pocítí i další kampaně ve stejném světě. Vypnuto = tahle kampaň má vlastní izolovanou
                kopii.
              </span>
            </label>
          )}
        </div>
      )}

      {/* Sandbox mode (#sandbox): no predetermined quest — free exploration. */}
      <label className="flex items-start gap-2 font-body text-xs text-subtext0">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={sandbox}
          onChange={(e) => setSandbox(e.target.checked)}
          disabled={working}
        />
        <span>
          Sandbox — bez předem daného úkolu či zápletky. AI postaví svět, ale družina ho prozkoumává volně
          vlastním tempem a Pán jeskyně ji do ničeho netlačí.
        </span>
      </label>

      {/* Streaming progress log */}
      {progress.length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-sm border border-surface1 bg-bg-crust/60 p-2">
          {progress.map((p, i) => (
            <div
              key={i}
              className={`flex items-baseline gap-1.5 py-0.5 font-log text-[11px] ${
                i === progress.length - 1 ? "text-gold" : "text-subtext0"
              }`}
            >
              <span className="shrink-0 text-subtext0/60">{p.phase}</span>
              <span>{p.msg}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="font-log text-xs text-blood">{error}</p>}
      <div className="mt-1 flex items-center justify-end gap-2">
        {working && <span className="animate-pulse font-log text-xs text-subtext0">AI staví svět…</span>}
        <button className="btn-gold px-4 py-2 text-sm" disabled={!name.trim() || working} onClick={() => void submit()}>
          {working ? "…" : "Postavit a otevřít"}
        </button>
      </div>
    </div>
  );
}

/* ── Zálohy ──────────────────────────────────────────────────────────────── */

function RollbackPanel() {
  const snapshots = useGame((s) => s.snapshots);
  const createSnapshot = useGame((s) => s.createSnapshot);
  const restoreSnapshot = useGame((s) => s.restoreSnapshot);
  const deleteSnapshot = useGame((s) => s.deleteSnapshot);
  const busy = useGame((s) => s.busy);
  const [label, setLabel] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString("cs-CZ");
  };

  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="archive" size={15} className="text-gold" />
        <h2 className="panel-title pb-0">Zálohy &amp; rollback</h2>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          className="settings-input flex-1 bg-bg-crust text-text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Popis zálohy (volitelné)"
        />
        <button
          className="btn-gold whitespace-nowrap px-3 py-2 text-sm"
          disabled={busy}
          onClick={async () => {
            await createSnapshot(label || undefined);
            setLabel("");
          }}
        >
          Uložit zálohu
        </button>
      </div>

      {snapshots.length === 0 ? (
        <p className="font-body text-sm italic text-subtext0">
          Zatím žádné zálohy. Ulož si bod, ke kterému se můžeš vrátit.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {snapshots.map((s) => (
            <li key={s.id} className="hover-lift flex items-center gap-3 rounded-sm border border-surface1 bg-bg-mantle/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-body text-text">{s.label}</span>
                  {s.auto && (
                    <span className="rounded-sm border border-surface2 px-1 font-log text-[9px] uppercase text-subtext0">
                      auto
                    </span>
                  )}
                </div>
                <div className="font-log text-[10px] text-subtext0">
                  {fmt(s.createdAt)}
                  {s.location ? ` · ${s.location}` : ""}
                  {s.day ? ` · den ${s.day}` : ""}
                </div>
              </div>
              {confirmId === s.id ? (
                <>
                  <button
                    className="rounded-sm border border-blood/60 px-2 py-1 font-log text-[11px] text-blood hover:bg-blood/10"
                    disabled={busy}
                    onClick={async () => {
                      await restoreSnapshot(s.id);
                      setConfirmId(null);
                    }}
                  >
                    potvrdit obnovu
                  </button>
                  <button className="btn-link text-[11px]" onClick={() => setConfirmId(null)}>
                    zpět
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-ghost text-[11px]" onClick={() => setConfirmId(s.id)}>
                    obnovit
                  </button>
                  <button
                    className="font-log text-[11px] text-subtext0 hover:text-blood"
                    title="Smazat zálohu"
                    onClick={() => void deleteSnapshot(s.id)}
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
