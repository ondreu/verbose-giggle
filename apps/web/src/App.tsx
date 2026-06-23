import { useEffect, useState } from "react";
import { useGame } from "./store/store";
import { PlaySurface } from "./components/PlaySurface";
import { TargetPicker } from "./components/TargetPicker";
import { Icon } from "./components/Icon";
import { ImageModal } from "./components/ImageModal";
import { SettingsModal } from "./components/SettingsModal";
import { StartMenu } from "./components/StartMenu";
import { GameOverModal } from "./components/GameOverModal";
import { EmberField } from "./components/EmberField";

export default function App() {
  const hydrate = useGame((s) => s.hydrate);
  const connect = useGame((s) => s.connect);
  const connected = useGame((s) => s.connected);
  const campaign = useGame((s) => s.campaign);
  const time = useGame((s) => s.session?.time);
  const view = useGame((s) => s.view);
  const setView = useGame((s) => s.setView);
  const intro = useGame((s) => s.intro);
  const narrationLen = useGame((s) => s.narration.length);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void hydrate();
    connect();
  }, [hydrate, connect]);

  // Fresh campaign with no narration yet → ask the DM for an opening scene (#31).
  useEffect(() => {
    if (view === "play" && campaign && narrationLen === 0) void intro();
  }, [view, campaign, narrationLen, intro]);

  if (view === "home") {
    return (
      <>
        <EmberField />
        <ImageModal />
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        <StartMenu onSettings={() => setSettingsOpen(true)} />
      </>
    );
  }

  return (
    <>
      <EmberField />
      <div className="relative z-10 flex h-full flex-col">
        <ImageModal />
      <GameOverModal />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <header className="flex items-center gap-3 border-b border-black bg-bg-mantle px-4 py-2">
        <button
          className="text-subtext0 transition-colors hover:text-gold"
          title="Domů / hlavní nabídka"
          aria-label="Domů"
          onClick={() => setView("home")}
        >
          <Icon name="d20" size={22} className="text-gold" />
        </button>
        <h1 className="font-display text-lg tracking-wide">{campaign?.name ?? "Pán jeskyně"}</h1>
        {time && (
          <span className="ml-2 flex items-center gap-1 font-log text-xs text-subtext0">
            <Icon name="hourglass" size={12} />
            den {time.day}, {String(time.hour).padStart(2, "0")}:00
          </span>
        )}
        <span
          className="ml-auto flex items-center gap-1.5 font-log text-[11px] text-subtext0"
          title={connected ? "Spojeno se serverem" : "Odpojeno"}
        >
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-verdigris" : "bg-blood"}`} />
          {connected ? "spojeno" : "odpojeno"}
        </span>
        <button
          className="btn-ghost text-xs"
          title="Hlavní nabídka (kampaně, tvorba postavy, zálohy)"
          onClick={() => setView("home")}
        >
          <Icon name="compass" size={14} />
          Nabídka
        </button>
        <button
          className="text-subtext0 transition-colors hover:text-gold"
          title="Nastavení"
          aria-label="Nastavení"
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="gear" size={18} />
        </button>
      </header>

      {/* Play surface: narration + map are the focal point; mechanics rail at
          right. Columns are resizable with persisted widths (#11). */}
      <PlaySurface />
        {/* Global target chooser (#38): list / free-text / click a token on the map. */}
        <TargetPicker />
      </div>
    </>
  );
}
