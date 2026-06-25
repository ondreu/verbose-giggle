/**
 * Session store (#55c). Server-side sessions keyed by a random opaque id that
 * lives in an httpOnly cookie. Being server-side means logout and (later)
 * admin revocation actually invalidate a session, unlike a stateless JWT.
 */
import { randomBytes } from "node:crypto";
import type { AppDatabase } from "../db/database.js";

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export class SessionStore {
  constructor(private readonly db: AppDatabase) {}

  /** Create a session for `userId`, valid for `ttlMs`. Returns its id. */
  create(userId: string, ttlMs: number): Session {
    const id = randomBytes(32).toString("base64url");
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlMs).toISOString();
    this.db
      .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(id, userId, createdAt, expiresAt);
    return { id, userId, createdAt, expiresAt };
  }

  /** Look up a session by id if it exists and hasn't expired. */
  get(id: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | SessionRow
      | undefined;
    if (!row) return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
      this.delete(id);
      return null;
    }
    return { id: row.id, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at };
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  /** Drop every session for a user (password change, ban, account delete). */
  deleteForUser(userId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  /** Count sessions that haven't expired (admin health view, #57b). */
  countActive(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?")
      .get(new Date().toISOString()) as { n: number };
    return Number(row.n);
  }

  /** Remove expired rows (housekeeping). Returns the number deleted. */
  pruneExpired(): number {
    const res = this.db
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(new Date().toISOString());
    return Number(res.changes);
  }
}
