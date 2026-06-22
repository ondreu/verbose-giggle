import { useEffect, useState } from "react";
import { useGame, type CampaignInfo } from "../store/store";
import { Icon } from "./Icon";
import { CharacterCreate } from "./CharacterCreate";

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
  const busy = useGame((s) => s.busy);

  useEffect(() => {
    void listCampaigns();
    void listSnapshots();
  }, [listCampaigns, listSnapshots]);

  const [createChar, setCreateChar] = useState(false);
  const active = campaigns.find((c) => c.active);

  return (
    <div className="min-h-full overflow-y-auto bg-bg-crust">
      {createChar && <CharacterCreate onClose={() => setCreateChar(false)} />}
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-10">
        <div className="flex items-center gap-3">
          <Icon name="d20" size={34} className="text-gold" />
          <div>
            <h1 className="font-display text-3xl tracking-wide text-text">Pán jeskyně</h1>
            <p className="font-body text-subtext0">Samostatně hostovaný AI vypravěč pro D&amp;D 5e</p>
          </div>
          <button
            className="ml-auto flex items-center gap-1.5 rounded-sm border border-surface2 px-2.5 py-1.5 font-log text-xs text-subtext1 hover:border-gold/60 hover:text-gold"
            onClick={onSettings}
          >
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
              className="flex items-center gap-1.5 rounded-sm border border-surface2 px-3 py-2.5 font-log text-sm text-subtext1 hover:border-gold/60 hover:text-gold"
              onClick={() => setCreateChar(true)}
            >
              <Icon name="scroll" size={14} /> Nová postava
            </button>
            <button className="btn-gold px-5 py-2.5 text-sm" onClick={() => setView("play")}>
              Pokračovat ve hře
            </button>
          </section>
        )}

        <CampaignList campaigns={campaigns} busy={busy} onSelect={selectCampaign} />
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
}: {
  campaigns: CampaignInfo[];
  busy: boolean;
  onSelect: (folder: string) => Promise<void>;
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
              <button
                className="rounded-sm border border-surface2 px-2.5 py-1 font-log text-[11px] text-subtext1 hover:border-gold/60 hover:text-gold disabled:opacity-40"
                disabled={busy}
                onClick={() => void onSelect(c.folder)}
              >
                otevřít
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ForgeCampaign() {
  const forge = useGame((s) => s.forgeCampaign);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [premise, setPremise] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [detail, setDetail] = useState<"sparse" | "normal" | "rich">("normal");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || working) return;
    setWorking(true);
    setError(null);
    const res = await forge({ name, premise: premise || undefined, length, detail });
    setWorking(false);
    if (!res.ok) {
      setError(res.error ?? "Stavba kampaně selhala");
      return;
    }
    // On success the campaign hot-swaps in; the menu re-hydrates.
    setOpen(false);
    setName("");
    setPremise("");
  };

  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="flame" size={15} className="text-arcane" />
          <h2 className="panel-title pb-0">Postavit kampaň s AI</h2>
        </div>
        <button
          className="flex items-center gap-1 font-log text-xs text-subtext1 hover:text-gold"
          onClick={() => setOpen((o) => !o)}
        >
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
          />
          <textarea
            className="settings-input min-h-[4.5rem] resize-y bg-bg-crust text-text"
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            placeholder="Námět (volitelné) — téma, tón, zápletka, postavy… nech prázdné a AI vymyslí vše."
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-log text-[10px] uppercase tracking-wider text-subtext0">Délka</label>
              <select
                className="settings-input bg-bg-crust text-text"
                value={length}
                onChange={(e) => setLength(e.target.value as typeof length)}
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
              >
                <option value="sparse">Stručný</option>
                <option value="normal">Běžný</option>
                <option value="rich">Bohatý</option>
              </select>
            </div>
          </div>
          {error && <p className="font-log text-xs text-blood">{error}</p>}
          <div className="mt-1 flex items-center justify-end gap-2">
            {working && <span className="font-log text-xs text-subtext0">AI staví svět…</span>}
            <button className="btn-gold px-4 py-2 text-sm" disabled={!name.trim() || working} onClick={() => void submit()}>
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
        <button
          className="flex items-center gap-1 font-log text-xs text-subtext1 hover:text-gold"
          onClick={() => setOpen((o) => !o)}
        >
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
                  <button
                    className="font-log text-[11px] text-subtext0 hover:text-gold"
                    onClick={() => setConfirmId(null)}
                  >
                    zpět
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="rounded-sm border border-surface2 px-2 py-1 font-log text-[11px] text-subtext1 hover:border-gold/60 hover:text-gold"
                    onClick={() => setConfirmId(s.id)}
                  >
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
