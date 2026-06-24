import { useEffect, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { AccountPanel } from "./AccountPanel";

// Masked settings view returned by GET /api/settings — secret values are
// never sent down, only whether they are set.
interface SettingsView {
  llm: { baseUrl: string; model: string; provider: "auto" | "mock"; apiKeySet: boolean; altModels: string[] };
  image: { enabled: boolean; baseUrl: string; model: string; apiKeySet: boolean; usesLlmKey: boolean };
  tts: {
    engine: "azure" | "piper" | "off";
    azureRegion: string;
    voice: string;
    rate: string;
    pitch: string;
    azureKeySet: boolean;
    piperFallback: boolean;
  };
  srdPath: string;
  srd: { spells: number; monsters: number; classes: number; subclasses: number; races: number; subraces: number; feats: number; total: number };
  campaign: string;
  campaigns: string[];
  activeNarrator: "mock" | "llm";
  env: { basicAuth: boolean };
}

/**
 * GUI for the runtime settings stored in the vault (`settings.json`), so the
 * table configures the LLM/image providers and campaign without touching
 * `.env`. Secrets are write-only: fields show whether a key is set but never
 * its value; leaving a key field blank keeps the existing one.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const hydrate = useGame((s) => s.hydrate);
  const [view, setView] = useState<SettingsView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Editable form fields (mirror the view; secrets kept separate, blank = keep).
  const [provider, setProvider] = useState<"auto" | "mock">("auto");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  // Alternate models for the "Jiným modelem" re-roll (#54), one per line.
  const [llmAltModels, setLlmAltModels] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [imageEnabled, setImageEnabled] = useState(false);
  const [imageBaseUrl, setImageBaseUrl] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [imageKey, setImageKey] = useState("");
  const [ttsRegion, setTtsRegion] = useState("");
  const [ttsVoice, setTtsVoice] = useState("cs-CZ-AntoninNeural");
  const [ttsRate, setTtsRate] = useState("-6%");
  const [ttsPitch, setTtsPitch] = useState("-2%");
  const [ttsKey, setTtsKey] = useState("");
  const [srdPath, setSrdPath] = useState("");
  const [campaign, setCampaign] = useState("");

  function apply(v: SettingsView) {
    setView(v);
    setProvider(v.llm.provider);
    setLlmBaseUrl(v.llm.baseUrl);
    setLlmModel(v.llm.model);
    setLlmAltModels((v.llm.altModels ?? []).join("\n"));
    setLlmKey("");
    setImageEnabled(v.image.enabled);
    setImageBaseUrl(v.image.baseUrl);
    setImageModel(v.image.model);
    setImageKey("");
    setTtsRegion(v.tts.azureRegion);
    setTtsVoice(v.tts.voice);
    setTtsRate(v.tts.rate);
    setTtsPitch(v.tts.pitch);
    setTtsKey("");
    setSrdPath(v.srdPath);
    setCampaign(v.campaign);
  }

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error(`Chyba ${res.status}`);
        apply((await res.json()) as SettingsView);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        llm: {
          provider,
          baseUrl: llmBaseUrl,
          model: llmModel,
          altModels: llmAltModels
            .split(/[\n,]/)
            .map((m) => m.trim())
            .filter(Boolean),
          ...(llmKey ? { apiKey: llmKey } : {}),
        },
        image: {
          enabled: imageEnabled,
          baseUrl: imageBaseUrl,
          model: imageModel,
          ...(imageKey ? { apiKey: imageKey } : {}),
        },
        tts: {
          azureRegion: ttsRegion,
          voice: ttsVoice,
          rate: ttsRate,
          pitch: ttsPitch,
          ...(ttsKey ? { azureKey: ttsKey } : {}),
        },
        srdPath,
        campaign,
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Chyba ${res.status}`);
      }
      apply((await res.json()) as SettingsView);
      // Refresh campaign name / model shown elsewhere in the UI.
      await hydrate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function previewVoice() {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: ttsVoice,
          rate: ttsRate,
          pitch: ttsPitch,
          region: ttsRegion,
          ...(ttsKey ? { azureKey: ttsKey } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Chyba ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  }

  const campaignChanged = view != null && campaign !== view.campaign;

  // Settings are grouped into tabs per the #47 wireframe. Účet/Kredity are
  // pre-prepared placeholders (accounts/billing aren't wired yet); the rest
  // drive the real settings.json fields.
  const [tab, setTab] = useState<TabId>("aidm");

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-bg-crust/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="parchment flex h-[88vh] w-full max-w-3xl flex-col p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ink/20 px-6 py-3">
          <Icon name="gear" size={18} className="text-ink" />
          <h2 className="font-display text-lg">Nastavení</h2>
          <button className="ml-auto font-log text-sm text-ink/60 hover:text-ink" onClick={onClose}>
            zavřít ✕
          </button>
        </div>

        {view === null ? (
          <p className="px-6 py-5 font-body italic text-ink/60">{error ?? "Načítám…"}</p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[12rem_1fr]">
            {/* Tab rail */}
            <nav className="flex flex-row flex-wrap gap-1 border-b border-ink/15 p-3 sm:flex-col sm:border-b-0 sm:border-r">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 rounded-sm px-3 py-2 text-left font-display text-sm transition-colors ${
                    tab === t.id ? "bg-ink/15 text-ink" : "text-ink/60 hover:bg-ink/10 hover:text-ink"
                  }`}
                >
                  <Icon name={t.icon} size={15} />
                  {t.label}
                </button>
              ))}
            </nav>

            {/* Active tab panel */}
            <div className="flex min-h-0 flex-col">
              <div className="flex flex-col gap-5 overflow-y-auto p-6 font-body text-ink">
                {tab === "account" && <AccountPanel />}
                {tab === "credits" && <PlaceholderPanel title="Kredity" />}

                {tab === "aidm" && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="font-display text-sm uppercase tracking-wider">Jazykový model (AI DM)</legend>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span
                        className={`h-2 w-2 rounded-full ${view.activeNarrator === "llm" ? "bg-verdigris" : "bg-ink/40"}`}
                      />
                      {view.activeNarrator === "llm"
                        ? "Aktivní vypravěč: jazykový model"
                        : "Aktivní vypravěč: offline mock (bez klíče nebo vynuceno)"}
                    </div>
                    <Field label="Režim">
                      <select
                        className="settings-input"
                        value={provider}
                        onChange={(e) => setProvider(e.target.value as "auto" | "mock")}
                      >
                        <option value="auto">Automaticky (model, je-li klíč)</option>
                        <option value="mock">Vynutit offline mock</option>
                      </select>
                    </Field>
                    <Field label="API klíč">
                      <input
                        type="password"
                        className="settings-input"
                        placeholder={view.llm.apiKeySet ? "•••••• (uloženo — ponech prázdné = beze změny)" : "nenastaveno"}
                        value={llmKey}
                        onChange={(e) => setLlmKey(e.target.value)}
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Base URL">
                      <input className="settings-input" value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} />
                    </Field>
                    <Field label="Model">
                      <input className="settings-input" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} />
                    </Field>
                    <Field label="Alternativní modely (pro „Jiným modelem“)">
                      <textarea
                        className="settings-input min-h-[4rem] resize-y font-log text-xs"
                        placeholder={"Jeden model na řádek, např.\nmistral-large-latest\nopen-mistral-nemo"}
                        value={llmAltModels}
                        onChange={(e) => setLlmAltModels(e.target.value)}
                      />
                    </Field>
                    <p className="text-xs italic text-ink/50">
                      Tyhle modely se nabídnou v chatu u zprávy DM přes „Jiným modelem" — přegenerují
                      poslední tah zvoleným modelem (stejný klíč i poskytovatel, jen jiný model).
                    </p>
                  </fieldset>
                )}

                {tab === "tts" && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="font-display text-sm uppercase tracking-wider">Hlas (TTS — Azure AI Speech)</legend>
                    <p className="text-xs italic text-ink/60">
                      Expresivní česká narace. Prázdný klíč → použije se záložní Piper
                      {view.tts.piperFallback ? " (nastaven)" : " (nenastaven)"}.
                    </p>
                    <Field label="API klíč (Azure Speech)">
                      <input
                        type="password"
                        className="settings-input"
                        placeholder={view.tts.azureKeySet ? "•••••• (uloženo — prázdné = beze změny)" : "nenastaveno → záložní Piper"}
                        value={ttsKey}
                        onChange={(e) => setTtsKey(e.target.value)}
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Region">
                      <input
                        className="settings-input"
                        placeholder="westeurope"
                        value={ttsRegion}
                        onChange={(e) => setTtsRegion(e.target.value)}
                      />
                    </Field>
                    <Field label="Hlas">
                      <select className="settings-input" value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
                        {!["cs-CZ-AntoninNeural", "cs-CZ-VlastaNeural"].includes(ttsVoice) && (
                          <option value={ttsVoice}>{ttsVoice}</option>
                        )}
                        <option value="cs-CZ-AntoninNeural">cs-CZ-AntoninNeural (mužský)</option>
                        <option value="cs-CZ-VlastaNeural">cs-CZ-VlastaNeural (ženský)</option>
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Tempo (rate)">
                        <input className="settings-input" placeholder="-6%" value={ttsRate} onChange={(e) => setTtsRate(e.target.value)} />
                      </Field>
                      <Field label="Výška (pitch)">
                        <input className="settings-input" placeholder="-2%" value={ttsPitch} onChange={(e) => setTtsPitch(e.target.value)} />
                      </Field>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-sm border border-ink/30 bg-ink/10 px-3 py-1 font-display text-xs hover:bg-ink/20 disabled:opacity-50"
                        onClick={previewVoice}
                        disabled={previewing}
                      >
                        <Icon name="flame" size={13} />
                        {previewing ? "Přehrávám…" : "Přehrát ukázku"}
                      </button>
                      {previewError && <span className="text-xs text-blood">{previewError}</span>}
                    </div>
                    <p className="text-xs italic text-ink/50">
                      Ukázka použije i neuložené hodnoty z formuláře. Pomalejší tempo a nižší výška ={" "}
                      dramatičtější projev. Aktivní engine:{" "}
                      {view.tts.engine === "azure" ? "Azure" : view.tts.engine === "piper" ? "Piper (záložní)" : "vypnuto"}.
                    </p>
                  </fieldset>
                )}

                {tab === "images" && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="font-display text-sm uppercase tracking-wider">Generování obrázků</legend>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={imageEnabled} onChange={(e) => setImageEnabled(e.target.checked)} />
                      Povolit generování obrázků
                    </label>
                    {imageEnabled && (
                      <>
                        <Field label="Base URL">
                          <input
                            className="settings-input"
                            placeholder="https://api.mistral.ai/v1"
                            value={imageBaseUrl}
                            onChange={(e) => setImageBaseUrl(e.target.value)}
                          />
                        </Field>
                        <Field label="Model">
                          <input
                            className="settings-input"
                            placeholder="výchozí dle poskytovatele"
                            value={imageModel}
                            onChange={(e) => setImageModel(e.target.value)}
                          />
                        </Field>
                        <Field label="API klíč">
                          <input
                            type="password"
                            className="settings-input"
                            placeholder={
                              view.image.apiKeySet
                                ? "•••••• (uloženo)"
                                : view.image.usesLlmKey
                                  ? "prázdné = použije klíč jazykového modelu"
                                  : "nenastaveno"
                            }
                            value={imageKey}
                            onChange={(e) => setImageKey(e.target.value)}
                            autoComplete="off"
                          />
                        </Field>
                      </>
                    )}
                  </fieldset>
                )}

                {tab === "info" && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="font-display text-sm uppercase tracking-wider">Obsah &amp; info</legend>
                    <Field label="Kampaň">
                      <select className="settings-input" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
                        {!view.campaigns.includes(campaign) && <option value={campaign}>{campaign}</option>}
                        {view.campaigns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {campaignChanged && (
                      <p className="text-xs italic text-blood">Změna kampaně se projeví po restartu serveru.</p>
                    )}
                    <Field label="Cesta k SRD">
                      <input
                        className="settings-input"
                        placeholder="./srd"
                        value={srdPath}
                        onChange={(e) => setSrdPath(e.target.value)}
                      />
                    </Field>
                    {view.srd.total > 0 ? (
                      <p className="text-xs italic text-verdigris">
                        Dataset načten: {view.srd.total} záznamů — {view.srd.spells} kouzel, {view.srd.monsters} nestvůr,{" "}
                        {view.srd.classes} povolání ({view.srd.subclasses} podtříd), {view.srd.races} ras (
                        {view.srd.subraces} podras), {view.srd.feats} vlastností.
                      </p>
                    ) : (
                      <p className="text-xs italic text-blood">
                        Žádný SRD dataset nenačten — zadej cestu ke složce s {`5e-SRD-*.json`} a ulož.
                      </p>
                    )}
                    <p className="text-xs italic text-ink/50">
                      Cesta k SRD se po uložení namountuje hned. Změna kampaně se projeví po restartu serveru.
                    </p>
                  </fieldset>
                )}

                {tab === "selfhosting" && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="font-display text-sm uppercase tracking-wider">Selfhosting</legend>
                    <p className="text-sm text-ink/80">
                      Tahle instance běží ve tvé vlastní režii. Citlivé provozní volby se nastavují v prostředí
                      kontejneru (<code className="font-log text-xs">.env</code>), ne tady.
                    </p>
                    <ul className="flex flex-col gap-1.5 text-sm text-ink/70">
                      <li className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${view.env.basicAuth ? "bg-verdigris" : "bg-ink/40"}`} />
                        Přihlášení (Basic Auth): {view.env.basicAuth ? "zapnuto" : "vypnuto"}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${view.tts.piperFallback ? "bg-verdigris" : "bg-ink/40"}`} />
                        Záložní Piper TTS: {view.tts.piperFallback ? "nastaven" : "nenastaven"}
                      </li>
                    </ul>
                    <p className="text-xs italic text-ink/50">
                      Přihlášení i adresa záložního Piperu se konfigurují v prostředí (.env). Data kampaní žijí
                      v pojmenovaném Docker volume <code className="font-log text-xs">vault_data</code>, takže
                      přežijí aktualizaci image.
                    </p>
                  </fieldset>
                )}
              </div>

              {error && <p className="px-6 text-sm text-blood">{error}</p>}

              {/* Persistent save bar (account/credits are placeholders — nothing to save). */}
              {tab !== "account" && tab !== "credits" && (
                <div className="flex items-center gap-3 border-t border-ink/20 px-6 py-3">
                  <button
                    className="rounded-sm border border-ink/30 bg-ink/10 px-4 py-1.5 font-display text-sm hover:bg-ink/20 disabled:opacity-50"
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? "Ukládám…" : "Uložit"}
                  </button>
                  <button className="font-log text-sm text-ink/60 hover:text-ink" onClick={onClose}>
                    Zavřít
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type TabId = "account" | "credits" | "aidm" | "tts" | "images" | "info" | "selfhosting";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "account", label: "Účet", icon: "user" },
  { id: "credits", label: "Kredity", icon: "coins" },
  { id: "aidm", label: "AI DM", icon: "flame" },
  { id: "tts", label: "TTS", icon: "speaker" },
  { id: "images", label: "Obrázky", icon: "camera" },
  { id: "info", label: "Info", icon: "info" },
  { id: "selfhosting", label: "Selfhosting", icon: "server" },
];

/** Pre-prepared tab with no backend yet (accounts/billing) — #47 stub. */
function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Icon name={title === "Účet" ? "user" : "coins"} size={28} className="text-ink/40" />
      <p className="font-display text-base text-ink/70">{title}</p>
      <p className="max-w-xs font-body text-sm text-ink/55">
        {title === "Účet"
          ? "Účty zatím nejsou aktivní. Aplikace běží bez přihlášení."
          : "Kreditní systém zatím není zapojen — selfhosted instance využívá tvůj vlastní API klíč."}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink/70">{label}</span>
      {children}
    </label>
  );
}
