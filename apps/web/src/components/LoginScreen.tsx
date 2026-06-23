import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { EmberField } from "./EmberField";

/**
 * Pre-prepared login / registration screen. Auth is not wired to a backend yet
 * (#auth, stub): every action — including the explicit "continue without
 * account" link — simply enters the app as before. An almost-empty stage: a
 * blurred dark-fantasy city silhouette, embers drifting in front of it, and a
 * single window centred on top.
 */
export function LoginScreen({ onContinue }: { onContinue: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const isRegister = mode === "register";

  // No backend yet — any submit just continues into the app.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onContinue();
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center overflow-hidden bg-bg-crust px-4">
      <CitySilhouette />
      <EmberField />

      <div className="panel relative z-10 w-full max-w-sm p-6 backdrop-blur-sm sm:p-7">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Icon name="d20" size={40} className="text-gold" />
          <h1 className="font-display text-2xl tracking-wide text-text">Pán jeskyně</h1>
          <p className="font-body text-sm text-subtext0">
            {isRegister ? "Založ si účet a vydej se do temných síní." : "Přihlas se a pokračuj ve svém příběhu."}
          </p>
        </div>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          <Field label="E-mail" htmlFor="login-email">
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className="settings-input bg-bg-crust text-text"
              placeholder="hrdina@kraj.cz"
            />
          </Field>

          <Field label="Heslo" htmlFor="login-password">
            <input
              id="login-password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="settings-input bg-bg-crust text-text"
              placeholder="••••••••"
            />
          </Field>

          {isRegister && (
            <Field label="Heslo znovu" htmlFor="login-confirm">
              <input
                id="login-confirm"
                type="password"
                autoComplete="new-password"
                className="settings-input bg-bg-crust text-text"
                placeholder="••••••••"
              />
            </Field>
          )}

          <button type="submit" className="btn-gold mt-1 w-full py-2.5 text-sm">
            {isRegister ? "Vytvořit účet" : "Přihlásit se"}
          </button>
        </form>

        <p className="mt-4 text-center font-log text-xs text-subtext0">
          {isRegister ? "Už máš účet? " : "Nemáš účet? "}
          <button
            type="button"
            className="btn-link text-xs underline-offset-2 hover:underline"
            onClick={() => setMode(isRegister ? "login" : "register")}
          >
            {isRegister ? "Přihlas se" : "Zaregistruj se"}
          </button>
        </p>

        <div className="mt-5 flex flex-col items-center gap-1 border-t border-surface1 pt-4">
          <button type="button" className="btn-link flex items-center gap-1 text-sm" onClick={onContinue}>
            Pokračovat bez přihlášení
            <Icon name="compass" size={14} />
          </button>
          <span className="font-log text-[10px] text-subtext0/70">Účty zatím nejsou aktivní</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block font-log text-[11px] uppercase tracking-wider text-subtext0">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Small deterministic PRNG so the skyline is dense but stable across renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1440;
const H = 600;

interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: "flat" | "spire" | "battlement";
  windows: { x: number; y: number; lit: boolean }[];
}

/** Generate a dense row of fantasy buildings with window grids. */
function generateCity(seed: number, count: number, minH: number, maxH: number): Building[] {
  const rng = mulberry32(seed);
  const out: Building[] = [];
  let x = -20;
  while (x < W + 20 && out.length < count) {
    const w = 28 + rng() * 64;
    const h = minH + rng() * (maxH - minH);
    const y = H - h;
    const roll = rng();
    const roof = roll < 0.22 ? "spire" : roll < 0.45 ? "battlement" : "flat";
    // Window grid — columns/rows scaled to the footprint, some lit warm.
    const windows: Building["windows"][number][] = [];
    const cols = Math.max(1, Math.floor(w / 16));
    const rows = Math.max(1, Math.floor(h / 26));
    const padX = (w - cols * 8) / (cols + 1);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        windows.push({
          x: x + padX + c * (8 + padX),
          y: y + 14 + r * 24,
          lit: rng() < 0.4,
        });
      }
    }
    out.push({ x, y, w, h, roof, windows });
    x += w + 4 + rng() * 10;
  }
  return out;
}

function roofPath(b: Building): string {
  if (b.roof === "spire") {
    const peak = 26 + b.w * 0.4;
    return `M${b.x} ${b.y} L${b.x + b.w / 2} ${b.y - peak} L${b.x + b.w} ${b.y} Z`;
  }
  if (b.roof === "battlement") {
    const n = Math.max(2, Math.floor(b.w / 12));
    const step = b.w / n;
    let d = `M${b.x} ${b.y}`;
    for (let i = 0; i < n; i++) {
      const x0 = b.x + i * step;
      d += ` L${x0} ${b.y - 8} L${x0 + step / 2} ${b.y - 8} L${x0 + step / 2} ${b.y}`;
    }
    return d + " Z";
  }
  return "";
}

/**
 * A blurred dark-fantasy city skyline — dense rooftops, towers and spires with
 * lit windows against a warm horizon glow. Decorative; sits behind the embers.
 */
function CitySilhouette() {
  const far = useMemo(() => generateCity(7, 60, 120, 260), []);
  const near = useMemo(() => generateCity(42, 40, 200, 420), []);

  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {/* Warm horizon glow rising behind the rooftops. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 80% at 50% 100%, rgba(217,122,52,0.22), transparent 55%)," +
            "radial-gradient(90% 55% at 50% 108%, rgba(196,54,28,0.16), transparent 60%)",
        }}
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        className="absolute bottom-0 left-0 h-[72%] w-full opacity-85"
        style={{ filter: "blur(4px)" }}
      >
        <CityLayer buildings={far} fill="#0d0b09" winColor="rgba(217,122,52,0.5)" />
        <CityLayer buildings={near} fill="#050403" winColor="rgba(232,138,58,0.75)" />
      </svg>
    </div>
  );
}

function CityLayer({ buildings, fill, winColor }: { buildings: Building[]; fill: string; winColor: string }) {
  return (
    <g>
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={fill} />
          {b.roof !== "flat" && <path d={roofPath(b)} fill={fill} />}
          {b.windows.map((win, j) =>
            win.lit ? <rect key={j} x={win.x} y={win.y} width={4} height={6} fill={winColor} /> : null,
          )}
        </g>
      ))}
    </g>
  );
}
