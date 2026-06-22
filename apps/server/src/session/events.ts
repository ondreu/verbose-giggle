import { EventEmitter } from "node:events";
import type { LogEntry, SessionState } from "@adm/schemas";

export type GameEvent =
  | { type: "narration"; text: string }
  | { type: "log"; entry: LogEntry }
  | { type: "state"; state: SessionState }
  | { type: "thinking"; tool: string }
  | { type: "actor_turn"; actor: string; name: string; controller: "human" | "ai" }
  | { type: "reload"; reason: string }
  | { type: "error"; message: string };

/** A tiny pub/sub bus the SSE route subscribes to (§13: SSE for push). */
export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit(event: GameEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: GameEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
