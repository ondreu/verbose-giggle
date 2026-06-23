import { describe, expect, it } from "vitest";
import { dispatch } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

const QUEST = {
  id: "mill-goblins",
  title: "Goblini z mlýna",
  giver: "starosta",
  objectives: [
    { id: "find-boss", text: "Najdi gobliního vůdce" },
    { id: "free-miller", text: "Osvoboď mlynáře" },
  ],
};

describe("quest tracking (#19)", () => {
  it("starts a quest, records it in session state, and logs it", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    const r = dispatch(state, "quest_start", QUEST);
    expect(r.ok).toBe(true);
    const q = state.session.quests["mill-goblins"];
    expect(q?.status).toBe("active");
    expect(q?.objectives.map((o) => o.id)).toEqual(["find-boss", "free-miller"]);
    expect(q?.objectives.every((o) => !o.done)).toBe(true);
    expect(state.session.log.some((l) => l.kind === "quest" && l.tool === "quest_start")).toBe(true);
  });

  it("refuses to re-start a quest already in progress", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    dispatch(state, "quest_start", QUEST);
    const r = dispatch(state, "quest_start", QUEST);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/už byl zahájen/i);
  });

  it("advances an objective and tracks remaining count", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    dispatch(state, "quest_start", QUEST);
    const r = dispatch(state, "quest_advance", { id: "mill-goblins", objective: "find-boss" });
    expect(r.ok).toBe(true);
    expect((r.result as { remaining: number }).remaining).toBe(1);
    const q = state.session.quests["mill-goblins"];
    expect(q?.objectives.find((o) => o.id === "find-boss")?.done).toBe(true);
    expect(q?.objectives.find((o) => o.id === "free-miller")?.done).toBe(false);
  });

  it("rejects advancing an unknown quest or objective", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    dispatch(state, "quest_start", QUEST);
    expect(dispatch(state, "quest_advance", { id: "nope", objective: "x" }).ok).toBe(false);
    expect(dispatch(state, "quest_advance", { id: "mill-goblins", objective: "nope" }).ok).toBe(false);
  });

  it("completes and fails a quest, and refuses to mutate a resolved quest", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    dispatch(state, "quest_start", QUEST);
    const done = dispatch(state, "quest_complete", { id: "mill-goblins" });
    expect(done.ok).toBe(true);
    expect(state.session.quests["mill-goblins"]?.status).toBe("completed");
    // A completed quest can't be advanced or completed again.
    expect(dispatch(state, "quest_advance", { id: "mill-goblins", objective: "free-miller" }).ok).toBe(false);
    expect(dispatch(state, "quest_complete", { id: "mill-goblins" }).ok).toBe(false);

    dispatch(state, "quest_start", { id: "lost", title: "Ztracená šance", objectives: [] });
    const failed = dispatch(state, "quest_fail", { id: "lost" });
    expect(failed.ok).toBe(true);
    expect(state.session.quests["lost"]?.status).toBe("failed");
  });
});
