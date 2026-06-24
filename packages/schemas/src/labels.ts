import type { ConditionName, DamageType, AbilityKey } from "./primitives.js";

/**
 * Czech labels for player-facing text (the guiding language of the project).
 * Identifiers/ids stay English; these map the closed enum sets to Czech for the
 * dice log and UI. Keep in sync with the enums in primitives.ts.
 */
export const CONDITION_CS: Record<ConditionName, string> = {
  blinded: "oslepen",
  charmed: "očarován",
  deafened: "ohlušen",
  exhaustion: "vyčerpání",
  frightened: "vyděšen",
  grappled: "sevřen",
  incapacitated: "neschopen jednat",
  invisible: "neviditelný",
  paralyzed: "ochromen",
  petrified: "zkamenělý",
  poisoned: "otráven",
  prone: "na zemi",
  restrained: "spoután",
  stunned: "omráčen",
  unconscious: "v bezvědomí",
};

/**
 * Short Czech rules descriptions for each condition (#34). Surfaced as tooltips/
 * popovers on the sheet's condition chips. (A fuller localization can later draw
 * on the SRD Conditions dataset, #21.)
 */
export const CONDITION_DESC_CS: Record<ConditionName, string> = {
  blinded: "Nevidíš: automaticky selháváš u zkoušek vyžadujících zrak. Útoky na tebe mají výhodu, tvé útoky nevýhodu.",
  charmed: "Nemůžeš útočit na původce ani ho cílit škodlivými efekty. Původce má výhodu na společenské zkoušky vůči tobě.",
  deafened: "Neslyšíš a automaticky selháváš u zkoušek vyžadujících sluch.",
  exhaustion: "Vyčerpání: ve stupních přidává postihy ke zkouškám i rychlosti; nejvyšší stupeň znamená smrt.",
  frightened: "Dokud vidíš zdroj strachu, máš nevýhodu na zkoušky i útoky a nemůžeš se k němu dobrovolně přiblížit.",
  grappled: "Sevřen: tvá rychlost je 0, nemůžeš se pohybovat.",
  incapacitated: "Neschopen jednat: nemůžeš provádět akce ani reakce.",
  invisible: "Neviditelný: útoky na tebe mají nevýhodu, tvé útoky výhodu.",
  paralyzed: "Ochromen: neschopen jednat, nehýbeš se ani nemluvíš. Útoky zblízka jsou automaticky kritické.",
  petrified: "Zkamenělý: neschopen jednat, odolnost vůči zranění, imunita vůči jedu a nemoci.",
  poisoned: "Otráven: nevýhoda na útoky a na zkoušky vlastností.",
  prone: "Na zemi: pohyb jen plazením, nevýhoda na útoky. Útoky zblízka na tebe mají výhodu, na dálku nevýhodu.",
  restrained: "Spoután: rychlost 0, nevýhoda na útoky a na záchrany Obratnosti. Útoky na tebe mají výhodu.",
  stunned: "Omráčen: neschopen jednat, nehýbeš se, mluvíš zajíkavě. Útoky na tebe mají výhodu.",
  unconscious: "V bezvědomí: neschopen jednat, nevnímáš okolí, upustíš co držíš a padneš. Útoky zblízka jsou kritické.",
};

export const DAMAGE_CS: Record<DamageType, string> = {
  acid: "kyselinové",
  bludgeoning: "drtivé",
  cold: "chladové",
  fire: "ohnivé",
  force: "silové",
  lightning: "bleskové",
  necrotic: "nekrotické",
  piercing: "bodné",
  poison: "jedové",
  psychic: "psychické",
  radiant: "zářivé",
  slashing: "sečné",
  thunder: "hromové",
};

/** Full Czech ability names (no two-letter shorthand, #4). */
export const ABILITY_CS: Record<AbilityKey, string> = {
  str: "Síla",
  dex: "Obratnost",
  con: "Odolnost",
  int: "Inteligence",
  wis: "Moudrost",
  cha: "Charisma",
};

/** Standard international 3-letter ability abbreviations for compact UI/log. */
export const ABILITY_ABBR: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export const AOE_SHAPE_CS: Record<string, string> = {
  sphere: "koule",
  cube: "krychle",
  cone: "kužel",
  line: "čára",
};

