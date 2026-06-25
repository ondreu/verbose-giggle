import { useEffect, useState } from "react";

const INPUT = "w-full rounded border border-ink/25 bg-bg-crust px-2 py-1 text-sm text-ink";

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

  const [provider, setProvider] = useState<"auto" | "mock">("auto");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
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
        llm: {
          provider,
          baseUrl: llmBaseUrl,
          model: llmModel,
          altModels: llmAltModels.split(/[\n,]/).map((m) => m.trim()).filter(Boolean),
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

  if (!view) return <p className="font-log text-sm text-ink/50">{error ?? "Načítám…"}</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 font-log text-sm text-ink/70">
        <span className={`h-2 w-2 rounded-full ${view.activeNarrator === "llm" ? "bg-gold" : "bg-ink/40"}`} />
        {view.activeNarrator === "llm" ? "Aktivní vypravěč: jazykový model" : "Aktivní vypravěč: offline mock"}
      </div>

      <section className="flex flex-col gap-2">
        <H3>Jazykový model (AI DM)</H3>
        <Field label="Režim">
          <select className="prov-input" value={provider} onChange={(e) => setProvider(e.target.value as "auto" | "mock")}>
            <option value="auto">Automaticky (model, je-li klíč)</option>
            <option value="mock">Vynutit offline mock</option>
          </select>
        </Field>
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
          <input className="prov-input" value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} />
        </Field>
        <Field label="Model">
          <input className="prov-input" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} />
        </Field>
        <Field label="Alternativní modely („Jiným modelem“) — jeden na řádek">
          <textarea
            className={`${INPUT} min-h-[4rem] resize-y font-log text-xs`}
            value={llmAltModels}
            onChange={(e) => setLlmAltModels(e.target.value)}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-2">
        <H3>Generování obrázků</H3>
        <label className="flex items-center gap-2 font-log text-sm text-ink/75">
          <input type="checkbox" className="accent-gold" checked={imageEnabled} onChange={(e) => setImageEnabled(e.target.checked)} />
          Povolit generování obrázků
        </label>
        {imageEnabled && (
          <>
            <Field label="Base URL">
              <input className="prov-input" placeholder="https://api.mistral.ai/v1" value={imageBaseUrl} onChange={(e) => setImageBaseUrl(e.target.value)} />
            </Field>
            <Field label="Model">
              <input className="prov-input" placeholder="výchozí dle poskytovatele" value={imageModel} onChange={(e) => setImageModel(e.target.value)} />
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
        <p className="font-log text-xs italic text-ink/55">
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
            <input className="prov-input" placeholder="westeurope" value={ttsRegion} onChange={(e) => setTtsRegion(e.target.value)} />
          </Field>
          <Field label="Hlas">
            <select className="prov-input" value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
              {!["cs-CZ-AntoninNeural", "cs-CZ-VlastaNeural"].includes(ttsVoice) && <option value={ttsVoice}>{ttsVoice}</option>}
              <option value="cs-CZ-AntoninNeural">cs-CZ-AntoninNeural (mužský)</option>
              <option value="cs-CZ-VlastaNeural">cs-CZ-VlastaNeural (ženský)</option>
            </select>
          </Field>
          <Field label="Tempo (rate)">
            <input className="prov-input" placeholder="-6%" value={ttsRate} onChange={(e) => setTtsRate(e.target.value)} />
          </Field>
          <Field label="Výška (pitch)">
            <input className="prov-input" placeholder="-2%" value={ttsPitch} onChange={(e) => setTtsPitch(e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <H3>SRD dataset</H3>
        <Field label="Cesta k SRD">
          <input className="prov-input" placeholder="./srd" value={srdPath} onChange={(e) => setSrdPath(e.target.value)} />
        </Field>
        <p className={`font-log text-xs italic ${view.srd.total > 0 ? "text-ink/55" : "text-blood"}`}>
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
  return <h3 className="font-display text-sm uppercase tracking-wider text-ink/70">{children}</h3>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-log text-sm">
      <span className="text-ink/70">{label}</span>
      {children}
    </label>
  );
}
