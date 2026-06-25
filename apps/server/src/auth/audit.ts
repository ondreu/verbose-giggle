/**
 * Audit log (#57c). Append-only record of admin actions (role changes, bans,
 * deletions, later credit grants). Never updated or deleted in normal
 * operation — it's the trail for "who did what".
 */
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/database.js";

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}

export class AuditStore {
  constructor(private readonly db: AppDatabase) {}

  /** Append an entry. `detail` is free-form (kept short / human-readable). */
  record(actorId: string, action: string, targetId?: string | null, detail?: string | null): AuditEntry {
    const entry: AuditEntry = {
      id: randomUUID(),
      actorId,
      action,
      targetId: targetId ?? null,
      detail: detail ?? null,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        "INSERT INTO audit_log (id, actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(entry.id, entry.actorId, entry.action, entry.targetId, entry.detail, entry.createdAt);
    return entry;
  }

  /** Most recent entries first, with `limit`/`offset` paging (#59h). */
  list(opts: { limit?: number; offset?: number } = {}): AuditEntry[] {
    const limit = opts.limit ?? 200;
    const offset = opts.offset ?? 0;
    // Tiebreak on rowid (insertion order) for entries sharing a millisecond.
    const rows = this.db
      .prepare("SELECT * FROM audit_log ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as unknown as AuditRow[];
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      targetId: r.target_id,
      detail: r.detail,
      createdAt: r.created_at,
    }));
  }

  /** Total number of audit entries (for pagination, #59h). */
  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number };
    return row.n;
  }
}
