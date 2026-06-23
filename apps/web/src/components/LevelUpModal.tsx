import { useEffect, useMemo, useState } from "react";
import { csAbility, csFeat, csSpellSchool, type Actor } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "./Icon";

const ASI_LEVELS = [4, 8, 12, 16, 19];
const AVG_DIE: Record<string, number> = { d6: 4, d8: 5, d10: 6, d12: 7 };
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
type Ability = (typeof ABILITIES)[number];

interface SpellOpt {
  id: string;
  name: string;
  level: number;
  school?: string;
}
interface LevelUpOptions {
  spellList?: SpellOpt[];
  subclasses: { id: string; name: string; flavor?: string }[];
  feats: { id: string; name: string }[];
}

const mod = (n: number) => Math.floor((n - 10) / 2);

/**
 * Level-up GUI (#13): surfaces the choices a level grants — HP (fixed average),
 * an Ability Score Improvement at ASI levels, and new spells for casters — then
 * applies them deterministically through the engine via POST /api/level-up.
 */
export function LevelUpModal({ actor, onClose }: { actor: Actor; onClose: () => void }) {
  const levelUp = useGame((s) => s.levelUp);
  const busy = useGame((s) => s.busy);

  const nextLevel = actor.level + 1;
  const isAsi = ASI_LEVELS.includes(nextLevel);
  const isCaster = Object.keys(actor.spell_slots).length > 0 || actor.spells_known.length > 0;
  const hpGain = Math.max(1, (AVG_DIE[actor.hit_dice?.type ?? "d8"] ?? 5) + mod(actor.abilities.con));

  const [asiMode, setAsiMode] = useState<"two" | "one" | "feat">("two");
  const [asiA, setAsiA] = useState<Ability>("str");
  const [asiB, setAsiB] = useState<Ability>("con");
  const [feat, setFeat] = useState("");
  const [subclass, setSubclass] = useState("");
  const [picked, setPicked] = useState<string[]>([]); // SRD spell picks
  const [spells, setSpells] = useState(""); // free-text fallback
  const [opts, setOpts] = useState<LevelUpOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch the SRD-derived options the next level grants.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/level-up/options?actor=${encodeURIComponent(actor.id)}`);
        if (res.ok) setOpts(await res.json());
      } catch {
        /* fall back to the free-text spell field */
      }
    })();
  }, [actor.id]);

  const needsSubclass = (opts?.subclasses.length ?? 0) > 0;
  const spellList = opts?.spellList;

  const increments = useMemo<Record<string, number>>(() => {
    if (!isAsi || asiMode === "feat") return {};
    if (asiMode === "one") return { [asiA]: 2 };
    if (asiA === asiB) return { [asiA]: 2 };
    return { [asiA]: 1, [asiB]: 1 };
  }, [isAsi, asiMode, asiA, asiB]);

  const toggleSpell = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = async () => {
    setError(null);
    if (needsSubclass && !subclass) {
      setError("Vyber podtřídu.");
      return;
    }
    const chosenSpells = spellList ? picked : spells.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await levelUp(actor.id, {
      asi: isAsi && asiMode !== "feat" ? increments : undefined,
      feats: isAsi && asiMode === "feat" && feat ? [feat] : undefined,
      subclass: subclass || undefined,
      spells: chosenSpells,
    });
    if (!res.ok) {
      setError(res.error ?? "Postup na úroveň selhal");
      return;
    }
    onClose();
  };

  if (actor.level >= 20) {
    return (
      <Shell onClose={onClose}>
        <p className="font-body italic text-subtext1">{actor.name} už dosáhl 20. úrovně — výš to nejde.</p>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose}>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl text-text">{actor.name}</span>
        <span className="font-log text-sm text-subtext0">
          úr. {actor.level} → <span className="text-gold">{nextLevel}</span>
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {/* HP */}
        <div className="flex items-center gap-2 rounded-sm border border-surface1 bg-bg-mantle/40 px-3 py-2">
          <Icon name="heart" size={15} className="text-blood" />
          <span className="font-body text-text">
            +{hpGain} HP <span className="font-log text-xs text-subtext0">(průměr {actor.hit_dice?.type ?? "d8"} + {csAbility("con")})</span>
          </span>
        </div>

        {/* Subclass selection (e.g. at level 3) */}
        {needsSubclass && (
          <div className="rounded-sm border border-gold/30 bg-gold/5 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="scroll" size={14} className="text-gold" />
              <span className="font-display text-sm tracking-wide text-gold">Podtřída</span>
            </div>
            <select
              className="settings-input bg-bg-crust text-text"
              value={subclass}
              onChange={(e) => setSubclass(e.target.value)}
            >
              <option value="">— vyber podtřídu —</option>
              {opts?.subclasses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ASI or feat */}
        {isAsi && (
          <div className="rounded-sm border border-gold/30 bg-gold/5 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="d20" size={14} className="text-gold" />
              <span className="font-display text-sm tracking-wide text-gold">Zvýšení vlastností nebo vlastnost</span>
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Mode label="+1 / +1" active={asiMode === "two"} onClick={() => setAsiMode("two")} />
              <Mode label="+2 do jedné" active={asiMode === "one"} onClick={() => setAsiMode("one")} />
              {(opts?.feats.length ?? 0) > 0 && (
                <Mode label="vlastnost (feat)" active={asiMode === "feat"} onClick={() => setAsiMode("feat")} />
              )}
            </div>
            {asiMode === "feat" ? (
              <select
                className="settings-input bg-bg-crust text-text"
                value={feat}
                onChange={(e) => setFeat(e.target.value)}
              >
                <option value="">— vyber vlastnost —</option>
                {opts?.feats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {csFeat(f.id, f.name)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex gap-2">
                <AbilitySelect value={asiA} onChange={setAsiA} actor={actor} />
                {asiMode === "two" && <AbilitySelect value={asiB} onChange={setAsiB} actor={actor} />}
              </div>
            )}
          </div>
        )}

        {/* Spells — SRD picker when a class list is mounted, else free text. */}
        {isCaster && spellList && spellList.length > 0 && (
          <div>
            <label className="mb-1 block font-log text-[11px] uppercase tracking-wider text-subtext0">
              Nová kouzla ({picked.length} zvoleno)
            </label>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {spellList.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSpell(s.id)}
                    title={s.school ? csSpellSchool(s.school) : undefined}
                    className={`rounded-sm border px-2 py-0.5 font-log text-[11px] ${
                      on ? "border-gold/60 bg-gold/10 text-gold" : "border-surface2 text-subtext1 hover:border-gold/40"
                    }`}
                  >
                    {s.name}
                    <span className="ml-1 text-subtext0">{s.level === 0 ? "trik" : s.level}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {isCaster && !spellList && (
          <div>
            <label className="mb-1 block font-log text-[11px] uppercase tracking-wider text-subtext0">
              Nová kouzla (id oddělená čárkou, volitelné)
            </label>
            <input
              className="settings-input bg-bg-crust text-text"
              value={spells}
              onChange={(e) => setSpells(e.target.value)}
              placeholder="magic-missile, shield"
            />
          </div>
        )}

        {error && <p className="font-log text-sm text-blood">{error}</p>}
      </div>

      <div className="mt-4 flex justify-end gap-3">
        <button className="btn-link text-sm" onClick={onClose}>
          Zrušit
        </button>
        <button className="btn-gold px-5 py-2 text-sm" disabled={busy} onClick={() => void submit()}>
          {busy ? "…" : `Postoupit na úr. ${nextLevel}`}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="panel w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <header className="mb-2 flex items-center gap-2">
          <Icon name="scroll" size={16} className="text-gold" />
          <h2 className="font-display text-lg tracking-wide">Postup na úroveň</h2>
          <button className="ml-auto text-subtext0 hover:text-gold" onClick={onClose} aria-label="Zavřít">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function Mode({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-2 py-0.5 font-log text-[11px] ${
        active ? "border-gold/60 bg-gold/10 text-gold" : "border-surface2 text-subtext1 hover:border-gold/40"
      }`}
    >
      {label}
    </button>
  );
}

function AbilitySelect({
  value,
  onChange,
  actor,
}: {
  value: Ability;
  onChange: (a: Ability) => void;
  actor: Actor;
}) {
  return (
    <select
      className="settings-input flex-1 bg-bg-crust text-text"
      value={value}
      onChange={(e) => onChange(e.target.value as Ability)}
    >
      {ABILITIES.map((a) => (
        <option key={a} value={a}>
          {csAbility(a)} ({actor.abilities[a]})
        </option>
      ))}
    </select>
  );
}
