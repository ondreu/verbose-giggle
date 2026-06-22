import { csCondition } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";


const mod = (score: number) => Math.floor((score - 10) / 2);
const fmt = (m: number) => (m >= 0 ? `+${m}` : `${m}`);
/** Prettify an SRD spell id ("fire-bolt") into a readable label ("Fire Bolt"). */
const spellLabel = (id: string) =>
  id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const ABILITY_LABELS: [keyof Abilities, string][] = [
  ["str", "SIL"],
  ["dex", "OBR"],
  ["con", "ODL"],
  ["int", "INT"],
  ["wis", "MDR"],
  ["cha", "CHA"],
];
type Abilities = { str: number; dex: number; con: number; int: number; wis: number; cha: number };

export function SheetPanel() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendCommand = useGame((s) => s.sendCommand);
  const sendAction = useGame((s) => s.sendAction);
  const busy = useGame((s) => s.busy);
  const generateImage = useGame((s) => s.generateImage);
  const imageLoading = useGame((s) => s.imageLoading);
  const activeId = session?.active_player ?? null;
  const actor = activeId ? actors[activeId] : null;

  if (!actor) {
    return (
      <section className="panel p-3">
        <header className="panel-title mb-2 pb-1">Postava</header>
        <p className="font-body text-sm italic text-subtext0">Žádná aktivní postava.</p>
      </section>
    );
  }

  const overlayHp = session?.actors[actor.id]?.hp?.current ?? actor.hp.current;
  const conditions = session?.actors[actor.id]?.conditions ?? actor.conditions;
  const hpPct = Math.max(0, Math.min(100, (overlayHp / actor.hp.max) * 100));
  const downed = overlayHp <= 0;
  const ds = actor.death_saves ?? { success: 0, fail: 0 };

  return (
    <section className="parchment flex flex-col p-4 font-body">
      <div className="flex items-baseline justify-between border-b border-ink/20 pb-1">
        <h2 className="font-display text-xl">{actor.name}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-ink/70">
            {actor.race} {actor.class} · úr. {actor.level}
          </span>
          <button
            className="flex items-center gap-0.5 font-log text-[10px] text-ink/50 hover:text-ink disabled:opacity-40"
            onClick={() => void generateImage("character", actor.id, `Portrét — ${actor.name}`)}
            disabled={imageLoading}
            title="Vygenerovat portrét postavy"
          >
            <Icon name="camera" size={12} />
            portrét
          </button>
        </div>
      </div>

      {/* HP / AC / Speed */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Icon name="heart" size={16} className="text-blood" />
          <span className="font-log text-sm">
            {overlayHp}/{actor.hp.max}
            {actor.hp.temp ? ` (+${actor.hp.temp})` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="shield" size={16} className="text-ink/80" />
          <span className="font-log text-sm">{actor.ac}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="footprints" size={16} className="text-ink/80" />
          <span className="font-log text-sm">{actor.speed} ft</span>
        </div>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-sm bg-ink/15">
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: `${hpPct}%`,
            background: hpPct > 50 ? "var(--verdigris)" : hpPct > 20 ? "var(--ember)" : "var(--blood)",
          }}
        />
      </div>

      {/* Abilities */}
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {ABILITY_LABELS.map(([key, label]) => (
          <div key={key} className="rounded-sm border border-ink/20 bg-ink/5 px-1 py-1 text-center">
            <div className="text-[10px] uppercase tracking-wider text-ink/60">{label}</div>
            <div className="font-display text-base leading-none">{fmt(mod(actor.abilities[key]))}</div>
            <div className="font-log text-[10px] text-ink/55">{actor.abilities[key]}</div>
          </div>
        ))}
      </div>

      {/* Spell slots (casters) */}
      {Object.keys(actor.spell_slots).length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-ink/60">Kouzelné sloty</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(actor.spell_slots).map(([lvl, slot]) => (
              <div key={lvl} className="flex items-center gap-1">
                <span className="font-log text-xs text-ink/70">{lvl}.</span>
                {Array.from({ length: slot.max }).map((_, i) => (
                  <span
                    key={i}
                    className="h-2.5 w-2.5 rounded-full border"
                    style={{
                      borderColor: "var(--arcane)",
                      background: i < slot.max - slot.used ? "var(--arcane)" : "transparent",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Known / prepared spells (casters) — each is castable via the DM loop */}
      {actor.spells_known.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-ink/60">
            <Icon name="flame" size={11} className="text-arcane" />
            Kouzla
          </div>
          <div className="flex flex-col gap-1">
            {actor.spells_known.map((spell) => (
              <div
                key={spell}
                className="flex items-center justify-between rounded-sm border border-ink/15 bg-ink/5 px-2 py-1"
              >
                <span className="font-body text-sm">{spellLabel(spell)}</span>
                <button
                  className="btn-gold px-2 py-0.5 text-[11px] disabled:opacity-40"
                  onClick={() => void sendAction(`Sešlu kouzlo ${spellLabel(spell)} (${spell}).`)}
                  disabled={busy || downed}
                  title={`Seslat ${spellLabel(spell)}`}
                >
                  seslat
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Death saves — shown when the actor is down at 0 HP */}
      {downed && (
        <div className="mt-3 rounded-sm border border-blood/40 bg-blood/10 p-2">
          <div className="mb-1 flex items-center gap-2">
            <Icon name="skull" size={14} className="text-blood" />
            <span className="text-[11px] uppercase tracking-wider text-blood">Záchrana před smrtí</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1" title="úspěchy">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-3 w-3 rounded-full border border-verdigris" style={{ background: i < ds.success ? "var(--verdigris)" : "transparent" }} />
              ))}
            </div>
            <div className="flex items-center gap-1" title="neúspěchy">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-3 w-3 rounded-full border border-blood" style={{ background: i < ds.fail ? "var(--blood)" : "transparent" }} />
              ))}
            </div>
            <button
              className="btn-gold ml-auto px-2 py-0.5 text-[11px]"
              onClick={() => void sendCommand("death_save", { actor: actor.id })}
            >
              Hodit
            </button>
          </div>
        </div>
      )}

      {/* Conditions */}
      {conditions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {conditions.map((c) => (
            <span
              key={c.name}
              className="rounded-sm border border-blood/50 bg-blood/10 px-1.5 py-0.5 font-log text-[11px] text-blood"
            >
              {csCondition(c.name)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
