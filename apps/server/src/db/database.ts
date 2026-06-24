/**
 * App database — a small SQLite file in the vault (#55a).
 *
 * The accounts/credits push (#55–58) needs durable per-user records that the
 * file-per-entity vault layout doesn't model well. Rather than add new infra we
 * stay "file-first" and keep a single SQLite file under `<vault>/db/app.db`,
 * alongside the rest of the mounted data.
 *
 * We use Node's built-in `node:sqlite` (Node 22+) on purpose: it ships with the
 * runtime, so there's no native build step (better-sqlite3 / node-gyp) in the
 * Docker image. The module is still flagged experimental, hence the runtime
 * `ExperimentalWarning`; the surface we use (exec/prepare/run/get/all) is
 * stable.
 *
 * Migrations are idempotent `CREATE TABLE IF NOT EXISTS` statements guarded by a
 * `user_version` pragma, so opening an existing DB is a no-op and adding a table
 * later is a new numbered step. Subsequent milestones add their own tables here
 * (#56 `credit_ledger`, #57 `audit_log`).
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as SqliteDatabase } from "node:sqlite";

// Load `node:sqlite` through createRequire rather than a static import: it's a
// Node 22+ builtin newer than the bundlers in the toolchain (vite-node) know
// about, so a static `import` makes them try to resolve a "sqlite" package and
// fail. createRequire defers to Node's own loader, which has the builtin.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export type AppDatabase = SqliteDatabase;

/** Ordered, idempotent migration steps. Index + 1 is the schema version. */
const MIGRATIONS: ReadonlyArray<(db: SqliteDatabase) => void> = [
  // v1 — users (#55a).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id             TEXT PRIMARY KEY,
        email          TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        display_name   TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
        role           TEXT NOT NULL DEFAULT 'user',
        created_at     TEXT NOT NULL
      ) STRICT;
    `);
    // Email is matched case-insensitively after normalization, but we normalize
    // to lowercase on write so a plain UNIQUE index is enough; the index above
    // (via UNIQUE) already covers lookups by email.
  },
];

function migrate(db: SqliteDatabase): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  const row = db.prepare("PRAGMA user_version;").get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    MIGRATIONS[v]!(db);
    // PRAGMA user_version doesn't accept bound params; the value is an integer
    // we control, so interpolation is safe.
    db.exec(`PRAGMA user_version = ${v + 1};`);
  }
}

/**
 * Open (creating if needed) the vault's app database and run migrations. The
 * returned handle is long-lived; the server opens it once at startup.
 */
export function openDatabase(vaultPath: string): AppDatabase {
  const dir = path.join(vaultPath, "db");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "app.db"));
  migrate(db);
  return db;
}

/** Open an in-memory database (tests, ephemeral use). */
export function openInMemoryDatabase(): AppDatabase {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}
