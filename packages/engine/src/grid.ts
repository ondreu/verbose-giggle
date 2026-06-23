import { csAoe, type Position } from "@adm/schemas";
import { movementBlocked } from "./conditions.js";
import { getActor, log, type GameState } from "./state.js";

export type DiagonalRule = "5-5-5" | "5-10-5";

/**
 * Distance in feet between two cells. 5-5-5: every step (incl. diagonal) is one
 * cell of movement (Chebyshev). 5-10-5: every second diagonal costs double.
 */
export function distanceFt(
  a: Position,
  b: Position,
  cellFt: number,
  rule: DiagonalRule = "5-5-5",
): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const diagonals = Math.min(dx, dy);
  const straights = Math.abs(dx - dy);
  if (rule === "5-5-5") {
    return (diagonals + straights) * cellFt;
  }
  // 5-10-5: every second diagonal costs double, i.e. each pair costs 3 cells.
  const diagCost = Math.floor(diagonals / 2) * 3 + (diagonals % 2);
  return (diagCost + straights) * cellFt;
}

export type GridShape = "square" | "hex";

// --- Hex grid (odd-r offset, pointy-top) -----------------------------------
// The stored (x,y) are offset coords; we convert to cube coords for distance.
function oddrToCube(x: number, y: number): { q: number; r: number; s: number } {
  const q = x - (y - (y & 1)) / 2;
  const r = y;
  return { q, r, s: -q - r };
}

/** Hex distance in feet (odd-r offset → cube). Each step is one cell. */
export function hexDistanceFt(a: Position, b: Position, cellFt: number): number {
  const ca = oddrToCube(a.x, a.y);
  const cb = oddrToCube(b.x, b.y);
  const steps = (Math.abs(ca.q - cb.q) + Math.abs(ca.r - cb.r) + Math.abs(ca.s - cb.s)) / 2;
  return steps * cellFt;
}

// The eight square-grid steps (orthogonal + diagonal).
const EIGHT_DIRS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

// Odd-r neighbour offsets, indexed by row parity (even rows / odd rows).
const ODDR_DIRS: [number, number][][] = [
  [[+1, 0], [0, -1], [-1, -1], [-1, 0], [-1, +1], [0, +1]], // even row
  [[+1, 0], [+1, -1], [0, -1], [-1, 0], [0, +1], [+1, +1]], // odd row
];

