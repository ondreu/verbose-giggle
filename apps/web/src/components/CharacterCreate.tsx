import { useEffect, useMemo, useState } from "react";
import { csAbility, csAbilityAbbr, csSkill, csSpellSchool } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "./Icon";

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

interface SubraceOpt {
  id: string;
  name: string;
  bonuses: Partial<Record<Ability, number>>;
  traits: string[];
}
interface RaceOpt {
  id: string;
  name: string;
  speed: number;
  bonuses: Partial<Record<Ability, number>>;
  subraces: SubraceOpt[];
}
interface SpellOpt {
  id: string;
  name: string;
  level: number;
  school?: string;
}
interface SpellList {
  cantripsAllowed: number;
  spellsAllowed: number;
  cantrips: SpellOpt[];
  level1: SpellOpt[];
}
interface ClassOpt {
  id: string;
  name: string;
  hitDie: string;
  saves: Ability[];
  skillCount: number;
  skills: string[];
  caster: "full" | "half" | "warlock" | "none";
  subclasses: { id: string; name: string }[];
  spellList?: SpellList;
}
interface PointBuy {
  budget: number;
  min: number;
  max: number;
  cost: Record<number, number>;
}
interface Options {
  races: RaceOpt[];
  classes: ClassOpt[];
  feats: { id: string; name: string }[];
  standardArray: number[];
  pointBuy: PointBuy;
  abilityOrder: Ability[];
}

const mod = (n: number) => Math.floor((n - 10) / 2);
const fmt = (m: number) => (m >= 0 ? `+${m}` : `${m}`);

/**
 * Guided character creation (#14): race, class, ability scores (standard array,
 * editable), skill picks (capped by class), and optional starting spells. Writes
 * a valid actor note + party entry via POST /api/characters.
 */
