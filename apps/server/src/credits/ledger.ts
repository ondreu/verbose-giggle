/**
 * Credit ledger (#56a). An append-only log of credit movements; a user's
 * balance is the SUM of their deltas. Append-only (never update/delete a row)
 * keeps a tamper-evident history and makes balance derivation trivial.
 *
 * Deltas are integers in the smallest credit unit — grants are positive,
 * charges negative — so there's no floating-point drift. Metering (#56b) and
 * enforcement (#56c) build on top; admin grants (#56d/#57) call `grant`.
 */
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/database.js";

export interface LedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  ref: string | null;
  createdAt: string;
}

interface LedgerRow {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  ref: string | null;
  created_at: string;
}

function rowToEntry(r: LedgerRow): LedgerEntry {
  return {
    id: r.id,
    userId: r.user_id,
    delta: r.delta,
    reason: r.reason,
    ref: r.ref,
    createdAt: r.created_at,
  };
}

export class CreditStore {
  constructor(private readonly db: AppDatabase) {}

  /** Append a movement. Positive `delta` credits, negative debits. */
  private record(userId: string, delta: number, reason: string, ref?: string | null): LedgerEntry {
    if (!Number.isInteger(delta)) throw new Error("credit delta must be an integer");
    const entry: LedgerEntry = {
      id: randomUUID(),
      userId,
      delta,
      reason,
      ref: ref ?? null,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        "INSERT INTO credit_ledger (id, user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(entry.id, entry.userId, entry.delta, entry.reason, entry.ref, entry.createdAt);
    return entry;
  }

  /** Add credits (top-up, admin grant). `amount` must be positive. */
  grant(userId: string, amount: number, reason: string, ref?: string | null): LedgerEntry {
    if (amount <= 0) throw new Error("grant amount must be positive");
    return this.record(userId, amount, reason, ref);
  }

  /** Deduct credits (metered usage). `amount` must be positive. */
  charge(userId: string, amount: number, reason: string, ref?: string | null): LedgerEntry {
    if (amount <= 0) throw new Error("charge amount must be positive");
    return this.record(userId, -amount, reason, ref);
  }

  /** Current balance = SUM(delta). Zero for an unknown user. */
  balance(userId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(delta), 0) AS bal FROM credit_ledger WHERE user_id = ?")
      .get(userId) as { bal: number };
    return row.bal;
  }

  /** Recent movements, newest first. */
  history(userId: string, limit = 100): LedgerEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(userId, limit) as unknown as LedgerRow[];
    return rows.map(rowToEntry);
  }
}