/** SRD skill ids → Czech labels. Keep in sync with SKILL_ABILITY in the engine. */
export const SKILL_CS: Record<string, string> = {
  athletics: "atletika",
  acrobatics: "akrobacie",
  "sleight-of-hand": "obratnost rukou",
  stealth: "nenápadnost",
  arcana: "magie",
  history: "historie",
  investigation: "pátrání",
  nature: "příroda",
  religion: "náboženství",
  "animal-handling": "zacházení se zvířaty",
  insight: "vhled",
  medicine: "léčitelství",
  perception: "vnímání",
  survival: "přežití",
  deception: "klamání",
  intimidation: "zastrašování",
  performance: "vystupování",
  persuasion: "přesvědčování",
};

/** Player-facing Czech names for SRD races (ids stay English). */
export const RACE_CS: Record<string, string> = {
  human: "Člověk",
  elf: "Elf",
  dwarf: "Trpaslík",
  halfling: "Půlčík",
  "half-orc": "Půlork",
  "half-elf": "Půlelf",
  tiefling: "Tiefling",
  dragonborn: "Drakorozený",
  gnome: "Gnóm",
};

export const SUBRACE_CS: Record<string, string> = {
  "hill-dwarf": "Pahorkatinný trpaslík",
  "mountain-dwarf": "Horský trpaslík",
  "high-elf": "Vznešený elf",
  "wood-elf": "Lesní elf",
  "dark-elf": "Temný elf (drow)",
  "lightfoot-halfling": "Lehkonohý půlčík",
  "stout-halfling": "Statný půlčík",
  "rock-gnome": "Skalní gnóm",
  "forest-gnome": "Lesní gnóm",
};

export const CLASS_CS: Record<string, string> = {
  fighter: "Bojovník",
  barbarian: "Barbar",
  rogue: "Tulák",
  monk: "Mnich",
  ranger: "Hraničář",
  paladin: "Paladin",
  cleric: "Klerik",
  druid: "Druid",
  wizard: "Kouzelník",
  sorcerer: "Čaroděj",
  bard: "Bard",
  warlock: "Černokněžník",
};

/** Schools of magic — for spell pickers and tooltips (#21). */
export const SPELL_SCHOOL_CS: Record<string, string> = {
  abjuration: "abjurace",
  conjuration: "konjurace",
  divination: "věštění",
  enchantment: "očarování",
  evocation: "evokace",
  illusion: "iluze",
  necromancy: "nekromancie",
  transmutation: "transmutace",
};

/**
 * Short Czech descriptions for each damage type (#21). The resistance/
 * vulnerability mechanic lives in the engine; these feed tooltips and the
 * rules-reference panel so players know what each type means.
 */
export const DAMAGE_DESC_CS: Record<DamageType, string> = {
  acid: "Leptavé zranění od kyselin, žíravin a dechu některých nestvůr.",
  bludgeoning: "Tupé údery — kyje, pády, drcení a sevření.",
  cold: "Mráz a ledový chlad; zpomaluje a křehne.",
  fire: "Žár plamenů a výbuchů.",
  force: "Čistá magická síla; málokdo vůči ní odolává.",
  lightning: "Elektrické výboje a blesky.",
  necrotic: "Zvadnutí života a temná energie nemrtvých.",
  piercing: "Bodné rány — šípy, kopí, tesáky.",
  poison: "Jedy a toxiny; mnoho tvorů je vůči nim odolných.",
  psychic: "Útok na mysl, který nezanechává viditelné rány.",
  radiant: "Zářivá, posvátná energie světla.",
  slashing: "Sečné rány — meče, sekery, drápy.",
  thunder: "Ohlušující rázová vlna zvuku.",
};

/**
 * Weapon property ids → Czech label (#21). Mirrors the SRD weapon-properties
 * list; ids stay English (SRD), the label is player-facing Czech.
 */
export const WEAPON_PROPERTY_CS: Record<string, string> = {
  ammunition: "střelivo",
  finesse: "elegantní",
  heavy: "těžká",
  light: "lehká",
  loading: "nabíjení",
  range: "dostřel",
  reach: "dosah",
  special: "zvláštní",
  thrown: "vrhací",
  "two-handed": "obouruční",
  versatile: "všestranná",
};

