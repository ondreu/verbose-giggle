import { useEffect, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";

/** Read-only viewer for the append-only session diary (§6.6 handoff surface). */
export function DiaryModal({ onClose }: { onClose: () => void }) {
  const fetchLog = useGame((s) => s.fetchLog);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    void fetchLog().then(setText);
  }, [fetchLog]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-bg-crust/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="parchment flex max-h-[80vh] w-full max-w-2xl flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-ink/20 pb-2">
          <Icon name="scroll" size={18} className="text-ink" />
          <h2 className="font-display text-lg">Deník výpravy</h2>
          <button className="ml-auto font-log text-sm text-ink/60 hover:text-ink" onClick={onClose}>
            zavřít ✕
          </button>
        </div>
        <div className="overflow-y-auto">
          {text === null ? (
            <p className="font-body italic text-ink/60">Načítám…</p>
          ) : text.trim() === "" ? (
            <p className="font-body italic text-ink/60">
              Deník je zatím prázdný. Naplní se, jakmile se bude hrát.
            </p>
          ) : (
            <Markdown text={text} className="font-body text-[15px] leading-relaxed text-ink" />
          )}
        </div>
      </div>
    </div>
  );
}
