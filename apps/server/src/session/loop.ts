import { toolSpecs } from "@adm/engine";
import type { Llm, ChatMsg } from "../llm/client.js";
import { sceneSnapshot, SYSTEM_PROMPT } from "../llm/prompt.js";
import type { EventBus } from "./events.js";
import type { SessionManager } from "./manager.js";

const MAX_TOOL_ROUNDS = 8; // turn budget to avoid loops (§9.2)
const HISTORY_WINDOW = 20;

/**
 * The function-calling loop (§9.2): assemble context, let the LLM narrate and
 * request tools, execute tools deterministically in the engine, feed results
 * back, and repeat until the model produces final narration. All state changes
 * flow through the engine; the LLM never writes state directly.
 */
export async function runTurn(opts: {
  manager: SessionManager;
  llm: Llm;
  bus: EventBus;
  input: string;
}): Promise<{ narration: string }> {
  const { manager, llm, bus, input } = opts;
  const gs = manager.buildGameState();

  const recent = manager.session.chat.slice(-HISTORY_WINDOW).map(
    (m): ChatMsg => ({ role: m.role, content: m.content, name: m.name, tool_call_id: m.tool_call_id }),
  );

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors) },
    ...recent,
    { role: "user", content: input },
  ];
  manager.session.chat.push({ role: "user", content: input });

  const specs = toolSpecs();
  let narration = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await llm.chat(messages, specs);

    if (resp.toolCalls.length > 0) {
      // Record the assistant's tool-call message verbatim for the next round.
      messages.push({
        role: "assistant",
        content: resp.content,
        tool_calls: resp.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      const beforeLen = manager.session.log.length;
      for (const call of resp.toolCalls) {
        bus.emit({ type: "thinking", tool: call.name });
        const result = await manager.applyTool(gs, call.name, call.args);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify(result),
        });
      }
      // Stream any new dice-log entries to clients.
      for (const entry of manager.session.log.slice(beforeLen)) {
        bus.emit({ type: "log", entry });
      }
      continue;
    }

    narration = resp.content ?? "";
    break;
  }

  if (narration) {
    manager.session.chat.push({ role: "assistant", content: narration });
    bus.emit({ type: "narration", text: narration });
    await manager.log(`\n**DM:** ${narration}`);
  }

  await manager.checkpoint(gs);
  bus.emit({ type: "state", state: manager.session });
  return { narration };
}