/** Short Czech rules notes for weapon properties (#21), for tooltips. */
export const WEAPON_PROPERTY_DESC_CS: Record<string, string> = {
  ammunition: "Útok na dálku spotřebuje střelivo (šíp, šipku, kámen).",
  finesse: "Pro útok i zranění si vybereš Sílu, nebo Obratnost.",
  heavy: "Malé tvory ji ovládají s nevýhodou.",
  light: "Vhodná pro boj dvěma zbraněmi (útok off-hand jako bonusová akce).",
  loading: "Za akci/bonus/reakci s ní vystřelíš jen jednou.",
  range: "Má dva dostřely; mimo bližší máš nevýhodu, za vzdálenějším nelze.",
  reach: "Dosáhne o 5 stop dál, než je obvyklé.",
  special: "Má vlastní zvláštní pravidlo (viz popis zbraně).",
  thrown: "Můžeš ji hodit; používá stejnou vlastnost jako útok zblízka.",
  "two-handed": "K útoku ji musíš držet oběma rukama.",
  versatile: "Lze ji držet jednou i oběma rukama (větší kostka zranění).",
};

/** Alignment ids → Czech label (#21). */
export const ALIGNMENT_CS: Record<string, string> = {
  "lawful-good": "zákonně dobrý",
  "neutral-good": "neutrálně dobrý",
  "chaotic-good": "chaoticky dobrý",
  "lawful-neutral": "zákonně neutrální",
  "neutral": "neutrální",
  "true-neutral": "ryze neutrální",
  "chaotic-neutral": "chaoticky neutrální",
  "lawful-evil": "zákonně zlý",
  "neutral-evil": "neutrálně zlý",
  "chaotic-evil": "chaoticky zlý",
  "unaligned": "bez přesvědčení",
};

/**
 * Short Czech descriptions of the six ability scores (#21). A single source for
 * the rules-reference panel and ability tooltips (shared with the web UI).
 */
export const ABILITY_DESC_CS: Record<AbilityKey, string> = {
  str: "Fyzická síla a atletika: útoky na blízko, nošení, šplh a skok.",
  dex: "Hbitost a reflexy: iniciativa, útoky na dálku, AC v lehké zbroji, nenápadnost.",
  con: "Zdraví a výdrž: maximum životů a záchrany proti jedu, vyčerpání a chladu.",
  int: "Paměť a úsudek: magie kouzelníka, Mystika, Historie, Pátrání.",
  wis: "Vnímavost a intuice: magie klerika/druida, Vnímání, Vhled, Přežití.",
  cha: "Síla osobnosti: magie barda/čaroděje, Přesvědčování, Klamání, Zastrašování.",
};

/** A handful of common feats; unknown ids fall back to the SRD name. */
export const FEAT_CS: Record<string, string> = {
  alert: "Ostražitý",
  "great-weapon-master": "Mistr velkých zbraní",
  lucky: "Šťastlivec",
  "magic-initiate": "Zasvěcenec magie",
  "war-caster": "Válečný sesílatel",
  resilient: "Houževnatý",
  tough: "Otužilý",
  sentinel: "Strážce",
  sharpshooter: "Ostrostřelec",
  grappler: "Zápasník",
};

/**
 * Player-facing Czech names for SRD spells (#45b). Keyed by the English SRD id
 * (ids stay English for determinism); only the displayed label is translated.
 * This is a curated starter layer covering every SRD cantrip and level-1 spell
 * — the set a new caster actually picks and casts (creation caps the picker at
 * level 1). Higher-level spells fall back to a prettified English name via
 * {@link csSpellName}; extend this map to localize more. (#45b is `[~]`.)
 */