/** The six neighbouring cells of a hex (odd-r), before bounds checking. */
export function hexNeighbors(x: number, y: number): Position[] {
  const dirs = ODDR_DIRS[y & 1]!;
  return dirs.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

/** Distance between two cells honouring the grid topology (square or hex). */
export function gridDistanceFt(
  a: Position,
  b: Position,
  cellFt: number,
  shape: GridShape = "square",
  rule: DiagonalRule = "5-5-5",
): number {
  return shape === "hex" ? hexDistanceFt(a, b, cellFt) : distanceFt(a, b, cellFt, rule);
}

interface MoveCostMap {
  blocked: Set<string>; // walls + occupied
  difficult: Set<string>; // costs double
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** Candidate neighbour cells for BFS, per grid topology. */
function neighborCells(p: Position, hex: boolean): { x: number; y: number; diagonal: boolean }[] {
  if (hex) return hexNeighbors(p.x, p.y).map((n) => ({ x: n.x, y: n.y, diagonal: false }));
  return EIGHT_DIRS.map(([dx, dy]) => ({
    x: p.x + dx,
    y: p.y + dy,
    diagonal: dx !== 0 && dy !== 0,
  }));
}

function buildCostMap(state: GameState, mover: string): MoveCostMap {
  const blocked = new Set<string>();
  const difficult = new Set<string>();
  const c = state.session.combat;
  if (c) {
    for (const [id, pos] of Object.entries(c.tokens)) {
      if (id !== mover) blocked.add(key(pos.x, pos.y));
    }
    // Static encounter terrain (walls block; difficult/hazard cost double).
    for (const t of c.terrain) {
      if (t.kind === "wall") blocked.add(key(t.x, t.y));
      else if (t.kind === "difficult" || t.kind === "hazard") difficult.add(key(t.x, t.y));
    }
  }
  return { blocked, difficult };
}

export interface MoveResult {
  ok: boolean;
  path?: Position[];
  cost?: number;
  remaining?: number;
  error?: string;
}

/**
 * Validate and execute a move via Dijkstra/BFS over the grid, respecting walls,
 * occupied cells, difficult terrain, and the actor's remaining movement budget.
 */
export function move(state: GameState, args: { actor: string; to: Position }): MoveResult {
  const c = state.session.combat;
  if (!c) return { ok: false, error: "No active combat" };
  const actor = getActor(state, args.actor);
  const from = c.tokens[args.actor] ?? actor.position;
  if (!from) return { ok: false, error: "Actor has no position" };
  if (movementBlocked(actor)) {
    return { ok: false, error: "Actor cannot move (grappled/restrained/incapacitated)" };
  }

  const { w, h, cell_ft } = c.grid;
  if (args.to.x < 0 || args.to.y < 0 || args.to.x >= w || args.to.y >= h) {
    return { ok: false, error: "Destination off-grid" };
  }
  const { blocked, difficult } = buildCostMap(state, args.actor);
  if (blocked.has(key(args.to.x, args.to.y))) {
    return { ok: false, error: "Destination occupied or blocked" };
  }

  const budget = c.budget?.movement ?? actor.speed;
  const rule = state.variant.diagonals;
  const hex = c.grid.shape === "hex";

  // Dijkstra: cost in feet, neighbours per grid topology (8-dir square / 6 hex).
  const dist = new Map<string, number>();
  const prev = new Map<string, Position>();
  const start = key(from.x, from.y);
  dist.set(start, 0);
  const queue: { pos: Position; cost: number; diagParity: number }[] = [
    { pos: from, cost: 0, diagParity: 0 },
  ];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    if (cur.cost > (dist.get(key(cur.pos.x, cur.pos.y)) ?? Infinity)) continue;
    for (const cand of neighborCells(cur.pos, hex)) {
      const { x: nx, y: ny, diagonal } = cand;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = key(nx, ny);
      if (blocked.has(nk)) continue;
      let stepFt = cell_ft;
      if (!hex && diagonal && rule === "5-10-5") {
        stepFt = cur.diagParity % 2 === 1 ? cell_ft * 2 : cell_ft;
      }
      if (difficult.has(nk)) stepFt *= 2;
      const nextCost = cur.cost + stepFt;
      if (nextCost > budget) continue;
      if (nextCost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nextCost);
        prev.set(nk, cur.pos);
        queue.push({
          pos: { x: nx, y: ny },
          cost: nextCost,
          diagParity: cur.diagParity + (diagonal ? 1 : 0),
        });
      }
    }
  }

  const destKey = key(args.to.x, args.to.y);
  if (!dist.has(destKey)) {
    return { ok: false, error: "Destination unreachable within movement budget" };
  }
  // Reconstruct path.
  const path: Position[] = [];
  let step: Position | undefined = args.to;
  while (step) {
    path.unshift(step);
    step = prev.get(key(step.x, step.y));
  }
  const cost = dist.get(destKey)!;
  c.tokens[args.actor] = { x: args.to.x, y: args.to.y };
  actor.position = { x: args.to.x, y: args.to.y };
  if (c.budget) c.budget.movement = Math.max(0, c.budget.movement - cost);
  const remaining = c.budget?.movement ?? 0;

  log(state, {
    kind: "move",
    actor: args.actor,
    detail: `${actor.name} se přesouvá na (${args.to.x},${args.to.y}) — ${cost} ft, zbývá ${remaining} ft`,
    tool: "move",
    result: { cost, remaining },
  });
  return { ok: true, path, cost, remaining };
}

/**
 * All cells the actor can reach this turn within its remaining movement budget,
 * respecting walls, occupied cells, and difficult terrain. Used by the UI to
 * highlight legal destinations before a move (§10.2) — engine-computed, never
 * guessed by the model.
 */
