import { useEffect, useState } from "react";
import { useGame, type CampaignInfo } from "../store/store";
import { Icon } from "./Icon";
import { CharacterCreate } from "./CharacterCreate";
import { CampaignManager } from "./CampaignManager";

/**
 * First-run / home screen (#2): continue the current campaign, switch or create
 * a campaign, roll the campaign back to a snapshot, or open Settings. The play
 * surface is entered via `setView("play")`.
 */
export function StartMenu({ onSettings }: { onSettings: () => void }) {
  const campaign = useGame((s) => s.campaign);
  const campaigns = useGame((s) => s.campaigns);
  const setView = useGame((s) => s.setView);
  const listCampaigns = useGame((s) => s.listCampaigns);
  const listSnapshots = useGame((s) => s.listSnapshots);
  const selectCampaign = useGame((s) => s.selectCampaign);
  const generateCampaignMap = useGame((s) => s.generateCampaignMap);
  const busy = useGame((s) => s.busy);
  const [mapMsg, setMapMsg] = useState<string | null>(null);

  useEffect(() => {
    void listCampaigns();
    void listSnapshots();
  }, [listCampaigns, listSnapshots]);

  const [createChar, setCreateChar] = useState(false);
  const [manage, setManage] = useState<CampaignInfo | null>(null);
  const active = campaigns.find((c) => c.active);

  return (
    <div className="relative z-10 min-h-full overflow-y-auto">
      {createChar && <CharacterCreate onClose={() => setCreateChar(false)} />}
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-10">
        <div className="flex items-center gap-3">
          <Icon name="d20" size={34} className="text-gold" />
          <div>
            <h1 className="font-display text-3xl tracking-wide text-text">Pán jeskyně</h1>
            <p className="font-body text-subtext0">Samostatně hostovaný AI vypravěč pro D&amp;D 5e</p>
          </div>
          <button className="btn-ghost ml-auto text-xs" onClick={onSettings}>
            <Icon name="gear" size={14} /> Nastavení
          </button>
        </div>

        {/* Continue the loaded campaign */}
        {campaign && (
          <section className="panel flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-display text-xl text-text">{campaign.name}</div>
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
            <button className="btn-ghost text-sm" onClick={() => setCreateChar(true)}>
              <Icon name="scroll" size={14} /> Nová postava
            </button>
            <button className="btn-gold px-5 py-2.5 text-sm" onClick={() => setView("play")}>
              Pokračovat ve hře
            </button>
          </section>
        )}
        {mapMsg && <p className="-mt-2 px-1 font-log text-xs text-subtext0">{mapMsg}</p>}

        <CampaignList campaigns={campaigns} busy={busy} onSelect={selectCampaign} onManage={setManage} />
        {manage && <CampaignManager campaign={manage} onClose={() => setManage(null)} />}
        <ForgeCampaign />
        <CreateCampaign />
        <RollbackPanel />
      </div>
    </div>
  );
}

