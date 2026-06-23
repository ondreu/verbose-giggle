import { useEffect, useMemo, useState } from "react";
import { csAbility, csFeat, csSpellSchool, type Actor } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "./Icon";
import { FeatCard } from "./InfoCard";

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
interface FeatureInfo {
  id: string;
  name: string;
  description?: string;
}
interface SubclassInfo {
  id: string;
  name: string;
  flavor?: string;
  description?: string;
}
interface LevelUpOptions {
  spellList?: SpellOpt[];
  subclasses: SubclassInfo[];
  feats: { id: string; name: string }[];
  newFeatures: FeatureInfo[];
}

const mod = (n: number) => Math.floor((n - 10) / 2);

/**
 * BG3-style guided level-up (#44c): a sectioned modal with HP, optional ASI/
 * feat, optional subclass, and spells. Each section is visually distinct and
 * shows SRD descriptions for subclasses, feats, and new features.
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
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [spells, setSpells] = useState("");
  const [opts, setOpts] = useState<LevelUpOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const selectedSubclass = opts?.subclasses.find((s) => s.id === subclass);
  const newFeatures = opts?.newFeatures ?? [];

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
      {/* Header */}
      <div className="flex items-baseline gap-3">
        <span className="font-display text-2xl text-text">{actor.name}</span>
        <span className="font-log text-sm text-subtext0">
          úr. {actor.level} →{" "}
          <span className="font-display text-lg text-gold">{nextLevel}</span>
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">

        {/* ── HP ── */}
        <Section icon="heart" label="Životy" color="blood">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl text-gold">+{hpGain}</span>
            <span className="font-body text-sm text-subtext1">
              HP <span className="font-log text-xs text-subtext0">
                (průměr {actor.hit_dice?.type ?? "d8"} + {csAbility("con")} {mod(actor.abilities.con) >= 0 ? "+" : ""}{mod(actor.abilities.con)})
              </span>
            </span>
          </div>
        </Section>

        {/* ── New class features at this level ── */}
        {newFeatures.length > 0 && (
          <Section icon="scroll" label="Nové schopnosti" color="gold">
            <ul className="space-y-1.5">
              {newFeatures.map((f) => (
                <li key={f.id}>
                  <button
                    className="flex w-full items-start gap-2 text-left"
                    onClick={() => setExpandedFeature(expandedFeature === f.id ? null : f.id)}
                  >
                    <span className="mt-0.5 shrink-0 text-gold/60">
                      {expandedFeature === f.id ? "▾" : "▸"}
                    </span>
                    <span className="font-body text-sm text-text">{f.name}</span>
                  </button>
                  {expandedFeature === f.id && f.description && (
                    <p className="ml-4 mt-1 font-body text-[11px] leading-snug text-subtext1">
                      {f.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── Subclass (e.g. at level 3) ── */}
        {needsSubclass && (
          <Section icon="d20" label="Podtřída" color="arcane">
            <select
              className="settings-input bg-bg-crust text-text"
              value={subclass}
              onChange={(e) => setSubclass(e.target.value)}
            >
              <option value="">— vyber podtřídu —</option>
              {opts?.subclasses.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedSubclass && (
              <div className="mt-2 rounded-sm border border-arcane/20 bg-arcane/5 p-2">
                {selectedSubclass.flavor && (
                  <p className="mb-1 font-display text-xs text-arcane/80">{selectedSubclass.flavor}</p>
                )}
                {selectedSubclass.description && (
                  <p className="font-body text-[11px] leading-snug text-subtext1 line-clamp-5">
                    {selectedSubclass.description}
                  </p>
                )}
              </div>
            )}
          </Section>
        )}

        {/* ── ASI or feat ── */}
        {isAsi && (
          <Section icon="d20" label="Zvýšení vlastností nebo vlastnost" color="gold">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <ModeBtn label="+1 do dvou" active={asiMode === "two"} onClick={() => setAsiMode("two")} />
              <ModeBtn label="+2 do jedné" active={asiMode === "one"} onClick={() => setAsiMode("one")} />
              {(opts?.feats.length ?? 0) > 0 && (
                <ModeBtn label="Vlastnost (feat)" active={asiMode === "feat"} onClick={() => setAsiMode("feat")} />
              )}
            </div>
            {asiMode === "feat" ? (
              <>
                <select
                  className="settings-input bg-bg-crust text-text"
                  value={feat}
                  onChange={(e) => setFeat(e.target.value)}
                >
                  <option value="">— vyber vlastnost —</option>
                  {opts?.feats.map((f) => (
                    <option key={f.id} value={f.id}>{csFeat(f.id, f.name)}</option>
                  ))}
                </select>
                {feat && (
                  <div className="mt-1">
                    <FeatCard id={feat}>
                      <span className="cursor-pointer font-log text-[11px] text-gold/80 underline underline-offset-2 hover:text-gold">
                        detaily vlastnosti…
                      </span>
                    </FeatCard>
                  </div>
                )}
              </>
            ) : (
              <div className="flex gap-2">
                <AbilitySelect value={asiA} onChange={setAsiA} actor={actor} />
                {asiMode === "two" && <AbilitySelect value={asiB} onChange={setAsiB} actor={actor} />}
              </div>
            )}
          </Section>
        )}

        {/* ── Spells ── */}
        {isCaster && spellList && spellList.length > 0 && (
          <Section icon="flame" label={`Nová kouzla (${picked.length} zvoleno)`} color="arcane">
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
              {spellList.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSpell(s.id)}
                    title={s.school ? csSpellSchool(s.school) : undefined}
                    className={`rounded-sm border px-2 py-0.5 font-log text-[11px] transition-colors ${
                      on ? "border-arcane/60 bg-arcane/15 text-arcane" : "border-surface2 text-subtext1 hover:border-arcane/40 hover:text-subtext2"
                    }`}
                  >
                    {s.name}
                    <span className="ml-1 text-subtext0">{s.level === 0 ? "trik" : s.level}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}
        {isCaster && !spellList && (
          <Section icon="flame" label="Nová kouzla" color="arcane">
            <input
              className="settings-input bg-bg-crust text-text"
              value={spells}
              onChange={(e) => setSpells(e.target.value)}
              placeholder="magic-missile, shield"
            />
          </Section>
        )}

        {error && <p className="font-log text-sm text-blood">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-link text-sm" onClick={onClose}>
          Zrušit
        </button>
        <button
          className="btn-gold px-5 py-2 text-sm"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "…" : `Postoupit na úr. ${nextLevel}`}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="panel w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-surface1 px-4 py-2.5">
          <Icon name="scroll" size={16} className="text-gold" />
          <h2 className="font-display text-lg tracking-wide">Postup na úroveň</h2>
          <button className="ml-auto text-subtext0 hover:text-gold" onClick={onClose} aria-label="Zavřít">
            ✕
          </button>
        </header>
        <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function Section({
  icon, label, color, children,
}: {
  icon: string; label: string; color: "gold" | "blood" | "arcane"; children: React.ReactNode;
}) {
  const borderCls = color === "gold" ? "border-gold/30" : color === "blood" ? "border-blood/30" : "border-arcane/30";
  const bgCls = color === "gold" ? "bg-gold/5" : color === "blood" ? "bg-blood/5" : "bg-arcane/5";
  const textCls = color === "gold" ? "text-gold" : color === "blood" ? "text-blood" : "text-arcane";
  return (
    <div className={`rounded-sm border ${borderCls} ${bgCls} px-3 py-2.5`}>
      <div className={`mb-2 flex items-center gap-1.5 font-display text-xs uppercase tracking-widest ${textCls}`}>
        <Icon name={icon} size={12} />
        {label}
      </div>
      {children}
    </div>
  );
}

function ModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function AbilitySelect({ value, onChange, actor }: {
  value: Ability; onChange: (a: Ability) => void; actor: Actor;
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
