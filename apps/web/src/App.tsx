import { useEffect, useState } from "react";
import { useGame } from "./store/store";
import { ChatPanel } from "./panels/ChatPanel";
import { DiceLog } from "./panels/DiceLog";
import { SheetPanel } from "./panels/SheetPanel";
import { ActionsPanel } from "./panels/ActionsPanel";
import { TurnTracker } from "./panels/TurnTracker";
import { InventoryPanel } from "./panels/InventoryPanel";
import { MapPanel } from "./map/MapPanel";
import { Icon } from "./components/Icon";
import { ImageModal } from "./components/ImageModal";
import { SettingsModal } from "./components/SettingsModal";
import { StartMenu } from "./components/StartMenu";

export default function App() {
  const hydrate = useGame((s) => s.hydrate);
  const connect = useGame((s) => s.connect);
  const connected = useGame((s) => s.connected);
  const campaign = useGame((s) => s.campaign);
  const time = useGame((s) => s.session?.time);
  const view = useGame((s) => s.view);
  const setView = useGame((s) => s.setView);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void hydrate();
    connect();
  }, [hydrate, connect]);

  if (view === "home") {
    return (
      <>
        <ImageModal />
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        <StartMenu onSettings={() => setSettingsOpen(true)} />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ImageModal />
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
          className="flex items-center gap-1.5 rounded-sm border border-surface2 px-2.5 py-1 font-log text-xs text-subtext1 transition-colors hover:border-gold/60 hover:text-gold"
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

      {/* Play surface: narration + map are the focal point; mechanics rail at right. */}
      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_22rem]">
        <div className="min-h-0">
          <ChatPanel />
        </div>
        <div className="min-h-0">
          <MapPanel />
        </div>
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <SheetPanel />
          <ActionsPanel />
          <TurnTracker />
          <InventoryPanel />
          <div className="min-h-[14rem] flex-1">
            <DiceLog />
          </div>
        </aside>
      </main>
    </div>
  );
}
