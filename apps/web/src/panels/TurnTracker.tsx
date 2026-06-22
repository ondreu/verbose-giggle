import { useGame } from "../store/store";
import { Icon } from "../components/Icon";

const FACTION_DOT: Record<string, string> = {
  party: "bg-steel",
  ally: "bg-verdigris",
  hostile: "bg-blood",
  neutral: "bg-bone",
};

// Faction-coloured HP bar fills (CSS custom properties from the theme).
const FACTION_HP: Record<string, string> = {
  party: "var(--steel)",
  ally: "var(--verdigris)",
  hostile: "var(--blood)",
  neutral: "var(--bone)",
};

/** One action-economy slot: bright when available, dim+struck when spent. */
function Slot({ label, available }: { label: string; available: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-log text-[10px] uppercase tracking-wide ${
        available
          ? "border-gold/50 bg-gold/10 text-gold"
          : "border-surface2 text-subtext0/60 line-through"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${available ? "bg-gold" : "bg-surface2"}`}
      />
      {label}
    </span>
  );
}

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

      {/* Action economy for the actor on turn — what they still have left (#10). */}
      {combat.budget && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-black/40 bg-bg-mantle/50 px-3 py-1.5">
          <span className="mr-0.5 font-display text-[10px] uppercase tracking-wider text-subtext0">
            {actors[combat.order[combat.turn_index]?.actor ?? ""]?.name ?? "Na tahu"}:
          </span>
          <Slot label="Akce" available={combat.budget.action} />
          <Slot label="Bonus" available={combat.budget.bonus} />
          <Slot label="Reakce" available={combat.budget.reaction} />
          <span className="flex items-center gap-1 font-log text-[10px] text-subtext1">
            <Icon name="footprints" size={11} className="text-subtext0" />
            {combat.budget.movement} ft
          </span>
        </div>
      )}

      <ol className="px-2 py-2">
        {combat.order.map((o, i) => {
          const a = actors[o.actor];
          const active = i === combat.turn_index;
          const faction = a?.faction ?? "neutral";
          // Live HP comes from the session overlay; the sheet is the baseline.
          const hpCur = session?.actors[o.actor]?.hp?.current ?? a?.hp.current ?? 0;
          const hpMax = a?.hp.max ?? 0;
          const dead = hpCur <= 0;
          const hpPct = hpMax > 0 ? Math.max(0, Math.min(100, (hpCur / hpMax) * 100)) : 0;
          return (
            <li
              key={o.actor}
              className={`mb-1 rounded px-2 py-1.5 ${
                active ? "ring-active bg-surface0" : "opacity-70"
              } ${dead ? "opacity-40" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${FACTION_DOT[faction]}`} />
                <span
                  className={`font-display text-sm tracking-wide text-text ${dead ? "line-through" : ""}`}
                >
                  {a?.name ?? o.actor}
                </span>
                {a?.controller === "ai" && (
                  <span className="font-log text-[10px] uppercase tracking-wider text-arcane">
                    ai
                  </span>
                )}
                <span className="ml-auto font-log text-xs text-subtext0">{o.initiative}</span>
                {active && <Icon name="d20" size={13} className="text-arcane" />}
              </div>
              {hpMax > 0 && (
                <div className="mt-1 flex items-center gap-2 pl-[18px]">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface2/60">
                    <div
                      className="h-full transition-[width] duration-500"
                      style={{ width: `${hpPct}%`, background: FACTION_HP[faction] }}
                    />
                  </div>
                  <span className="font-log text-[10px] text-subtext0">
                    {Math.max(0, hpCur)}/{hpMax}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
