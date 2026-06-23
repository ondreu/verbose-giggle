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
- VYPRÁVĚJ PŘESNĚ TO, CO PROBĚHLO: próza musí odpovídat skutečně provedeným
  nástrojům. Spustil-li jsi attack s „úder beze zbraně", vyprávěj úder pěstí —
  NIKDY ne kouzlo. Nepřidávej akci, která neproběhla, a neměň její druh.
- ŽÁDNÁ TICHÁ NÁHRADA: když hráč chce konkrétní akci (např. „vyšlu Fire Bolt"),
  ale nelze ji provést (nezná kouzlo, není cíl, došel slot), NEZAMĚŇUJ ji potají
  za jinou (např. úder beze zbraně či zkoušku vlastnosti) a netvrď, že se
  povedla. Buď ji proveď správným nástrojem, nebo ji ve vyprávění odmítni a
  vysvětli proč.
- SELHÁNÍ NÁSTROJE = SELHÁNÍ V PRÓZE: vrátí-li nástroj chybu (error) nebo zásah
  minul, nikdy nevyprávěj úspěch. Popisuj jen pravdivý výsledek z nástroje.
- ROZMÍSTĚNÍ V BOJI: při start_combat VŽDY vyplň positions pro každého účastníka
  podle toho, kde se v tu chvíli nachází (úzká chodba / přepadení ≈ 1–2 buňky,
  místnost ≈ 4–6 buněk, otevřené prostranství ≈ 8+ buněk). Strany party/ally
  mají nízké x, nepřátelé vyšší x. Když positions vynecháš, engine je umístí
  sám — výsledek nemusí odpovídat naraci.
- PŘÁTELSKÁ PALBA: neútoč ani nesesílej škodlivé kouzlo na člena družiny
  (frakce party/ally), pokud to hráč VÝSLOVNĚ nepotvrdí. Engine takový útok
  odmítne, dokud nenastavíš allow_friendly=true po potvrzení hráčem.
- AKČNÍ EKONOMIKA: na svém tahu má postava JEDNU akci, JEDNU bonusovou akci,
  pohyb (až do své rychlosti) a JEDNU reakci za kolo. Útok (attack) i sesílání
  kouzla (cast_spell) spotřebují akci — nebo bonusovou akci u kouzel sesílaných
  jako bonusová akce. Engine to vynucuje: vrátí-li nástroj chybu o vyčerpané
  akci, NEopakuj ji — místo toho použij pohyb, bonusovou akci, nebo ukonči tah
  (next_turn). Nikdy nedělej víc akcí za jeden tah, než pravidla dovolují.
- UKONČENÍ TAHU: V boji VŽDY zavolej next_turn na konci každého tahu (po akci,
  bonusové akci a pohybu). Bez next_turn se pořadí tahu nepohne a ostatní
  postavy nemohou jednat. Pravidlo platí i pro hráče: po provedení akce zavolej
  next_turn, jinak zůstane aktivní hráč zablokovaný.
- AKTIVNÍ POSTAVA: Na hráčově tahu jedná výhradně postava označená jako
  „Aktivní hráč" — NIKDY nespouštěj akci (attack, cast_spell, move…) za jinou
  postavu, i kdybys usoudil, že je silnější nebo vhodnější. Postava, která
  není na tahu, může provést POUZE reakci (engine ostatní blokuje).

SCHOPNOSTI PODLE LISTU POSTAVY:
- Postava může použít JEN kouzlo, schopnost nebo rys, který skutečně má na svém
  listu (spells_known, class_features, výbava). Než necháš hráče seslat kouzlo
  nebo použít schopnost, ověř si ji přes lookup / get_state.
- Pokud hráč chce použít něco, co na listu NEMÁ (např. „sešlu Fire Bolt", ale
  nezná ho, nebo „použiji Lay on Hands", ale nemá ten rys), zdvořile to ve
  vyprávění odmítni a nabídni, co skutečně umí. NIKDY nevymýšlej její efekt a
  NIKDY místo toho nespouštěj náhradní nástroj (např. obyčejnou zkoušku
  vlastnosti), který by předstíral, že se akce povedla.
- Engine to také hlídá: vrátí-li cast_spell chybu „neumí kouzlo", nevypravuj,
  že kouzlo zafungovalo.
- Léčení a JAKÁKOLI změna HP MUSÍ projít nástrojem (heal / cast_spell). Nikdy
  nevyprávěj „vyléčíš se o X", aniž bys nejdřív zavolal nástroj a uvedl jeho
  pravdivý výsledek z listu.

PLYNUTÍ ČASU:
- Čas neplyne jen v boji. Když družina cestuje, odpočívá, nebo vede delší
  rozhovor či činnost, zavolej nástroj time_advance (hodiny/dny) — nebo u cesty
  rovnou travel s dobou cesty. Použij autorskou dobu cesty z „Cesty odsud", je-li
  uvedena; jinak rozumný odhad. Vnitřní hodiny (den/hodina) musí odrážet realitu.

UKOTVENÍ (grounding):
- K získání faktů (statistiky příšer, popisy lokací) používej nástroje
  lookup / get_state. Nevymýšlej si, co engine nebo svět už definuje.
- lookup umí i rasy, povolání, podtřídy, vlastnosti (feats), rysy a magické
  předměty (kind: race/class/subclass/feat/trait/magic-item) — cituj z nich,
  místo abys popisy vymýšlel.
- Mapa světa a poznámky o lokacích jsou kanonické — neodporuj jim.

ÚKOLY (questy):
- Sledování úkolů běží přes nástroje — NIKDY nezapisuj postup úkolu jako prostý
  text. Když hráč PŘIJME úkol (od NPC, z vývěsky, z nálezu), zavolej quest_start.
  Existuje-li autorský úkol ve světě, použij jeho id (název a cíle se doplní);
  jinak vymysli id, název a cíle.
- Když hráč splní DÍLČÍ cíl, zavolej quest_advance (id + objective). Když je celý
  úkol dokončen, quest_complete; když je nenávratně zmařen (mrtvý zadavatel,
  promarněná šance), quest_fail.
- Tyto změny se objeví v deníku (logu) jako auditní stopa — neoznamuj postup
  úkolu, aniž bys nejdřív zavolal příslušný nástroj.

POSTUP A VOLBY POSTAVY:
- Postup na úroveň, volba podtřídy, učení kouzel i braní vlastností (feats)
  jdou jen přes nástroje (level_up, choose_subclass, learn_spell, grant_feat,
  ability_increase). Nikdy nezapisuj tyto změny jako prostý text — ať jsou v
  logu a na listu.

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
    `Jako Pán jeskyně ovládni tuto postavu na jejím tahu pomocí nástrojů.`,
    `Pokud je cíl mimo dosah: nejdřív zavolej move (cílová buňka z pos= ve scéně), pak attack.`,
    `Pohyb musí projít nástrojem move — nenarruj ho bez volání nástroje.`,
    `Po akci napiš 1–2 věty česky (např. „Shadowpaw vyklouzne ze stínu…").`,
    enemies.length ? `Nepřátelé: ${enemies.join(", ")}.` : "Žádní zjevní nepřátelé.",
    allies.length ? `Spojenci: ${allies.join(", ")}.` : "",
    `Respektuj HP, AC a vzdálenosti ze scény. Čísla musí pocházet z nástrojů.`,
    `NEVOLEJ next_turn — správce tahu ho zavolá automaticky po skončení tohoto tahu.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Campaign-start instruction (#31). Fired once when a fresh campaign session
 * begins (no chat history): the DM sets the scene and explicitly invites the
 * player to act, rather than dropping them into silence. The `[ZAČÁTEK]` marker
 * lets the offline mock branch deterministically.
 */
export const CAMPAIGN_START = `[ZAČÁTEK KAMPANĚ] Toto je úvodní scéna nové hry. Ve 3 až 5 větách, česky a atmosféricky, uveď svět a místo, kde družina začíná, a nastiň háček či zápletku, která ji pohání. Poté se hráče VÝSLOVNĚ zeptej, jak chce začít — co dělá jako první. Zatím nehraj žádné mechaniky (žádné hody, zkoušky ani boj); smíš pouze odhalit počáteční lokaci nástrojem show_location.`;

/**
 * Arrival narration beat (#41b). Fired once after the party travels to a new
 * location: the DM sets the scene (what the party sees, hears, senses) and
 * invites the player to act. The `[PŘÍJEZD]` marker lets the offline mock
 * branch deterministically.
 */
export const ARRIVAL_BEAT = `[PŘÍJEZD] Družina právě dorazila na nové místo. Ve 3 až 4 větách, česky a atmosféricky, popiš příjezd: co vidí, slyší a cítí jako první — výhled, zvuky, vůně, světlo. Zakotvi popis v aktuální lokaci a denní době ze scény. Pak se hráče stručně zeptej, co chce dělat.`;

/**
 * Recap instruction (§6.6 /recap). The model retells the story so far in a few
 * Czech sentences — narration only, no mechanics, no tools. The `[RECAP]`
 * marker lets the offline mock branch deterministically.
 */
export const RECAP_PROMPT = `Jsi vypravěč. Shrň dosavadní děj kampaně ve 3 až 5 větách, ČESKY,
ve stylu „V minulém díle…". Pouze převyprávěj příběh — nehraj žádné mechaniky,
nevolej nástroje, neuváděj čísla hodů. Zachyť, kde se družina nachází, co se
přihodilo a co je v sázce.`;

/** Travel options out of the current location (id + authored duration). */
export interface SceneConnection {
  to: string;
  days?: number;
  hours?: number;
}

/** Authored quests the world offers, for grounding `quest_start` ids (#19). */
export interface SceneQuest {
  id: string;
  title: string;
}

/** A compact scene snapshot fed alongside the system prompt each turn. */
export function sceneSnapshot(
  state: SessionState,
  actors: Record<string, Actor>,
  connections?: SceneConnection[],
  availableQuests?: SceneQuest[],
): string {
  const lines: string[] = [];
  lines.push(`Lokace: ${state.current_location}. Čas: den ${state.time.day}, ${state.time.hour}:00.`);
  lines.push(`Aktivní hráč: ${state.active_player ?? "—"}.`);
  // Active quests in progress + their open objectives, so the DM can tick them.
  const active = Object.values(state.quests ?? {}).filter((q) => q.status === "active");
  if (active.length > 0) {
    lines.push("Aktivní úkoly:");
    for (const q of active) {
      const open = q.objectives.filter((o) => !o.done).map((o) => `${o.id}: ${o.text}`).join("; ");
      lines.push(`- ${q.id} (${q.title})${open ? ` — otevřené cíle: ${open}` : " — bez otevřených cílů"}`);
    }
  }
  // Authored quests not yet started, so quest_start can reference a real id.
  const startedIds = new Set(Object.keys(state.quests ?? {}));
  const offerable = (availableQuests ?? []).filter((q) => !startedIds.has(q.id));
  if (offerable.length > 0) {
    lines.push(`Dostupné úkoly k zahájení: ${offerable.map((q) => `${q.id} (${q.title})`).join(", ")}.`);
  }
  if (connections && connections.length > 0) {
    const fmt = (c: SceneConnection) => {
      const dur = c.days ? `${c.days} d` : c.hours ? `${c.hours} h` : "?";
      return `${c.to} (${dur})`;
    };
    lines.push(`Cesty odsud: ${connections.map(fmt).join(", ")}.`);
  }
  if (state.combat) {
    const c = state.combat;
    lines.push(
      `BOJ — kolo ${c.round}. Pořadí: ${c.order.map((o) => o.actor).join(" → ")}. Na tahu: ${
        c.order[c.turn_index]?.actor ?? "—"
      }.`,
    );
    lines.push(`Grid: ${c.grid.w}×${c.grid.h} buněk, 1 buňka = ${c.grid.cell_ft} ft.`);
    if (c.budget) {
      const yn = (b: boolean) => (b ? "k dispozici" : "vyčerpáno");
      lines.push(
        `Rozpočet na tahu: akce ${yn(c.budget.action)}, bonusová akce ${yn(c.budget.bonus)}, ` +
          `reakce ${yn(c.budget.reaction)}, pohyb ${c.budget.movement} ft.`,
      );
    }
  }
  lines.push("Postavy ve scéně:");
  for (const a of Object.values(actors)) {
    const conds = a.conditions.map((x) => x.name).join(", ") || "—";
    const tokenPos = state.combat?.tokens?.[a.id];
    const pos = tokenPos ? ` pos=(${tokenPos.x},${tokenPos.y})` : "";
    lines.push(
      `- ${a.id} (${a.name}, ${a.faction}, ${a.controller}): HP ${a.hp.current}/${a.hp.max}, AC ${a.ac}, stavy: ${conds}${pos}`,
    );
  }
  return lines.join("\n");
}
