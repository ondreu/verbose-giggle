import { useEffect, useState } from "react";

const INPUT = "w-full rounded border border-surface2 bg-bg-crust px-2 py-1 text-sm text-text";

/**
 * Editable provider/SRD configuration (LLM, image generation, Azure TTS, SRD
 * path), backed by the global vault `settings.json` via GET/PUT `/api/settings`.
 * Secrets are write-only: a blank key field keeps the stored one. Used inside
 * the admin panel (#57/#58b) so a hosted operator configures providers there
 * instead of `.env`; in self-hosted mode the same fields also live in the gear
 * Settings modal. Server-side `canEditProviders` gates the PUT (admin-only when
 * anonymous access is off).
 */
interface SettingsView {
  llm: { baseUrl: string; model: string; provider: "auto" | "mock"; apiKeySet: boolean; altModels: string[] };
  image: { enabled: boolean; baseUrl: string; model: string; apiKeySet: boolean; usesLlmKey: boolean };
  tts: { azureRegion: string; voice: string; rate: string; pitch: string; azureKeySet: boolean; piperFallback: boolean };
  srdPath: string;
  srd: { total: number; spells: number; monsters: number };
  activeNarrator: "mock" | "llm";
  canEditProviders: boolean;
}

export function ProviderSettings() {
  const [view, setView] = useState<SettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [llmBaseUrl, setLlmBaseUrl] = useState("");
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

  function apply(v: SettingsView) {
    setView(v);
    setLlmBaseUrl(v.llm.baseUrl);
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
  }

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Chyba ${res.status}`);
        apply((await res.json()) as SettingsView);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        // Models are governed by the model pool now; here we persist only the
        // API access (key + endpoint). Omitting model/altModels/provider leaves
        // the stored values untouched.
        llm: {
          baseUrl: llmBaseUrl,
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
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Chyba ${res.status}`);
      }
      apply((await res.json()) as SettingsView);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!view) return <p className="font-log text-sm text-subtext0">{error ?? "Načítám…"}</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 font-log text-sm text-subtext1">
        <span className={`h-2 w-2 rounded-full ${view.activeNarrator === "llm" ? "bg-gold" : "bg-surface2"}`} />
        {view.activeNarrator === "llm" ? "Aktivní vypravěč: jazykový model" : "Aktivní vypravěč: offline mock"}
      </div>

      <section className="flex flex-col gap-2">
        <H3>Jazykový model (AI DM)</H3>
        <p className="font-log text-xs italic text-subtext0">
          Tady je jen přístup k API — konkrétní modely, jejich ceny a hvězdičky spravuje
          sekce <strong>Model pool</strong> výše. Hráči si z poolu volí, kterým modelem hrají.
        </p>
        <Field label="API klíč">
          <input
            type="password"
            className={INPUT}
            placeholder={view.llm.apiKeySet ? "•••••• (uloženo — prázdné = beze změny)" : "nenastaveno"}
            value={llmKey}
            onChange={(e) => setLlmKey(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Base URL">
          <input className={INPUT} placeholder="https://openrouter.ai/api/v1" value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} />
        </Field>
      </section>

      <section className="flex flex-col gap-2">
        <H3>Generování obrázků</H3>
        <label className="flex items-center gap-2 font-log text-sm text-text">
          <input type="checkbox" className="accent-gold" checked={imageEnabled} onChange={(e) => setImageEnabled(e.target.checked)} />
          Povolit generování obrázků
        </label>
        {imageEnabled && (
          <>
            <p className="font-log text-xs italic text-subtext0">
              OpenRouter: zadej kořen API <code>https://openrouter.ai/api/v1</code> (bez <code>/images</code>) a model
              např. <code>google/gemini-2.5-flash-image</code>. Funguje i Mistral (<code>https://api.mistral.ai/v1</code>)
              nebo OpenAI-kompatibilní endpoint s <code>/images/generations</code> (DALL·E, FLUX).
            </p>
            <Field label="Base URL">
              <input className={INPUT} placeholder="https://openrouter.ai/api/v1" value={imageBaseUrl} onChange={(e) => setImageBaseUrl(e.target.value)} />
            </Field>
            <Field label="Model">
              <input className={INPUT} placeholder="výchozí dle poskytovatele" value={imageModel} onChange={(e) => setImageModel(e.target.value)} />
            </Field>
            <Field label="API klíč">
              <input
                type="password"
                className={INPUT}
                placeholder={view.image.apiKeySet ? "•••••• (uloženo)" : view.image.usesLlmKey ? "prázdné = klíč jazykového modelu" : "nenastaveno"}
                value={imageKey}
                onChange={(e) => setImageKey(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <H3>Hlas (TTS — Azure AI Speech)</H3>
        <p className="font-log text-xs italic text-subtext1">
          Prázdný klíč → záložní Piper{view.tts.piperFallback ? " (nastaven)" : " (nenastaven, env)"}.
        </p>
        <Field label="API klíč (Azure Speech)">
          <input
            type="password"
            className={INPUT}
            placeholder={view.tts.azureKeySet ? "•••••• (uloženo)" : "nenastaveno → Piper"}
            value={ttsKey}
            onChange={(e) => setTtsKey(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Region">
            <input className={INPUT} placeholder="westeurope" value={ttsRegion} onChange={(e) => setTtsRegion(e.target.value)} />
          </Field>
          <Field label="Hlas">
            <select className={INPUT} value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
              {!["cs-CZ-AntoninNeural", "cs-CZ-VlastaNeural"].includes(ttsVoice) && <option value={ttsVoice}>{ttsVoice}</option>}
              <option value="cs-CZ-AntoninNeural">cs-CZ-AntoninNeural (mužský)</option>
              <option value="cs-CZ-VlastaNeural">cs-CZ-VlastaNeural (ženský)</option>
            </select>
          </Field>
          <Field label="Tempo (rate)">
            <input className={INPUT} placeholder="-6%" value={ttsRate} onChange={(e) => setTtsRate(e.target.value)} />
          </Field>
          <Field label="Výška (pitch)">
            <input className={INPUT} placeholder="-2%" value={ttsPitch} onChange={(e) => setTtsPitch(e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <H3>SRD dataset</H3>
        <Field label="Cesta k SRD">
          <input className={INPUT} placeholder="./srd" value={srdPath} onChange={(e) => setSrdPath(e.target.value)} />
        </Field>
        <p className={`font-log text-xs italic ${view.srd.total > 0 ? "text-subtext1" : "text-blood"}`}>
          {view.srd.total > 0
            ? `Načteno ${view.srd.total} záznamů (${view.srd.spells} kouzel, ${view.srd.monsters} nestvůr).`
            : "Žádný SRD dataset nenačten."}
        </p>
      </section>

      {error && <p className="font-log text-sm text-blood">{error}</p>}
      <div className="flex items-center gap-3">
        <button className="btn-gold self-start rounded px-3 py-1.5 text-sm disabled:opacity-50" disabled={saving} onClick={save}>
          {saving ? "Ukládám…" : "Uložit poskytovatele"}
        </button>
        {saved && <span className="font-log text-sm text-gold">Uloženo. Nastavení přežije i restart.</span>}
      </div>
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-sm uppercase tracking-wider text-subtext1">{children}</h3>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-log text-sm">
      <span className="text-subtext1">{label}</span>
      {children}
    </label>
  );
}
