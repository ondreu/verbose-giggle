import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { DiaryModal } from "./DiaryModal";
import { QuestLogModal } from "./QuestLogModal";
import { ReferenceModal } from "./ReferenceModal";

export function ChatPanel() {
  const narration = useGame((s) => s.narration);
  const busy = useGame((s) => s.busy);
  const thinking = useGame((s) => s.thinking);
  const aiActing = useGame((s) => s.aiActing);
  const error = useGame((s) => s.error);
  const ttsEnabled = useGame((s) => s.ttsEnabled);
  const ttsProvider = useGame((s) => s.ttsProvider);
  const speaking = useGame((s) => s.speaking);
  const sendAction = useGame((s) => s.sendAction);
  const toggleTts = useGame((s) => s.toggleTts);
  const setTtsProvider = useGame((s) => s.setTtsProvider);
  const stopSpeech = useGame((s) => s.stopSpeech);
  const speakLine = useGame((s) => s.speakLine);
  const recap = useGame((s) => s.recap);
  const undoTurn = useGame((s) => s.undoTurn);
  const generateImage = useGame((s) => s.generateImage);
  const imageLoading = useGame((s) => s.imageLoading);
  const activeQuests = useGame(
    (s) => Object.values(s.session?.quests ?? {}).filter((q) => q.status === "active").length,
  );
  const [input, setInput] = useState("");
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Follow streaming text: the last line grows without changing array length,
  // so key the scroll on its text length too (#32).
  const lastLen = narration[narration.length - 1]?.text.length ?? 0;
  // The most recent DM line carries the always-visible action rail; older DM
  // lines reveal it on hover (#47).
  const lastDmId = [...narration].reverse().find((l) => l.role === "dm")?.id ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [narration.length, lastLen, thinking, aiActing]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    void sendAction(text);
    setInput("");
  };

  return (
    <section className="panel flex h-full flex-col">
      {/* Top row: log & reference navigation (Shrnutí · Deník · Úkoly · Pravidla),
          with the global narration toggle anchored at the right. */}
      <header className="panel-title flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <span className="flex items-center gap-1.5">
          <Icon name="scroll" size={14} />
          Vyprávění
        </span>
        <div className="flex items-center gap-2.5">
          <NavBtn icon="document" label="shrnutí" title="Shrnout dosavadní děj" onClick={() => void recap()} disabled={busy} />
          <NavBtn icon="scroll" label="deník" title="Otevřít deník výpravy" onClick={() => setDiaryOpen(true)} />
          <NavBtn icon="quest" label="úkoly" title="Otevřít deník úkolů" onClick={() => setQuestsOpen(true)} badge={activeQuests} />
          <NavBtn icon="document" label="pravidla" title="Rejstřík pravidel (stavy, zranění, dovednosti…)" onClick={() => setRefOpen(true)} />
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {speaking && (
            <button
              className="flex items-center gap-1 font-log text-[11px] normal-case text-blood hover:text-gold"
              onClick={stopSpeech}
              title="Zastavit předčítání"
            >
              <Icon name="hourglass" size={12} />
              stop
            </button>
          )}
          {ttsEnabled && (
            <button
              className="font-log text-[11px] normal-case text-subtext0 hover:text-gold"
              onClick={() =>
                setTtsProvider(ttsProvider === "auto" ? "azure" : ttsProvider === "azure" ? "piper" : "auto")
              }
              title="Přepnout hlasový engine (auto → Azure → Piper)"
            >
              {ttsProvider}
            </button>
          )}
          <button
            className={`flex items-center gap-1 font-log text-[11px] normal-case ${ttsEnabled ? "text-gold" : "text-subtext0"}`}
            onClick={toggleTts}
            title="Předčítání nahlas zap/vyp"
          >
            <Icon name="speaker" size={13} />
            {ttsEnabled ? "hlas zap" : "hlas vyp"}
          </button>
        </div>
      </header>
      {diaryOpen && <DiaryModal onClose={() => setDiaryOpen(false)} />}
      {questsOpen && <QuestLogModal onClose={() => setQuestsOpen(false)} />}
      {refOpen && <ReferenceModal onClose={() => setRefOpen(false)} />}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {narration.length === 0 && (
          <p className="font-body italic text-subtext0">Svíce zaprská. Pán jeskyně čeká na tvůj první krok…</p>
        )}
        {narration.map((line) => {
          if (line.role === "roll") return <RollLine key={line.id} kind={line.kind} text={line.text} />;
          if (line.role === "player") return <PlayerMessage key={line.id} actor={line.actor} text={line.text} />;
          return (
            <DmMessage
              key={line.id}
              text={line.text}
              isLast={line.id === lastDmId}
              busy={busy}
              imageLoading={imageLoading}
              onSpeak={() => speakLine(line.text)}
              onUndo={() => void undoTurn()}
              onVisualize={() => void generateImage("scene", undefined, "Atmosféra scény")}
              onRegenerate={() => {
                /* #54: backend not wired yet. */
              }}
              onSwapModel={() => {
                /* #54: backend not wired yet. */
              }}
            />
          );
        })}
        {aiActing && (
          <p className="mb-2 flex items-center gap-1.5 font-display text-sm tracking-wide text-arcane">
            <Icon name="d20" size={14} className="animate-pulse" />
            {aiActing} koná svůj tah…
          </p>
        )}
        {thinking && (
          <p className="font-log text-xs text-arcane">
            <Icon name="d20" size={12} className="mr-1 inline animate-pulse" />
            engine: {thinking}…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="border-t border-blood/40 bg-blood/10 px-4 py-1.5 font-log text-xs text-blood">{error}</div>
      )}

      <div className="flex gap-2 border-t border-black/60 bg-bg-mantle/60 p-2">
        <textarea
          className="min-h-[2.6rem] flex-1 resize-none rounded-sm border border-surface1 bg-bg-crust px-3 py-2 font-body text-text outline-none focus:border-gold/60"
          placeholder="Co děláš? (Enter odešle, Shift+Enter nový řádek)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
        />
        <button className="btn-gold px-4 py-2 text-sm" onClick={submit} disabled={busy}>
          {busy ? "…" : "Konat"}
        </button>
      </div>
    </section>
  );
}

