import type { Actor, SessionState } from "@adm/schemas";

/**
 * The Dungeon Master system prompt (§9.3). Hard rules enforce determinism: the
 * model narrates engine truth and may never assert a mechanical number that did
 * not come from a tool result.
 */
export const SYSTEM_PROMPT = `Jsi Pán jeskyně (Dungeon Master) pro hru Dungeons & Dragons 5e (SRD 5.1).
Vyprávíš poutavě a atmosféricky v ČEŠTINĚ, ve druhé osobě k aktivnímu hráči.

ŽELEZNÁ PRAVIDLA (neporušitelná):
- NIKDY si nevymýšlej mechanické výsledky. Každý hod kostkou, zásah, zranění,
  záchranný hod, vzdálenost, pohyb, kouzelný slot a stav MUSÍ projít nástrojem
  (tool call). Engine je jediný, kdo hází kostkami a mění stav hry.
- Pokud bys ve vyprávění uvedl číslo (např. "zasáhneš za 8 zranění"), musíš
  nejdříve zavolat příslušný nástroj (attack / apply_damage / ...) a teprve
  potom vyprávět jeho pravdivý výsledek.
- Vyber vhodnou zkoušku a DC ze standardních pásem SRD: velmi snadné 5,
  snadné 10, střední 15, těžké 20, velmi těžké 25, téměř nemožné 30.
- Respektuj pořadí na tahu. Ovládáš všechny postavy s controller: ai, když je
  na nich řada (společníci i nepřátelé), a to přes STEJNÉ nástroje jako hráči.

UKOTVENÍ (grounding):
- K získání faktů (statistiky příšer, popisy lokací) používej nástroje
  lookup / get_state. Nevymýšlej si, co engine nebo svět už definuje.
- Mapa světa a poznámky o lokacích jsou kanonické — neodporuj jim.

STYL:
- Vyprávění česky, úsečné a obrazné. Mechanický šum (čísla hodů) patří do
  deníku kostek (dice log), próza vypráví příběh.
- Próza pro vyprávění; tool calls pro mechaniku. Nikdy obojí: neuváděj číslo
  v próze a zároveň nevynechej nástroj.`;

/**
 * Instruction handed to the model when it must take an AI-controlled actor's
 * turn (§8.3). The actor acts through the SAME engine tools as a human, so AI
 * companions and enemies are bound by identical determinism. The `[AI-TAH]`
 * marker also lets the offline mock narrator branch deterministically.
 */
export function aiTurnInstruction(
  actor: Actor,
  enemies: string[],
  allies: string[],
): string {
  return [
    `[AI-TAH] Je řada na postavě ${actor.name} (${actor.id}, frakce: ${actor.faction}).`,
    actor.ai_profile ? `Profil chování: ${actor.ai_profile}` : "",
    `Jako Pán jeskyně ovládni tuto postavu na jejím tahu: zvol JEDNU rozumnou akci`,
    `pomocí nástrojů (např. attack, move, cast_spell, apply_condition) a poté ji`,
    `stručně a obrazně popiš v jednom až dvou větách (např. „Shadowpaw vyklouzne ze stínu…").`,
    enemies.length ? `Nepřátelé: ${enemies.join(", ")}.` : "Žádní zjevní nepřátelé.",
    allies.length ? `Spojenci: ${allies.join(", ")}.` : "",
    `Respektuj profil chování a aktuální stav (HP, vzdálenosti). Čísla musí pocházet z nástrojů.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A compact scene snapshot fed alongside the system prompt each turn. */
export function sceneSnapshot(state: SessionState, actors: Record<string, Actor>): string {
  const lines: string[] = [];
  lines.push(`Lokace: ${state.current_location}. Čas: den ${state.time.day}, ${state.time.hour}:00.`);
  lines.push(`Aktivní hráč: ${state.active_player ?? "—"}.`);
  if (state.combat) {
    const c = state.combat;
    lines.push(
      `BOJ — kolo ${c.round}. Pořadí: ${c.order.map((o) => o.actor).join(" → ")}. Na tahu: ${
        c.order[c.turn_index]?.actor ?? "—"
      }.`,
    );
  }
  lines.push("Postavy ve scéně:");
  for (const a of Object.values(actors)) {
    const conds = a.conditions.map((x) => x.name).join(", ") || "—";
    lines.push(
      `- ${a.id} (${a.name}, ${a.faction}, ${a.controller}): HP ${a.hp.current}/${a.hp.max}, AC ${a.ac}, stavy: ${conds}`,
    );
  }
  return lines.join("\n");
}
