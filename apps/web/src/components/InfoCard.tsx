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

// ── Portal tooltip infrastructure ─────────────────────────────────────────────
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
          {spell ? <SpellBody spell={spell} /> : <p className="font-log text-[11px] text-subtext0">načítám…</p>}
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
      <p className="mb-0.5 font-display text-sm text-text">{spell.name}</p>
      <p className="mb-1.5 font-log text-[10px] text-subtext0">
        {levelLabel}{schoolLabel ? ` · ${schoolLabel}` : ""}{flags ? ` · ${flags}` : ""}
      </p>
      {spell.casting_time && <Row label="Čas" value={spell.casting_time} />}
      {spell.range_ft !== undefined && <Row label="Dosah" value={`${spell.range_ft} ft`} />}
      {spell.duration && <Row label="Trvání" value={spell.duration} />}
      {spell.components && spell.components.length > 0 && <Row label="Složky" value={spell.components.join(", ")} />}
      {spell.description && (
        <p className="mt-1.5 line-clamp-6 font-body text-[11px] leading-snug text-subtext1">{spell.description}</p>
      )}
      {spell.higher_level && (
        <p className="mt-1 font-body text-[10px] italic leading-snug text-subtext0">{spell.higher_level}</p>
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
              <p className="mb-0.5 font-display text-sm text-text">{feat.name}</p>
              {feat.prerequisites.length > 0 && (
                <p className="mb-1 font-log text-[10px] text-subtext0">Požadavky: {feat.prerequisites.join(", ")}</p>
              )}
              <p className="font-body text-[11px] leading-snug text-subtext1 line-clamp-6">{feat.description}</p>
            </>
          ) : (
            <p className="font-log text-[11px] text-subtext0">načítám…</p>
          )}
        </TipPortal>
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
