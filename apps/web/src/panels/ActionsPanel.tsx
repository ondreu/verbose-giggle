import { useEffect, useState } from "react";
import { csSkill } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { SpellCard } from "../components/InfoCard";
import { targetClause } from "./SheetPanel";

/** Minimal spell metadata the actions list needs: level (0 = cantrip) so trips
 *  and slotted spells can be split (#2), and range so the map can highlight the
 *  cells the spell can reach when picking a target (#4). */
interface SpellMeta {
  level: number;
  range_ft?: number;
}

/** Batch-fetch level + range for an actor's known spells (cached per id). */
const spellMetaCache: Record<string, SpellMeta> = {};
async function fetchSpellMeta(ids: string[]): Promise<Record<string, SpellMeta>> {
  const missing = ids.filter((id) => !(id in spellMetaCache));
  if (missing.length > 0) {
    try {
      const res = await fetch(`/api/srd/spells?ids=${encodeURIComponent(missing.join(","))}`);
      if (res.ok) {
        const data = (await res.json()) as Record<string, { level?: number; range_ft?: number }>;
        for (const id of missing) {
          const hit = data[id];
          // Unknown ids (dataset not mounted) default to level 1 so they list as
          // spells rather than being mis-sorted into cantrips.
          spellMetaCache[id] = { level: hit?.level ?? 1, range_ft: hit?.range_ft };
        }
      }
    } catch {
      /* best-effort; chips still render, just unsplit */
    }
  }
  return Object.fromEntries(ids.map((id) => [id, spellMetaCache[id] ?? { level: 1 }]));
}

