import { useEffect, useRef } from "react";
import { useGame } from "../store/store";
import { Icon } from "./Icon";

export function ImageModal() {
  const lastImage = useGame((s) => s.lastImage);
  const imageLoading = useGame((s) => s.imageLoading);
  const imageError = useGame((s) => s.imageError);
  const closeImage = useGame((s) => s.closeImage);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeImage();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [closeImage]);

  if (!imageLoading && !lastImage && !imageError) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) closeImage();
      }}
    >
      <div className="panel relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl">
        <header className="flex items-center gap-2 border-b border-black px-4 py-2">
          <Icon name="scroll" size={14} className="text-gold" />
          <span className="font-display text-sm tracking-wide">
            {lastImage?.label ?? "Vizualizace"}
          </span>
          <button
            className="ml-auto text-subtext0 hover:text-gold"
            onClick={closeImage}
            title="Zavřít (Esc)"
          >
            <Icon name="skull" size={14} />
          </button>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center overflow-auto p-4">
          {imageLoading && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Icon name="d20" size={32} className="animate-pulse text-gold" />
              <span className="font-display text-sm tracking-widest text-subtext0">
                Vize se formuje…
              </span>
            </div>
          )}

          {imageError && (
            <div className="rounded-sm border border-blood/40 bg-blood/10 px-4 py-3 font-log text-sm text-blood">
              {imageError}
            </div>
          )}

          {lastImage && (
            <>
              <img
                src={lastImage.url}
                alt={lastImage.label}
                className="max-h-[65vh] w-full rounded-sm object-contain shadow-lg"
              />
              <p className="mt-3 max-w-prose text-center font-log text-[11px] leading-relaxed text-subtext0">
                {lastImage.prompt}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