export const SPELL_NAME_CS: Record<string, string> = {
  // Cantrips (level 0)
  "acid-splash": "Kyselinová sprška",
  "chill-touch": "Mrazivý dotek",
  "dancing-lights": "Tančící světla",
  druidcraft: "Druidský um",
  "eldritch-blast": "Mystický výšleh",
  "fire-bolt": "Ohnivá střela",
  guidance: "Vedení",
  light: "Světlo",
  "mage-hand": "Kouzelná ruka",
  mending: "Spravení",
  message: "Vzkaz",
  "minor-illusion": "Drobná iluze",
  "poison-spray": "Jedovatý postřik",
  prestidigitation: "Prestidigitace",
  "produce-flame": "Vyvolání plamene",
  "ray-of-frost": "Mrazivý paprsek",
  resistance: "Odolnost",
  "sacred-flame": "Posvátný plamen",
  shillelagh: "Shillelagh",
  "shocking-grasp": "Šokující sevření",
  "spare-the-dying": "Záchrana umírajícího",
  thaumaturgy: "Thaumaturgie",
  "true-strike": "Jistý úder",
  "vicious-mockery": "Zlomyslný posměšek",
  // Level 1
  alarm: "Poplach",
  "animal-friendship": "Přátelství se zvířaty",
  bane: "Záhuba",
  bless: "Požehnání",
  "burning-hands": "Hořící ruce",
  "charm-person": "Očarování osoby",
  "color-spray": "Barevná sprška",
  command: "Rozkaz",
  "comprehend-languages": "Porozumění jazykům",
  "create-or-destroy-water": "Stvoření či zničení vody",
  "cure-wounds": "Léčení ran",
  "detect-evil-and-good": "Odhalení zla a dobra",
  "detect-magic": "Odhalení magie",
  "detect-poison-and-disease": "Odhalení jedu a nemoci",
  "disguise-self": "Přestrojení",
  "divine-favor": "Boží přízeň",
  entangle: "Spoutání",
  "expeditious-retreat": "Spěšný ústup",
  "faerie-fire": "Vílí oheň",
  "false-life": "Klamný život",
  "feather-fall": "Pírkový pád",
  "find-familiar": "Přivolání familiára",
  "floating-disk": "Vznášející se disk",
  "fog-cloud": "Mlžný oblak",
  goodberry: "Léčivé bobule",
  grease: "Mastnota",
  "guiding-bolt": "Navádějící střela",
  "healing-word": "Léčivé slovo",
  "hellish-rebuke": "Pekelná odveta",
  heroism: "Hrdinství",
  "hideous-laughter": "Příšerný smích",
  "hunters-mark": "Lovcovo znamení",
  identify: "Identifikace",
  "illusory-script": "Iluzorní písmo",
  "inflict-wounds": "Uštědření ran",
  jump: "Skok",
  longstrider: "Dlouhý krok",
  "mage-armor": "Kouzelná zbroj",
  "magic-missile": "Magická střela",
  "protection-from-evil-and-good": "Ochrana před zlem a dobrem",
  "purify-food-and-drink": "Očištění jídla a pití",
  sanctuary: "Útočiště",
  shield: "Štít",
  "shield-of-faith": "Štít víry",
  "silent-image": "Tichý obraz",
  sleep: "Spánek",
  "speak-with-animals": "Řeč se zvířaty",
  thunderwave: "Hromová vlna",
  "unseen-servant": "Neviditelný sluha",
};

/**
 * Player-facing Czech names for SRD equipment (#45b): all weapons and armor
 * (every character carries some), plus the adventuring gear and equipment packs
 * that appear in starting kits. Unknown ids fall back to a prettified English
 * name via {@link csItemName}. Ids stay English (SRD); only labels translate.
 */
