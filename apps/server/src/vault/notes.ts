import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/** A parsed vault note: frontmatter (machine truth) + body (flavor for the LLM). */
export interface Note<T = Record<string, unknown>> {
  /** Absolute path the note was read from. */
  filePath: string;
  data: T;
  body: string;
}

export async function readNote<T = Record<string, unknown>>(filePath: string): Promise<Note<T>> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  return { filePath, data: parsed.data as T, body: parsed.content.trimStart() };
}

/**
 * Write a note back atomically (temp file + rename) so a sync tool never sees a
 * half-written file. Frontmatter is serialized via gray-matter; the body is
 * preserved verbatim.
 */
export async function writeNote(note: Note): Promise<void> {
  const serialized = matter.stringify(`\n${note.body}\n`, note.data);
  const dir = path.dirname(note.filePath);
  const tmp = path.join(dir, `.${path.basename(note.filePath)}.tmp-${process.pid}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, serialized, "utf8");
  await fs.rename(tmp, note.filePath);
}

/** List markdown notes in a directory (non-recursive), ignoring dotfiles. */
export async function listNotes(dir: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .map((f) => path.join(dir, f));
}
