import { useState } from "react";
import type { Actor } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "./Icon";

const FACTION_DOT: Record<string, string> = {
  party: "bg-steel",
  ally: "bg-verdigris",
  hostile: "bg-blood",
  neutral: "bg-bone",
};

/**
 * Global target chooser for actions that need a target (#38). Driven by the
 * store's `targetRequest` so any caller can `await requestTarget(...)`. It is a
 * non-modal floating card (no blocking backdrop) so the player can ALSO click a
 * token on the tactical map to pick a target — the map resolves the same
 * request. Lists scene actors (foes vs allies/self), accepts free text, and —
 * when allowed — "no specific target" (self / AoE).
 */
export function TargetPicker() {
  const request = useGame((s) => s.targetRequest);
  const resolveTarget = useGame((s) => s.resolveTarget);
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const [free, setFree] = useState("");

  if (!request) return null;

  const activeId = session?.active_player ?? null;
  const self = (activeId ? actors[activeId] : null) ?? null;
  const friendly = (f: string) => f === "party" || f === "ally";

  const all = Object.values(actors).filter((a) => {
    const hp = session?.actors[a.id]?.hp?.current ?? a.hp.current;
    return hp > 0 || a.id === activeId;
  });
  const foes = all.filter((a) =>
    self && friendly(self.faction) ? a.faction === "hostile" : friendly(a.faction),
  );
  const allies = all.filter((a) => a.id === activeId || (a.id !== activeId && sameSide(self, a)));

  const pick = (t: { label: string; id?: string } | null) => {
    setFree("");
    resolveTarget(t);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[2100] w-full max-w-sm -translate-x-1/2 px-3">
      <div className="parchment flex max-h-[60vh] flex-col gap-3 rounded-md p-4 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink/20 pb-2">
          <Icon name="compass" size={15} className="text-ink" />
          <h2 className="font-display text-sm">{request.title}</h2>
          <button
            className="ml-auto font-log text-xs text-ink/60 hover:text-ink"
            onClick={() => resolveTarget("cancelled")}
          >
            zrušit ✕
          </button>
        </div>

        <p className="-mt-1 font-log text-[10px] text-ink/50">
          Vyber ze seznamu, napiš cíl, nebo klikni na postavu na bojišti.
        </p>

        <div className="flex flex-col gap-2 overflow-y-auto">
          {foes.length > 0 && (
            <Group label="Nepřátelé">
              {foes.map((a) => (
                <TargetRow key={a.id} actor={a} onClick={() => pick({ label: a.name, id: a.id })} />
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
                  onClick={() => pick({ label: a.name, id: a.id })}
                />
              ))}
            </Group>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = free.trim();
              if (v) pick({ label: v });
            }}
          >
            <input
              autoFocus
              value={free}
              onChange={(e) => setFree(e.target.value)}
              placeholder="…nebo napiš cíl (velitel goblinů, dveře…)"
              className="settings-input flex-1"
            />
            <button type="submit" className="btn-gold px-3 py-1 text-sm" disabled={!free.trim()}>
              Cíl
            </button>
          </form>

          {request.allowNone && (
            <button
              className="rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20"
              onClick={() => pick(null)}
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