export function reachableCells(
  state: GameState,
  args: { actor: string },
): { cells: Position[]; budget: number } {
  const c = state.session.combat;
  if (!c) return { cells: [], budget: 0 };
  const actor = getActor(state, args.actor);
  const from = c.tokens[args.actor] ?? actor.position;
  if (!from || movementBlocked(actor)) return { cells: [], budget: 0 };

  const { w, h, cell_ft } = c.grid;
  const { blocked, difficult } = buildCostMap(state, args.actor);
  const budget = c.budget?.movement ?? actor.speed;
  const rule = state.variant.diagonals;
  const hex = c.grid.shape === "hex";

  const dist = new Map<string, number>();
  dist.set(key(from.x, from.y), 0);
  const queue: { pos: Position; cost: number; diagParity: number }[] = [
    { pos: from, cost: 0, diagParity: 0 },
  ];
  const cells: Position[] = [];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    if (cur.cost > (dist.get(key(cur.pos.x, cur.pos.y)) ?? Infinity)) continue;
    for (const cand of neighborCells(cur.pos, hex)) {
      const { x: nx, y: ny, diagonal } = cand;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = key(nx, ny);
      if (blocked.has(nk)) continue;
      let stepFt = cell_ft;
      if (!hex && diagonal && rule === "5-10-5") stepFt = cur.diagParity % 2 === 1 ? cell_ft * 2 : cell_ft;
      if (difficult.has(nk)) stepFt *= 2;
      const nextCost = cur.cost + stepFt;
      if (nextCost > budget) continue;
      if (nextCost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nextCost);
        cells.push({ x: nx, y: ny });
        queue.push({ pos: { x: nx, y: ny }, cost: nextCost, diagParity: cur.diagParity + (diagonal ? 1 : 0) });
      }
    }
  }
  return { cells, budget };
}

/**
 * The best cell the actor can move to THIS turn to get within `reachFt` of
 * `target` (or, failing that, as close as possible). Returns null when no move
 * helps — already in reach, no grid, or surrounded. Deterministic geometry so
 * an AI actor can move→attack in one clean step instead of flailing out of
 * range. `reachFt` defaults to 5 ft (melee); an adjacent cell is in reach for
 * any creature with reach ≥ 5.
 */
export function approachStep(
  state: GameState,
  args: { actor: string; target: string; reachFt?: number },
): { to: Position; distFtAfter: number; inReach: boolean } | null {
  const c = state.session.combat;
  if (!c) return null;
  const actor = getActor(state, args.actor);
  const target = getActor(state, args.target);
  const from = c.tokens[args.actor] ?? actor.position;
  const tpos = c.tokens[args.target] ?? target.position;
  if (!from || !tpos) return null;
  const reachFt = args.reachFt ?? 5;
  const cellFt = c.grid.cell_ft;
  const shape = c.grid.shape ?? "square";
  const rule = state.variant.diagonals;
  const distTo = (p: Position) => gridDistanceFt(p, tpos, cellFt, shape, rule);
  const stepCost = (p: Position) => gridDistanceFt(from, p, cellFt, shape, rule);

  const curDist = distTo(from);
  if (curDist <= reachFt) return null; // already in reach — no move needed

  const { cells } = reachableCells(state, { actor: args.actor });
  let best: { to: Position; distFtAfter: number } | null = null;
  for (const cell of cells) {
    const d = distTo(cell);
    // Minimise distance to the target; tie-break by the cheapest move there.
    if (
      !best ||
      d < best.distFtAfter ||
      (d === best.distFtAfter && stepCost(cell) < stepCost(best.to))
    ) {
      best = { to: cell, distFtAfter: d };
    }
  }
  if (!best || best.distFtAfter >= curDist) return null; // can't get any closer
  return { to: best.to, distFtAfter: best.distFtAfter, inReach: best.distFtAfter <= reachFt };
}

