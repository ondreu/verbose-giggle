import { useMemo, useRef, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";

/**
 * Procedurally-drawn overworld map (#8). Instead of an AI-generated backdrop
 * image, the region is rendered in-app as an aged-parchment cartographic SVG —
 * the same "drawn by the engine, not photographed" approach the tactical grid
 * uses. Location nodes sit at their authored 0..1 coords; ink paths trace the
 * known travel network; fog hides the undiscovered. Click a connected node to
 * travel. Kept alongside the classic Leaflet/image map so the experiment is a
 * one-toggle revert (see MapPanel).
 */
const W = 960;
const H = 680;
const PAD = 70; // keep nodes off the parchment's edge
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;

type Pt = { x: number; y: number };
// Authored coords are 0..1 ratios (§10.1); map them into the padded canvas.
const place = (c: Pt): Pt => ({ x: PAD + c.x * (W - 2 * PAD), y: PAD + c.y * (H - 2 * PAD) });

export function ProceduralOverworld() {
  const session = useGame((s) => s.session);
  const locations = useGame((s) => s.locations);
  const sendCommand = useGame((s) => s.sendCommand);
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [panMode, setPanMode] = useState(false);

  const current = session?.current_location ?? "";
  const revealed = useMemo(() => new Set(session?.revealed_locations ?? []), [session?.revealed_locations]);

  // Resolve which nodes are visible (known or a foggy direct connection), mirroring
  // the Leaflet overworld's fog-of-war so the two renderers agree (§10.1).
  const { nodes, edges } = useMemo(() => {
    const currentNode = locations[current];
    const connections = new Set((currentNode?.connections ?? []).map((c) => c.to));
    const visible: { id: string; name: string; pos: Pt; isCurrent: boolean; fog: boolean; travel?: string }[] = [];
    for (const loc of Object.values(locations)) {
      if (!loc.coords) continue;
      const isCurrent = loc.id === current;
      const known = isCurrent || revealed.has(loc.id) || loc.discovered;
      const connected = connections.has(loc.id);
      if (!known && !connected) continue;
      const edge = currentNode?.connections.find((c) => c.to === loc.id)?.travel;
      const travel = edge
        ? `${edge.days ? `${edge.days} dní` : ""}${edge.danger ? ` · ${edge.danger}` : ""}`.trim().replace(/^· /, "")
        : undefined;
      visible.push({ id: loc.id, name: loc.name, pos: place(loc.coords), isCurrent, fog: !known && connected, travel });
    }
    // Edges across the known network, deduped; the current node's links are kept
    // separate (drawn brighter) so the active routes read at a glance.
    const known = new Set(visible.filter((n) => !n.fog).map((n) => n.id));
    const seen = new Set<string>();
    const lines: { a: Pt; b: Pt; active: boolean; travel?: string; mid: Pt }[] = [];
    for (const loc of Object.values(locations)) {
      if (!loc.coords) continue;
      if (!known.has(loc.id) && loc.id !== current) continue;
      for (const c of loc.connections ?? []) {
        const dest = locations[c.to];
        if (!dest?.coords) continue;
        const bothKnown = (known.has(loc.id) || loc.id === current) && (known.has(c.to) || c.to === current);
        const active = loc.id === current || c.to === current;
        if (!bothKnown && !active) continue;
        const key = [loc.id, c.to].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        const a = place(loc.coords);
        const b = place(dest.coords);
        lines.push({ a, b, active, travel: undefined, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
      }
    }
    return { nodes: visible, edges: lines };
  }, [locations, current, revealed]);

  const startPan = (e: React.PointerEvent) => {
    if (!panMode) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
    const move = (ev: PointerEvent) => {
      el.scrollLeft = sl - (ev.clientX - sx);
      el.scrollTop = st - (ev.clientY - sy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Icon name="compass" size={40} className="mb-3 text-gold/70" />
        <p className="max-w-md font-body italic text-subtext1">
          Tahle kampaň zatím nemá lokace se souřadnicemi. Jakmile svět dostane mapu (souřadnice
          lokací), vykreslí se tu kraj.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-black/40 px-3 py-1.5">
        <span className="font-log text-[10px] uppercase tracking-wider text-subtext0">Kreslený kraj</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPanMode((p) => !p)}
            title="Posun mapy tažením (ruka)"
            className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-log text-[10px] ${
              panMode ? "border-gold text-gold" : "border-surface2 text-subtext0 hover:text-subtext1"
            }`}
          >
            <Icon name="footprints" size={11} /> posun
          </button>
          <button onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - 0.25) * 100) / 100))}
            className="rounded-sm border border-surface2 px-1.5 py-0.5 font-log text-[11px] text-subtext0 hover:text-gold" title="Oddálit">−</button>
          <button onClick={() => setZoom(1)}
            className="rounded-sm border border-surface2 px-1.5 py-0.5 font-log text-[10px] text-subtext0 hover:text-gold" title="Výchozí přiblížení">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + 0.25) * 100) / 100))}
            className="rounded-sm border border-surface2 px-1.5 py-0.5 font-log text-[11px] text-subtext0 hover:text-gold" title="Přiblížit">+</button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-3"
        style={{ cursor: panMode ? "grab" : "default" }}
        onPointerDown={startPan}
      >
        <svg
          width={W * zoom}
          height={H * zoom}
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto block"
          style={{ background: "var(--bg-crust)" }}
        >
          <defs>
            {/* Aged parchment fill: warm base + faint fibre speckle. */}
            <radialGradient id="ow-parch" cx="50%" cy="42%" r="75%">
              <stop offset="0%" stopColor="#efe2c4" />
              <stop offset="70%" stopColor="#e4d4ad" />
              <stop offset="100%" stopColor="#cdb98c" />
            </radialGradient>
            <pattern id="ow-fibre" width={26} height={26} patternUnits="userSpaceOnUse">
              <circle cx={4} cy={6} r={0.8} fill="rgba(90,70,40,0.10)" />
              <circle cx={18} cy={16} r={0.7} fill="rgba(90,70,40,0.08)" />
              <circle cx={11} cy={22} r={0.6} fill="rgba(90,70,40,0.07)" />
            </pattern>
            {/* Soft inner vignette so the sheet looks like aged vellum. */}
            <radialGradient id="ow-vig" cx="50%" cy="50%" r="62%">
              <stop offset="78%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(60,40,15,0.34)" />
            </radialGradient>
          </defs>

          {/* Parchment sheet + texture + decorative frame. */}
          <rect x={0} y={0} width={W} height={H} fill="url(#ow-parch)" />
          <rect x={0} y={0} width={W} height={H} fill="url(#ow-fibre)" />
          <rect x={0} y={0} width={W} height={H} fill="url(#ow-vig)" />
          <rect x={16} y={16} width={W - 32} height={H - 32} fill="none" stroke="rgba(74,52,20,0.45)" strokeWidth={2} />
          <rect x={22} y={22} width={W - 44} height={H - 44} fill="none" stroke="rgba(74,52,20,0.25)" strokeWidth={1} />

          {/* Travel network: faint ink for the wider map, gold for the active routes. */}
          {edges.map((e, i) => (
            <line
              key={`e${i}`}
              x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
              stroke={e.active ? "#9a6b1f" : "rgba(74,52,20,0.35)"}
              strokeWidth={e.active ? 2 : 1.2}
              strokeDasharray="5 7"
              opacity={e.active ? 0.85 : 0.5}
            />
          ))}

          {/* Location nodes. */}
          {nodes.map((n) => {
            const r = n.isCurrent ? 9 : 7;
            const fill = n.isCurrent ? "var(--gold)" : n.fog ? "rgba(60,44,20,0.45)" : "var(--steel)";
            return (
              <g
                key={n.id}
                onClick={n.fog || (!n.isCurrent && n.travel != null) ? () => void sendCommand("travel", { to: n.id }) : undefined}
                style={{ cursor: !n.isCurrent ? "pointer" : "default" }}
              >
                <title>{n.fog ? "Neprozkoumáno — vyraz sem" : n.name}</title>
                {n.isCurrent && (
                  <circle cx={n.pos.x} cy={n.pos.y} r={r + 6} fill="none" stroke="var(--arcane)" strokeWidth={2} opacity={0.7} />
                )}
                <circle
                  cx={n.pos.x} cy={n.pos.y} r={r}
                  fill={fill}
                  stroke="#3a2a12"
                  strokeWidth={2}
                  strokeDasharray={n.fog ? "3 3" : undefined}
                />
                <text
                  x={n.pos.x}
                  y={n.pos.y + r + 14}
                  textAnchor="middle"
                  fontFamily="Cinzel, serif"
                  fontSize={13}
                  fill="#2a1f0e"
                  style={{ paintOrder: "stroke", stroke: "rgba(239,226,196,0.85)", strokeWidth: 3 }}
                >
                  {n.fog ? "?" : n.name}
                </text>
                {n.isCurrent && (
                  <text x={n.pos.x} y={n.pos.y + r + 28} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={9} fill="#9a6b1f">
                    jste zde
                  </text>
                )}
                {!n.isCurrent && n.travel && (
                  <text x={n.pos.x} y={n.pos.y + r + 28} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={9} fill="#6b4f22">
                    {n.travel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
