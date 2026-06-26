import type { Actor, Location, SessionState } from "@adm/schemas";
import type { Config } from "../config.js";

const STYLE =
  "Dark fantasy illustration, painterly D&D 5e art style, dramatic chiaroscuro lighting, rich detail, atmospheric and foreboding. ";

export type ImageSubject = "character" | "location" | "scene";

export interface ImageResult {
  url: string;
  prompt: string;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible client (DALL-E, Together AI FLUX, etc.)
// POST /images/generations → { data: [{ url?, b64_json? }] }
// ---------------------------------------------------------------------------
interface OpenAIImagesResponse {
  data: Array<{ url?: string; b64_json?: string }>;
}

class OpenAIImageClient {
  constructor(private cfg: NonNullable<Config["image"]>) {}

  async generate(prompt: string): Promise<ImageResult> {
    const res = await fetch(`${this.cfg.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({ model: this.cfg.model, prompt, n: 1, size: "1024x1024" }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Image API ${res.status}: ${text}`);
    }
    const body = (await res.json()) as OpenAIImagesResponse;
    const item = body.data?.[0];
    if (!item) throw new Error("Prázdná odpověď z image API");
    const url =
      item.url ??
      (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!url) throw new Error("Image API nevrátilo URL ani base64");
    return { url, prompt };
  }
}

// ---------------------------------------------------------------------------
// Mistral client — uses Agents + Conversations + Files APIs
// 1. POST /v1/agents  (lazy, created once per instance)
// 2. POST /v1/conversations  → file_id in tool_file chunk
// 3. GET  /v1/files/{file_id}/content  → binary → base64 data URL
// ---------------------------------------------------------------------------
interface MistralAgentResponse { id: string }
interface MistralConversationOutput {
  type: string;
  content?: Array<{
    type: string;
    text?: string;
    file_id?: string;
    file_name?: string;
  }>;
}
interface MistralConversationResponse {
  outputs: MistralConversationOutput[];
}

class MistralImageClient {
  private agentId: string | null = null;

  constructor(private cfg: NonNullable<Config["image"]>) {}

