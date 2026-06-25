/**
 * In-memory ring buffer of recent server log lines (#59g). The audit log records
 * *admin actions*; this is the operational tail — the pino output the process
 * would otherwise only write to stdout — surfaced read-only in the admin panel
 * for quick "what just happened" debugging without shell access to the box.
 *
 * Bounded by line count so it can never grow without limit. The buffer tees the
 * logger stream: every line still goes to stdout (container logs) and is also
 * kept here. Lines are stored verbatim (pino JSON), so the viewer can show them
 * raw or parse as it likes.
 */
import { Writable } from "node:stream";

export class LogBuffer {
  private lines: string[] = [];

  constructor(private readonly capacity = 1000) {}

  /** Append raw output (may contain several newline-separated log lines). */
  push(chunk: string): void {
    for (const raw of chunk.split("\n")) {
      const line = raw.trimEnd();
      if (line) this.lines.push(line);
    }
    if (this.lines.length > this.capacity) {
      this.lines.splice(0, this.lines.length - this.capacity);
    }
  }

  /** The most recent `limit` lines, oldest first. */
  tail(limit = 200): string[] {
    const n = Math.max(0, Math.min(limit, this.lines.length));
    return this.lines.slice(this.lines.length - n);
  }

  /**
   * A Writable for pino's `stream` option that tees each line to stdout (so
   * container/log collectors still see everything) and into this buffer.
   */
  stream(): Writable {
    return new Writable({
      write: (chunk, _enc, cb) => {
        const s = chunk.toString("utf8");
        process.stdout.write(s);
        this.push(s);
        cb();
      },
    });
  }
}