/** Compact text+icon button used in the chat's top navigation row. */
function NavBtn({
  icon,
  label,
  title,
  onClick,
  disabled,
  badge,
}: {
  icon: string;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: number;
}) {
  return (
    <button
      className="flex items-center gap-1 font-log text-[11px] normal-case text-subtext0 transition-colors hover:text-gold disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon name={icon} size={12} />
      {label}
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-gold/20 px-1 text-[9px] font-semibold text-gold">{badge}</span>
      )}
    </button>
  );
}

/** A player's stated action — a distinct labelled block (#47 "Hráčova zpráva"). */
function PlayerMessage({ actor, text }: { actor?: string; text: string }) {
  return (
    <div className="mb-4 rounded-sm border border-surface1 bg-bg-mantle/40 px-3 py-2">
      <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-gold">{actor ?? "Hráč"}</div>
      <p className="font-body italic text-subtext1">{text}</p>
    </div>
  );
}

/** A DM narration block with its always-visible action menu (#47 "AI zpráva"). */
function DmMessage({
  text,
  isLast,
  busy,
  imageLoading,
  onSpeak,
  onUndo,
  onVisualize,
  onRegenerate,
  onSwapModel,
}: {
  text: string;
  isLast: boolean;
  busy: boolean;
  imageLoading: boolean;
  onSpeak: () => void;
  onUndo: () => void;
  onVisualize: () => void;
  onRegenerate: () => void;
  onSwapModel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div className="mb-4 flex items-start gap-2">
      <div className="min-w-0 flex-1 font-body text-[1.12rem] font-medium leading-relaxed text-text">
        <Markdown text={text} />
      </div>
      {/* One always-visible menu button opens an attached popover of actions. */}
      <div className="relative shrink-0">
        <button
          className={`mt-1 grid h-7 w-7 place-items-center rounded-sm border transition-colors ${
            open ? "border-gold/50 bg-gold/10 text-gold" : "border-transparent text-subtext0 hover:border-gold/40 hover:bg-gold/10 hover:text-gold"
          }`}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Akce zprávy"
        >
          <Icon name="dots" size={16} />
        </button>
        {open && (
          <>
            {/* Click-away backdrop. */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              role="menu"
              className="panel absolute right-0 z-50 mt-1 flex w-52 flex-col py-1"
            >
              <MenuItem icon="speaker" label="Předčíst zprávu" onClick={run(onSpeak)} />
              {isLast && <MenuItem icon="undo" label="Vrátit tah" onClick={run(onUndo)} disabled={busy} />}
              <MenuItem icon="camera" label="Vizualizovat scénu" onClick={run(onVisualize)} disabled={busy || imageLoading} />
              <div className="my-1 border-t border-surface1" />
              <MenuItem icon="refresh" label="Regenerovat" onClick={run(onRegenerate)} />
              <MenuItem icon="swap" label="Jiným modelem" onClick={run(onSwapModel)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One row inside the per-message action popover. */
function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      className="flex items-center gap-2.5 px-3 py-1.5 text-left font-body text-sm text-subtext1 transition-colors hover:bg-gold/10 hover:text-gold disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-subtext1"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

// Per-kind accent for inline roll cards (#33): border, text, and a soft tint.
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

/** A prominent animated dice-roll card shown inline in the narration (#33). */
function RollLine({ kind, text }: { kind?: string; text: string }) {
  const style =
    (kind && ROLL_STYLE[kind]) || { border: "border-surface2", text: "text-subtext1", bg: "bg-bg-mantle/50" };
  return (
    <div
      className={`log-enter mb-3 flex items-center gap-3 rounded-md border-2 ${style.border} ${style.bg} px-3 py-2.5 shadow-sm`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${style.border} ${style.bg}`}>
        <Icon name="d20" size={24} className={`dice-rolling ${style.text}`} />
      </span>
      <span className={`font-log text-sm font-medium leading-snug ${style.text}`}>{emphasize(text)}</span>
    </div>
  );
}
