import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { DiaryModal } from "./DiaryModal";


export function ChatPanel() {
  const narration = useGame((s) => s.narration);
  const busy = useGame((s) => s.busy);
  const thinking = useGame((s) => s.thinking);
  const aiActing = useGame((s) => s.aiActing);
  const error = useGame((s) => s.error);
  const ttsEnabled = useGame((s) => s.ttsEnabled);
  const sendAction = useGame((s) => s.sendAction);
  const toggleTts = useGame((s) => s.toggleTts);
  const recap = useGame((s) => s.recap);
  const generateImage = useGame((s) => s.generateImage);
  const imageLoading = useGame((s) => s.imageLoading);
  const [input, setInput] = useState("");
  const [diaryOpen, setDiaryOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [narration.length, thinking, aiActing]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    void sendAction(text);
    setInput("");
  };

  return (
    <section className="panel flex h-full flex-col">
      <header className="panel-title flex items-center gap-2 px-3 py-2">
        <Icon name="scroll" size={14} />
        Vyprávění
        <div className="ml-auto flex items-center gap-2.5">
          <button
            className="flex items-center gap-1 font-log text-[11px] normal-case text-subtext0 hover:text-gold disabled:opacity-50"
            onClick={() => void recap()}
            disabled={busy}
            title="Shrnout dosavadní děj"
          >
            <Icon name="hourglass" size={12} />
            shrnutí
          </button>
          <button
            className="flex items-center gap-1 font-log text-[11px] normal-case text-subtext0 hover:text-gold"
            onClick={() => setDiaryOpen(true)}
            title="Otevřít deník výpravy"
          >
            <Icon name="scroll" size={12} />
            deník
          </button>
          <button
            className="flex items-center gap-1 font-log text-[11px] normal-case text-subtext0 hover:text-gold disabled:opacity-50"
            onClick={() => void generateImage("scene", undefined, "Atmosféra scény")}
            disabled={busy || imageLoading}
            title="Vygenerovat obrázek aktuální scény"
          >
            <Icon name="scroll" size={12} />
            {imageLoading ? "…" : "vizualizovat"}
          </button>
          <button
            className={`flex items-center gap-1 font-log text-[11px] normal-case ${
              ttsEnabled ? "text-gold" : "text-subtext0"
            }`}
            onClick={toggleTts}
            title="Předčítání nahlas (Piper TTS)"
          >
            <Icon name="flame" size={12} />
            {ttsEnabled ? "hlas zap" : "hlas vyp"}
          </button>
        </div>
      </header>
      {diaryOpen && <DiaryModal onClose={() => setDiaryOpen(false)} />}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {narration.length === 0 && (
          <p className="font-body italic text-subtext0">
            Svíce zaprská. Pán jeskyně čeká na tvůj první krok…
          </p>
        )}
        {narration.map((line) => (
          <div
            key={line.id}
            className={
              line.role === "dm"
                ? "mb-4 font-body text-[1.05rem] leading-relaxed text-text"
                : "mb-4 border-l-2 border-gold/40 pl-3 font-body italic text-subtext1"
            }
          >
            {line.role === "dm" ? (
              <Markdown text={line.text} />
            ) : (
              <p>
                <span className="mr-1 font-display text-xs uppercase tracking-wider text-gold">
                  {line.actor ?? "Hráč"} ·{" "}
                </span>
                {line.text}
              </p>
            )}
          </div>
        ))}
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
        <div className="border-t border-blood/40 bg-blood/10 px-4 py-1.5 font-log text-xs text-blood">
          {error}
        </div>
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
