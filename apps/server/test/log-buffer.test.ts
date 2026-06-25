import { describe, expect, it } from "vitest";
import { LogBuffer } from "../src/admin/log-buffer.js";

describe("LogBuffer (#59g)", () => {
  it("keeps recent lines and tails them oldest-first", () => {
    const buf = new LogBuffer(100);
    buf.push("one\ntwo\n");
    buf.push("three\n");
    expect(buf.tail()).toEqual(["one", "two", "three"]);
    expect(buf.tail(2)).toEqual(["two", "three"]);
  });

  it("drops the oldest lines past capacity", () => {
    const buf = new LogBuffer(3);
    for (let i = 1; i <= 5; i++) buf.push(`line${i}\n`);
    expect(buf.tail()).toEqual(["line3", "line4", "line5"]);
  });

  it("ignores blank lines and trims trailing whitespace", () => {
    const buf = new LogBuffer();
    buf.push("a  \n\n  \nb\n");
    expect(buf.tail()).toEqual(["a", "b"]);
  });

  it("tees writes through its stream into the buffer", async () => {
    const buf = new LogBuffer();
    const stream = buf.stream();
    await new Promise<void>((res) => stream.write('{"msg":"hi"}\n', () => res()));
    expect(buf.tail()).toEqual(['{"msg":"hi"}']);
  });
});
