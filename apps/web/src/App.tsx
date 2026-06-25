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
import { LoginScreen } from "./components/LoginScreen";
import { AdminPage } from "./components/AdminPage";
import { CreditBadge } from "./components/CreditBadge";
import { ReferenceModal } from "./panels/ReferenceModal";
import { fetchAuthConfig, fetchCurrentUser, type AuthConfig } from "./auth";

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
  const [refOpen, setRefOpen] = useState(false);
  // Auth gate (#55e). `authChecked` gates rendering until we've asked the
  // server whether there's an existing session, so we don't flash the login
  // screen for already-signed-in (or anonymous-allowed) users.
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasUser, setHasUser] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    allowAnonymous: true,
    registrationEnabled: true,
    creditsEnabled: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cfg, user] = await Promise.all([fetchAuthConfig(), fetchCurrentUser()]);
      if (cancelled) return;
      setAuthConfig(cfg);
      if (user) {
        setAuthed(true);
        setHasUser(true);
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void hydrate();
    connect();
  }, [hydrate, connect]);

  // Fresh campaign with no narration yet → ask the DM for an opening scene (#31).
  useEffect(() => {
    if (view === "play" && campaign && narrationLen === 0) void intro();
  }, [view, campaign, narrationLen, intro]);

  // Admin panel (#57d) lives at /admin; it's gated server-side (its API
  // returns 403 to non-admins), so render it directly without the login gate.
  if (window.location.pathname.startsWith("/admin")) return <AdminPage />;

  // Hold rendering until the session check resolves (avoids a login flash).
  if (!authChecked) return <div className="fixed inset-0 bg-bg-crust" />;

  if (!authed)
    return (
      <LoginScreen
        onAuthed={() => setAuthed(true)}
        allowAnonymous={authConfig.allowAnonymous}
        registrationEnabled={authConfig.registrationEnabled}
      />
    );

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
      {refOpen && <ReferenceModal onClose={() => setRefOpen(false)} />}
      <header className="flex items-center gap-3 border-b border-black bg-bg-mantle px-4 py-2">
        <button
          className="text-subtext0 transition-colors hover:text-gold"
          title="Domů / hlavní nabídka"
          aria-label="Domů"
          onClick={() => setView("home")}
        >
          <Icon name="d20" size={22} className="flicker text-gold" />
        </button>
        <h1 className="font-display text-lg tracking-wide">{campaign?.name ?? "Pán jeskyně"}</h1>
        {time && (
          <span className="ml-2 flex items-center gap-1 font-log text-xs text-subtext0">
            <Icon name="hourglass" size={12} />
            den {time.day}, {String(time.hour).padStart(2, "0")}:00
          </span>
        )}
        {authConfig.creditsEnabled && hasUser && <span className="ml-auto" />}
        <span
          className={`flex items-center gap-1.5 font-log text-[11px] text-subtext0 ${
            authConfig.creditsEnabled && hasUser ? "" : "ml-auto"
          }`}
          title={connected ? "Spojeno se serverem" : "Odpojeno"}
        >
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-verdigris" : "bg-blood"}`} />
          {connected ? "spojeno" : "odpojeno"}
        </span>
        {authConfig.creditsEnabled && hasUser && <CreditBadge />}
        <button
          className="btn-ghost text-xs"
          title="Hlavní nabídka (kampaně, tvorba postavy, zálohy)"
          onClick={() => setView("home")}
        >
          <Icon name="compass" size={14} />
          Nabídka
        </button>
        <button
          className="btn-ghost text-xs"
          title="Rejstřík pravidel (stavy, zranění, dovednosti…)"
          onClick={() => setRefOpen(true)}
        >
          <Icon name="document" size={14} />
          Pravidla
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
