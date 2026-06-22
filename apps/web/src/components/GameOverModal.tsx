import { useEffect, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "./Icon";
import { CharacterCreate } from "./CharacterCreate";

/**
 * Terminal game-over screen (#23). Shown when the campaign reaches an `ending`
 * state — a fallen hero who failed their death saves. A dead character is not
 * recoverable in play, so the only ways forward are rolling back to an earlier
 * save or returning to the main menu.
 */
export function GameOverModal() {
  const ending = useGame((s) => s.session?.ending ?? null);
  const snapshots = useGame((s) => s.snapshots);
  const listSnapshots = useGame((s) => s.listSnapshots);
  const restoreSnapshot = useGame((s) => s.restoreSnapshot);
  const busy = useGame((s) => s.busy);
  const setView = useGame((s) => s.setView);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (ending) void listSnapshots();
  }, [ending, listSnapshots]);

  if (!ending) return null;
  // The creation modal clears `session.ending` server-side on success, which
  // unmounts this overlay automatically — no manual dismissal needed.
  if (creating) return <CharacterCreate onClose={() => setCreating(false)} />;
  const latest = snapshots[0];

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-bg-crust/85 p-6 backdrop-blur-sm">
      <div className="parchment flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
        <Icon name="skull" size={56} className="text-blood" />
        <h2 className="font-display text-2xl tracking-wide text-blood">Konec výpravy</h2>
        <p className="font-body text-ink">{ending.reason}</p>
        <p className="font-body text-sm italic text-ink/60">
          Mrtvou postavu nelze v běžné hře oživit. Vytvoř si novou postavu a pokračuj, vrať se k
          poslední záloze, nebo začni znovu z hlavní nabídky.
        </p>

        <div className="mt-2 flex w-full flex-col gap-2">
          <button
            className="btn-gold w-full px-4 py-2 text-sm"
            onClick={() => setCreating(true)}
          >
            Vytvořit novou postavu
          </button>
          <button
            className="w-full rounded-sm border border-ink/30 bg-ink/10 px-4 py-2 font-display text-sm hover:bg-ink/20 disabled:opacity-50"
            disabled={busy || !latest}
            onClick={() => latest && void restoreSnapshot(latest.id)}
          >
            {latest ? `Načíst poslední zálohu (${latest.label})` : "Žádná záloha k dispozici"}
          </button>
          <button
            className="w-full rounded-sm border border-ink/30 bg-ink/10 px-4 py-2 font-display text-sm hover:bg-ink/20"
            onClick={() => setView("home")}
          >
            Hlavní nabídka
          </button>
        </div>
      </div>
    </div>
  );
}
