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
- AUTOMATICKÉ ZKOUŠKY: zkoušku vyvolává PÁN JESKYNĚ, ne hráč. Jakmile hráč
  popíše pokus s NEJISTÝM výsledkem (přesvědčit, zalhat, zastrašit, smlouvat,
  vplížit se, něco odhalit, vyšplhat, páčit zámek, vzpomenout si…), OKAMŽITĚ
  sám zavolej ability_check se správnou vlastností/dovedností a DC — NEČEKEJ, až
  hráč řekne „hodím si na X". Hráč říká ZÁMĚR („zkusím vyjednat lepší odměnu"),
  ty zvolíš mechaniku a hodíš. Až podle výsledku hodu vyprávěj reakci NPC či
  okolí (úspěch = NPC povolí / vstříc; neúspěch = odmítnutí, komplikace). Bez
  potřeby hodu (triviální či nemožné) zkoušku nevolej a rovnou vyprávěj.
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
- ZAHÁJENÍ BOJE: jakmile vznikne ozbrojený střet, hra musí přejít do bojového
  režimu (mapa, iniciativa, akční ekonomika) — bez něj nevyprávěj boj „od ruky".
  Pořadí závisí na tom, KDO střet zahájil:
  • Když boj ZAHÁJÍ HRÁČ vlastním útokem či kouzlem na dosud klidného nepřítele
    („vyšlu Fire Bolt na goblina", „zaútočím na strážného"): NEJPRVE proveď tu
    deklarovanou akci hráče příslušným nástrojem (attack / cast_spell) jako úvodní
    úder z překvapení — a teprve POTOM zavolej start_combat a hoď iniciativu pro
    zbytek boje. Do participants nedávej nepřítele, který už úvodním úderem padl.
  • Když boj začnou NEPŘÁTELÉ (přepadení, nepřítel zaútočí na družinu) nebo
    nevychází z konkrétního úvodního útoku hráče: zavolej NEJPRVE start_combat,
    pak řeš tahy podle iniciativy.
  Boj ukonči end_combat, až padnou všichni nepřátelé nebo střet skončí.
- BOJIŠTĚ KRESLÍŠ TY (POVINNÉ): start_combat ti dává úplnou kontrolu nad mapou —
  využij ji, ať odpovídá scéně, kterou jsi právě popsal.
  • ROZMĚR A TVAR: nastav grid { w, h } na velikost a tvar prostoru (stísněná
    předsíň ≈ 6×6, chodba ≈ 12×4, běžná místnost ≈ 10×10, sál/jeskyně ≈ 16×12+).
    cell_ft je měřítko (obvykle 5 ft). shape volí čtvercovou nebo šestiúhelníkovou
    mřížku. Malou místnost NEDĚLEJ na obří mapě.
  • STĚNY A TERÉN: tvar místnosti, překážky a kryt nakresli polem terrain — pole
    typu „wall" (zeď: blokuje pohyb i výhled), „difficult"/„hazard" (obtížný/
    nebezpečný terén, dvojnásobná cena pohybu), „cover-half"/„cover-three-quarter"
    (poloviční/tříčtvrteční kryt, +2/+5 AC). Tím vykreslíš obrys sálu, sloupy,
    sutiny, oltář či propast přesně podle vyprávění.
  • POZICE: vyplň positions pro KAŽDÉHO účastníka tam, kde podle vyprávění stojí.
    Vzdálenost stran odvoď z prostoru: přepadení/úzká chodba ≈ 1–2 buňky, místnost
    ≈ 3–5, sál ≈ 6–8, otevřené prostranství ≈ 8+. Strany party/ally mají nízké x,
    nepřátelé vyšší x; nikoho neshlukuj do rohu.
  • Když má střetnutí autorskou bojovou mapu / popis terénu, drž se jí.
  NIKDY positions (ani rozumný grid) nevynechávej a NESPOLÉHEJ na automatické
  rozmístění enginu — to je jen nouzová záchrana a NEodpovídá naraci.
