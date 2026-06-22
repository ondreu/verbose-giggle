/** Runtime configuration from environment (§9.1, §14.2). */
export interface Config {
  port: number;
  host: string;
  vaultPath: string;
  srdPath: string;
  llm: { baseUrl: string; apiKey: string; model: string };
  piperUrl: string | null;
  basicAuth: string | null;
  webDist: string | null;
  image: { baseUrl: string; apiKey: string; model: string } | null;
}

export function loadConfig(): Config {
  const vaultPath = process.env.VAULT_PATH ?? "./data/vault";
  const llmApiKey = process.env.LLM_API_KEY ?? "";

  const imageBaseUrl = process.env.IMAGE_BASE_URL ?? null;
  const image = imageBaseUrl
    ? {
        baseUrl: imageBaseUrl,
        apiKey: process.env.IMAGE_API_KEY || llmApiKey,
        model: process.env.IMAGE_MODEL ?? "dall-e-3",
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
    },
    piperUrl: process.env.PIPER_URL ?? null,
    basicAuth: process.env.BASIC_AUTH || null,
    webDist: process.env.WEB_DIST ?? null,
    image,
  };
}
