import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/store";
import { ChatPanel } from "../panels/ChatPanel";
import { MapPanel } from "../map/MapPanel";
import { SheetPanel } from "../panels/SheetPanel";
import { PartyPanel } from "../panels/PartyPanel";
import { TurnTracker } from "../panels/TurnTracker";
import { InventoryPanel } from "../panels/InventoryPanel";

// The three-column play surface, resizable via draggable splitters with sizes
// persisted to localStorage (#11). Widths are stored as fractions of the total
// so they survive window resizing; the middle (map) column takes the remainder.
const LAYOUT_KEY = "adm.layout";
const DEFAULT = { chat: 0.32, rail: 0.26 };
const MIN_CHAT = 0.18;
const MIN_RAIL = 0.18;
const MIN_MAP = 0.2;

interface Layout {
  chat: number;
  rail: number;
}

function loadLayout(): Layout {
  try {
    const r = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "");
    if (typeof r?.chat === "number" && typeof r?.rail === "number") return clamp(r);
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT };
}

function clamp({ chat, rail }: Layout): Layout {
  const c = Math.max(MIN_CHAT, Math.min(chat, 1 - MIN_RAIL - MIN_MAP));
  const r = Math.max(MIN_RAIL, Math.min(rail, 1 - c - MIN_MAP));
  return { chat: c, rail: r };
}

export function PlaySurface() {
  const ref = useRef<HTMLDivElement>(null);
  const inCombat = useGame((s) => s.session?.combat != null);
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [desktop, setDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      /* best-effort */
    }
  }, [layout]);

  const startDrag = (which: keyof Layout) => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const total = ref.current?.getBoundingClientRect().width ?? 1;
    const start = layout[which];
    const move = (ev: PointerEvent) => {
      // The chat handle grows the left column rightward; the rail handle grows
      // the right column leftward (hence the sign flip).
      const delta = ((ev.clientX - startX) / total) * (which === "rail" ? -1 : 1);
      setLayout((l) => clamp({ ...l, [which]: start + delta }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Below lg, stack the columns (no splitters) — matches the prior responsive layout.
  if (!desktop) {
    return (
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3">
        <div className="min-h-[60vh]"><ChatPanel /></div>
        <div className="min-h-[60vh]"><MapPanel /></div>
        {inCombat && <TurnTracker />}
        <aside className="flex min-h-0 flex-col gap-3">
          <PartyPanel />
          <SheetPanel />
          <InventoryPanel />
        </aside>
      </main>
    );
  }

  const map = Math.max(MIN_MAP, 1 - layout.chat - layout.rail);
  return (
    <main
      ref={ref}
      className="grid min-h-0 flex-1 gap-0 p-3"
      style={{ gridTemplateColumns: `${layout.chat}fr 0.6rem ${map}fr 0.6rem ${layout.rail}fr` }}
    >
      <div className="min-h-0 min-w-0"><ChatPanel /></div>
      <Splitter onPointerDown={startDrag("chat")} />
      {/* Middle column: the map fills it; combat turn-order/HP docks below (per
          the #47 sketch: "Pořadí tahu a informace z boje" under the map). */}
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="min-h-0 flex-1"><MapPanel /></div>
        {inCombat && <div className="max-h-[40%] shrink-0 overflow-y-auto"><TurnTracker /></div>}
      </div>
      <Splitter onPointerDown={startDrag("rail")} />
      {/* Right rail: the party tab strip stays pinned at the top and sits flush on
          the parchment sheet; the sheet (with its actions) and the inventory each
          scroll on their own so the rail as a whole never scrolls (#47). */}
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="shrink-0"><PartyPanel /></div>
        <div className="min-h-0 flex-1 overflow-y-auto"><SheetPanel /></div>
        <div className="mt-3 max-h-[38%] shrink-0 overflow-y-auto"><InventoryPanel /></div>
      </aside>
    </main>
  );
}

/** A draggable column divider. */
function Splitter({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      title="Táhni pro změnu šířky"
      className="group flex cursor-col-resize items-center justify-center"
    >
      <div className="h-16 w-1 rounded-full bg-surface2 transition-colors group-hover:bg-gold/60" />
    </div>
  );
}
