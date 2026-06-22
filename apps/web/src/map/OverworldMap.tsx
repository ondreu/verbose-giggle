import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useGame } from "../store/store";

// A fixed CRS.Simple coordinate space; 0..1 location ratios map onto it so
// coords stay resolution-independent (§10.1). Image coords run y-down, Leaflet
// CRS.Simple runs y-up, hence the (1 - y) inversion.
const SIZE = 1000;
const toLatLng = (x: number, y: number): L.LatLngExpression => [(1 - y) * SIZE, x * SIZE];

export function OverworldMap() {
  const session = useGame((s) => s.session);
  const locations = useGame((s) => s.locations);
  const campaign = useGame((s) => s.campaign);
  const sendCommand = useGame((s) => s.sendCommand);

  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Init the map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const bounds: L.LatLngBoundsExpression = [
      [0, 0],
      [SIZE, SIZE],
    ];
    const map = L.map(elRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 2,
      zoomControl: true,
      attributionControl: false,
      zoomSnap: 0.25,
    });
    map.fitBounds(bounds);

    // Backdrop image if the campaign provides one; harmless 404 otherwise
    // (the container keeps its parchment styling).
    if (campaign?.world_map) {
      L.imageOverlay(`/api/asset/${campaign.world_map}`, bounds, { opacity: 0.85 }).addTo(map);
    }
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [campaign?.world_map]);

  // Render markers whenever the world or fog-of-war changes.
  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map || !session) return;
    layer.clearLayers();

    const current = session.current_location;
    const revealed = new Set(session.revealed_locations);
    const currentNode = locations[current];
    const connections = new Set((currentNode?.connections ?? []).map((c) => c.to));

    for (const loc of Object.values(locations)) {
      if (!loc.coords) continue;
      const isCurrent = loc.id === current;
      const known = isCurrent || revealed.has(loc.id) || loc.discovered;
      const connected = connections.has(loc.id);
      // Hide undiscovered nodes unless they're a direct (foggy) connection.
      if (!known && !connected) continue;

      const fog = !known && connected;
      const color = isCurrent ? "var(--gold)" : fog ? "var(--subtext0)" : "var(--steel)";
      const edge = currentNode?.connections.find((c) => c.to === loc.id)?.travel;
      const travelInfo = edge
        ? `${edge.days ? `${edge.days} dní` : ""}${edge.danger ? ` · ${edge.danger}` : ""}`
        : "";

      const html = `
        <div style="transform:translate(-50%,-50%);text-align:center;${fog ? "opacity:.7" : ""}">
          <div style="
            width:18px;height:18px;border-radius:50%;margin:0 auto;
            background:${color};border:2px solid var(--bg-crust);
            ${isCurrent ? "box-shadow:0 0 0 3px var(--arcane),0 0 14px -2px var(--arcane);" : ""}
          "></div>
          <div style="
            font-family:Cinzel,serif;font-size:11px;letter-spacing:.04em;margin-top:3px;
            color:var(--text);text-shadow:0 1px 3px #000;white-space:nowrap;">
            ${fog ? "?" : loc.name}
          </div>
          ${isCurrent ? `<div style="font-family:'IBM Plex Mono';font-size:9px;color:var(--gold)">jste zde</div>` : ""}
          ${connected && !isCurrent && travelInfo ? `<div style="font-family:'IBM Plex Mono';font-size:9px;color:var(--subtext0)">${travelInfo}</div>` : ""}
        </div>`;

      const marker = L.marker(toLatLng(loc.coords.x, loc.coords.y), {
        icon: L.divIcon({ html, className: "adm-node", iconSize: [0, 0] }),
        interactive: connected || known,
      }).addTo(layer);

      if (connected && !isCurrent) {
        marker.on("click", () => {
          void sendCommand("travel", { to: loc.id });
        });
      }
    }

    // Draw edges from the current node to its connections.
    if (currentNode?.coords) {
      for (const edge of currentNode.connections) {
        const dest = locations[edge.to];
        if (!dest?.coords) continue;
        L.polyline([toLatLng(currentNode.coords.x, currentNode.coords.y), toLatLng(dest.coords.x, dest.coords.y)], {
          color: "#c9a227", // gold (SVG stroke can't resolve CSS vars)
          weight: 1,
          opacity: 0.35,
          dashArray: "4 6",
        }).addTo(layer);
      }
    }
  }, [session, locations, sendCommand]);

  return <div ref={elRef} className="h-full w-full" style={{ background: "var(--bg-crust)" }} />;
}
