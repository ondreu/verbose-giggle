/** Runtime configuration from environment (§9.1, §14.2). */
import type { Settings } from "./settings.js";

export interface Config {
  port: number;
  host: string;
  vaultPath: string;
  srdPath: string;
  llm: { baseUrl: string; apiKey: string; model: string; provider: "auto" | "mock" };
  piperUrl: string | null;
  basicAuth: string | null;
  webDist: string | null;
  image: { baseUrl: string; apiKey: string; model: string } | null;
}

export function loadConfig(): Config {
  const vaultPath = process.env.VAULT_PATH ?? "./data/vault";
  const llmApiKey = process.env.LLM_API_KEY ?? "";

  const imageBaseUrl = process.env.IMAGE_BASE_URL ?? null;
  const isMistral = imageBaseUrl?.includes("mistral.ai") ?? false;
  const image = imageBaseUrl
    ? {
        baseUrl: imageBaseUrl,
        apiKey: process.env.IMAGE_API_KEY || llmApiKey,
        model: process.env.IMAGE_MODEL ?? (isMistral ? "mistral-medium-2505" : "dall-e-3"),
      }
    : null;

  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "0.0.0.0",
    vaultPath,
    srdPath: process.env.SRD_PATH ?? `${vaultPath.replace(/\/$/, "")}/srd`,
    llm: {
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.mistral.ai/v1",
      apiKey: llmApiKey,
      model: process.env.LLM_MODEL ?? "mistral-medium-3.5",
      provider: process.env.LLM_PROVIDER === "mock" ? "mock" : "auto",
    },
    piperUrl: process.env.PIPER_URL ?? null,
    basicAuth: process.env.BASIC_AUTH || null,
    webDist: process.env.WEB_DIST ?? null,
    image,
  };
}

/** The default image model for a base URL when the user hasn't picked one. */
function defaultImageModel(baseUrl: string): string {
  return baseUrl.includes("mistral.ai") ? "mistral-medium-2505" : "dall-e-3";
}

/**
 * Overlay GUI-editable settings (vault `settings.json`) on top of the env
 * defaults to produce the effective config. Env is the bootstrap floor;
 * settings win where present so the table can configure the app without
 * touching `.env`. Per-campaign `campaign.yaml` still overrides on top of this
 * downstream (e.g. the LLM model), as before.
 */
export function applySettings(base: Config, s: Settings): Config {
  const llm = {
    baseUrl: s.llm?.baseUrl?.trim() || base.llm.baseUrl,
    apiKey: s.llm?.apiKey ?? base.llm.apiKey,
    model: s.llm?.model?.trim() || base.llm.model,
    provider: s.llm?.provider ?? base.llm.provider,
  };

  // Image: settings can enable/disable and override any field. It's active
  // when explicitly enabled with a base URL, or when env already provided one
  // and settings didn't turn it off.
  const imgBaseUrl = s.image?.baseUrl?.trim() || base.image?.baseUrl || "";
  const imageEnabled = s.image?.enabled ?? base.image != null;
  const image =
    imageEnabled && imgBaseUrl
      ? {
          baseUrl: imgBaseUrl,
          apiKey: (s.image?.apiKey ?? base.image?.apiKey ?? "") || llm.apiKey,
          model: s.image?.model?.trim() || base.image?.model || defaultImageModel(imgBaseUrl),
        }
      : null;

  return {
    ...base,
    srdPath: s.srdPath?.trim() || base.srdPath,
    llm,
    image,
  };
}
