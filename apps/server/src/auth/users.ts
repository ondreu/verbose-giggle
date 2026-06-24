/**
 * User store (#55a) — the data layer for accounts.
 *
 * Pure persistence over the `users` table: create, look up, and mutate user
 * records. Higher-level concerns (registration flow, email verification tokens,
 * sessions, authorization) build on top in #55b–#55f. Passwords are hashed by
 * the caller via `./password.ts`; this store only reads/writes the hash string.
 */
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/database.js";

export type UserRole = "user" | "admin";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  role: UserRole;
  createdAt: string;
}

/** A row as stored in SQLite (integers for booleans). */
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  email_verified: number;
  role: string;
  created_at: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName?: string | null;
  role?: UserRole;
  /** Pre-verified at creation (e.g. the seeded admin). Defaults to false. */
  emailVerified?: boolean;
}

/** Normalize an email for storage and lookup: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Thrown when creating a user whose email already exists. */
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A user with email ${email} already exists`);
    this.name = "DuplicateEmailError";
  }
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: row.email_verified !== 0,
    role: row.role === "admin" ? "admin" : "user",
    createdAt: row.created_at,
  };
}

export class UserStore {
  constructor(private readonly db: AppDatabase) {}

  /** Create a user. Throws {@link DuplicateEmailError} on email collision. */
  create(input: CreateUserInput): User {
    const id = randomUUID();
    const email = normalizeEmail(input.email);
    const createdAt = new Date().toISOString();
    const role: UserRole = input.role ?? "user";
    try {
      this.db
        .prepare(
          `INSERT INTO users (id, email, password_hash, display_name, email_verified, role, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          email,
          input.passwordHash,
          input.displayName ?? null,
          input.emailVerified ? 1 : 0,
          role,
          createdAt,
        );
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed: users\.email/.test(err.message)) {
        throw new DuplicateEmailError(email);
      }
      throw err;
    }
    return {
      id,
      email,
      displayName: input.displayName ?? null,
      emailVerified: input.emailVerified ?? false,
      role,
      createdAt,
    };
  }

  findById(id: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  findByEmail(email: string): User | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(normalizeEmail(email)) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  /** Read the stored password hash for a user (login path). Null if no user. */
  getPasswordHash(id: string): string | null {
    const row = this.db.prepare("SELECT password_hash FROM users WHERE id = ?").get(id) as
      | { password_hash: string }
      | undefined;
    return row?.password_hash ?? null;
  }

  setPasswordHash(id: string, passwordHash: string): void {
    this.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
  }

  setEmailVerified(id: string, verified: boolean): void {
    this.db.prepare("UPDATE users SET email_verified = ? WHERE id = ?").run(verified ? 1 : 0, id);
  }

  setRole(id: string, role: UserRole): void {
    this.db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  }

  /** Update mutable profile fields. Only provided keys change. */
  updateProfile(id: string, patch: { email?: string; displayName?: string | null }): void {
    if (patch.email !== undefined) {
      this.db
        .prepare("UPDATE users SET email = ? WHERE id = ?")
        .run(normalizeEmail(patch.email), id);
    }
    if (patch.displayName !== undefined) {
      this.db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(patch.displayName, id);
    }
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  /** All users, newest first (admin panel, #57). */
  list(): User[] {
    const rows = this.db
      .prepare("SELECT * FROM users ORDER BY created_at DESC")
      .all() as unknown as UserRow[];
    return rows.map(rowToUser);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    return row.n;
  }
}
