import { useGame } from "../store/store";
import { Icon } from "../components/Icon";

const FACTION_DOT: Record<string, string> = {
  party: "bg-steel",
  ally: "bg-verdigris",
  hostile: "bg-blood",
  neutral: "bg-bone",
};

export function TurnTracker() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendCommand = useGame((s) => s.sendCommand);
  const combat = session?.combat;

  if (!combat) {
    return (
      <section className="panel p-3">
        <header className="panel-title mb-2 pb-1">Pořadí na tahu</header>
        <p className="font-body text-sm italic text-subtext0">Mimo boj.</p>
      </section>
    );
  }

  return (
    <section className="panel flex flex-col">
      <header className="panel-title flex items-center justify-between px-3 py-2">
        <span>Iniciativa · kolo {combat.round}</span>
        <button
          className="btn-gold px-2 py-0.5 text-[11px]"
          onClick={() => void sendCommand("next_turn", {})}
        >
          Další tah
        </button>
      </header>
      <ol className="px-2 py-2">
        {combat.order.map((o, i) => {
          const a = actors[o.actor];
          const active = i === combat.turn_index;
          const dead = (a?.hp.current ?? 1) <= 0;
          return (
            <li
              key={o.actor}
              className={`mb-1 flex items-center gap-2 rounded px-2 py-1.5 ${
                active ? "ring-active bg-surface0" : "opacity-70"
              } ${dead ? "line-through opacity-40" : ""}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${FACTION_DOT[a?.faction ?? "neutral"]}`}
              />
              <span className="font-display text-sm tracking-wide text-text">
                {a?.name ?? o.actor}
              </span>
              {a?.controller === "ai" && (
                <span className="font-log text-[10px] uppercase tracking-wider text-arcane">
                  ai
                </span>
              )}
              <span className="ml-auto font-log text-xs text-subtext0">{o.initiative}</span>
              {active && <Icon name="d20" size={13} className="text-arcane" />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
