import { useState } from "react";
import { csSkill } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { TargetPicker, type PickedTarget } from "../components/TargetPicker";
import { targetClause } from "./SheetPanel";

/** Prettify an id ("fire-bolt" / "longsword") into a readable label. */
const pretty = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
  const busy = useGame((s) => s.busy);

  // A pending targeted action: chosen verb + how to weave the target into it.
  const [pending, setPending] = useState<
    { title: string; allowNone: boolean; build: (clause: string) => string } | null
  >(null);

  const activeId = session?.active_player ?? null;
  const actor = activeId ? actors[activeId] : null;

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

  const equipped = actor.inventory.filter((i) => i.equipped);
  // Authored class/racial abilities (optional passthrough frontmatter).
  const raw = (actor as unknown as { features?: unknown }).features;
  const features: Feature[] = Array.isArray(raw)
    ? raw.map((f) => (typeof f === "string" ? { name: f } : (f as Feature))).filter((f) => f?.name)
    : [];

  const act = (text: string) => {
    if (!disabled) void sendAction(text);
  };
  /** Open the target picker, then send the built action with the chosen target. */
  const aim = (title: string, build: (clause: string) => string, allowNone = true) => {
    if (!disabled) setPending({ title, allowNone, build });
  };

  return (
    <section className="panel flex flex-col">
      {pending && (
        <TargetPicker
          title={pending.title}
          allowNone={pending.allowNone}
          onClose={() => setPending(null)}
          onPick={(t: PickedTarget) => {
            void sendAction(pending.build(targetClause(t)));
            setPending(null);
          }}
        />
      )}
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
            onClick={() => aim("Cíl útoku", (c) => `Zaútočím vybranou zbraní${c}.`, false)}
          />
          {equipped.map((i) => (
            <Chip
              key={i.id}
              label={pretty(i.id)}
              disabled={disabled}
              onClick={() => aim(`Cíl pro ${pretty(i.id)}`, (c) => `Zaútočím zbraní ${pretty(i.id)} (${i.id})${c}.`, false)}
            />
          ))}
          <Chip
            label="Beze zbraně"
            disabled={disabled}
            onClick={() => aim("Cíl útoku beze zbraně", (c) => `Zaútočím beze zbraně (unarmed strike)${c}.`, false)}
          />
        </Group>

        {/* Standard actions */}
        <Group label="Obecné akce" icon="d20">
          {STANDARD_ACTIONS.map((a) => (
            <Chip key={a.label} label={a.label} disabled={disabled} onClick={() => act(a.text)} />
          ))}
        </Group>

        {/* Spells */}
        {actor.spells_known.length > 0 && (
          <Group label="Kouzla" icon="flame">
            {actor.spells_known.map((spell) => (
              <Chip
                key={spell}
                label={pretty(spell)}
                accent
                disabled={disabled}
                onClick={() => aim(`Cíl pro ${pretty(spell)}`, (c) => `Sešlu kouzlo ${pretty(spell)} (${spell})${c}.`)}
              />
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
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-sm border px-2 py-1 font-body text-[13px] transition-colors disabled:opacity-40 ${
        accent
          ? "border-arcane/50 bg-arcane/10 text-arcane hover:bg-arcane/20"
          : "border-surface2 bg-bg-mantle/40 text-subtext1 hover:border-gold/50 hover:text-gold"
      }`}
    >
      {label}
    </button>
  );
}