function CampaignList({
  campaigns,
  busy,
  onSelect,
  onManage,
}: {
  campaigns: CampaignInfo[];
  busy: boolean;
  onSelect: (folder: string) => Promise<void>;
  onManage: (c: CampaignInfo) => void;
}) {
  if (campaigns.length === 0) return null;
  return (
    <section className="panel p-4">
      <h2 className="panel-title mb-3 pb-1">Kampaně</h2>
      <ul className="flex flex-col gap-1.5">
        {campaigns.map((c) => (
          <li
            key={c.folder}
            className={`flex items-center gap-3 rounded-sm border px-3 py-2 ${
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
              <span className="font-log text-[10px] uppercase tracking-wider text-gold">aktivní</span>
            ) : (
              <button className="btn-ghost text-[11px]" disabled={busy} onClick={() => void onSelect(c.folder)}>
                otevřít
              </button>
            )}
            <button
              className="btn-ghost text-[11px]"
              onClick={() => onManage(c)}
              title="Spravovat: procházet soubory, export, smazat"
            >
              spravovat
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ForgeCampaign() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [premise, setPremise] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [detail, setDetail] = useState<"sparse" | "normal" | "rich">("normal");
  const [worlds, setWorlds] = useState<{ id: string; name: string }[]>([]);
  const [world, setWorld] = useState("");
  const [worldShared, setWorldShared] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ phase: string; msg: string }[]>([]);

  // Load the vault's shared worlds the first time the wizard opens (#49).
  useEffect(() => {
    if (!open || worlds.length > 0) return;
    void fetch("/api/worlds")
      .then((r) => (r.ok ? r.json() : { worlds: [] }))
      .then((d) => setWorlds(Array.isArray(d.worlds) ? d.worlds : []))
      .catch(() => setWorlds([]));
  }, [open, worlds.length]);

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
        try { data = JSON.parse(datMatch[1]!) as Record<string, unknown>; } catch { continue; }

        const evType = evMatch?.[1] ?? "message";
        if (evType === "progress") {
          setProgress((prev) => [
            ...prev,
            { phase: String(data.phase ?? ""), msg: String(data.msg ?? "") },
          ]);
        } else if (evType === "done") {
          setWorking(false);
          setOpen(false);
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
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="flame" size={15} className="text-arcane" />
          <h2 className="panel-title pb-0">Postavit kampaň s AI</h2>
        </div>
        <button className="btn-link flex items-center gap-1 text-xs" onClick={() => setOpen((o) => !o)}>
          {open ? "zavřít" : "spustit průvodce"}
        </button>
      </div>
      <p className="mt-1 font-body text-sm text-subtext0">
        Řekni AI tolik nebo málo, kolik chceš — postaví ti svět, NPC i úvodní úkol.
      </p>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
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
                    Sdílet stav světa s ostatními kampaněmi — co tahle družina ve
                    světě změní (postup frakcí, události), pocítí i další kampaně ve
                    stejném světě. Vypnuto = tahle kampaň má vlastní izolovanou kopii.
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Streaming progress log */}
          {progress.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-sm border border-ink/10 bg-ink/5 p-2">
              {progress.map((p, i) => (
                <div
                  key={i}
                  className={`flex items-baseline gap-1.5 py-0.5 font-log text-[11px] ${
                    i === progress.length - 1 ? "text-gold" : "text-ink/50"
                  }`}
                >
                  <span className="shrink-0 text-ink/30">{p.phase}</span>
                  <span>{p.msg}</span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="font-log text-xs text-blood">{error}</p>}
          <div className="mt-1 flex items-center justify-end gap-2">
            {working && (
              <span className="font-log text-xs text-subtext0 animate-pulse">AI staví svět…</span>
            )}
            <button
              className="btn-gold px-4 py-2 text-sm"
              disabled={!name.trim() || working}
              onClick={() => void submit()}
            >
              {working ? "…" : "Postavit a otevřít"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CreateCampaign() {
  const createCampaign = useGame((s) => s.createCampaign);
  const selectCampaign = useGame((s) => s.selectCampaign);
  const [open, setOpen] = useState(false);
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
    setOpen(false);
    if (res.folder) void selectCampaign(res.folder);
  };

  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="panel-title pb-0">Nová kampaň</h2>
        <button className="btn-link flex items-center gap-1 text-xs" onClick={() => setOpen((o) => !o)}>
          <Icon name="scroll" size={13} /> {open ? "zavřít" : "vytvořit"}
        </button>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="font-log text-[11px] uppercase tracking-wider text-subtext0">Název kampaně</label>
          <input
            className="settings-input bg-bg-crust text-text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="např. Stíny nad Tří Řekami"
            autoFocus
          />
          <label className="font-log text-[11px] uppercase tracking-wider text-subtext0">
            Výchozí lokace (volitelné)
          </label>
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
      )}
    </section>
  );
}

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
        <Icon name="hourglass" size={15} className="text-gold" />
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
            <li key={s.id} className="flex items-center gap-3 rounded-sm border border-surface1 bg-bg-mantle/40 px-3 py-2">
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
