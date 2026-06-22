import { useEffect, useMemo, useState } from "react";
import { csAbility, csSkill } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "./Icon";

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

interface RaceOpt {
  id: string;
  name: string;
  speed: number;
  bonuses: Partial<Record<Ability, number>>;
}
interface ClassOpt {
  id: string;
  name: string;
  hitDie: string;
  saves: Ability[];
  skillCount: number;
  skills: string[];
  caster: "full" | "half" | "warlock" | "none";
}
interface Options {
  races: RaceOpt[];
  classes: ClassOpt[];
  standardArray: number[];
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
  const [classId, setClassId] = useState("");
  const [abilities, setAbilities] = useState<Record<Ability, number>>({
    str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8,
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [spells, setSpells] = useState("");
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
  const cls = opts?.classes.find((c) => c.id === classId);

  // Reset skills when the class changes (their list is class-specific).
  useEffect(() => setSkills([]), [classId]);

  const finalAbilities = useMemo(() => {
    const out = { ...abilities };
    if (race) for (const k of Object.keys(out) as Ability[]) out[k] = Math.min(20, out[k] + (race.bonuses[k] ?? 0));
    return out;
  }, [abilities, race]);

  const toggleSkill = (s: string) => {
    setSkills((cur) => {
      if (cur.includes(s)) return cur.filter((x) => x !== s);
      if (cls && cur.length >= cls.skillCount) return cur; // cap reached
      return [...cur, s];
    });
  };

  const canSubmit = name.trim() && race && cls && (!cls || skills.length === cls.skillCount) && !busy;

  const submit = async () => {
    if (!race || !cls) return;
    setError(null);
    const res = await createCharacter({
      name: name.trim(),
      race: race.id,
      class: cls.id,
      abilities,
      skills,
      spells: spells.split(",").map((s) => s.trim()).filter(Boolean),
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

              {/* Ability scores */}
              <div>
                <Label>Vlastnosti (standardní pole {opts.standardArray.join(", ")})</Label>
                <div className="grid grid-cols-6 gap-1.5">
                  {opts.abilityOrder.map((k) => (
                    <div key={k} className="rounded-sm border border-surface1 bg-bg-mantle/50 px-1 py-1.5 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-subtext0">{csAbility(k)}</div>
                      <input
                        type="number"
                        min={3}
                        max={18}
                        value={abilities[k]}
                        onChange={(e) =>
                          setAbilities((a) => ({ ...a, [k]: Math.max(3, Math.min(18, Number(e.target.value) || 0)) }))
                        }
                        className="w-full bg-transparent text-center font-display text-base text-text outline-none"
                      />
                      <div className="font-log text-[10px] text-gold">
                        {finalAbilities[k]} ({fmt(mod(finalAbilities[k]))})
                      </div>
                    </div>
                  ))}
                </div>
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

              {/* Spells (casters) */}
              {cls && cls.caster !== "none" && (
                <div>
                  <Label>Počáteční kouzla (id oddělená čárkou, volitelné)</Label>
                  <input
                    className="settings-input bg-bg-crust text-text"
                    value={spells}
                    onChange={(e) => setSpells(e.target.value)}
                    placeholder="fire-bolt, cure-wounds"
                  />
                </div>
              )}

              {error && <p className="font-log text-sm text-blood">{error}</p>}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-black px-4 py-2.5">
          <button className="font-log text-sm text-subtext0 hover:text-gold" onClick={onClose}>
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
