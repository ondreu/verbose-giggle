import type { ChatMsg, Llm, LlmResponse, ToolSpec } from "./client.js";

/** Minimal scene facts the mock needs to choose plausible tool calls. */
export interface MockContext {
  activePlayer: string | null;
  partyIds: string[];
  hostileIds: string[];
  inCombat: boolean;
  /** First alive opposing-faction actor for the given actor, or null. */
  enemyOf: (actorId: string) => string | null;
}

/**
 * Offline narrator for running the full turn loop WITHOUT an LLM API key
 * (dev/demo/CI). It is intentionally simple: it reads the latest player input,
 * picks ONE appropriate engine tool by keyword, and on the follow-up round
 * narrates the engine's true result in Czech. The determinism guarantee is
 * unchanged — every number still comes from the real engine via dispatch; the
 * mock only decides *which* mechanic to call and how to describe the outcome.
 */
export class MockLlmClient implements Llm {
  constructor(private ctx: () => MockContext) {}

  async chat(messages: ChatMsg[], _tools: ToolSpec[]): Promise<LlmResponse> {
    const last = messages[messages.length - 1];

    // Second pass: tool results are in context → narrate them, no more tools.
    if (last?.role === "tool") {
      return { content: narrateResults(messages), toolCalls: [] };
    }

    const userMsg =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const text = userMsg.toLowerCase();
    const { activePlayer, partyIds, hostileIds, inCombat, enemyOf } = this.ctx();
    const mk = (name: string, args: unknown): LlmResponse => ({
      content: null,
      toolCalls: [{ id: `mock-${Date.now()}`, name, args }],
    });

    // Recap request (§6.6): summarize from the embedded context deterministically.
    if (text.includes("[recap]")) {
      const events = userMsg
        .split("\n")
        .filter((l) => l.trim().startsWith("- "))
        .slice(0, 3)
        .map((l) => l.replace(/^[-\s]+/, ""));
      const body = events.length
        ? events.join(" ")
        : "Družina se vydala na cestu a osud dosud mlčel.";
      return { content: `V minulém díle: ${body}`, toolCalls: [] };
    }

    // AI-controlled actor's turn (§8.3): attack the nearest enemy, else idle.
    if (text.includes("[ai-tah]") && activePlayer) {
      const target = enemyOf(activePlayer);
      if (target) return mk("attack", { attacker: activePlayer, target });
      return { content: "[mock DM] Postava vyčkává a kryje se.", toolCalls: [] };
    }

    if (/\b(boj|combat|iniciativ|fight|útok začín|napad)/.test(text) && !inCombat) {
      const participants = [...partyIds, ...hostileIds];
      if (participants.length > 0) return mk("start_combat", { participants });
    }
    if (/(út[oč]|attack|sek|udeř|bod[an]|máv|zaút)/.test(text) && activePlayer && hostileIds[0]) {
      return mk("attack", { attacker: activePlayer, target: hostileIds[0] });
    }
    if (/(hod|roll|kostk)/.test(text)) {
      const m = text.match(/\d*d\d+([+-]\d+)?/);
      return mk("roll", { expr: m?.[0] ?? "1d20" });
    }
    if (/(prohledá|prohlíž|search|hledá|zkoumá|investig)/.test(text) && activePlayer) {
      return mk("ability_check", { actor: activePlayer, ability: "int", skill: "investigation", dc: 12 });
    }
    if (/(skry|plíž|stealth|tiš)/.test(text) && activePlayer) {
      return mk("ability_check", { actor: activePlayer, ability: "dex", skill: "stealth", dc: 13 });
    }
    if (/(přesvědč|persuad|promluv|vyjedná)/.test(text) && activePlayer) {
      return mk("ability_check", { actor: activePlayer, ability: "cha", skill: "persuasion", dc: 14 });
    }
    if (/(odpoč|rest|spánek|tábor)/.test(text)) {
      return mk("short_rest", { actors: partyIds });
    }

    // No mechanic implied — pure narration.
    return { content: ambientNarration(userMsg), toolCalls: [] };
  }
}

function narrateResults(messages: ChatMsg[]): string {
  const toolMsgs = messages.filter((m) => m.role === "tool");
  const parts: string[] = [];
  for (const m of toolMsgs) {
    try {
      const r = JSON.parse(m.content ?? "{}");
      const res = r.result ?? r;
      if (r.name === "attack" || res?.to_hit !== undefined) {
        parts.push(
          res.hit
            ? `Rána dopadá — ${res.crit ? "drtivě! " : ""}${res.damage ?? ""} zranění.`
            : "Čepel míjí o vlásek.",
        );
      } else if (res?.success !== undefined && res?.dc !== undefined) {
        parts.push(res.success ? "Zkouška se daří." : "Marně — nevychází to.");
      } else if (res?.order) {
        parts.push("Kostky iniciativy se zakutálely; boj začíná.");
      } else if (res?.total !== undefined) {
        parts.push(`Kostka ukazuje ${res.total}.`);
      } else if (res?.results) {
        parts.push("Družina nabírá dech a síly.");
      }
    } catch {
      /* ignore */
    }
  }
  const tail =
    parts.length > 0
      ? parts.join(" ")
      : "Engine promluvil; výsledek je zapsán v deníku kostek.";
  return `[mock DM] ${tail} Co podnikneš dál?`;
}

function ambientNarration(input: string): string {
  return `[mock DM] Vnímáš tíhu okamžiku. „${input.slice(0, 80)}“ — scéna ztichne v očekávání. (Bez API klíče běží náhradní vypravěč; nastav LLM_API_KEY pro plné vyprávění.)`;
}
