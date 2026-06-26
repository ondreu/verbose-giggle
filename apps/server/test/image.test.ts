import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageClient } from "../src/llm/image.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ImageClient provider routing", () => {
  it("OpenRouter goes through chat/completions with image modality", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = new ImageClient({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "k",
      model: "google/gemini-2.5-flash-image",
    });
    const res = await client.generate("a dragon");

    expect(res.url).toBe("data:image/png;base64,AAAA");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0].body).toMatchObject({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
    });
  });

  it("tolerates a base URL pasted with a trailing /images", async () => {
    let seen = "";
    vi.stubGlobal("fetch", async (url: string) => {
      seen = url;
      return new Response(
        JSON.stringify({
          choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,BBBB" } }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = new ImageClient({
      baseUrl: "https://openrouter.ai/api/v1/images",
      apiKey: "k",
      model: "google/gemini-2.5-flash-image",
    });
    await client.generate("a castle");
    expect(seen).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("OpenAI-compatible providers still use /images/generations", async () => {
    let seen = "";
    vi.stubGlobal("fetch", async (url: string) => {
      seen = url;
      return new Response(JSON.stringify({ data: [{ url: "https://img/1.png" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = new ImageClient({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "k",
      model: "dall-e-3",
    });
    const res = await client.generate("a sword");
    expect(res.url).toBe("https://img/1.png");
    expect(seen).toBe("https://api.openai.com/v1/images/generations");
  });
});
