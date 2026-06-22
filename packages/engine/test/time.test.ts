import { describe, expect, it } from "vitest";
import { advanceTime, dispatch } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("advanceTime (#24)", () => {
  it("adds hours and rolls them into days on a 24h clock", () => {
    const state = makeState([makeActor({ id: "h", name: "H" })]);
    state.session.time = { day: 1, hour: 20 };
    const t = advanceTime(state, { hours: 8, reason: "cesta" });
    expect(t).toEqual({ day: 2, hour: 4 });
    expect(state.session.log.some((l) => l.kind === "time")).toBe(true);
  });

  it("adds whole days and hours together", () => {
    const state = makeState([makeActor({ id: "h", name: "H" })]);
    state.session.time = { day: 3, hour: 6 };
    expect(advanceTime(state, { days: 2, hours: 30 })).toEqual({ day: 6, hour: 12 });
  });

  it("a zero advance is a no-op and logs nothing", () => {
    const state = makeState([makeActor({ id: "h", name: "H" })]);
    advanceTime(state, {});
    expect(state.session.log.length).toBe(0);
    expect(state.session.time).toEqual({ day: 1, hour: 8 });
  });

  it("the travel tool advances the clock by the journey duration", () => {
    const state = makeState([makeActor({ id: "h", name: "H" })]);
    state.session.time = { day: 1, hour: 8 };
    const r = dispatch(state, "travel", { to: "velen", days: 1, hours: 2 });
    expect(r.ok).toBe(true);
    expect(state.session.current_location).toBe("velen");
    expect(state.session.time).toEqual({ day: 2, hour: 10 });
  });
});
