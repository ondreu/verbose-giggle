import { useEffect, useRef } from "react";
import type { LogEntry } from "@adm/schemas";
import { ROLL_KINDS, useGame } from "../store/store";
import { Icon } from "../components/Icon";

// Per-kind accent for roll cards (#33): border, text, and a soft tint.
const ROLL_STYLE: Record<string, { border: string; text: string; bg: string }> = {
  attack: { border: "border-gold/60", text: "text-gold", bg: "bg-gold/10" },
  damage: { border: "border-blood/60", text: "text-blood", bg: "bg-blood/10" },
  spell: { border: "border-arcane/60", text: "text-arcane", bg: "bg-arcane/10" },
  save: { border: "border-steel/60", text: "text-steel", bg: "bg-steel/10" },
  check: { border: "border-arcane/50", text: "text-arcane", bg: "bg-arcane/10" },
  "death-save": { border: "border-blood/60", text: "text-blood", bg: "bg-blood/10" },
  initiative: { border: "border-bone/50", text: "text-bone", bg: "bg-bone/10" },
};

/** Highlight the headline number/outcome so a roll reads at a glance. */
function emphasize(text: string) {
  const m = text.match(/(KRIT|krit|zásah|úspěch|minutí|neúspěch)/);
  if (!m) return text;
  const i = text.lastIndexOf(m[0]);
  return (
    <>
      {text.slice(0, i)}
      <span className="font-display font-semibold">{text.slice(i)}</span>
    </>
  );
}

/** A prominent animated dice-roll card (#33). `animate` only on the freshest entry. */
export function RollLine({ kind, text, animate }: { kind?: string; text: string; animate?: boolean }) {
  const style =
    (kind && ROLL_STYLE[kind]) || { border: "border-surface2", text: "text-subtext1", bg: "bg-bg-mantle/50" };
  return (
    <div
      className={`${animate ? "log-enter" : ""} mb-2 flex items-center gap-3 rounded-md border-2 ${style.border} ${style.bg} px-3 py-2 shadow-sm`}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${style.border} ${style.bg}`}
      >
        <Icon name="d20" size={20} className={`${animate ? "dice-rolling" : ""} ${style.text}`} />
      </span>
      <span className={`font-log text-sm font-medium leading-snug ${style.text}`}>{emphasize(text)}</span>
    </div>
  );
}

/**
 * Collapsible dice log (#51). The dice log is a bonus add-on, not the primary
 * read — surfacing every roll inline in the chat made auto-scroll constantly
 * interrupt the narrative. Here it lives in its own drawer (sourced from
 * `session.log`, which persists across reloads) with its own contained
 * auto-scroll, so it never tugs the story view. Collapsed by default.
 */
export function DiceLogPanel() {
  const open = useGame((s) => s.diceLogOpen);
  const toggle = useGame((s) => s.toggleDiceLog);
  const log = useGame((s) => s.session?.log ?? []);
  const rolls = log.filter((e: LogEntry) => ROLL_KINDS.has(e.kind));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll within the drawer only (never the chat), and only while open.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, rolls.length]);

  return (
    <div className="border-t border-black/60 bg-bg-mantle/40">
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 font-log text-[11px] uppercase tracking-wider text-subtext0 hover:text-gold"
        onClick={toggle}
        title="Deník kostek — zobrazit/skrýt"
      >
        <Icon name="d20" size={13} />
        deník kostek
        {rolls.length > 0 && (
          <span className="rounded-full bg-gold/20 px-1.5 text-[9px] font-semibold text-gold">{rolls.length}</span>
        )}
        <Icon name={open ? "undo" : "scroll"} size={11} className="ml-auto opacity-60" />
      </button>
      {open && (
        <div ref={scrollRef} className="max-h-48 overflow-y-auto px-3 pb-2 pt-1">
          {rolls.length === 0 ? (
            <p className="py-2 font-body text-xs italic text-subtext0">Zatím žádné hody.</p>
          ) : (
            rolls.map((e, i) => (
              <RollLine
                key={`${e.t}-${i}`}
                kind={e.kind}
                text={e.detail}
                animate={i === rolls.length - 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