export const ITEM_NAME_CS: Record<string, string> = {
  // Weapons
  club: "Kyj",
  dagger: "Dýka",
  greatclub: "Velký kyj",
  handaxe: "Sekerka",
  javelin: "Oštěp",
  "light-hammer": "Lehké kladivo",
  mace: "Palcát",
  quarterstaff: "Bojová hůl",
  sickle: "Srp",
  spear: "Kopí",
  "crossbow-light": "Lehká kuše",
  dart: "Šipka",
  shortbow: "Krátký luk",
  sling: "Prak",
  battleaxe: "Bojová sekera",
  flail: "Řemdih",
  glaive: "Sudlice",
  greataxe: "Velká sekera",
  greatsword: "Velký meč",
  halberd: "Halapartna",
  lance: "Dřevec",
  longsword: "Dlouhý meč",
  maul: "Perlík",
  morningstar: "Palcát s bodci",
  pike: "Píka",
  rapier: "Rapír",
  scimitar: "Šavle",
  shortsword: "Krátký meč",
  trident: "Trojzubec",
  "war-pick": "Válečný špičák",
  warhammer: "Válečné kladivo",
  whip: "Bič",
  blowgun: "Foukačka",
  "crossbow-hand": "Ruční kuše",
  "crossbow-heavy": "Těžká kuše",
  longbow: "Dlouhý luk",
  net: "Síť",
  // Armor & shields
  "padded-armor": "Prošívaná zbroj",
  "leather-armor": "Kožená zbroj",
  "studded-leather-armor": "Cvočkovaná kožená zbroj",
  "hide-armor": "Kožešinová zbroj",
  "chain-shirt": "Kroužková košile",
  "scale-mail": "Šupinová zbroj",
  breastplate: "Náprsní pancíř",
  "half-plate-armor": "Poloplátová zbroj",
  "ring-mail": "Kroužkovaná zbroj",
  "chain-mail": "Drátěná zbroj",
  "splint-armor": "Pásová zbroj",
  "plate-armor": "Plátová zbroj",
  shield: "Štít",
  // Common adventuring gear (starting kits)
  arrow: "Šíp",
  "crossbow-bolt": "Šipka do kuše",
  backpack: "Batoh",
  bedroll: "Spací podložka",
  "rations-1-day": "Příděly jídla (1 den)",
  "rope-hempen-50-feet": "Konopné lano (50 stop)",
  "rope-silk-50-feet": "Hedvábné lano (50 stop)",
  torch: "Pochodeň",
  waterskin: "Měch na vodu",
  tinderbox: "Křesadlo",
  candle: "Svíce",
  "lantern-hooded": "Krytá lucerna",
  "lantern-bullseye": "Reflektorová lucerna",
  "oil-flask": "Lampový olej (lahvička)",
  crowbar: "Páčidlo",
  hammer: "Kladivo",
  piton: "Skoba",
  "grappling-hook": "Lezecký hák",
  pouch: "Váček",
  quiver: "Toulec",
  "holy-water-flask": "Svěcená voda (lahvička)",
  "healers-kit": "Léčitelská brašna",
  spellbook: "Kniha kouzel",
  "component-pouch": "Váček se sesílacími přísadami",
  "thieves-tools": "Zlodějské náčiní",
  "mess-kit": "Jídelní souprava",
  "clothes-common": "Prostý oděv",
  "clothes-fine": "Vznešený oděv",
  "clothes-travelers": "Cestovní oděv",
  robes: "Hábit",
  // Equipment packs
  "explorers-pack": "Průzkumnický balíček",
  "dungeoneers-pack": "Jeskyňářský balíček",
  "burglars-pack": "Lupičský balíček",
  "diplomats-pack": "Diplomatický balíček",
  "entertainers-pack": "Bavičský balíček",
  "priests-pack": "Kněžský balíček",
  "scholars-pack": "Učenecký balíček",
};

/**
 * Short Czech descriptions of the eight schools of magic (#45c). Static, so
 * tooltips and the rules reference read Czech with no dataset mounted.
 */
export const SPELL_SCHOOL_DESC_CS: Record<string, string> = {
  abjuration: "Ochranná magie: štíty, bariéry a rušení jiných kouzel.",
  conjuration: "Přivolávání tvorů a předmětů či přemísťování na dálku.",
  divination: "Odhalování pravdy, skrytého a budoucího.",
  enchantment: "Ovlivňování mysli — okouzlení, rozkazy a klam.",
  evocation: "Zkrocení živlů do ničivé energie (oheň, blesk, mráz).",
  illusion: "Klamy smyslů — obrazy, zvuky a falešné vjemy.",
  necromancy: "Magie života a smrti, nemrtvých a vysávání sil.",
  transmutation: "Proměna podstaty věcí, tvorů a hmoty.",
};

/**
 * Short Czech descriptions of the eighteen skills (#45c), for hover tooltips
 * and the rules reference. Keyed by the same SRD ids as {@link SKILL_CS}.
 */
export const SKILL_DESC_CS: Record<string, string> = {
  athletics: "Šplh, skok, plavání a zápas — fyzické zdolávání překážek (Síla).",
  acrobatics: "Rovnováha, kotouly a hbité úhyby na nejisté noze (Obratnost).",
  "sleight-of-hand": "Kapsářství, žonglování a nenápadné triky s rukama (Obratnost).",
  stealth: "Plížení, schovávání a tichý pohyb bez povšimnutí (Obratnost).",
  arcana: "Znalost magie, kouzel, run a tajemných bytostí (Inteligence).",
  history: "Znalost dějin, válek, panovníků a dávných civilizací (Inteligence).",
  investigation: "Hledání stop, vyvozování a luštění hádanek (Inteligence).",
  nature: "Znalost přírody, rostlin, zvířat a počasí (Inteligence).",
  religion: "Znalost božstev, obřadů, kultů a nemrtvých (Inteligence).",
  "animal-handling": "Uklidnění, výcvik a porozumění zvířatům (Moudrost).",
  insight: "Odhalení lži, nálad a skutečných úmyslů druhých (Moudrost).",
  medicine: "Stabilizace umírajících a rozpoznání nemocí (Moudrost).",
  perception: "Všímání si okolí zrakem, sluchem a čichem (Moudrost).",
  survival: "Stopování, hledání cesty a přežití v divočině (Moudrost).",
  deception: "Přesvědčivé lhaní, přetvářka a klamání (Charisma).",
  intimidation: "Vynucení si poslušnosti hrozbami a nátlakem (Charisma).",
  performance: "Bavení publika hudbou, tancem a vystoupením (Charisma).",
  persuasion: "Získání druhých na svou stranu taktem a argumenty (Charisma).",
};