  private async ensureAgent(): Promise<string> {
    if (this.agentId) return this.agentId;
    const res = await fetch(`${this.cfg.baseUrl}/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: this.cfg.model,
        name: "adm-image-gen",
        instructions:
          "You are an image generation assistant for a D&D game. " +
          "When asked to create an image, always use the image_generation tool immediately.",
        tools: [{ type: "image_generation" }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Mistral create agent ${res.status}: ${text}`);
    }
    const body = (await res.json()) as MistralAgentResponse;
    this.agentId = body.id;
    return this.agentId;
  }

  async generate(prompt: string): Promise<ImageResult> {
    const agentId = await this.ensureAgent();

    const convRes = await fetch(`${this.cfg.baseUrl}/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({ agent_id: agentId, inputs: prompt, stream: false }),
    });
    if (!convRes.ok) {
      const text = await convRes.text().catch(() => convRes.statusText);
      throw new Error(`Mistral conversations ${convRes.status}: ${text}`);
    }
    const conv = (await convRes.json()) as MistralConversationResponse;

    // Find the first tool_file chunk across all outputs
    let fileId: string | null = null;
    for (const output of conv.outputs ?? []) {
      for (const chunk of output.content ?? []) {
        if (chunk.type === "tool_file" && chunk.file_id) {
          fileId = chunk.file_id;
          break;
        }
      }
      if (fileId) break;
    }
    if (!fileId) throw new Error("Mistral nevrátil žádný obrázek (file_id nenalezeno)");

    const fileRes = await fetch(`${this.cfg.baseUrl}/files/${encodeURIComponent(fileId)}/content`, {
      headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
    });
    if (!fileRes.ok) {
      throw new Error(`Mistral files ${fileRes.status}: ${fileRes.statusText}`);
    }
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const mime = fileRes.headers.get("content-type") ?? "image/png";
    const url = `data:${mime};base64,${buf.toString("base64")}`;
    return { url, prompt };
  }
}

// ---------------------------------------------------------------------------
// OpenRouter client — OpenRouter has NO OpenAI-style /images/generations
// endpoint. Image models (e.g. google/gemini-2.5-flash-image) generate through
// the regular chat-completions endpoint with modalities:["image","text"]; the
// image comes back as a data URL in message.images[].image_url.url.
// ---------------------------------------------------------------------------
interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
      images?: Array<{ type?: string; image_url?: { url?: string } }>;
    };
  }>;
}

class OpenRouterImageClient {
  constructor(private cfg: NonNullable<Config["image"]>) {}

  async generate(prompt: string): Promise<ImageResult> {
    // Tolerate a base URL the user pasted with a trailing /images (or slash):
    // OpenRouter wants /chat/completions off the API root, not an images path.
    const root = this.cfg.baseUrl.replace(/\/+$/, "").replace(/\/images$/, "");
    const res = await fetch(`${root}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Image API ${res.status}: ${text}`);
    }
    const body = (await res.json()) as OpenRouterChatResponse;
    const url = body.choices?.[0]?.message?.images?.find((i) => i.image_url?.url)?.image_url?.url;
    if (!url) throw new Error("OpenRouter nevrátil žádný obrázek (modalita image?)");
    return { url, prompt };
  }
}

// ---------------------------------------------------------------------------
// Factory — picks the right client based on base URL
// ---------------------------------------------------------------------------
export class ImageClient {
  private inner: OpenAIImageClient | MistralImageClient | OpenRouterImageClient;

  constructor(cfg: NonNullable<Config["image"]>) {
    this.inner = cfg.baseUrl.includes("mistral.ai")
      ? new MistralImageClient(cfg)
      : cfg.baseUrl.includes("openrouter.ai")
        ? new OpenRouterImageClient(cfg)
        : new OpenAIImageClient(cfg);
  }

  generate(prompt: string): Promise<ImageResult> {
    return this.inner.generate(prompt);
  }
}

const MAP_STYLE =
  "Hand-drawn fantasy overworld map on aged parchment, ink and watercolor cartography, " +
  "bird's-eye top-down view, compass rose, mountains, forests, rivers, roads and coastlines, " +
  "decorative border. ";

/** Prompt for a campaign overworld map from its name + authored locations (#37). */
export function buildMapPrompt(campaignName: string, locations: Record<string, Location>): string {
  const places = Object.values(locations)
    .filter((l) => l.kind !== "dungeon")
    .slice(0, 12)
    .map((l) => l.name);
  return (
    MAP_STYLE +
    `The world of ${campaignName}.` +
    (places.length ? ` Notable places: ${places.join(", ")}.` : "") +
    " Clean cartography, no rendered text labels."
  );
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------
export function buildPrompt(
  subject: ImageSubject,
  actors: Record<string, Actor>,
  locations: Record<string, Location>,
  session: SessionState,
  id?: string,
): string {
  if (subject === "character" && id) {
    const a = actors[id];
    if (!a) throw new Error(`Postava nenalezena: ${id}`);
    const extra = (a as Record<string, unknown>).description as string | undefined;
    const parts: string[] = [`Portrait of ${a.name}`];
    if (a.race || a.class)
      parts.push(`a ${[a.race, a.class].filter(Boolean).join(" ")}`);
    if (a.level > 1) parts.push(`level ${a.level} adventurer`);
    if (extra) parts.push(extra);
    parts.push("heroic pose, dark background");
    return STYLE + parts.join(", ") + ".";
  }

  if (subject === "location" && id) {
    const loc = locations[id];
    if (!loc) throw new Error(`Lokace nenalezena: ${id}`);
    const extra = (loc as Record<string, unknown>).description as string | undefined;
    return (
      STYLE +
      `A ${loc.kind} called ${loc.name}. ` +
      (extra ? extra + " " : "") +
      "Wide establishing shot, epic fantasy scale."
    );
  }

  // scene / atmosphere
  const locId = session.current_location;
  const loc = locations[locId];
  const locLabel = loc ? `${loc.kind} called ${loc.name}` : locId;
  const timeLabel = `hour ${session.time.hour}, day ${session.time.day}`;
  const combatLabel = session.combat ? "intense combat encounter" : "tense exploration";
  const visible = Object.values(actors)
    .slice(0, 5)
    .map((a) => `${a.name}${a.race ? ` (${a.race})` : ""}`)
    .join(", ");
  return (
    STYLE +
    `A ${combatLabel} in a ${locLabel}. ${timeLabel}. ` +
    (visible ? `Characters visible: ${visible}. ` : "") +
    "Cinematic wide angle, epic scale."
  );
}
