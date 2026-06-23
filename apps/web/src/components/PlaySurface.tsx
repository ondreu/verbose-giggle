import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../panels/ChatPanel";
import { MapPanel } from "../map/MapPanel";
import { SheetPanel } from "../panels/SheetPanel";
import { TurnTracker } from "../panels/TurnTracker";
import { InventoryPanel } from "../panels/InventoryPanel";
import { DiceLog } from "../panels/DiceLog";

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
        <aside className="flex min-h-0 flex-col gap-3">
          <SheetPanel />
          <TurnTracker />
          <InventoryPanel />
          <div className="min-h-[14rem]"><DiceLog /></div>
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
      <div className="min-h-0 min-w-0"><MapPanel /></div>
      <Splitter onPointerDown={startDrag("rail")} />
      <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto">
        <SheetPanel />
        <TurnTracker />
        <InventoryPanel />
        <div className="min-h-[14rem] flex-1"><DiceLog /></div>
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
