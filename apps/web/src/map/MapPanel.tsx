import { useEffect, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { OverworldMap } from "./OverworldMap";
import { TacticalGrid } from "./TacticalGrid";

type Mode = "overworld" | "tactical";

/**
 * Hosts the two map systems sharing one hierarchy (§10): the authored,
 * image-based overworld zooms down to the per-encounter tactical grid. Combat
 * auto-switches to the grid; otherwise the overworld is shown. A manual toggle
 * lets the table override.
 */
export function MapPanel() {
  const inCombat = useGame((s) => s.session?.combat != null);
  const [manual, setManual] = useState<Mode | null>(null);

  // Follow combat unless the user has explicitly overridden the mode.
  useEffect(() => {
    setManual(null);
  }, [inCombat]);

  const mode: Mode = manual ?? (inCombat ? "tactical" : "overworld");

  return (
    <section className="panel flex h-full flex-col">
      <header className="panel-title flex items-center gap-2 px-3 py-2">
        <Icon name={mode === "tactical" ? "skull" : "compass"} size={14} />
        {mode === "tactical" ? "Bojiště" : "Kraj"}
        <div className="ml-auto flex gap-1">
          <ModeButton active={mode === "overworld"} onClick={() => setManual("overworld")} icon="compass" label="Kraj" />
          <ModeButton active={mode === "tactical"} onClick={() => setManual("tactical")} icon="skull" label="Bitva" />
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {mode === "tactical" ? <TacticalGrid embedded /> : <OverworldMap />}
      </div>
    </section>
  );
}


function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-log text-[10px] uppercase tracking-wider ${
        active ? "border-gold/60 text-gold" : "border-surface2 text-subtext0 hover:text-subtext1"
      }`}
    >
      <Icon name={icon} size={11} />
      {label}
    </button>
  );
}
