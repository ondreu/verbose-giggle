import { describe, expect, it } from "vitest";
import { stripMarkdown } from "./store";

describe("stripMarkdown (TTS, #27)", () => {
  it("removes bold/italic/code markers but keeps the words", () => {
    expect(stripMarkdown("**Thorin** zvedá *sekeru* a `zařve`."))
      .toBe("Thorin zvedá sekeru a zařve.");
  });

  it("strips heading and list prefixes", () => {
    const md = "# Hostinec\n\n- první\n- druhý\n1. krok";
    expect(stripMarkdown(md)).toBe("Hostinec\n\nprvní\ndruhý\nkrok");
  });

  it("keeps link/image text, drops the URL", () => {
    expect(stripMarkdown("Viz [mapa](http://x/y) a ![oltář](z.png)."))
      .toBe("Viz mapa a oltář.");
  });

  it("drops horizontal rules and blockquote markers", () => {
    expect(stripMarkdown("> cituji\n\n---\n\ndál")).toBe("cituji\n\ndál");
  });

  it("leaves plain prose untouched", () => {
    expect(stripMarkdown("Prostá věta bez formátování.")).toBe(
      "Prostá věta bez formátování.",
    );
  });
});
