import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { EmberField } from "./EmberField";
import { login, register, requestPasswordReset, resendVerification } from "../auth";

type Mode = "login" | "register" | "forgot";

/**
 * Login / registration / password-reset screen, wired to the auth API (#55e).
 * On a successful login it calls `onAuthed`; "continue without login" is only
 * offered when the server reports anonymous access is allowed (self-hosted).
 * The stage behind it is decorative: a blurred dark-fantasy skyline with
 * drifting embers.
 */
export function LoginScreen({
  onAuthed,
  allowAnonymous,
  registrationEnabled,
}: {
  onAuthed: () => void;
  allowAnonymous: boolean;
  registrationEnabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set when login fails because the email isn't verified — offers a resend.
  const [needsVerify, setNeedsVerify] = useState(false);

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setNeedsVerify(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setNeedsVerify(false);

    if (isRegister && password !== confirm) {
      setError("Hesla se neshodují.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        const res = await login(email, password);
        if (res.ok) return onAuthed();
        if (res.status === 403) setNeedsVerify(true);
        setError(res.error);
      } else if (mode === "register") {
        const res = await register(email, password);
        if (res.ok) {
          setNotice("Účet vytvořen. Zkontroluj e-mail a klikni na ověřovací odkaz.");
          switchModeKeepNotice("login");
        } else {
          setError(res.error);
        }
      } else {
        // forgot — always neutral.
        await requestPasswordReset(email);
        setNotice("Pokud účet existuje, poslali jsme odkaz pro obnovení hesla.");
        switchModeKeepNotice("login");
      }
    } finally {
      setBusy(false);
    }
  }

  // Switch mode but keep the just-set notice visible.
  function switchModeKeepNotice(next: Mode) {
    setMode(next);
    setError(null);
    setNeedsVerify(false);
    setConfirm("");
  }

  async function onResend() {
    setBusy(true);
    try {
      await resendVerification(email);
      setNeedsVerify(false);
      setNotice("Ověřovací e-mail jsme poslali znovu.");
    } finally {
      setBusy(false);
    }
  }

  const title = isRegister
    ? "Založ si účet a vydej se do temných síní."
    : isForgot
      ? "Zadej e-mail a pošleme ti odkaz pro obnovení hesla."
      : "Přihlas se a pokračuj ve svém příběhu.";

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center overflow-hidden bg-bg-crust px-4">
      <CitySilhouette />
      <EmberField />

      <div className="panel relative z-10 w-full max-w-sm p-6 backdrop-blur-sm sm:p-7">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Icon name="d20" size={40} className="flicker text-gold" />
          <h1 className="font-display text-2xl tracking-wide text-text">Pán jeskyně</h1>
          <p className="font-body text-sm text-subtext0">{title}</p>
        </div>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          <Field label="E-mail" htmlFor="login-email">
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="settings-input bg-bg-crust text-text"
              placeholder="hrdina@kraj.cz"
            />
          </Field>

          {!isForgot && (
            <Field label="Heslo" htmlFor="login-password">
              <input
                id="login-password"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="settings-input bg-bg-crust text-text"
                placeholder="••••••••"
              />
            </Field>
          )}

          {isRegister && (
            <Field label="Heslo znovu" htmlFor="login-confirm">
              <input
                id="login-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="settings-input bg-bg-crust text-text"
                placeholder="••••••••"
              />
            </Field>
          )}

          {error && (
            <p className="font-log text-xs text-blood" role="alert">
              {error}
            </p>
          )}
          {needsVerify && (
            <button
              type="button"
              className="btn-link self-start text-xs underline-offset-2 hover:underline"
              onClick={onResend}
              disabled={busy}
            >
              Poslat ověřovací e-mail znovu
            </button>
          )}
          {notice && <p className="font-log text-xs text-verdigris">{notice}</p>}

          <button type="submit" className="btn-gold mt-1 w-full py-2.5 text-sm" disabled={busy}>
            {busy
              ? "Pracuji…"
              : isRegister
                ? "Vytvořit účet"
                : isForgot
                  ? "Poslat odkaz"
                  : "Přihlásit se"}
          </button>
        </form>

        {!isForgot && (
          <p className="mt-3 text-center font-log text-xs text-subtext0">
            <button
              type="button"
              className="btn-link text-xs underline-offset-2 hover:underline"
              onClick={() => switchMode("forgot")}
            >
              Zapomenuté heslo?
            </button>
          </p>
        )}

        {(registrationEnabled || isRegister || isForgot) && (
          <p className="mt-2 text-center font-log text-xs text-subtext0">
            {isRegister
              ? "Už máš účet? "
              : isForgot
                ? "Zpět na "
                : registrationEnabled
                  ? "Nemáš účet? "
                  : ""}
            <button
              type="button"
              className="btn-link text-xs underline-offset-2 hover:underline"
              onClick={() => switchMode(isRegister || isForgot ? "login" : "register")}
            >
              {isRegister || isForgot ? "Přihlas se" : "Zaregistruj se"}
            </button>
          </p>
        )}

        {allowAnonymous && (
          <div className="mt-5 flex flex-col items-center gap-1 border-t border-surface1 pt-4">
            <button type="button" className="btn-link flex items-center gap-1 text-sm" onClick={onAuthed}>
              Pokračovat bez přihlášení
              <Icon name="compass" size={14} />
            </button>
          </div>
        )}
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

type Roof = "gable" | "cone" | "battlement" | "spire" | "flat";

interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: Roof;
  windows: { x: number; y: number }[]; // sparse, warm-lit only
}

/**
 * Generate a medieval / dark-ages town: mostly low houses with steep gabled
 * roofs, the occasional round tower with a conical cap, a battlemented keep and
 * a church steeple. Heights are modest and windows are few — nothing reads like
 * a modern high-rise. `scale` thins/shortens the far layer.
 */
function generateCity(seed: number, scale: number): Building[] {
  const rng = mulberry32(seed);
  const out: Building[] = [];
  let x = -24;
  while (x < W + 24) {
    const roll = rng();
    let w: number;
    let h: number;
    let roof: Roof;
    if (roll < 0.62) {
      // Townhouse — short, steep gable.
      w = 30 + rng() * 36;
      h = 46 + rng() * 70;
      roof = "gable";
    } else if (roll < 0.82) {
      // Round tower with a witch-hat cone, or a squat battlemented turret.
      w = 20 + rng() * 16;
      h = 130 + rng() * 110;
      roof = rng() < 0.65 ? "cone" : "battlement";
    } else if (roll < 0.93) {
      // Keep / great hall — wide, crenellated.
      w = 72 + rng() * 56;
      h = 80 + rng() * 70;
      roof = "battlement";
    } else {
      // Church with a tall narrow steeple.
      w = 40 + rng() * 22;
      h = 120 + rng() * 70;
      roof = "spire";
    }
    w *= 0.92 + scale * 0.08;
    h *= scale;
    const y = H - h;

    // Sparse warm windows: a short vertical slit pattern, never a full grid.
    const windows: Building["windows"][number][] = [];
    const slots = roof === "gable" ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3);
    for (let s = 0; s < slots; s++) {
      if (rng() > 0.55) continue; // most windows are dark
      windows.push({
        x: x + w / 2 - 1.5 + (rng() < 0.5 ? -7 : 7) * (rng() < 0.5 ? 0 : 1),
        y: y + 16 + s * 22,
      });
    }
    out.push({ x, y, w, h, roof, windows });
    x += w + 1 + rng() * 6; // packed together, tiny gaps
  }
  return out;
}

