import { promises as fs } from "node:fs";
import path from "node:path";

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

/** Recursively collect files under `dir` as POSIX-relative entries. */
async function collect(dir: string, base = ""): Promise<{ name: string; data: Buffer }[]> {
  const out: { name: string; data: Buffer }[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await collect(abs, rel)));
    else if (e.isFile()) out.push({ name: rel, data: await fs.readFile(abs) });
  }
  return out;
}

/** Build a ZIP archive (STORE method) of every file under `dir`. */
export async function zipDir(dir: string): Promise<Buffer> {
  const files = await collect(dir);
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

/** List every file under `dir` as POSIX-relative paths, sorted (read-only tree). */
export async function listFiles(dir: string): Promise<string[]> {
  const files = await collect(dir);
  return files.map((f) => f.name).sort();
}
