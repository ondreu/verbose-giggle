import { useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "./Icon";

/**
 * "Ukončit sezení" header action (#5). Confirms, then asks the server to write
 * the played session up as a chapter of the campaign chronicle and start a
 * clean session (durable character/world state is kept; the transcript is
 * cleared and re-hydrated via the `reload` event). The generated chapter is
 * shown so the player sees what was added to the book of the adventure.
 */
export function SessionEnd() {
  const endSession = useGame((s) => s.endSession);
  const busy = useGame((s) => s.busy);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"confirm" | "working" | "done" | "error">("confirm");
  const [chapter, setChapter] = useState("");
  const [error, setError] = useState("");

  const start = () => {
    setPhase("confirm");
    setChapter("");
    setError("");
    setOpen(true);
  };

  const run = async () => {
    setPhase("working");
    const res = await endSession();
    if (res.ok) {
      setChapter(res.chapter ?? "");
      setPhase("done");
    } else {
      setError(res.error ?? "Nepodařilo se uzavřít sezení.");
      setPhase("error");
    }
  };

  return (
    <>
      <button
        className="btn-ghost text-xs"
        title="Zapsat sezení do kroniky a začít načisto"
        onClick={start}
      >
        <Icon name="book" size={14} />
        Ukončit sezení
      </button>

      {open && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4" onClick={() => phase !== "working" && setOpen(false)}>
          <div className="panel flex max-h-[80vh] w-full max-w-2xl flex-col p-5" onClick={(e) => e.stopPropagation()}>
            <header className="mb-3 flex items-center gap-2">
              <Icon name="book" size={18} className="text-gold" />
              <h2 className="font-display text-xl text-text">Kronika dobrodružství</h2>
            </header>

            {phase === "confirm" && (
              <>
                <p className="font-body text-sm leading-relaxed text-subtext1">
                  Sezení se zapíše jako nová kapitola kroniky této kampaně — souvislé vyprávění toho, co
                  družina prožila. Poté začne <strong>čisté sezení</strong>: vymaže se chat a deník hodů,
                  ale postavy, úkoly a stav světa zůstanou. Příště navážeš s rekapitulací.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn-ghost text-sm" onClick={() => setOpen(false)}>Zpět</button>
                  <button className="btn-gold px-4 py-2 text-sm" disabled={busy} onClick={() => void run()}>
                    Zapsat a začít načisto
                  </button>
                </div>
              </>
            )}

            {phase === "working" && (
              <p className="animate-pulse py-6 text-center font-body italic text-subtext0">
                Kronikář spisuje kapitolu…
              </p>
            )}

            {phase === "done" && (
              <>
                <p className="mb-2 font-log text-[11px] uppercase tracking-wider text-subtext0">
                  Nová kapitola přidána do kroniky
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-surface1 bg-bg-crust/50 p-4">
                  {chapter
                    ? chapter.split(/\n\n+/).map((para, i) => (
                        <p key={i} className="mb-3 font-body text-[15px] leading-relaxed text-text last:mb-0">{para}</p>
                      ))
                    : <p className="font-body italic text-subtext0">Kapitola byla uložena.</p>}
                </div>
                <div className="mt-4 flex justify-end">
                  <button className="btn-gold px-4 py-2 text-sm" onClick={() => setOpen(false)}>Hotovo</button>
                </div>
              </>
            )}

            {phase === "error" && (
              <>
                <p className="py-4 font-body text-sm text-blood">{error}</p>
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost text-sm" onClick={() => setOpen(false)}>Zavřít</button>
                  <button className="btn-gold px-4 py-2 text-sm" disabled={busy} onClick={() => void run()}>Zkusit znovu</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