/** Cells the straight line a→b passes through, excluding the endpoints. */
export function cellsOnLine(a: Position, b: Position): Position[] {
  let x0 = a.x;
  let y0 = a.y;
  const dx = Math.abs(b.x - x0);
  const dy = Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1;
  const sy = y0 < b.y ? 1 : -1;
  let err = dx - dy;
  const cells: Position[] = [];
  for (;;) {
    const atEnd = (x0 === a.x && y0 === a.y) || (x0 === b.x && y0 === b.y);
    if (!atEnd) cells.push({ x: x0, y: y0 });
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return cells;
}

export type Cover = "none" | "half" | "three-quarter" | "full";

const COVER_AC: Record<Cover, number> = { none: 0, half: 2, "three-quarter": 5, full: 99 };

/**
 * Cover and line-of-sight between two cells from the encounter's static
 * terrain (§8.1). A wall fully blocks (no line of sight / can't be targeted);
 * cover-three-quarter → +5 AC; cover-half → +2 AC. Engine-computed.
 */
export function coverBetween(
  state: GameState,
  from: Position,
  to: Position,
): { cover: Cover; acBonus: number; clearLineOfSight: boolean } {
  const terrain = state.session.combat?.terrain ?? [];
  const byKey = new Map(terrain.map((t) => [key(t.x, t.y), t.kind]));
  let best: Cover = "none";
  for (const cell of cellsOnLine(from, to)) {
    const kind = byKey.get(key(cell.x, cell.y));
    if (kind === "wall") {
      best = "full";
      break;
    }
    if (kind === "cover-three-quarter" && COVER_AC[best] < COVER_AC["three-quarter"]) {
      best = "three-quarter";
    } else if (kind === "cover-half" && COVER_AC[best] < COVER_AC.half) {
      best = "half";
    }
  }
  return {
    cover: best,
    acBonus: best === "full" ? 0 : COVER_AC[best],
    clearLineOfSight: best !== "full",
  };
}

export type AoeShape = "sphere" | "cube" | "cone" | "line";

export interface AoeResult {
  cells: Position[];
  tokens: string[];
}

/**
 * Compute cells covered by an area template and which tokens fall inside.
 * `size` is the radius/length/side in feet; geometry is grid-approximate but
 * deterministic — the engine answers, never the LLM (§10.2).
 */
export function aoe(
  state: GameState,
  args: { shape: AoeShape; origin: Position; size: number; direction?: Position },
): AoeResult {
  const c = state.session.combat;
  const cellFt = c?.grid.cell_ft ?? 5;
  const w = c?.grid.w ?? 30;
  const h = c?.grid.h ?? 30;
  const hex = c?.grid.shape === "hex";
  const radius = Math.round(args.size / cellFt);
  const cells: Position[] = [];

  const within = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  if (args.shape === "sphere" || args.shape === "cube") {
    for (let x = args.origin.x - radius - 1; x <= args.origin.x + radius + 1; x++) {
      for (let y = args.origin.y - radius; y <= args.origin.y + radius; y++) {
        if (!within(x, y)) continue;
        if (args.shape === "cube") {
          cells.push({ x, y });
        } else if (hex) {
          // True hex radius (in cells) for a circular burst.
          if (hexDistanceFt({ x, y }, args.origin, 1) <= radius) cells.push({ x, y });
        } else {
          const cheb = Math.max(Math.abs(x - args.origin.x), Math.abs(y - args.origin.y));
          if (cheb <= radius) cells.push({ x, y });
        }
      }
    }
  } else if (args.shape === "line" || args.shape === "cone") {
    const dir = args.direction ?? { x: 1, y: 0 };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / len;
    const uy = dir.y / len;
    for (let step = 1; step <= radius; step++) {
      const cx = Math.round(args.origin.x + ux * step);
      const cy = Math.round(args.origin.y + uy * step);
      const spread = args.shape === "cone" ? Math.ceil(step / 2) : 0;
      for (let s = -spread; s <= spread; s++) {
        // Spread perpendicular to direction.
        const px = Math.round(cx + -uy * s);
        const py = Math.round(cy + ux * s);
        if (within(px, py) && !cells.some((p) => p.x === px && p.y === py)) {
          cells.push({ x: px, y: py });
        }
      }
    }
  }

  const tokens: string[] = [];
  if (c) {
    for (const [id, pos] of Object.entries(c.tokens)) {
      if (cells.some((p) => p.x === pos.x && p.y === pos.y)) tokens.push(id);
    }
  }
  log(state, {
    kind: "aoe",
    detail: `${csAoe(args.shape)} (${args.size} ft) na (${args.origin.x},${args.origin.y}) zasahuje ${cells.length} polí a ${tokens.length} cílů`,
    tool: "aoe",
    result: { cells: cells.length, tokens },
  });
  return { cells, tokens };
}
