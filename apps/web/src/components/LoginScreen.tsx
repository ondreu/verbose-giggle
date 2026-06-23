import { useState } from "react";
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

/**
 * A blurred dark-fantasy city skyline — towers, spires and rooftops against a
 * faint warm horizon glow. Decorative only; sits behind the embers and window.
 */
function CitySilhouette() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {/* Warm horizon glow rising behind the rooftops. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 100%, rgba(217,122,52,0.16), transparent 55%)," +
            "radial-gradient(90% 50% at 50% 105%, rgba(201,162,39,0.12), transparent 60%)",
        }}
      />
      <svg
        viewBox="0 0 1440 600"
        preserveAspectRatio="xMidYMax slice"
        className="absolute bottom-0 left-0 h-[60%] w-full opacity-60"
        style={{ filter: "blur(6px)" }}
      >
        {/* Far ridge of towers (lighter, hazier). */}
        <g fill="#0c0a09" opacity="0.7">
          <path d="M0 600 V360 h70 v-60 h26 v60 h60 v-110 l24 -34 24 34 v110 h70 v-44 h30 v44 h90 v-80 h26 v80 h120 v-60 h70 v60 h140 v-90 h28 v90 h120 v-50 h60 v50 h150 v-70 h30 v70 h130 V600 Z" />
        </g>
        {/* Near ridge — taller spires and keeps, fully dark. */}
        <g fill="#060504">
          <path d="M0 600 V440 h90 v-70 h40 v70 h70 v-150 l34 -48 34 48 v150 h60 v-90 h44 v90 h110 v-120 l30 -40 30 40 v120 h90 v-70 h50 v70 h120 v-180 l30 -44 30 44 v180 h80 v-100 h46 v100 h120 v-70 h60 v70 h150 V600 Z" />
        </g>
        {/* A few lit windows as faint warm specks. */}
        <g fill="#d97a34" opacity="0.5">
          <rect x="300" y="340" width="4" height="6" />
          <rect x="312" y="356" width="4" height="6" />
          <rect x="690" y="320" width="4" height="6" />
          <rect x="702" y="340" width="4" height="6" />
          <rect x="1010" y="300" width="4" height="6" />
          <rect x="1022" y="322" width="4" height="6" />
        </g>
      </svg>
    </div>
  );
}
