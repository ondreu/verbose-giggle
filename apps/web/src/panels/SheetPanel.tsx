import { useState } from "react";
import { csCondition, csConditionDesc, csAbility, csAbilityAbbr, type AbilityKey } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { LevelUpModal } from "../components/LevelUpModal";
import { TargetPicker, type PickedTarget } from "../components/TargetPicker";

/** Turn a picked target into a Czech "na <cíl>" clause for the action sentence. */
export function targetClause(t: PickedTarget): string {
  if (!t) return "";
  return t.id ? ` na ${t.label} (${t.id})` : ` na ${t.label}`;
}


const mod = (score: number) => Math.floor((score - 10) / 2);
const fmt = (m: number) => (m >= 0 ? `+${m}` : `${m}`);
/** Prettify an SRD spell id ("fire-bolt") into a readable label. */
const prettySpell = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Cumulative XP to REACH each level (index 0 = level 1). SRD. */
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000,
  165000, 195000, 225000, 265000, 305000, 355000,
];

const ABILITY_ORDER: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export function SheetPanel() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendCommand = useGame((s) => s.sendCommand);
  const sendAction = useGame((s) => s.sendAction);
  const busy = useGame((s) => s.busy);
  const generateImage = useGame((s) => s.generateImage);
  const imageLoading = useGame((s) => s.imageLoading);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [castSpell, setCastSpell] = useState<string | null>(null);
  const [openCond, setOpenCond] = useState<string | null>(null);
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

  const canLevel = actor.type === "character" && actor.faction === "party" && actor.level < 20;
  const isPc = actor.type === "character" && actor.faction === "party";
  const curFloor = XP_THRESHOLDS[actor.level - 1] ?? 0;
  const nextFloor = XP_THRESHOLDS[actor.level] ?? null;
  const xpPct =
    nextFloor != null
      ? Math.max(0, Math.min(100, ((actor.xp - curFloor) / (nextFloor - curFloor)) * 100))
      : 100;
  const readyToLevel = nextFloor != null && actor.xp >= nextFloor;

  return (
    <section className="parchment flex flex-col p-4 font-body">
      {levelUpOpen && <LevelUpModal actor={actor} onClose={() => setLevelUpOpen(false)} />}
      {castSpell && (
        <TargetPicker
          title={`Cíl pro ${prettySpell(castSpell)}`}
          onClose={() => setCastSpell(null)}
          onPick={(t) => {
            void sendAction(`Sešlu kouzlo ${prettySpell(castSpell)} (${castSpell})${targetClause(t)}.`);
            setCastSpell(null);
          }}
        />
      )}
      <div className="flex items-baseline justify-between border-b border-ink/20 pb-1">
        <h2 className="font-display text-xl">{actor.name}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-ink/70">
            {actor.race} {actor.class} · úr. {actor.level}
          </span>
          {canLevel && (
            <button
              className="flex items-center gap-0.5 font-log text-[10px] text-gold/80 hover:text-gold disabled:opacity-40"
              onClick={() => setLevelUpOpen(true)}
              disabled={busy}
              title="Postup na vyšší úroveň"
            >
              <Icon name="d20" size={12} />
              úroveň
            </button>
          )}
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

      {/* XP toward next level (party PCs) */}
      {isPc && (
        <div className="mt-2">
          <div className="mb-0.5 flex items-baseline justify-between font-log text-[10px] text-ink/60">
            <span className="uppercase tracking-wider">Zkušenosti</span>
            <span>
              {actor.xp.toLocaleString("cs-CZ")}
              {nextFloor != null ? ` / ${nextFloor.toLocaleString("cs-CZ")} XP` : " XP (max)"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-ink/15">
            <div
              className="h-full transition-[width] duration-500"
              style={{ width: `${xpPct}%`, background: readyToLevel ? "var(--gold)" : "var(--steel)" }}
            />
          </div>
          {readyToLevel && (
            <div className="mt-0.5 font-log text-[10px] text-gold">Dost XP na postup — klikni „úroveň“.</div>
          )}
        </div>
      )}

      {/* Abilities */}
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {ABILITY_ORDER.map((key) => (
          <div
            key={key}
            className="rounded-sm border border-ink/20 bg-ink/5 px-1 py-1 text-center"
            title={csAbility(key)}
          >
            <div className="text-[10px] uppercase tracking-wider text-ink/60">{csAbilityAbbr(key)}</div>
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

      {/* Known / prepared spells (#8): list with cast buttons so a caster can
          actually pick a spell from the sheet, not just see empty slots. */}
      {actor.spells_known.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-ink/60">Známá kouzla</div>
          <div className="flex flex-wrap gap-1.5">
            {actor.spells_known.map((spell) => (
              <button
                key={spell}
                disabled={busy || downed}
                title={`Seslat ${prettySpell(spell)}`}
                onClick={() => setCastSpell(spell)}
                className="flex items-center gap-1 rounded-sm border border-arcane/50 bg-arcane/10 px-1.5 py-0.5 font-body text-[12px] text-arcane transition-colors hover:bg-arcane/20 disabled:opacity-40"
              >
                <Icon name="flame" size={11} />
                {prettySpell(spell)}
              </button>
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

      {/* Conditions (#34): chips you can tap to read the rules effect. */}
      {conditions.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((c) => {
              const open = openCond === c.name;
              return (
                <button
                  key={c.name}
                  title={csConditionDesc(c.name)}
                  onClick={() => setOpenCond(open ? null : c.name)}
                  className={`rounded-sm border px-1.5 py-0.5 font-log text-[11px] transition-colors ${
                    open
                      ? "border-blood bg-blood/20 text-blood"
                      : "border-blood/50 bg-blood/10 text-blood hover:bg-blood/20"
                  }`}
                >
                  {csCondition(c.name)}
                </button>
              );
            })}
          </div>
          {openCond && (
            <p className="mt-1.5 rounded-sm border border-ink/20 bg-ink/5 px-2 py-1 font-body text-[12px] leading-snug text-ink/80">
              <span className="font-semibold">{csCondition(openCond)}:</span>{" "}
              {csConditionDesc(openCond) || "Popis není k dispozici."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
