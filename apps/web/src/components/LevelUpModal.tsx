import { useMemo, useState } from "react";
import { csAbility, type Actor } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "./Icon";

const ASI_LEVELS = [4, 8, 12, 16, 19];
const AVG_DIE: Record<string, number> = { d6: 4, d8: 5, d10: 6, d12: 7 };
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
type Ability = (typeof ABILITIES)[number];

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

  const [asiMode, setAsiMode] = useState<"two" | "one">("two");
  const [asiA, setAsiA] = useState<Ability>("str");
  const [asiB, setAsiB] = useState<Ability>("con");
  const [spells, setSpells] = useState("");
  const [error, setError] = useState<string | null>(null);

  const increments = useMemo<Record<string, number>>(() => {
    if (!isAsi) return {};
    if (asiMode === "one") return { [asiA]: 2 };
    if (asiA === asiB) return { [asiA]: 2 };
    return { [asiA]: 1, [asiB]: 1 };
  }, [isAsi, asiMode, asiA, asiB]);

  const submit = async () => {
    setError(null);
    const res = await levelUp(actor.id, {
      asi: isAsi ? increments : undefined,
      spells: spells.split(",").map((s) => s.trim()).filter(Boolean),
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
            +{hpGain} HP <span className="font-log text-xs text-subtext0">(průměr {actor.hit_dice?.type ?? "d8"} + ODL)</span>
          </span>
        </div>

        {/* ASI */}
        {isAsi && (
          <div className="rounded-sm border border-gold/30 bg-gold/5 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="d20" size={14} className="text-gold" />
              <span className="font-display text-sm tracking-wide text-gold">Zvýšení vlastností (+2)</span>
            </div>
            <div className="mb-2 flex gap-2">
              <Mode label="+1 / +1" active={asiMode === "two"} onClick={() => setAsiMode("two")} />
              <Mode label="+2 do jedné" active={asiMode === "one"} onClick={() => setAsiMode("one")} />
            </div>
            <div className="flex gap-2">
              <AbilitySelect value={asiA} onChange={setAsiA} actor={actor} />
              {asiMode === "two" && <AbilitySelect value={asiB} onChange={setAsiB} actor={actor} />}
            </div>
          </div>
        )}

        {/* Spells */}
        {isCaster && (
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

      <div className="mt-4 flex justify-end gap-2">
        <button className="font-log text-sm text-subtext0 hover:text-gold" onClick={onClose}>
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
