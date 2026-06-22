import type { Config } from "../config.js";

type AzureConfig = NonNullable<Config["azureTts"]>;

/** Escape text for safe inclusion in SSML (XML). */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build SSML for a dramatic Czech narrator. Prosody (rate/pitch) is universally
 * supported by neural voices; the optional mstts express-as style is only
 * emitted when configured, since most cs-CZ voices don't expose styles.
 */
export function buildSsml(cfg: AzureConfig, text: string): string {
  const inner = `<prosody rate="${cfg.rate}" pitch="${cfg.pitch}">${escapeXml(text)}</prosody>`;
  const styled = cfg.style
    ? `<mstts:express-as style="${escapeXml(cfg.style)}">${inner}</mstts:express-as>`
    : inner;
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="cs-CZ">` +
    `<voice name="${cfg.voice}">${styled}</voice></speak>`
  );
}

/**
 * Synthesize speech via the Azure AI Speech REST endpoint. Returns WAV bytes
 * (RIFF) per the configured output format. Throws on any non-2xx so the caller
 * can fall back to Piper.
 */
export async function synthesizeAzure(cfg: AzureConfig, text: string): Promise<Buffer> {
  const url = `https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": cfg.key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": cfg.format,
      "User-Agent": "ai-dungeon-master",
    },
    body: buildSsml(cfg, text),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Azure TTS ${res.status}: ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
