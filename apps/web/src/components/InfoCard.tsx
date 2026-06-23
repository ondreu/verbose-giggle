import { useEffect, useRef, useState } from "react";
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

/** Lazily fetched SRD spell data cached for the session. */
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

/** Floating card that appears on hover/focus over its children. */
function TooltipCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-[3000] mb-1.5 w-64 -translate-x-1/2 rounded-sm border border-surface2 bg-bg-crust p-2.5 text-left shadow-xl"
    >
      {children}
    </div>
  );
}

/**
 * Wraps a spell button/chip and shows an SRD hover card on focus/hover (#42a).
 * Fetches spell data lazily and caches it for the session lifetime.
 */
export function SpellCard({ id, children }: { id: string; children: React.ReactNode }) {
  const [spell, setSpell] = useState<SpellData | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), 300);
    if (!spell) void fetchSpell(id).then(setSpell);
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!spell || !visible) {
    return (
      <span className="relative" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        {children}
      </span>
    );
  }

  const levelLabel = spell.level === 0 ? "trik" : `${spell.level}. úroveň`;
  const schoolLabel = spell.school ? csSpellSchool(spell.school) : "";
  const flagBits = [
    spell.concentration && "soustředění",
    spell.ritual && "rituál",
  ].filter(Boolean).join(", ");

  return (
    <span className="relative" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <TooltipCard>
          <p className="mb-0.5 font-display text-sm text-text">{spell.name}</p>
          <p className="mb-1.5 font-log text-[10px] text-subtext0">
            {levelLabel}{schoolLabel ? ` · ${schoolLabel}` : ""}
            {flagBits ? ` · ${flagBits}` : ""}
          </p>
          {spell.casting_time && (
            <Row label="Čas" value={spell.casting_time} />
          )}
          {spell.range_ft !== undefined && (
            <Row label="Dosah" value={`${spell.range_ft} ft`} />
          )}
          {spell.duration && (
            <Row label="Trvání" value={spell.duration} />
          )}
          {spell.components && spell.components.length > 0 && (
            <Row label="Složky" value={spell.components.join(", ")} />
          )}
          {spell.description && (
            <p className="mt-1.5 line-clamp-4 font-body text-[11px] leading-snug text-subtext1">
              {spell.description}
            </p>
          )}
          {spell.higher_level && (
            <p className="mt-1 font-body text-[10px] italic leading-snug text-subtext0">
              {spell.higher_level}
            </p>
          )}
        </TooltipCard>
      )}
    </span>
  );
}

/**
 * Wraps a feat chip and shows its SRD description on hover (#42c).
 */
export function FeatCard({ id, children }: { id: string; children: React.ReactNode }) {
  const [feat, setFeat] = useState<FeatData | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), 300);
    if (!feat) void fetchFeat(id).then(setFeat);
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <span className="relative" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && feat?.description && (
        <TooltipCard>
          <p className="mb-0.5 font-display text-sm text-text">{feat.name}</p>
          {feat.prerequisites.length > 0 && (
            <p className="mb-1 font-log text-[10px] text-subtext0">
              Požadavky: {feat.prerequisites.join(", ")}
            </p>
          )}
          <p className="font-body text-[11px] leading-snug text-subtext1 line-clamp-5">
            {feat.description}
          </p>
        </TooltipCard>
      )}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5 font-log text-[10px]">
      <span className="shrink-0 text-subtext0">{label}:</span>
      <span className="text-subtext1">{value}</span>
    </div>
  );
}
