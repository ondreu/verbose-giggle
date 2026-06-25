import { promises as fs, createWriteStream } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Minimal dependency-free ZIP writer (#35). Produces a valid archive using the
 * STORE method (no compression) — enough to export a campaign folder for backup
 * without pulling in a zip library. Handles nested directories; entry names use
 * forward slashes per the ZIP spec.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string;
  data: Buffer;
  crc: number;
  offset: number;
}

/**
 * Recursively collect files under `dir` as POSIX-relative entries. An optional
 * `exclude` predicate (tested against the POSIX-relative path) skips files or
 * whole subtrees — used by the vault backup (#57b) to avoid zipping the backups
 * folder into itself.
 */
async function collect(
  dir: string,
  exclude?: (rel: string) => boolean,
  base = "",
): Promise<{ name: string; data: Buffer }[]> {
  const out: { name: string; data: Buffer }[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (exclude?.(rel)) continue;
    if (e.isDirectory()) out.push(...(await collect(abs, exclude, rel)));
    else if (e.isFile()) out.push({ name: rel, data: await fs.readFile(abs) });
  }
  return out;
}

/** Build a ZIP archive (STORE method) of every file under `dir`. */
export async function zipDir(dir: string, exclude?: (rel: string) => boolean): Promise<Buffer> {
  return zipFiles(await collect(dir, exclude));
}

/**
 * Build a ZIP archive (STORE method) from in-memory entries. Lets callers mix
 * files read off disk with generated content (e.g. a GDPR export's
 * `account.json` alongside the user's vault files, #59e). Entry names use
 * forward slashes per the ZIP spec.
 */
export function zipFiles(files: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const entries: Entry[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // local file header signature
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // flags: UTF-8 filename
    header.writeUInt16LE(0, 8); // method: store
    header.writeUInt16LE(0, 10); // mod time
    header.writeUInt16LE(0, 12); // mod date
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(f.data.length, 18); // compressed size
    header.writeUInt32LE(f.data.length, 22); // uncompressed size
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28); // extra length
    local.push(header, nameBuf, f.data);
    entries.push({ name: f.name, data: f.data, crc, offset });
    offset += header.length + nameBuf.length + f.data.length;
  }

  const central: Buffer[] = [];
  let centralSize = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central dir signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8); // flags: UTF-8
    cd.writeUInt16LE(0, 10); // method
    cd.writeUInt16LE(0, 12); // time
    cd.writeUInt16LE(0, 14); // date
    cd.writeUInt32LE(e.crc, 16);
    cd.writeUInt32LE(e.data.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk number
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(e.offset, 42);
    central.push(cd, nameBuf);
    centralSize += cd.length + nameBuf.length;
  }

  const localBuf = Buffer.concat(local);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // disk
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(entries.length, 8); // entries on disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(localBuf.length, 16); // central dir offset
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localBuf, ...central, end]);
}

/** Local-file-header bytes for one STORE entry (everything but the data). */
function localHeader(name: Buffer, crc: number, size: number): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0x0800, 6); // flags: UTF-8 filename
  header.writeUInt16LE(0, 8); // method: store
  header.writeUInt16LE(0, 10); // mod time
  header.writeUInt16LE(0, 12); // mod date
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18); // compressed size
  header.writeUInt32LE(size, 22); // uncompressed size
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28); // extra length
  return header;
}

/** List file names (not contents) under `dir`, so a writer can stream them. */
async function collectNames(
  dir: string,
  exclude?: (rel: string) => boolean,
  base = "",
): Promise<{ abs: string; name: string }[]> {
  const out: { abs: string; name: string }[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (exclude?.(rel)) continue;
    if (e.isDirectory()) out.push(...(await collectNames(abs, exclude, rel)));
    else if (e.isFile()) out.push({ abs, name: rel });
  }
  return out;
}

/**
 * Stream a ZIP archive (STORE method) of every file under `dir` straight to
 * `target`, one file at a time (#59c). Unlike {@link zipDir}, the whole archive
 * is never held in memory — only the current file is — so backing up a large
 * vault (maps, audio) can't blow up RSS. `mode` defaults to 0o600 because a
 * vault backup contains password hashes and should not be world-readable.
 */
