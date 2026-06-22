import type { Actor, Location, SessionState } from "@adm/schemas";
import type { Config } from "../config.js";

const STYLE =
  "Dark fantasy illustration, painterly D&D 5e art style, dramatic chiaroscuro lighting, rich detail, atmospheric and foreboding. ";

export type ImageSubject = "character" | "location" | "scene";

export interface ImageResult {
  url: string;
  prompt: string;
}

interface ImagesResponse {
  data: Array<{ url?: string; b64_json?: string }>;
}

export class ImageClient {
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
    const body = (await res.json()) as ImagesResponse;
    const item = body.data?.[0];
    if (!item) throw new Error("Prázdná odpověď z image API");
    const url =
      item.url ??
      (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!url) throw new Error("Image API nevrátilo URL ani base64");
    return { url, prompt };
  }
}

/** Build a descriptive image prompt from structured game data. */
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
