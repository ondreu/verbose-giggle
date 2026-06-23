import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { csSpellSchool } from "@adm/schemas";

interface SpellData {
  id: string;
  name: string;
  level: number;
  school?: string;
  casting_time?: string;
  duration?: string;
  components?: string[];
  higher_level?: string;
  range_ft?: number;
  concentration?: boolean;
  ritual?: boolean;
  description?: string;
}

interface FeatData {
  id: string;
  name: string;
  prerequisites: string[];
  description?: string;
}

interface FeatureData {
  id: string;
  name: string;
  level?: number;
  class?: string;
  subclass?: string;
  description?: string;
}

interface ItemData {
  id: string;
  name: string;
  category?: string;
  rarity?: string;
  magic: boolean;
  description?: string;
}

const spellCache: Record<string, SpellData | null> = {};
async function fetchSpell(id: string): Promise<SpellData | null> {
  if (id in spellCache) return spellCache[id]!;
  try {
    const res = await fetch(`/api/srd/spell/${encodeURIComponent(id)}`);
    if (!res.ok) return (spellCache[id] = null);
    const data = await res.json();
    spellCache[id] = data?.id ? (data as SpellData) : null;
    return spellCache[id];
  } catch {
    return (spellCache[id] = null);
  }
}

const featCache: Record<string, FeatData | null> = {};
async function fetchFeat(id: string): Promise<FeatData | null> {
  if (id in featCache) return featCache[id]!;
  try {
    const res = await fetch(`/api/srd/feat/${encodeURIComponent(id)}`);
    if (!res.ok) return (featCache[id] = null);
    const data = await res.json();
    featCache[id] = data?.id ? (data as FeatData) : null;
    return featCache[id];
  } catch {
    return (featCache[id] = null);
  }
}

const featureCache: Record<string, FeatureData | null> = {};
async function fetchFeature(id: string): Promise<FeatureData | null> {
  if (id in featureCache) return featureCache[id]!;
  try {
    const res = await fetch(`/api/srd/feature/${encodeURIComponent(id)}`);
    if (!res.ok) return (featureCache[id] = null);
    const data = await res.json();
    featureCache[id] = data?.id ? (data as FeatureData) : null;
    return featureCache[id];
  } catch {
    return (featureCache[id] = null);
  }
}

// Items are resolved in a batch (equipment + magic items) and primed into this
// cache by the inventory panel, but ItemCard can also fetch a single id lazily.
const itemCache: Record<string, ItemData | null> = {};
export function primeItemCache(items: Record<string, Omit<ItemData, "id">>) {
  for (const [id, data] of Object.entries(items)) itemCache[id] = { id, ...data };
}
async function fetchItem(id: string): Promise<ItemData | null> {
  if (id in itemCache) return itemCache[id]!;
  try {
    const res = await fetch(`/api/srd/items?ids=${encodeURIComponent(id)}`);
    if (!res.ok) return (itemCache[id] = null);
    const data = await res.json();
    const hit = data?.[id];
    itemCache[id] = hit ? ({ id, ...hit } as ItemData) : null;
    return itemCache[id];
  } catch {
    return (itemCache[id] = null);
  }
}

// ── Shared Czech label maps (ability + skill descriptions) ───────────────────

export const ABILITY_TIP: Record<string, string> = {
  str: "Síla — fyzická zdatnost a atletika. Ovlivňuje útoky na blízko, hody na udržení a nošení těžkých věcí.",
  dex: "Obratnost — hbitost a reflexy. Ovlivňuje iniciativu, útoky zbraněmi na dálku a lehké zbroje.",
  con: "Odolnost — zdraví a výdrž. Určuje maximum životů a záchranné hody na výdrž.",
  int: "Inteligence — paměť a analytické myšlení. Základ kouzelníka; ovlivňuje Mystiku, Historii a Přírodu.",
  wis: "Moudrost — vnímavost a intuice. Základ klerika a druida; ovlivňuje Vnímání, Vhled a Přežití.",
  cha: "Charisma — síla osobnosti a přesvědčivost. Základ barda a čaroděje; ovlivňuje Přesvědčování a Zastrašování.",
};