export async function zipDirToFile(
  dir: string,
  target: string,
  exclude?: (rel: string) => boolean,
  mode = 0o600,
): Promise<void> {
  const files = await collectNames(dir, exclude);
  const stream = createWriteStream(target, { mode });
  const errored = once(stream, "error").then(([err]) => {
    throw err;
  });
  const write = async (buf: Buffer): Promise<void> => {
    if (!stream.write(buf)) await Promise.race([once(stream, "drain"), errored]);
  };

  const entries: { name: string; crc: number; size: number; offset: number }[] = [];
  let offset = 0;
  for (const f of files) {
    const data = await fs.readFile(f.abs);
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(data);
    const header = localHeader(nameBuf, crc, data.length);
    await write(header);
    await write(nameBuf);
    await write(data);
    entries.push({ name: f.name, crc, size: data.length, offset });
    offset += header.length + nameBuf.length + data.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central dir signature
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8); // flags: UTF-8
    cd.writeUInt16LE(0, 10); // method
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(e.crc, 16);
    cd.writeUInt32LE(e.size, 20);
    cd.writeUInt32LE(e.size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(e.offset, 42);
    await write(cd);
    await write(nameBuf);
    centralSize += cd.length + nameBuf.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // EOCD signature
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  await write(end);

  stream.end();
  await Promise.race([once(stream, "finish"), errored]);
}

/** List every file under `dir` as POSIX-relative paths, sorted (read-only tree). */
export async function listFiles(dir: string): Promise<string[]> {
  const files = await collect(dir);
  return files.map((f) => f.name).sort();
}

/** Total byte size of every file under `dir` (0 if it doesn't exist). */
export async function dirSize(dir: string): Promise<number> {
  try {
    const files = await collect(dir);
    return files.reduce((sum, f) => sum + f.data.length, 0);
  } catch {
    return 0;
  }
}

/** Reject zip-slip / absolute entries; return a confined POSIX-relative path. */
function sanitizeEntry(name: string): string | null {
  const norm = name.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = norm.split("/").filter((s) => s && s !== ".");
  if (parts.length === 0 || parts.some((s) => s === "..")) return null;
  return parts.join("/");
}

/** Locate the End Of Central Directory record, scanning back from the tail. */
function findEocd(zip: Buffer): number {
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * List the file entry names in a ZIP via its central directory, without
 * extracting. Used to validate an uploaded backup (#59c) before staging it.
 * Throws on a structurally invalid archive.
 */
export function listZipEntries(zip: Buffer): string[] {
  const eocd = findEocd(zip);
  if (eocd < 0) throw new Error("Neplatný ZIP soubor (chybí EOCD).");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Poškozený ZIP (central dir).");
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    names.push(zip.toString("utf8", p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/**
 * Extract a ZIP archive into `destDir` (#worlds upload). Reads via the central
 * directory so it tolerates archives written by other tools, and supports both
 * STORE (method 0) and DEFLATE (method 8). Existing files are overwritten;
 * entries that try to escape the destination (zip-slip) are skipped. Returns
 * the number of files written.
 */
export async function unzipInto(destDir: string, zip: Buffer): Promise<number> {
  const eocd = findEocd(zip);
  if (eocd < 0) throw new Error("Neplatný ZIP soubor (chybí EOCD).");

  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16); // central directory offset
  let written = 0;

  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Poškozený ZIP (central dir).");
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directory entry
    const safe = sanitizeEntry(name);
    if (!safe) continue; // zip-slip / unsafe — skip

    if (zip.readUInt32LE(localOff) !== 0x04034b50) throw new Error("Poškozený ZIP (local header).");
    const lNameLen = zip.readUInt16LE(localOff + 26);
    const lExtraLen = zip.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = zip.subarray(dataStart, dataStart + compSize);

    let data: Buffer;
    if (method === 0) data = Buffer.from(comp);
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error(`Nepodporovaná komprese ZIP (metoda ${method}).`);

    const abs = path.join(destDir, safe);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
    written++;
  }
  return written;
}
