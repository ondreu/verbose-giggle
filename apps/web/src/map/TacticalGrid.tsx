import { useGame } from "../store/store";
import { Icon } from "../components/Icon";

const CELL = 44;

const FACTION_FILL: Record<string, string> = {
  party: "var(--steel)",
  ally: "var(--verdigris)",
  hostile: "var(--blood)",
  neutral: "var(--bone)",
};

export function TacticalGrid() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const locations = useGame((s) => s.locations);
  const sendCommand = useGame((s) => s.sendCommand);
  const combat = session?.combat;

  if (!combat) {
    const loc = session ? locations[session.current_location] : null;
    return (
      <section className="panel flex h-full flex-col items-center justify-center p-8 text-center">
        <Icon name="compass" size={40} className="mb-3 text-gold/70" />
        <h3 className="font-display text-lg">{loc?.name ?? session?.current_location ?? "Neznámo"}</h3>
        <p className="mt-2 max-w-md font-body italic text-subtext1">
          Divadlo mysli. Mapa se rozsvítí, jakmile začne boj nebo se rozvine
          přehledová mapa kraje.
        </p>
      </section>
    );
  }

  const { w, h } = combat.grid;
  const activeId = combat.order[combat.turn_index]?.actor;

  return (
    <section className="panel flex h-full flex-col">
      <header className="panel-title flex items-center gap-2 px-3 py-2">
        <Icon name="skull" size={14} />
        Bojiště · {combat.grid.cell_ft} ft / pole
      </header>
      <div className="flex-1 overflow-auto p-4">
        <svg
          width={w * CELL}
          height={h * CELL}
          className="mx-auto block"
          style={{ background: "var(--bg-crust)" }}
        >
          {/* Grid lines */}
          {Array.from({ length: w + 1 }).map((_, x) => (
            <line
              key={`v${x}`}
              x1={x * CELL}
              y1={0}
              x2={x * CELL}
              y2={h * CELL}
              stroke="rgba(216,205,180,0.08)"
            />
          ))}
          {Array.from({ length: h + 1 }).map((_, y) => (
            <line
              key={`hl${y}`}
              x1={0}
              y1={y * CELL}
              x2={w * CELL}
              y2={y * CELL}
              stroke="rgba(216,205,180,0.08)"
            />
          ))}

          {/* Clickable cells → move the active actor */}
          {Array.from({ length: h }).map((_, y) =>
            Array.from({ length: w }).map((_, x) => (
              <rect
                key={`c${x}-${y}`}
                x={x * CELL}
                y={y * CELL}
                width={CELL}
                height={CELL}
                fill="transparent"
                className="cursor-pointer hover:fill-[rgba(201,162,39,0.08)]"
                onClick={() =>
                  activeId && void sendCommand("move", { actor: activeId, to: { x, y } })
                }
              />
            )),
          )}

          {/* Tokens */}
          {Object.entries(combat.tokens).map(([id, pos]) => {
            const a = actors[id];
            const active = id === activeId;
            const cx = pos.x * CELL + CELL / 2;
            const cy = pos.y * CELL + CELL / 2;
            const dead = (a?.hp.current ?? 1) <= 0;
            return (
              <g key={id} opacity={dead ? 0.35 : 1}>
                {active && (
                  <circle cx={cx} cy={cy} r={CELL / 2 - 2} fill="none" stroke="var(--arcane)" strokeWidth={2} />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={CELL / 2 - 6}
                  fill={FACTION_FILL[a?.faction ?? "neutral"]}
                  stroke="var(--bg-crust)"
                  strokeWidth={2}
                />
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fontFamily="Cinzel, serif"
                  fontSize={13}
                  fill="var(--bg-crust)"
                >
                  {(a?.name ?? id).slice(0, 2).toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