/** Prettify an id ("fire-bolt" / "longsword") into a readable label. */
const pretty = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Armor/shields are equipped too but are not attacks (#43c). Exclude them so the
 *  "Útoky" list shows only weapons. SRD armor ids carry these tells. */
const ARMOR_RE = /(armor|shield|mail|plate|breastplate)/i;
const isWeaponId = (id: string) => !ARMOR_RE.test(id);

/** Universal D&D actions available to any creature on its turn (SRD §Combat). */
const STANDARD_ACTIONS: { label: string; icon: string; text: string }[] = [
  { label: "Sprint", icon: "footprints", text: "Použiju akci Sprint (Dash) a zdvojnásobím svůj pohyb." },
  { label: "Úhyb", icon: "shield", text: "Použiju akci Úhyb (Dodge) — útoky proti mně mají nevýhodu." },
  { label: "Odpoutání", icon: "footprints", text: "Použiju akci Odpoutání (Disengage), abych se vyhnul příležitostným útokům." },
  { label: "Pomoc", icon: "heart", text: "Použiju akci Pomoc (Help) a podpořím spojence." },
  { label: "Úkryt", icon: "compass", text: "Pokusím se ukrýt (akce Úkryt) — hod na Nenápadnost." },
  { label: "Pátrání", icon: "compass", text: "Použiju akci Pátrání (Search) a pozorně se rozhlédnu." },
];

interface Feature {
  name: string;
  desc?: string;
}

/**
 * All actions for the active character (#all-actions): standard combat actions,
 * weapon attacks from equipped gear, known spells, and any authored class/racial
 * features. Every button sends a natural-language action through the DM loop,
 * which resolves it deterministically via the engine.
 */
export function ActionsPanel() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendAction = useGame((s) => s.sendAction);
  const requestTarget = useGame((s) => s.requestTarget);
  const busy = useGame((s) => s.busy);

  const activeId = session?.active_player ?? null;
  const actor = activeId ? actors[activeId] : null;

  // Level/range for the known spells, so cantrips split off from slotted spells
  // (#2) and the map can show a spell's reach when targeting (#4).
  const [spellMeta, setSpellMeta] = useState<Record<string, SpellMeta>>({});
  const knownKey = actor?.spells_known.join(",") ?? "";
  useEffect(() => {
    const ids = knownKey ? knownKey.split(",") : [];
    if (ids.length === 0) return setSpellMeta({});
    let live = true;
    void fetchSpellMeta(ids).then((m) => {
      if (live) setSpellMeta(m);
    });
    return () => {
      live = false;
    };
  }, [knownKey]);

  if (!actor) {
    return (
      <section className="panel p-3">
        <header className="panel-title mb-2 pb-1">Akce</header>
        <p className="font-body text-sm italic text-subtext0">Žádná aktivní postava.</p>
      </section>
    );
  }

  const overlayHp = session?.actors[actor.id]?.hp?.current ?? actor.hp.current;
  const downed = overlayHp <= 0;
  const disabled = busy || downed;

  const equipped = actor.inventory.filter((i) => i.equipped && isWeaponId(i.id));
  // Authored class/racial abilities (optional passthrough frontmatter).
  const raw = (actor as unknown as { features?: unknown }).features;
  const features: Feature[] = Array.isArray(raw)
    ? raw.map((f) => (typeof f === "string" ? { name: f } : (f as Feature))).filter((f) => f?.name)
    : [];

  const act = (text: string) => {
    if (!disabled) void sendAction(text);
  };
  /** Ask the player for a target, then send the built action with it (#38).
   *  `range` (ft) makes the map highlight cells within reach from the caster (#4). */
  const aim = async (
    title: string,
    build: (clause: string) => string,
    allowNone = true,
    range?: number,
  ) => {
    if (disabled) return;
    const origin = session?.combat?.tokens?.[actor.id];
    const t = await requestTarget(title, allowNone, range != null ? { range, origin } : undefined);
    if (t === "cancelled") return;
    void sendAction(build(targetClause(t)));
  };

  // Split known spells into cantrips (level 0) and slotted spells (#2). Spells
  // whose metadata hasn't loaded yet fall in with the slotted list.
  const cantrips = actor.spells_known.filter((s) => spellMeta[s]?.level === 0);
  const leveled = actor.spells_known.filter((s) => spellMeta[s]?.level !== 0);

  return (
    <section className="panel flex flex-col">
      <header className="panel-title flex items-center gap-2 px-3 py-2">
        <Icon name="sword" size={14} />
        Akce — {actor.name}
      </header>
      <div className="flex flex-col gap-3 px-3 py-2.5">
        {/* Attacks — every attack needs a target, so pick one first. */}
        <Group label="Útoky" icon="sword">
          <Chip
            label="Útok zbraní"
            disabled={disabled}
            onClick={() => void aim("Cíl útoku", (c) => `Zaútočím vybranou zbraní${c}.`, false)}
          />
          {equipped.map((i) => (
            <Chip
              key={i.id}
              label={pretty(i.id)}
              disabled={disabled}
              onClick={() => void aim(`Cíl pro ${pretty(i.id)}`, (c) => `Zaútočím zbraní ${pretty(i.id)} (${i.id})${c}.`, false)}
            />
          ))}
          <Chip
            label="Beze zbraně"
            disabled={disabled}
            onClick={() => void aim("Cíl útoku beze zbraně", (c) => `Zaútočím beze zbraně (unarmed strike)${c}.`, false)}
          />
          <Chip
            label="Strčení"
            disabled={disabled}
            onClick={() => void aim("Cíl strčení", (c) => `Použiju speciální útok Strčení (Shove)${c} — pokus o sražení nebo odtlačení.`, false)}
          />
          <Chip
            label="Chvat"
            disabled={disabled}
            onClick={() => void aim("Cíl chvatu", (c) => `Pokusím se o Chvat (Grapple)${c}.`, false)}
          />
        </Group>

        {/* Standard actions */}
        <Group label="Obecné akce" icon="d20">
          {STANDARD_ACTIONS.map((a) => (
            <Chip key={a.label} label={a.label} disabled={disabled} onClick={() => act(a.text)} />
          ))}
        </Group>

        {/* Cantrips — split out from slotted spells with their own tone (#2). */}
        {cantrips.length > 0 && (
          <Group label="Triky (cantripy)" icon="flame">
            {cantrips.map((spell) => (
              <SpellCard key={spell} id={spell}>
                <Chip
                  label={pretty(spell)}
                  cantrip
                  disabled={disabled}
                  onClick={() =>
                    void aim(
                      `Cíl pro ${pretty(spell)}`,
                      (c) => `Sešlu trik ${pretty(spell)} (${spell})${c}.`,
                      true,
                      spellMeta[spell]?.range_ft,
                    )
                  }
                />
              </SpellCard>
            ))}
          </Group>
        )}

        {/* Slotted spells (#42a hover cards) */}
        {leveled.length > 0 && (
          <Group label="Kouzla" icon="flame">
            {leveled.map((spell) => (
              <SpellCard key={spell} id={spell}>
                <Chip
                  label={pretty(spell)}
                  accent
                  disabled={disabled}
                  onClick={() =>
                    void aim(
                      `Cíl pro ${pretty(spell)}`,
                      (c) => `Sešlu kouzlo ${pretty(spell)} (${spell})${c}.`,
                      true,
                      spellMeta[spell]?.range_ft,
                    )
                  }
                />
              </SpellCard>
            ))}
          </Group>
        )}

        {/* Authored class / racial features */}
        {features.length > 0 && (
          <Group label="Schopnosti" icon="shield">
            {features.map((f) => (
              <Chip
                key={f.name}
                label={f.name}
                disabled={disabled}
                title={f.desc}
                onClick={() => act(`Použiju schopnost ${f.name}.`)}
              />
            ))}
          </Group>
        )}

        {/* A couple of common ability checks for convenience */}
        <Group label="Zkoušky" icon="compass">
          {["perception", "insight", "persuasion"].map((sk) => (
            <Chip
              key={sk}
              label={csSkill(sk)}
              disabled={disabled}
              onClick={() => act(`Udělám zkoušku dovednosti ${csSkill(sk)}.`)}
            />
          ))}
        </Group>
      </div>
    </section>
  );
}

function Group({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 font-log text-[10px] uppercase tracking-wider text-subtext0">
        <Icon name={icon} size={11} />
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  label,
  onClick,
  disabled,
  accent,
  cantrip,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Slotted-spell tone (arcane). */
  accent?: boolean;
  /** Cantrip tone (ember) — visually distinct from slotted spells (#2). */
  cantrip?: boolean;
  title?: string;
}) {
  const tone = cantrip
    ? "border-ember/50 bg-ember/10 text-ember hover:bg-ember/20"
    : accent
      ? "border-arcane/50 bg-arcane/10 text-arcane hover:bg-arcane/20"
      : "border-surface2 bg-bg-mantle/40 text-subtext1 hover:border-gold/50 hover:text-gold";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-sm border px-2 py-1 font-body text-[13px] transition-colors disabled:opacity-40 ${tone}`}
    >
      {label}
    </button>
  );
}
