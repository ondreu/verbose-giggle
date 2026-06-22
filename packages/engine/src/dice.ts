import type { RNG } from "./rng.js";

export interface DieGroup {
  count: number;
  sides: number;
  /** Individual face results, in roll order. */
  results: number[];
}

export interface RollResult {
  expr: string;
  /** Each dice group rolled (e.g. the `2d6` in `2d6+3`). */
  groups: DieGroup[];
  /** Flat modifier (sum of constants). */
  modifier: number;
  total: number;
  /** Human-readable breakdown, e.g. "2d6 [4,5] +3 = 12". */
  detail: string;
}

interface Term {
  sign: 1 | -1;
  count?: number;
  sides?: number;
  constant?: number;
}

/** Parse a dice expression like "2d6+3", "1d20", "d8-1" into signed terms. */
export function parseDice(expr: string): Term[] {
  const cleaned = expr.replace(/\s+/g, "");
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i.test(cleaned)) {
    throw new Error(`Invalid dice expression: "${expr}"`);
  }
  const terms: Term[] = [];
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    if (m[3] !== undefined) {
      const sign = m[1] === "-" ? -1 : 1;
      const count = m[2] ? parseInt(m[2], 10) : 1;
      terms.push({ sign, count, sides: parseInt(m[3], 10) });
    } else if (m[5] !== undefined) {
      const sign = m[4] === "-" ? -1 : 1;
      terms.push({ sign, constant: parseInt(m[5], 10) });
    }
  }
  return terms;
}

/** Roll a full dice expression. */
export function roll(expr: string, rng: RNG): RollResult {
  const terms = parseDice(expr);
  const groups: DieGroup[] = [];
  let modifier = 0;
  let total = 0;
  const parts: string[] = [];

  for (const t of terms) {
    if (t.sides !== undefined && t.count !== undefined) {
      const results: number[] = [];
      let sum = 0;
      for (let i = 0; i < t.count; i++) {
        const r = rng.int(1, t.sides);
        results.push(r);
        sum += r;
      }
      groups.push({ count: t.count, sides: t.sides, results });
      total += t.sign * sum;
      parts.push(`${t.sign < 0 ? "-" : parts.length ? "+" : ""}${t.count}d${t.sides} [${results.join(",")}]`);
    } else if (t.constant !== undefined) {
      modifier += t.sign * t.constant;
      total += t.sign * t.constant;
      parts.push(`${t.sign < 0 ? "-" : "+"}${t.constant}`);
    }
  }

  return {
    expr,
    groups,
    modifier,
    total,
    detail: `${parts.join(" ").replace(/^\+/, "")} = ${total}`,
  };
}

export interface D20Result {
  /** The die face used after advantage/disadvantage resolution. */
  natural: number;
  /** Both faces when adv/disadv applied, else a single face. */
  rolls: number[];
  modifier: number;
  total: number;
  advantage: "advantage" | "disadvantage" | "none";
  detail: string;
}

/** Roll a d20 with an optional modifier and advantage/disadvantage. */
export function rollD20(
  rng: RNG,
  modifier = 0,
  advantage: "advantage" | "disadvantage" | "none" = "none",
): D20Result {
  const a = rng.int(1, 20);
  let natural = a;
  let rolls = [a];
  if (advantage !== "none") {
    const b = rng.int(1, 20);
    rolls = [a, b];
    natural = advantage === "advantage" ? Math.max(a, b) : Math.min(a, b);
  }
  const total = natural + modifier;
  const modStr = modifier === 0 ? "" : modifier > 0 ? ` +${modifier}` : ` ${modifier}`;
  const advStr =
    advantage === "none" ? "" : ` (${advantage === "advantage" ? "adv" : "dis"} [${rolls.join(",")}])`;
  return {
    natural,
    rolls,
    modifier,
    total,
    advantage,
    detail: `d20: ${natural}${advStr}${modStr} = ${total}`,
  };
}
