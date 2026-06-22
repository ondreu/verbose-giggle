import { useState } from "react";
import type { Actor } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "./Icon";

/** A chosen target: a known actor, free-text, or `null` for "no specific target". */
export type PickedTarget = { label: string; id?: string } | null;

const FACTION_DOT: Record<string, string> = {
  party: "bg-steel",
  ally: "bg-verdigris",
  hostile: "bg-blood",
  neutral: "bg-bone",
};

/**
 * Target chooser for actions that need a target (#38). Lists the actors in the
 * current scene — grouped into foes vs allies relative to the active character —
 * lets the player pick one, type an arbitrary target, or proceed with no
 * specific target (self / AoE). The caller turns the result into the action it
 * sends through the DM loop, so the engine still resolves and validates it.
 */
export function TargetPicker({
  title,
  allowNone = true,
  onPick,
  onClose,
}: {
  title: string;
  /** Show the "no specific target" option (self-buffs, AoE). */
  allowNone?: boolean;
  onPick: (target: PickedTarget) => void;
  onClose: () => void;
}) {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const [free, setFree] = useState("");

  const activeId = session?.active_player ?? null;
  const self = (activeId ? actors[activeId] : null) ?? null;
  const friendly = (f: string) => f === "party" || f === "ally";

  // Only living, on-scene actors are worth targeting; the active actor lands in
  // the "allies" group, flagged as self.
  const all = Object.values(actors).filter((a) => {
    const hp = session?.actors[a.id]?.hp?.current ?? a.hp.current;
    return hp > 0 || a.id === activeId;
  });
  const foes = all.filter((a) =>
    self && friendly(self.faction) ? a.faction === "hostile" : friendly(a.faction),
  );
  const allies = all.filter((a) => a.id === activeId || (a.id !== activeId && sameSide(self, a)));

  const choose = (a: Actor) => onPick({ label: a.name, id: a.id });

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-bg-crust/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="parchment flex max-h-[80vh] w-full max-w-sm flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-ink/20 pb-2">
          <Icon name="compass" size={16} className="text-ink" />
          <h2 className="font-display text-base">{title}</h2>
          <button className="ml-auto font-log text-sm text-ink/60 hover:text-ink" onClick={onClose}>
            zavřít ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto">
          {foes.length > 0 && (
            <Group label="Nepřátelé">
              {foes.map((a) => (
                <TargetRow key={a.id} actor={a} onClick={() => choose(a)} />
              ))}
            </Group>
          )}
          {allies.length > 0 && (
            <Group label="Spojenci">
              {allies.map((a) => (
                <TargetRow
                  key={a.id}
                  actor={a}
                  self={a.id === activeId}
                  onClick={() => choose(a)}
                />
              ))}
            </Group>
          )}

          {/* Free-text target for off-board / improvised targets. */}
          <div>
            <div className="mb-1 font-log text-[10px] uppercase tracking-wider text-ink/50">
              …nebo napiš cíl
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = free.trim();
                if (v) onPick({ label: v });
              }}
            >
              <input
                autoFocus
                value={free}
                onChange={(e) => setFree(e.target.value)}
                placeholder="např. velitel goblinů, dveře…"
                className="settings-input flex-1"
              />
              <button type="submit" className="btn-gold px-3 py-1 text-sm" disabled={!free.trim()}>
                Cíl
              </button>
            </form>
          </div>

          {allowNone && (
            <button
              className="rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20"
              onClick={() => onPick(null)}
            >
              Bez konkrétního cíle (sám / plošně)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Two actors are on the same side if both are friendly or both hostile. */
function sameSide(a: Actor | null, b: Actor): boolean {
  if (!a) return b.faction === "party" || b.faction === "ally";
  const fa = a.faction === "party" || a.faction === "ally";
  const fb = b.faction === "party" || b.faction === "ally";
  return fa === fb;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-log text-[10px] uppercase tracking-wider text-ink/50">{label}</div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function TargetRow({ actor, self, onClick }: { actor: Actor; self?: boolean; onClick: () => void }) {
  const session = useGame((s) => s.session);
  const hp = session?.actors[actor.id]?.hp?.current ?? actor.hp.current;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-sm border border-ink/20 bg-ink/5 px-2 py-1.5 text-left transition-colors hover:border-gold/60 hover:bg-ink/10"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${FACTION_DOT[actor.faction] ?? "bg-bone"}`} />
      <span className="font-body text-sm text-ink">
        {actor.name}
        {self && <span className="ml-1 font-log text-[10px] text-ink/50">(ty)</span>}
      </span>
      <span className="ml-auto font-log text-[11px] text-ink/55">
        {Math.max(0, hp)}/{actor.hp.max} HP
      </span>
    </button>
  );
}