export const SKILL_TIP: Record<string, string> = {
  acrobatics: "Akrobacie (Obratnost) — udržíš rovnováhu, uděláš kotrmelec nebo se vyhneš pádu.",
  "animal-handling": "Zacházení se zvířaty (Moudrost) — uklidníš zvíře, odhadneš jeho záměr nebo ho vycvičíš.",
  arcana: "Mystika (Inteligence) — znáš kouzla, magické předměty, kouzelné tradice a jiné sféry.",
  athletics: "Atletika (Síla) — šplháš, skáčeš, plaveš nebo překonáváš fyzické překážky.",
  deception: "Klamání (Charisma) — přimíš někoho uvěřit lži nebo odvedeš jeho pozornost.",
  history: "Historie (Inteligence) — vzpomínáš na historické události, osoby, války nebo starobylé civilizace.",
  insight: "Vhled (Moudrost) — odhadneš záměry nebo emoce druhé osoby; poznáš, zda lže.",
  intimidation: "Zastrašování (Charisma) — ovlivníš ostatní hrozbami, výslechem nebo agresivním přístupem.",
  investigation: "Pátrání (Inteligence) — hledáš stopy, analyzuješ scény a rozluštíš záhady.",
  medicine: "Medicína (Moudrost) — stabilizuješ umírajícího, diagnostikuješ nemoc nebo ošetříš zranění.",
  nature: "Příroda (Inteligence) — znáš zvířata, rostliny, počasí, terén a přírodní cykly.",
  perception: "Vnímání (Moudrost) — zachytíš skryté tvory, neobvyklé předměty nebo hrozby ve svém okolí.",
  performance: "Vystupování (Charisma) — zahraješ, zazpíváš nebo jinak zaujmeš publikum.",
  persuasion: "Přesvědčování (Charisma) — ovlivníš ostatní taktním přístupem a vhodně volenými argumenty.",
  religion: "Náboženství (Inteligence) — znáš božstva, obřady, modlitby a posvátná písma.",
  "sleight-of-hand": "Šikovné ruce (Obratnost) — kapesní krádež, schovávání předmětů nebo prestidigitace.",
  stealth: "Nenápadnost (Obratnost) — pohybuješ se tiše a skrytě, aniž by si tě kdo všiml.",
  survival: "Přežití (Moudrost) — stopuješ, lovíš, orientuješ se v divočině nebo předpovídáš počasí.",
};


// Renders into document.body so it's never clipped by overflow or hidden behind
// the Leaflet map layer. Position is computed from the anchor element's viewport
// rect; clamped to viewport edges; flips above/below based on available space.

type TipPos = { left: number; y: number; above: boolean };

function computePos(anchor: HTMLElement): TipPos {
  const r = anchor.getBoundingClientRect();
  const W = 320;
  const cx = r.left + r.width / 2;
  const above = r.top > 220;
  return {
    left: Math.max(12, Math.min(cx - W / 2, window.innerWidth - W - 12)),
    y: above ? window.innerHeight - r.top + 8 : r.bottom + 8,
    above,
  };
}

function TipPortal({ pos, children }: { pos: TipPos; children: React.ReactNode }) {
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        zIndex: 9999,
        width: 320,
        left: pos.left,
        ...(pos.above ? { bottom: pos.y } : { top: pos.y }),
      }}
      className="pointer-events-none rounded-sm border border-surface2 bg-bg-crust p-3 text-left shadow-2xl"
    >
      {children}
    </div>,
    document.body,
  );
}

// Shared hook. Wrapper uses display:contents so it never breaks grid/flex layout.
// Position is taken from the first rendered child element.
function useTip(delay = 250) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<TipPos | null>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const span = wrapRef.current;
      if (!span) return;
      const anchor = (span.firstElementChild as HTMLElement | null) ?? span;
      setPos(computePos(anchor));
    }, delay);
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPos(null);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { wrapRef, pos, show, hide };
}

// ── Public components ──────────────────────────────────────────────────────────

/** Generic static tooltip. Wrap any element; show `content` on hover/focus. */
export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  const { wrapRef, pos, show, hide } = useTip();
  return (
    <span ref={wrapRef} style={{ display: "contents" }} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && <TipPortal pos={pos}>{content}</TipPortal>}
    </span>
  );
}

/** Wraps a spell chip and shows a full SRD card on hover. */
export function SpellCard({ id, children }: { id: string; children: React.ReactNode }) {
  const [spell, setSpell] = useState<SpellData | null>(null);
  const { wrapRef, pos, show: trigger, hide } = useTip();

  const show = () => {
    trigger();
    if (!spell) void fetchSpell(id).then(setSpell);
  };

  return (
    <span ref={wrapRef} style={{ display: "contents" }} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && (
        <TipPortal pos={pos}>
          {spell ? <SpellBody spell={spell} /> : <p className="font-log text-xs text-subtext0">načítám…</p>}
        </TipPortal>
      )}
    </span>
  );
}