export function CharacterCreate({ onClose }: { onClose: () => void }) {
  const createCharacter = useGame((s) => s.createCharacter);
  const busy = useGame((s) => s.busy);

  const [opts, setOpts] = useState<Options | null>(null);
  const [name, setName] = useState("");
  const [raceId, setRaceId] = useState("");
  const [subraceId, setSubraceId] = useState("");
  const [classId, setClassId] = useState("");
  // Default to the 5e standard array (costs exactly the 27-pt budget) so the
  // sheet opens balanced; "vynulovat" drops to all-8 for free point-buy.
  const [abilities, setAbilities] = useState<Record<Ability, number>>({
    str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8,
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]); // SRD spell-list selections
  const [backstory, setBackstory] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/creation/options");
        if (res.ok) setOpts(await res.json());
      } catch {
        /* surface on submit instead */
      }
    })();
  }, []);

  const race = opts?.races.find((r) => r.id === raceId);
  const subrace = race?.subraces.find((s) => s.id === subraceId);
  const cls = opts?.classes.find((c) => c.id === classId);
  const spellList = cls?.spellList;

  // Reset skills when the class changes (their list is class-specific).
  useEffect(() => setSkills([]), [classId]);
  // Reset spell picks when the class changes; reset subrace when race changes.
  useEffect(() => setPicked([]), [classId]);
  useEffect(() => setSubraceId(""), [raceId]);

  const finalAbilities = useMemo(() => {
    const out = { ...abilities };
    if (race) for (const k of Object.keys(out) as Ability[]) out[k] = Math.min(20, out[k] + (race.bonuses[k] ?? 0));
    if (subrace) for (const k of Object.keys(out) as Ability[]) out[k] = Math.min(20, out[k] + (subrace.bonuses[k] ?? 0));
    return out;
  }, [abilities, race, subrace]);

  // Point-buy budget: sum the cost of every base score; remaining gates the +.
  const pb = opts?.pointBuy;
  const spent = useMemo(
    () => (pb ? (Object.values(abilities) as number[]).reduce((s, v) => s + (pb.cost[v] ?? 0), 0) : 0),
    [abilities, pb],
  );
  const remaining = pb ? pb.budget - spent : 0;

  const bumpAbility = (k: Ability, dir: 1 | -1) => {
    if (!pb) return;
    setAbilities((a) => {
      const cur = a[k];
      const next = cur + dir;
      if (next < pb.min || next > pb.max) return a;
      const delta = (pb.cost[next] ?? 0) - (pb.cost[cur] ?? 0);
      if (dir === 1 && delta > remaining) return a; // can't afford
      return { ...a, [k]: next };
    });
  };
  const resetAbilities = () => setAbilities({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });

  const toggleSkill = (s: string) => {
    setSkills((cur) => {
      if (cur.includes(s)) return cur.filter((x) => x !== s);
      if (cls && cur.length >= cls.skillCount) return cur; // cap reached
      return [...cur, s];
    });
  };

  // Count current picks against the cantrip / level-1 caps.
  const pickedCantrips = spellList ? picked.filter((id) => spellList.cantrips.some((s) => s.id === id)) : [];
  const pickedSpells = spellList ? picked.filter((id) => spellList.level1.some((s) => s.id === id)) : [];
  const toggleSpell = (id: string, kind: "cantrip" | "level1") => {
    if (!spellList) return;
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const cap = kind === "cantrip" ? spellList.cantripsAllowed : spellList.spellsAllowed;
      const taken = kind === "cantrip" ? pickedCantrips.length : pickedSpells.length;
      if (taken >= cap) return cur; // cap reached
      return [...cur, id];
    });
  };

  const canSubmit = name.trim() && race && cls && (!cls || skills.length === cls.skillCount) && !busy;

  const submit = async () => {
    if (!race || !cls) return;
    setError(null);
    // Spells come only from the validated SRD picker (no free-text entry).
    const chosenSpells = spellList ? picked : [];
    const res = await createCharacter({
      name: name.trim(),
      race: race.id,
      subrace: subrace?.id,
      class: cls.id,
      abilities,
      skills,
      spells: chosenSpells,
      backstory: backstory.trim() || undefined,
    });
    if (!res.ok) {
      setError(res.error ?? "Nepodařilo se vytvořit postavu");
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="panel flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-black px-4 py-2.5">
          <Icon name="scroll" size={16} className="text-gold" />
          <h2 className="font-display text-lg tracking-wide">Tvorba postavy</h2>
          <button className="ml-auto text-subtext0 hover:text-gold" onClick={onClose} aria-label="Zavřít">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!opts ? (
            <p className="font-body italic text-subtext0">Načítám možnosti…</p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <Label>Jméno</Label>
                <input
                  className="settings-input bg-bg-crust text-text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jméno hrdiny"
                  autoFocus
                />
              </div>

              {/* Race + class */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Rasa</Label>
                  <select className="settings-input bg-bg-crust text-text" value={raceId} onChange={(e) => setRaceId(e.target.value)}>
                    <option value="">— vyber —</option>
                    {opts.races.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {race && (
                    <p className="mt-1 font-log text-[10px] text-subtext0">
                      rychlost {race.speed} ft ·{" "}
                      {Object.entries(race.bonuses).map(([k, v]) => `${csAbility(k)} +${v}`).join(", ")}
                    </p>
                  )}
                  {race && race.subraces.length > 0 && (
                    <div className="mt-2">
                      <Label>Podrasa</Label>
                      <select className="settings-input bg-bg-crust text-text" value={subraceId} onChange={(e) => setSubraceId(e.target.value)}>
                        <option value="">— bez podrasy —</option>
                        {race.subraces.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      {subrace && Object.keys(subrace.bonuses).length > 0 && (
                        <p className="mt-1 font-log text-[10px] text-subtext0">
                          {Object.entries(subrace.bonuses).map(([k, v]) => `${csAbility(k)} +${v}`).join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Povolání</Label>
                  <select className="settings-input bg-bg-crust text-text" value={classId} onChange={(e) => setClassId(e.target.value)}>
                    <option value="">— vyber —</option>
                    {opts.classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {cls && (
                    <p className="mt-1 font-log text-[10px] text-subtext0">
                      {cls.hitDie} · záchrany {cls.saves.map(csAbility).join(", ")} · {cls.skillCount} dovednosti
                      {cls.caster !== "none" ? " · sesílatel" : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* Ability scores — point-buy from a shared pool (#14). */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label>Vlastnosti — rozděl body</Label>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-log text-[11px] ${remaining < 0 ? "text-blood" : remaining === 0 ? "text-subtext0" : "text-gold"}`}
                    >
                      Body: {remaining}/{pb?.budget ?? 27}
                    </span>
                    <button type="button" className="btn-link text-[11px]" onClick={resetAbilities}>
                      vynulovat
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {opts.abilityOrder.map((k) => {
                    const base = abilities[k];
                    const racial = finalAbilities[k] - base;
                    const canInc = pb ? base < pb.max && ((pb.cost[base + 1] ?? 0) - (pb.cost[base] ?? 0)) <= remaining : false;
                    const canDec = pb ? base > pb.min : false;
                    return (
                      <div
                        key={k}
                        className="flex items-center gap-2 rounded-sm border border-surface1 bg-bg-mantle/50 px-2 py-1.5"
                        title={csAbility(k)}
                      >
                        <div className="flex-1">
                          <div className="text-[10px] uppercase tracking-wider text-subtext0">{csAbilityAbbr(k)}</div>
                          <div className="font-log text-[11px] text-gold">
                            {finalAbilities[k]} ({fmt(mod(finalAbilities[k]))})
                            {racial > 0 && <span className="ml-1 text-subtext0">·{base}+{racial}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Stepper sign="−" disabled={!canDec} onClick={() => bumpAbility(k, -1)} />
                          <span className="w-5 text-center font-display text-base text-text">{base}</span>
                          <Stepper sign="+" disabled={!canInc} onClick={() => bumpAbility(k, 1)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1 font-log text-[10px] text-subtext0">
                  Základ {pb?.min ?? 8}–{pb?.max ?? 15}; rasové bonusy se přičtou navrch.
                </p>
              </div>

              {/* Skills */}
              {cls && (
                <div>
                  <Label>
                    Dovednosti — vyber {cls.skillCount} ({skills.length}/{cls.skillCount})
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {cls.skills.map((s) => {
                      const on = skills.includes(s);
                      const full = !on && skills.length >= cls.skillCount;
                      return (
                        <button
                          key={s}
                          onClick={() => toggleSkill(s)}
                          disabled={full}
                          className={`rounded-sm border px-2 py-0.5 font-log text-[11px] ${
                            on
                              ? "border-gold/60 bg-gold/10 text-gold"
                              : full
                                ? "border-surface1 text-subtext0/40"
                                : "border-surface2 text-subtext1 hover:border-gold/40"
                          }`}
                        >
                          {csSkill(s)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Spells — real SRD picker when a class list is mounted, else free text. */}
              {cls && spellList && (
                <div className="flex flex-col gap-2">
                  {spellList.cantrips.length > 0 && (
                    <SpellPicker
                      title={`Triky — vyber ${spellList.cantripsAllowed} (${pickedCantrips.length}/${spellList.cantripsAllowed})`}
                      spells={spellList.cantrips}
                      picked={picked}
                      full={pickedCantrips.length >= spellList.cantripsAllowed}
                      onToggle={(id) => toggleSpell(id, "cantrip")}
                    />
                  )}
                  {spellList.level1.length > 0 && spellList.spellsAllowed > 0 && (
                    <SpellPicker
                      title={`Kouzla 1. úrovně — vyber ${spellList.spellsAllowed} (${pickedSpells.length}/${spellList.spellsAllowed})`}
                      spells={spellList.level1}
                      picked={picked}
                      full={pickedSpells.length >= spellList.spellsAllowed}
                      onToggle={(id) => toggleSpell(id, "level1")}
                    />
                  )}
                </div>
              )}
              {cls && cls.caster !== "none" && !spellList && (
                <div>
                  <Label>Kouzla</Label>
                  {cls.caster === "half" ? (
                    <p className="font-body text-sm italic text-subtext0">
                      {cls.name} získává kouzla až od 2. úrovně — na 1. úrovni žádná nevybíráš.
                    </p>
                  ) : (
                    <p className="font-body text-sm italic text-blood/90">
                      Seznam kouzel nelze načíst — není namountovaný SRD dataset. Nastav cestu v
                      Nastavení → „Cesta k SRD" (a ulož); pak se kouzla načtou z databáze.
                    </p>
                  )}
                </div>
              )}

              {/* Backstory — free text; becomes narration grounding for the DM. */}
              <div>
                <Label>Příběh postavy (volitelné)</Label>
                <textarea
                  className="settings-input min-h-[5rem] resize-y bg-bg-crust text-text"
                  value={backstory}
                  onChange={(e) => setBackstory(e.target.value)}
                  placeholder="Odkud přichází, co ji žene, koho ztratila… Pár vět stačí, vypravěč je použije."
                />
              </div>

              {error && <p className="font-log text-sm text-blood">{error}</p>}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-black px-4 py-3">
          <button className="btn-link text-sm" onClick={onClose}>
            Zrušit
          </button>
          <button className="btn-gold px-5 py-2 text-sm" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "…" : "Vytvořit postavu"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block font-log text-[11px] uppercase tracking-wider text-subtext0">{children}</label>;
}

/** Small round +/- control for point-buy ability steppers. */
function Stepper({ sign, onClick, disabled }: { sign: "+" | "−"; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={sign === "+" ? "Přidat" : "Ubrat"}
      className="flex h-6 w-6 items-center justify-center rounded-sm border border-surface2 font-display text-base leading-none text-subtext1 transition-colors hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
    >
      {sign}
    </button>
  );
}

function SpellPicker({
  title,
  spells,
  picked,
  full,
  onToggle,
}: {
  title: string;
  spells: SpellOpt[];
  picked: string[];
  full: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="flex flex-wrap gap-1.5">
        {spells.map((s) => {
          const on = picked.includes(s.id);
          const disabled = !on && full;
          return (
            <button
              key={s.id}
              onClick={() => onToggle(s.id)}
              disabled={disabled}
              title={s.school ? csSpellSchool(s.school) : undefined}
              className={`rounded-sm border px-2 py-0.5 font-log text-[11px] ${
                on
                  ? "border-gold/60 bg-gold/10 text-gold"
                  : disabled
                    ? "border-surface1 text-subtext0/40"
                    : "border-surface2 text-subtext1 hover:border-gold/40"
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