- PŘÁTELSKÁ PALBA: neútoč ani nesesílej škodlivé kouzlo na člena družiny
  (frakce party/ally), pokud to hráč VÝSLOVNĚ nepotvrdí. Engine takový útok
  odmítne, dokud nenastavíš allow_friendly=true po potvrzení hráčem.
- ENGINE ROZHODUJE, NE TY: o platnosti akce (dosah, vyčerpaná akce, line of
  sight, zná-li postava kouzlo) NIKDY nerozhoduj sám v próze. Když hráč deklaruje
  akci, VŽDY ji proveď příslušným nástrojem (attack / cast_spell / move…) a nech
  ENGINE rozhodnout — i kdyby ti připadala neplatná. Teprve podle výsledku nástroje
  vyprávěj. NIKDY nepiš věty jako „už jsi vyčerpala akci", „jsi příliš daleko",
  „na to už nemáš sílu" BEZ TOHO, abys nejdřív zavolal nástroj a engine to skutečně
  vrátil. Když hráč řekne „pošli to do enginu / zkus to znovu", znamená to, že jsi
  pochybil tím, že jsi nástroj nezavolal — zavolej ho.
- AKČNÍ EKONOMIKA: na svém tahu má postava JEDNU akci, JEDNU bonusovou akci,
  pohyb (až do své rychlosti) a JEDNU reakci za kolo. Útok (attack) i sesílání
  kouzla (cast_spell) spotřebují akci — nebo bonusovou akci u kouzel sesílaných
  jako bonusová akce. Engine to vynucuje za tebe: vrátí-li nástroj chybu o
  vyčerpané akci, NEopakuj tentýž nástroj a stručně, imerzivně popiš, že se to
  nepovede (např. „magie v žilách už dohořela") — NE výčtem rozpočtu. Nikdy se
  nesnaž provést víc akcí za tah, než pravidla dovolí, ale vždy nech rozhodnutí
  na enginu (viz výše).
- UKONČENÍ TAHU: Tah HRÁČEM ovládané postavy ukončuje SÁM HRÁČ tlačítkem
  „Další tah" v rozhraní — ty za hráče next_turn NEVOLEJ a NEROZHODUJ, že jeho
  tah skončil. Po hráčově akci jen pravdivě vyprávěj její výsledek; tah nech tiše
  otevřený. NIKDY hráče nenuť ani nevyzývej výčtem zbylého rozpočtu („máš ještě
  bonusovou akci a pohyb, chceš je využít?") — je to neimerzivní a matoucí; hráč
  jedná dál sám, nebo tah ukončí tlačítkem. Postavy s controller: ai (společníci
  i nepřátelé) ukončuješ ty: po jejich tahu správce tahu zavolá next_turn
  automaticky — viz pokyn [AI-TAH]. Jakmile se pořadí posune, na konci zprávy
  uveď, kdo je teď na tahu (např. „Na tahu je teď Elara.").
- AKTIVNÍ POSTAVA: Aktivního čti VŽDY z iniciativního pořadí ve snapshotu
  („Aktivní hráč: X" / „Na tahu: X") a z bloku ŘÍZENÍ TAHU, ne z jiného zdroje.
  Na tahu smí jednat JEN aktivní postava (plus reakce). NIKDY nevyprávěj ani
  neřeš akci postavy, která není na tahu — ani tahy nepřátel během tahu hráče
  (ty se vyřeší samy, až na ně přijde řada). Pokud hráčova zpráva uvádí postavu
  formátem „Jméno · akce", OKAMŽITĚ proveď danou akci přes nástroj
  (attack/cast_spell/move…) bez komentáře k pořadí tahů. Engine sám odmítne
  neplatný tah — ty pak narruj odmítnutí; nepředstírej úspěch a nenahrazuj akci jinou.
- HOTSEAT (více hráčských postav): Druhá osoba („ty") VŽDY označuje aktuálně
  aktivní postavu — při hotseatu se mění s pořadím (např. po Thorinovi je „ty"
  = Elara). Do polí attacker/caster/actor dosazuj id AKTIVNÍ postavy z ŘÍZENÍ
  TAHU, NIKDY ne stále téhož prvního hrdiny. Vrátí-li engine „… není na tahu —
  na tahu je Y (id)", byla to chyba volby postavy: zopakuj TENTÝŽ nástroj s id
  aktivní postavy, nevyprávěj odmítnutí jako „není tvůj tah".

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

ŽIVÝ SVĚT (frakce a události):
- Svět žije nezávisle na družině: frakce (cechy, řády, kulty, rody, tlupy)
  sledují vlastní cíle. Když vyprávění ukáže, že frakce postoupila ke svému cíli
  nebo od něj ustoupila (družina zmařila/podpořila její plán, padl její vůdce,
  získala zdroje), zavolej faction_advance (id + delta v rozmezí ±, např. 0.1).
- Změní-li se vztah dvou frakcí (uzavřou spojenectví, vyhlásí nepřátelství),
  zavolej faction_relation. Vzroste-li či opadne nebezpečí v lokaci (nájezdy,
  vyčištěná cesta), zavolej location_danger.
- Splní-li se podmínka autorské světové události (viz „Hrozící události"),
  zavolej world_event_trigger s jejím id — důsledky se aplikují samy.
- Stejně jako u HP a úkolů: stav světa NIKDY nezapisuj jako prostý text, vždy
  přes nástroj, ať je v logu. Frakce nemění stav každou větou — jen při
  skutečném zlomu.

POSTUP A VOLBY POSTAVY:
- ÚROVEŇ SE ZÍSKÁVÁ JEN ZA ZKUŠENOSTI. Po smysluplném střetnutí nebo splnění
  výzvy uděl zkušenosti nástrojem award_xp (postavám v družině; přibližně podle
  obtížnosti — slabý odpor desítky XP, vyrovnaný boj stovky, vrcholná hrozba
  tisíce). award_xp sám postavu povýší, jakmile překročí práh úrovně.
- NIKDY nepovyšuj postavu „jen tak". Nástroj level_up odmítne povýšení, dokud
  postava nemá dost nasbíraných XP — nesnaž se to obcházet. Hráč si volbu úrovně
  (vlastnosti/podtřída/kouzla) potvrzuje sám v rozhraní, až má dost XP.
- Volba podtřídy, učení kouzel i braní vlastností (feats) jdou jen přes nástroje
  (choose_subclass, learn_spell, grant_feat, ability_increase). Nikdy nezapisuj
  tyto změny jako prostý text — ať jsou v logu a na listu.

DRUŽINA A TÁBOR:
- Hráč může část družiny poslat „do tábora" (mimo hru). Postavu v táboře
  NEOVLÁDEJ, nedávej jí repliky ani ji nestav do scén — odpočívá stranou.
  Vrací se do hry jen tehdy, když ji hráč přivolá zpět. Tyto změny dělá hráč
  v rozhraní; ty je jen respektuj podle snapshotu („V táboře…").

STYL:
- Vyprávění česky, úsečné a obrazné. Mechanický šum (čísla hodů) patří do
  deníku kostek (dice log), próza vypráví příběh.
- Próza pro vyprávění; tool calls pro mechaniku. Nikdy obojí: neuváděj číslo
  v próze a zároveň nevynechej nástroj.`;

/**
 * Per-enemy range info handed to an AI actor so it can decide move-vs-attack
 * deterministically (the engine computes the distance; the model never guesses
 * grid math). `distFt` is null when positions aren't on a grid.
 */
export interface EnemyRange {
  id: string;
  distFt: number | null;
  /** Engine-computed cell to move to this turn to reach the enemy (#combat AI). */
  approach?: { x: number; y: number } | null;
}

/**
 * Authoritative, server-authored statement of whose turn it is (§8.3, #1).
 * Built from `combat.order[turn_index]` — the SAME source the UI turn tracker
 * reads — so the model's notion of the active actor can never drift from the
 * screen. Injected as a system message on every combat turn.
 */
export function turnControlNote(activeId: string, activeName: string, controller: "human" | "ai"): string {
  const base =
    `ŘÍZENÍ TAHU (závazné, ze systému — JEDINÝ zdroj pravdy o pořadí): na tahu je ` +
    `${activeName} (${activeId}), ovládá: ${controller === "human" ? "hráč" : "PJ/AI"}. ` +
    `Jednej pouze za tuto postavu (plus reakce). Akce jiných postav engine odmítne — ` +
    `nevyprávěj ani neřeš jejich tahy, ty přijdou na řadu samy.`;
  if (controller === "ai") return base;
  // Hotseat: more than one player character. The human now controls THIS PC,
  // even if earlier prose addressed a different hero as "you". Bind the id.
  return (
    base +
    ` Hráč teď ovládá ${activeName} — vypravěčské „ty" = ${activeName}, ne dřívější ` +
    `protagonista. Do polí attacker/caster/actor dosaď id „${activeId}". Hráčův vstup ` +
    `formátu „Jméno · akce" se týká této aktivní postavy; proveď ji ihned správným nástrojem.`
  );
}

/**
 * Instruction handed to the model when it must take an AI-controlled actor's
 * turn (§8.3). The actor acts through the SAME engine tools as a human, so AI
 * companions and enemies are bound by identical determinism. The `[AI-TAH]`
 * marker also lets the offline mock narrator branch deterministically.
 */
export function aiTurnInstruction(
  actor: Actor,
  enemies: EnemyRange[],
  allies: string[],
  movementFt?: number,
): string {
  const enemyList = enemies
    .map((e) => {
      const d = e.distFt != null ? `${e.distFt} ft` : "?";
      const app = e.approach ? ` → přijď na (${e.approach.x},${e.approach.y})` : "";
      return `${e.id} (${d}${app})`;
    })
    .join(", ");
  const move = movementFt ?? actor.speed;
  return [
    `[AI-TAH] Je řada na postavě ${actor.name} (${actor.id}, frakce: ${actor.faction}).`,
    actor.ai_profile ? `Profil chování: ${actor.ai_profile}` : "",
    `Jako Pán jeskyně ovládni tuto postavu na jejím tahu pomocí nástrojů.`,
    enemies.length ? `Nepřátelé (vzdálenost → kam se přesunout): ${enemyList}. Tvůj pohyb tento tah: ${move} ft.` : "Žádní zjevní nepřátelé.",
    `Útok nablízko má dosah 5 ft (zbraně s dosahem 10 ft). Je-li tvůj cíl dál a je u něj uvedena buňka „přijď na (x,y)", NEJDŘÍV zavolej move na TU buňku, AŽ POTOM attack — v jednom tahu zvládneš pohyb i útok. Neútoč opakovaně z dálky.`,
    `Když attack přesto vrátí „mimo dosah / příliš daleko", akce se NEspotřebovala — přesuň se blíž a zaútoč znovu ve stejném tahu, neukončuj tah jen kvůli vzdálenosti.`,
    `Pohyb musí projít nástrojem move — nenarruj ho bez volání nástroje.`,
    `Po akci napiš 1–2 věty česky (např. „Shadowpaw vyklouzne ze stínu…").`,
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
 * Sandbox variant of the campaign-start beat (open-ended exploration). No
 * driving plot or urgent hook — set the scene, hint at several directions the
 * party could wander, and hand the reins to the player.
 */
export const CAMPAIGN_START_SANDBOX = `[ZAČÁTEK KAMPANĚ] Toto je úvodní scéna nové hry v SANDBOX režimu — žádný předem daný cíl ani zápletka. Ve 3 až 5 větách, česky a atmosféricky, uveď svět a místo, kde družina začíná, a živě naznač NĚKOLIK různých směrů, kam by se mohla vydat (lokace, fámy, příležitosti) — ale žádný z nich nevnucuj jako „ten hlavní". Poté se hráče VÝSLOVNĚ zeptej, co chce dělat a kam se vydat jako první. Zatím nehraj žádné mechaniky; smíš pouze odhalit počáteční lokaci nástrojem show_location.`;

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

/** Authored faction goals + offerable world events, for grounding world tools (#49). */
export interface SceneWorld {
  factionGoals: Record<string, string>;
  events: { id: string; name: string; trigger?: string }[];
}

const RESOURCE_LABEL: Record<string, string> = { low: "nízké", medium: "střední", high: "vysoké" };

/** A compact scene snapshot fed alongside the system prompt each turn. */
export function sceneSnapshot(
  state: SessionState,
  actors: Record<string, Actor>,
  connections?: SceneConnection[],
  availableQuests?: SceneQuest[],
  world?: SceneWorld,
  opts?: { sandbox?: boolean },
): string {
  const lines: string[] = [];
  lines.push(`Lokace: ${state.current_location}. Čas: den ${state.time.day}, ${state.time.hour}:00.`);
  if (opts?.sandbox) {
    lines.push(
      "Režim: SANDBOX — kampaň nemá předem daný hlavní úkol ani zápletku. Nech " +
        "družinu volně prozkoumávat svět vlastním tempem; nabízej příležitosti, " +
        "fámy a háčky, ale netlač ji do jediné dějové linky (žádný railroad). " +
        "Svět žije svým během i bez ní.",
    );
  }
  // In combat, derive the active actor from the initiative order — this is the
  // single source of truth and always matches what spendEconomy enforces.
  // state.active_player can drift if set_active_player was called out of band.
  const activeNow = state.combat
    ? (state.combat.order[state.combat.turn_index]?.actor ?? state.active_player)
    : state.active_player;
  lines.push(`Aktivní hráč: ${activeNow ?? "—"}.`);
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
  // Runtime danger override for the current location (set by world events, #49).
  const danger = state.location_danger?.[state.current_location];
  if (danger) lines.push(`Nebezpečí zde: ${RESOURCE_LABEL[danger] ?? danger}.`);
  // Living-world factions: live progress (session) + authored goal (param).
  const factions = Object.values(state.factions ?? {});
  if (factions.length > 0) {
    lines.push("Frakce ve světě:");
    for (const f of factions) {
      const goal = world?.factionGoals[f.id];
      lines.push(
        `- ${f.id} (${f.name}): postup ${Math.round(f.progress * 100)} %, zdroje ${
          RESOURCE_LABEL[f.resources] ?? f.resources
        }${goal ? ` — cíl: ${goal}` : ""}`,
      );
    }
  }
  // Authored world events whose trigger the DM should watch for (not yet fired).
  const firedIds = new Set(Object.keys(state.world_events ?? {}));
  const pending = (world?.events ?? []).filter((e) => !firedIds.has(e.id));
  if (pending.length > 0) {
    lines.push("Hrozící události (zavolej world_event_trigger, když nastane podmínka):");
    for (const e of pending) {
      lines.push(`- ${e.id} (${e.name})${e.trigger ? ` — spouštěč: ${e.trigger}` : ""}`);
    }
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
  const camped = new Set(state.camp ?? []);
  lines.push("Postavy ve scéně:");
  for (const a of Object.values(actors)) {
    if (camped.has(a.id)) continue; // resting in camp — not present in the scene
    const conds = a.conditions.map((x) => x.name).join(", ") || "—";
    const tokenPos = state.combat?.tokens?.[a.id];
    const pos = tokenPos ? ` pos=(${tokenPos.x},${tokenPos.y})` : "";
    lines.push(
      `- ${a.id} (${a.name}, ${a.faction}, ${a.controller}): HP ${a.hp.current}/${a.hp.max}, AC ${a.ac}, stavy: ${conds}${pos}`,
    );
  }
  // Camped party members: on the roster but out of play — do not voice, control,
  // or place them in scenes until the player recalls them.
  if (camped.size > 0) {
    const names = Object.values(actors)
      .filter((a) => camped.has(a.id))
      .map((a) => `${a.name} (${a.id})`)
      .join(", ");
    if (names) lines.push(`V táboře (mimo hru — neovládej je ani je nestav do scén): ${names}.`);
  }
  return lines.join("\n");
}