/** Prettify an SRD id ("fire-bolt") into a readable English fallback label. */
function prettyId(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Translate a possibly-unknown key, falling back to the original string. */
export function csDamage(type?: string): string {
  if (!type) return "";
  return DAMAGE_CS[type as DamageType] ?? type;
}
export function csCondition(name: string): string {
  return CONDITION_CS[name as ConditionName] ?? name;
}
export function csConditionDesc(name: string): string {
  return CONDITION_DESC_CS[name as ConditionName] ?? "";
}
export function csDamageDesc(type?: string): string {
  if (!type) return "";
  return DAMAGE_DESC_CS[type as DamageType] ?? "";
}
export function csWeaponProperty(id: string): string {
  return WEAPON_PROPERTY_CS[id] ?? id;
}
export function csWeaponPropertyDesc(id: string): string {
  return WEAPON_PROPERTY_DESC_CS[id] ?? "";
}
export function csAlignment(id?: string): string {
  if (!id) return "";
  return ALIGNMENT_CS[id] ?? id;
}
export function csAbilityDesc(k: string): string {
  return ABILITY_DESC_CS[k as AbilityKey] ?? "";
}
export function csAbility(k: string): string {
  return ABILITY_CS[k as AbilityKey] ?? k.toUpperCase();
}
/** Compact 3-letter ability label (STR/DEX/…) for grids and the dice log. */
export function csAbilityAbbr(k: string): string {
  return ABILITY_ABBR[k as AbilityKey] ?? k.toUpperCase();
}
export function csAoe(shape: string): string {
  return AOE_SHAPE_CS[shape] ?? shape;
}
export function csSkill(skill: string): string {
  return SKILL_CS[skill] ?? skill;
}
/** Race/class/subrace/feat/school names, falling back to a given label or the id. */
export function csRace(id: string, fallback?: string): string {
  return RACE_CS[id] ?? fallback ?? id;
}
export function csSubrace(id: string, fallback?: string): string {
  return SUBRACE_CS[id] ?? fallback ?? id;
}
export function csClass(id: string, fallback?: string): string {
  return CLASS_CS[id] ?? fallback ?? id;
}
/** Localize a stored lineage id, which may be a race or a subrace id. */
export function csLineage(id?: string): string {
  if (!id) return "";
  return SUBRACE_CS[id] ?? RACE_CS[id] ?? id;
}
export function csFeat(id: string, fallback?: string): string {
  return FEAT_CS[id] ?? fallback ?? id;
}
export function csSpellSchool(id?: string): string {
  if (!id) return "";
  return SPELL_SCHOOL_CS[id] ?? id;
}
export function csSpellSchoolDesc(id?: string): string {
  if (!id) return "";
  return SPELL_SCHOOL_DESC_CS[id] ?? "";
}
export function csSkillDesc(skill: string): string {
  return SKILL_DESC_CS[skill] ?? "";
}
/**
 * Player-facing spell name (#45b): Czech where translated, else a prettified
 * English fallback (or the caller's `fallback`, e.g. the SRD's own name). Ids
 * stay English; only the label changes.
 */
export function csSpellName(id: string, fallback?: string): string {
  return SPELL_NAME_CS[id] ?? fallback ?? prettyId(id);
}
/** Player-facing equipment/item name (#45b), same fallback chain as spells. */
export function csItemName(id: string, fallback?: string): string {
  return ITEM_NAME_CS[id] ?? fallback ?? prettyId(id);
}

/** Quest lifecycle status → Czech (#19). */
const QUEST_STATUS_CS: Record<string, string> = {
  active: "Aktivní",
  completed: "Splněno",
  failed: "Nezdařeno",
};
export function csQuestStatus(status: string): string {
  return QUEST_STATUS_CS[status] ?? status;
}
