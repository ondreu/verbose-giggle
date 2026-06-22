import { log, type GameState } from "./state.js";

export interface TimeAdvance {
  hours?: number;
  days?: number;
  /** Optional human-readable cause ("cesta do Velenu", "odpočinek"). */
  reason?: string;
}

/**
 * Advance the in-world clock by whole days/hours, rolling hours into days on a
 * 24-hour clock (#24). Logged so the passage of time is visible/auditable like
 * any other state change. A zero advance is a no-op (no log).
 */
export function advanceTime(state: GameState, args: TimeAdvance): { day: number; hour: number } {
  const addDays = Math.max(0, Math.floor(args.days ?? 0));
  const addHours = Math.max(0, Math.floor(args.hours ?? 0));
  const t = state.session.time;
  t.day += addDays;
  t.hour += addHours;
  while (t.hour >= 24) {
    t.hour -= 24;
    t.day += 1;
  }
  if (addDays > 0 || addHours > 0) {
    const parts: string[] = [];
    if (addDays) parts.push(`${addDays} d`);
    if (addHours) parts.push(`${addHours} h`);
    log(state, {
      kind: "time",
      detail: `Uplynulo ${parts.join(" ")}${args.reason ? ` — ${args.reason}` : ""} → den ${t.day}, ${String(t.hour).padStart(2, "0")}:00`,
      tool: "time_advance",
    });
  }
  return { day: t.day, hour: t.hour };
}