function roofPath(b: Building): string {
  if (b.roof === "gable") {
    // Steep medieval pitch.
    const peak = Math.min(46, 16 + b.w * 0.6);
    return `M${b.x - 2} ${b.y} L${b.x + b.w / 2} ${b.y - peak} L${b.x + b.w + 2} ${b.y} Z`;
  }
  if (b.roof === "cone") {
    // Tall conical "witch hat" with a slight eave overhang.
    const peak = b.w * 1.6;
    return `M${b.x - 3} ${b.y} L${b.x + b.w / 2} ${b.y - peak} L${b.x + b.w + 3} ${b.y} Z`;
  }
  if (b.roof === "spire") {
    // Narrow church steeple.
    const peak = 60 + b.w * 1.1;
    const sw = b.w * 0.5;
    const cx = b.x + b.w / 2;
    return `M${cx - sw / 2} ${b.y} L${cx} ${b.y - peak} L${cx + sw / 2} ${b.y} Z`;
  }
  if (b.roof === "battlement") {
    const n = Math.max(2, Math.floor(b.w / 12));
    const step = b.w / n;
    let d = `M${b.x} ${b.y}`;
    for (let i = 0; i < n; i++) {
      const x0 = b.x + i * step;
      d += ` L${x0} ${b.y - 7} L${x0 + step / 2} ${b.y - 7} L${x0 + step / 2} ${b.y}`;
    }
    return d + " Z";
  }
  return "";
}

/**
 * A blurred dark-ages town skyline — packed gabled rooftops, round towers and a
 * church steeple against a warm horizon glow. Decorative; behind the embers.
 */
function CitySilhouette() {
  const far = useMemo(() => generateCity(7, 0.62), []);
  const near = useMemo(() => generateCity(42, 1), []);

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
        className="absolute bottom-0 left-0 h-[64%] w-full opacity-85"
        style={{ filter: "blur(4px)" }}
      >
        <CityLayer buildings={far} fill="#0d0b09" winColor="rgba(217,122,52,0.5)" />
        <CityLayer buildings={near} fill="#050403" winColor="rgba(232,138,58,0.8)" />
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
          {b.windows.map((win, j) => (
            <rect key={j} x={win.x} y={win.y} width={3} height={5} fill={winColor} />
          ))}
        </g>
      ))}
    </g>
  );
}
