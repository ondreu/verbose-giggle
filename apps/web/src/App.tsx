import { useEffect } from "react";
import { useGame } from "./store/store";
import { ChatPanel } from "./panels/ChatPanel";
import { DiceLog } from "./panels/DiceLog";
import { SheetPanel } from "./panels/SheetPanel";
import { TurnTracker } from "./panels/TurnTracker";
import { InventoryPanel } from "./panels/InventoryPanel";
import { TacticalGrid } from "./map/TacticalGrid";
import { Icon } from "./components/Icon";

export default function App() {
  const hydrate = useGame((s) => s.hydrate);
  const connect = useGame((s) => s.connect);
  const connected = useGame((s) => s.connected);
  const campaign = useGame((s) => s.campaign);
  const time = useGame((s) => s.session?.time);

  useEffect(() => {
    void hydrate();
    connect();
  }, [hydrate, connect]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-black bg-bg-mantle px-4 py-2">
        <Icon name="d20" size={22} className="text-gold" />
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
      </header>

      {/* Play surface: narration + map are the focal point; mechanics rail at right. */}
      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_22rem]">
        <div className="min-h-0">
          <ChatPanel />
        </div>
        <div className="min-h-0">
          <TacticalGrid />
        </div>
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <SheetPanel />
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
