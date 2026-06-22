import { useEffect, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";

const AOE_SHAPES = [
  { shape: "sphere", label: "Koule", icon: "flame", needsDir: false },
  { shape: "cube", label: "Krychle", icon: "skull", needsDir: false },
  { shape: "cone", label: "Kužel", icon: "flame", needsDir: true },
  { shape: "line", label: "Čára", icon: "sword", needsDir: true },
] as const;

const CELL = 44;

const FACTION_FILL: Record<string, string> = {
  party: "var(--steel)",
  ally: "var(--verdigris)",
  hostile: "var(--blood)",
  neutral: "var(--bone)",
};

export function TacticalGrid({ embedded = false }: { embedded?: boolean }) {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const locations = useGame((s) => s.locations);
  const sendCommand = useGame((s) => s.sendCommand);
  const reachable = useGame((s) => s.reachable);
  const fetchReachable = useGame((s) => s.fetchReachable);
  const aoeCells = useGame((s) => s.aoeCells);
  const castAoe = useGame((s) => s.castAoe);
  const clearAoe = useGame((s) => s.clearAoe);

  const [aoeShape, setAoeShape] = useState<string | null>(null);
  const [aoeSize, setAoeSize] = useState(15);
  const [aoeOrigin, setAoeOrigin] = useState<{ x: number; y: number } | null>(null);
  const combat = session?.combat;
  const activeForFetch = combat?.order[combat.turn_index]?.actor ?? null;
  const tokenKey = combat ? JSON.stringify(combat.tokens) : "";

  // Recompute reachable cells (engine-authoritative) whenever the active actor,
  // round, or token layout changes.
  useEffect(() => {
    if (combat && activeForFetch) void fetchReachable(activeForFetch);
  }, [combat ? 1 : 0, activeForFetch, combat?.round, tokenKey, fetchReachable]);

  if (!combat) {
    const loc = session ? locations[session.current_location] : null;
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Icon name="compass" size={40} className="mb-3 text-gold/70" />
        <h3 className="font-display text-lg">{loc?.name ?? session?.current_location ?? "Neznámo"}</h3>
        <p className="mt-2 max-w-md font-body italic text-subtext1">
          Divadlo mysli. Mimo boj se bojiště nezobrazuje — přepni na Kraj pro
          přehledovou mapu, nebo začni souboj.
        </p>
      </div>
    );
  }

  const { w, h } = combat.grid;
  const activeId = combat.order[combat.turn_index]?.actor;

  const handleCell = (x: number, y: number) => {
    if (aoeShape) {
      const def = AOE_SHAPES.find((s) => s.shape === aoeShape)!;
      if (def.needsDir) {
        if (!aoeOrigin) {
          setAoeOrigin({ x, y });
          return;
        }
        void castAoe({
          shape: aoeShape,
          origin: aoeOrigin,
          size: aoeSize,
          direction: { x: x - aoeOrigin.x, y: y - aoeOrigin.y },
        });
        setAoeOrigin(null);
      } else {
        void castAoe({ shape: aoeShape, origin: { x, y }, size: aoeSize });
      }
      return;
    }
    if (activeId) void sendCommand("move", { actor: activeId, to: { x, y } });
  };

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-black/50 px-3 py-1.5">
        <span className="font-log text-[10px] uppercase tracking-wider text-subtext0">Plocha:</span>
        {AOE_SHAPES.map((s) => (
          <button
            key={s.shape}
            onClick={() => {
              setAoeShape(aoeShape === s.shape ? null : s.shape);
              setAoeOrigin(null);
              clearAoe();
            }}
            className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-log text-[10px] ${
              aoeShape === s.shape ? "border-ember text-ember" : "border-surface2 text-subtext0 hover:text-subtext1"
            }`}
          >
            <Icon name={s.icon} size={11} />
            {s.label}
          </button>
        ))}
        <select
          value={aoeSize}
          onChange={(e) => setAoeSize(Number(e.target.value))}
          className="rounded-sm border border-surface2 bg-bg-crust px-1 py-0.5 font-log text-[10px] text-subtext1"
        >
          {[5, 10, 15, 20, 30, 60].map((ft) => (
            <option key={ft} value={ft}>
              {ft} ft
            </option>
          ))}
        </select>
        {aoeShape && (
          <span className="font-log text-[10px] text-ember">
            {AOE_SHAPES.find((s) => s.shape === aoeShape)?.needsDir && !aoeOrigin
              ? "klikni počátek"
              : AOE_SHAPES.find((s) => s.shape === aoeShape)?.needsDir
                ? "klikni směr"
                : "klikni střed"}
          </span>
        )}
        {(aoeShape || aoeCells.length > 0) && (
          <button
            onClick={() => {
              setAoeShape(null);
              setAoeOrigin(null);
              clearAoe();
            }}
            className="ml-auto font-log text-[10px] text-subtext0 hover:text-gold"
          >
            zrušit
          </button>
        )}
      </div>
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

          {/* Reachable cells for the active actor (engine-computed) */}
          {reachable.map((c) => (
            <rect
              key={`r${c.x}-${c.y}`}
              x={c.x * CELL + 2}
              y={c.y * CELL + 2}
              width={CELL - 4}
              height={CELL - 4}
              fill="var(--arcane)"
              opacity={0.12}
              rx={2}
              pointerEvents="none"
            />
          ))}

          {/* AoE coverage (engine-computed) */}
          {aoeCells.map((c) => (
            <rect
              key={`aoe${c.x}-${c.y}`}
              x={c.x * CELL}
              y={c.y * CELL}
              width={CELL}
              height={CELL}
              fill="var(--ember)"
              opacity={0.22}
              pointerEvents="none"
            />
          ))}

          {/* Clickable cells → move the active actor or place an AoE */}
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
                onClick={() => handleCell(x, y)}
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
    </div>
  );

  if (embedded) return body;
  return (
    <section className="panel flex h-full flex-col">
      <header className="panel-title flex items-center gap-2 px-3 py-2">
        <Icon name="skull" size={14} />
        Bojiště · {combat.grid.cell_ft} ft / pole
      </header>
      {body}
    </section>
  );
}