function SpellBody({ spell }: { spell: SpellData }) {
  const levelLabel = spell.level === 0 ? "trik" : `${spell.level}. úroveň`;
  const schoolLabel = spell.school ? csSpellSchool(spell.school) : "";
  const flags = [spell.concentration && "soustředění", spell.ritual && "rituál"].filter(Boolean).join(", ");
  return (
    <>
      <p className="mb-0.5 font-display text-base text-text">{spell.name}</p>
      <p className="mb-1.5 font-log text-xs text-subtext0">
        {levelLabel}{schoolLabel ? ` · ${schoolLabel}` : ""}{flags ? ` · ${flags}` : ""}
      </p>
      {spell.casting_time && <Row label="Čas" value={spell.casting_time} />}
      {spell.range_ft !== undefined && <Row label="Dosah" value={`${spell.range_ft} ft`} />}
      {spell.duration && <Row label="Trvání" value={spell.duration} />}
      {spell.components && spell.components.length > 0 && <Row label="Složky" value={spell.components.join(", ")} />}
      {spell.description && (
        <p className="mt-1.5 line-clamp-6 font-body text-[13px] leading-snug text-subtext1">{spell.description}</p>
      )}
      {spell.higher_level && (
        <p className="mt-1 font-body text-xs italic leading-snug text-subtext0">{spell.higher_level}</p>
      )}
    </>
  );
}

/** Wraps a feat chip and shows its SRD description on hover. */
export function FeatCard({ id, children }: { id: string; children: React.ReactNode }) {
  const [feat, setFeat] = useState<FeatData | null>(null);
  const { wrapRef, pos, show: trigger, hide } = useTip();

  const show = () => {
    trigger();
    if (!feat) void fetchFeat(id).then(setFeat);
  };

  return (
    <span ref={wrapRef} style={{ display: "contents" }} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && (
        <TipPortal pos={pos}>
          {feat ? (
            <>
              <p className="mb-0.5 font-display text-base text-text">{feat.name}</p>
              {feat.prerequisites.length > 0 && (
                <p className="mb-1 font-log text-xs text-subtext0">Požadavky: {feat.prerequisites.join(", ")}</p>
              )}
              <p className="font-body text-[13px] leading-snug text-subtext1 line-clamp-6">{feat.description}</p>
            </>
          ) : (
            <p className="font-log text-xs text-subtext0">načítám…</p>
          )}
        </TipPortal>
      )}
    </span>
  );
}

/** Wraps a class/racial feature chip and shows its SRD description on hover (#42c). */
export function FeatureCard({ id, children }: { id: string; children: React.ReactNode }) {
  const [feature, setFeature] = useState<FeatureData | null>(null);
  const { wrapRef, pos, show: trigger, hide } = useTip();

  const show = () => {
    trigger();
    if (!feature) void fetchFeature(id).then(setFeature);
  };

  return (
    <span ref={wrapRef} style={{ display: "contents" }} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && (
        <TipPortal pos={pos}>
          {feature ? (
            <>
              <p className="mb-0.5 font-display text-base text-text">{feature.name}</p>
              {feature.level !== undefined && (
                <p className="mb-1 font-log text-xs text-subtext0">{feature.level}. úroveň</p>
              )}
              {feature.description ? (
                <p className="font-body text-[13px] leading-snug text-subtext1 line-clamp-6">{feature.description}</p>
              ) : (
                <p className="font-body text-xs italic text-subtext0">Popis není v datasetu.</p>
              )}
            </>
          ) : (
            <p className="font-log text-xs text-subtext0">načítám…</p>
          )}
        </TipPortal>
      )}
    </span>
  );
}

/** Wraps an inventory item and shows its SRD card (rarity/category/desc) on hover (#42c). */
export function ItemCard({ id, children }: { id: string; children: React.ReactNode }) {
  const [item, setItem] = useState<ItemData | null>(itemCache[id] ?? null);
  const { wrapRef, pos, show: trigger, hide } = useTip();

  const show = () => {
    trigger();
    if (!item) void fetchItem(id).then(setItem);
  };

  return (
    <span ref={wrapRef} style={{ display: "contents" }} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && (
        <TipPortal pos={pos}>
          {item ? (
            <>
              <p className="mb-0.5 font-display text-base text-text">{item.name}</p>
              <p className="mb-1.5 font-log text-xs text-subtext0">
                {[item.magic ? "magický předmět" : "vybavení", item.rarity, item.category].filter(Boolean).join(" · ")}
              </p>
              {item.description ? (
                <p className="font-body text-[13px] leading-snug text-subtext1 line-clamp-6">{item.description}</p>
              ) : (
                <p className="font-body text-xs italic text-subtext0">Bez dalšího popisu.</p>
              )}
            </>
          ) : (
            <p className="font-log text-xs text-subtext0">načítám…</p>
          )}
        </TipPortal>
      )}
    </span>
  );
}

/** Static condition tooltip — descriptions come from the Czech label map (#34/#42c). */
export function ConditionCard({ name, description, children }: { name: string; description: string; children: React.ReactNode }) {
  return (
    <Tip
      content={
        <>
          <p className="mb-0.5 font-display text-base text-text">{name}</p>
          <p className="font-body text-[13px] leading-snug text-subtext1 line-clamp-6">
            {description || "Popis není k dispozici."}
          </p>
        </>
      }
    >
      {children}
    </Tip>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5 font-log text-xs">
      <span className="shrink-0 text-subtext0">{label}:</span>
      <span className="text-subtext1">{value}</span>
    </div>
  );
}
