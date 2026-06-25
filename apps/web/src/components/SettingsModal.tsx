import { useEffect, useState } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { AccountPanel } from "./AccountPanel";
import { CreditsPanel } from "./CreditsPanel";

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
  /** Operator model pool (#56g) the player picks their own model from. */
  modelPool: { model: string; name: string; perMessage: number; intelligence: number; price: number; tooltip: string }[];
  /** This user's saved pool choice (slug), or "" for the global default. */
  selectedModel: string;
  activeNarrator: "mock" | "llm";
  env: { basicAuth: boolean };
  /**
   * Whether this client may edit the global provider/SRD credentials. True for
   * self-hosted (anonymous access on) and for admins; false for a regular
   * hosted tenant, who manages providers via the /admin panel instead.
   */
  canEditProviders: boolean;
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
  // The player's chosen pool model (slug); "" = global default (#56g).
  const [selectedModel, setSelectedModel] = useState("");

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
    setSelectedModel(v.selectedModel ?? "");
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
      // The campaign selection is per-user and always editable. Global
      // provider/SRD credentials are only sent when this client may edit them
      // (self-hosted or admin); otherwise the server would reject them (403).
      // The per-user model choice is always editable (#56g); the campaign is
      // switched from the start menu now, not here. Provider/SRD creds only when
      // this client may edit them.
      const patch: Record<string, unknown> = { selectedModel };
      if (view?.canEditProviders) {
        patch.llm = {
          provider,
          baseUrl: llmBaseUrl,
          model: llmModel,
          altModels: llmAltModels
            .split(/[\n,]/)
            .map((m) => m.trim())
            .filter(Boolean),
          ...(llmKey ? { apiKey: llmKey } : {}),
        };
        patch.image = {
          enabled: imageEnabled,
          baseUrl: imageBaseUrl,
          model: imageModel,
          ...(imageKey ? { apiKey: imageKey } : {}),
        };
        patch.tts = {
          azureRegion: ttsRegion,
          voice: ttsVoice,
          rate: ttsRate,
          pitch: ttsPitch,
          ...(ttsKey ? { azureKey: ttsKey } : {}),
        };
        patch.srdPath = srdPath;
      }
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

  // Settings are grouped into tabs per the #47 wireframe. Účet/Kredity are
  // pre-prepared placeholders (accounts/billing aren't wired yet); the rest
  // drive the real settings.json fields.
  const [tab, setTab] = useState<TabId>("aidm");

  // Provider tabs are hidden when this client can't edit global credentials
  // (hosted, non-admin); those settings live in the /admin panel instead. The
  // AI DM tab stays visible to everyone — a regular player uses it to pick their
  // model from the operator pool (#56g); only the provider credentials inside
  // it are gated.
  const canEditProviders = view?.canEditProviders ?? true;
  const providerTabs: TabId[] = ["tts", "images"];
  const visibleTabs = TABS.filter((t) => canEditProviders || !providerTabs.includes(t.id));

  // If the active tab got hidden after load, fall back to a visible one.
  useEffect(() => {
    if (!canEditProviders && providerTabs.includes(tab)) setTab("account");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEditProviders]);

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
              {visibleTabs.map((t) => (
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
                {tab === "credits" && <CreditsPanel />}

                {tab === "aidm" && (
                  <fieldset className="flex flex-col gap-4">
                    <legend className="font-display text-sm uppercase tracking-wider">AI Dungeon Master</legend>

                    {/* Player model picker (#56g): choose which pooled model drives
                        your turns. Only name + credits + ★ ratings — never the slug. */}
                    <ModelPicker
                      pool={view.modelPool ?? []}
                      value={selectedModel}
                      onChange={setSelectedModel}
                    />

                    {/* Provider credentials are admin/self-hosted only; a regular
                        hosted player sees just the picker above. */}
                    {canEditProviders && (
                      <div className="flex flex-col gap-2 border-t border-ink/15 pt-3">
                        <h3 className="font-display text-xs uppercase tracking-wider text-ink/60">
                          Poskytovatel (jazykový model)
                        </h3>
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
                      </div>
                    )}
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
                    <legend className="font-display text-sm uppercase tracking-wider">Info</legend>
                    {/* The campaign selector lived here but duplicated the start
                        menu's campaign switch, so it was removed. Self-hosted /
                        admin still configure the SRD dataset path here; a regular
                        player sees an empty placeholder for now. */}
                    {canEditProviders ? (
                      <>
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
                          Cesta k SRD se po uložení namountuje hned.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs italic text-ink/50">Zatím prázdné.</p>
                    )}
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

type TabId = "account" | "credits" | "aidm" | "tts" | "images" | "info";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "account", label: "Účet", icon: "user" },
  { id: "credits", label: "Kredity", icon: "coins" },
  { id: "aidm", label: "AI DM", icon: "flame" },
  { id: "tts", label: "TTS", icon: "speaker" },
  { id: "images", label: "Obrázky", icon: "camera" },
  { id: "info", label: "Info", icon: "info" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink/70">{label}</span>
      {children}
    </label>
  );
}

type PoolEntry = { model: string; name: string; perMessage: number; intelligence: number; price: number; tooltip: string };

/**
 * Player-facing model picker (#56g): pick which model from the operator pool
 * drives your turns. Shows only the display name, per-message credit cost, and
 * ★ intelligence / $ price ratings — never the raw slug. The operator curates
 * the pool itself in the admin panel; the player only chooses among it.
 */
function ModelPicker({
  pool,
  value,
  onChange,
}: {
  pool: PoolEntry[];
  value: string;
  onChange: (slug: string) => void;
}) {
  if (pool.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-ink/70 text-sm">Model</span>
        <p className="text-xs italic text-ink/50">
          Zatím nejsou k dispozici žádné modely. Nabídku spravuje administrátor.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-ink/70 text-sm">Model, kterým hraješ</span>
      <div className="flex flex-col gap-1.5">
        {pool.map((m) => {
          const active = m.model === value;
          return (
            <button
              key={m.model}
              type="button"
              onClick={() => onChange(m.model)}
              title={m.tooltip?.trim() || undefined}
              className={`flex items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-verdigris bg-verdigris/10"
                  : "border-ink/20 hover:border-ink/40 hover:bg-ink/5"
              }`}
            >
              <span
                className={`h-3 w-3 shrink-0 rounded-full border ${
                  active ? "border-verdigris bg-verdigris" : "border-ink/40"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-body text-sm text-ink">{m.name}</span>
                <span className="font-log text-[11px] text-ink/55">
                  <span title="inteligence">{"★".repeat(m.intelligence)}</span>{" "}
                  <span title="cena">{"$".repeat(m.price)}</span>
                </span>
              </span>
              <span className="shrink-0 font-log text-xs text-ink/60">{m.perMessage} kr./zpráva</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
