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

/** Ledger reason for the one-time signup welcome bonus (#56). */
export const SIGNUP_BONUS_REASON = "signup-bonus";

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

  /**
   * Whether the user already has a ledger entry with the given reason. Used to
   * make one-time grants (e.g. the signup welcome bonus) idempotent so a user
   * who re-verifies their email can't collect the bonus twice.
   */
  hasReason(userId: string, reason: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM credit_ledger WHERE user_id = ? AND reason = ? LIMIT 1")
      .get(userId, reason) as { 1: number } | undefined;
    return row != null;
  }

  /** Current balance = SUM(delta). Zero for an unknown user. */
  balance(userId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(delta), 0) AS bal FROM credit_ledger WHERE user_id = ?")
      .get(userId) as { bal: number };
    return row.bal;
  }

  /**
   * Aggregate spend/grant for the admin usage view (#57b). Returns per-reason
   * totals (spent = sum of debits, granted = sum of credits) and a per-user
   * roll-up (balance + total spent), newest activity first. Derived purely from
   * the append-only ledger, so it's exact and survives a redeploy with the DB.
   */
  usageSummary(): {
    byReason: { reason: string; spent: number; granted: number; count: number }[];
    byUser: { userId: string; balance: number; spent: number; entries: number }[];
    totals: { spent: number; granted: number; entries: number };
  } {
    const byReason = this.db
      .prepare(
        `SELECT reason,
                COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent,
                COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS granted,
                COUNT(*) AS count
           FROM credit_ledger GROUP BY reason ORDER BY spent DESC, granted DESC`,
      )
      .all() as unknown as { reason: string; spent: number; granted: number; count: number }[];
    const byUser = this.db
      .prepare(
        `SELECT user_id AS userId,
                COALESCE(SUM(delta), 0) AS balance,
                COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent,
                COUNT(*) AS entries
           FROM credit_ledger GROUP BY user_id ORDER BY spent DESC`,
      )
      .all() as unknown as { userId: string; balance: number; spent: number; entries: number }[];
    const totals = byReason.reduce(
      (acc, r) => ({
        spent: acc.spent + r.spent,
        granted: acc.granted + r.granted,
        entries: acc.entries + r.count,
      }),
      { spent: 0, granted: 0, entries: 0 },
    );
    return { byReason, byUser, totals };
  }

  /** Recent movements, newest first. */
  history(userId: string, limit = 100): LedgerEntry[] {
    // Tiebreak on rowid (insertion order) so entries created within the same
    // millisecond still return newest-first deterministically.
    const rows = this.db
      .prepare("SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(userId, limit) as unknown as LedgerRow[];
    return rows.map(rowToEntry);
  }
}
