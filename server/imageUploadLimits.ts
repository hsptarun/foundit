import db from './db';

/**
 * Image upload rate limiting (Phase 2A) — 1 image per user per hour.
 *
 * WHY A NEW TABLE (instead of audit_logs):
 * `audit_logs` is append-only — it has no per-user uniqueness and its rows are
 * never mutated. Enforcing the limit requires an ATOMIC per-user claim row that
 * transitions pending → success (or is deleted when the Supabase upload fails,
 * so a failed attempt never consumes the allowance). Mutation + uniqueness are
 * incompatible with an audit trail, so a dedicated table is the smallest safe
 * mechanism. No image data is ever stored here — only timestamps.
 *
 * RACE PROTECTION: better-sqlite3 is synchronous, so the check+claim below runs
 * inside a single `BEGIN IMMEDIATE` transaction that cannot interleave with
 * another request on this Node process; `BEGIN IMMEDIATE` additionally takes
 * the database write lock, serializing multi-process access. Two simultaneous
 * uploads from the same user can therefore never both pass the check.
 */

const HOUR_MS = 60 * 60 * 1000;

// Idempotent, minimal schema. user_id matches users.id (TEXT, UUID).
db.exec(`
  CREATE TABLE IF NOT EXISTS image_upload_limits (
    user_id TEXT PRIMARY KEY,
    claimed_at INTEGER NOT NULL,          -- ms epoch when the slot was claimed
    last_success_at INTEGER,              -- ms epoch of the last successful Supabase upload
    updated_at INTEGER NOT NULL
  );
`);

interface LimitRow {
  user_id: string;
  claimed_at: number;
  last_success_at: number | null;
  updated_at: number;
}

export interface UploadWindow {
  allowed: boolean;
  /** ms remaining until the user may upload again (0 when allowed) */
  retryAfterMs: number;
}

/**
 * Atomically check the 1-hour window and claim the slot for this user.
 * The claim row is committed BEFORE the Supabase upload starts; concurrent
 * requests for the same user hit the committed claim and are rejected.
 * Call `confirmUpload()` on success or `releaseClaim()` on failure.
 */
export function claimUploadSlot(userId: string): UploadWindow {
  const now = Date.now();
  const tx = db.transaction((): UploadWindow => {
    const row = db
      .prepare(`SELECT claimed_at, last_success_at FROM image_upload_limits WHERE user_id = ?`)
      .get(userId) as LimitRow | undefined;

    // The effective window anchor is the latest of the two: a still-pending
    // claim (in-flight upload) or the last confirmed success.
    const anchor = row ? Math.max(row.claimed_at, row.last_success_at ?? 0) : 0;

    if (row && now - anchor < HOUR_MS) {
      return { allowed: false, retryAfterMs: HOUR_MS - (now - anchor) };
    }

    db.prepare(`
      INSERT INTO image_upload_limits (user_id, claimed_at, last_success_at, updated_at)
      VALUES (?, ?, NULL, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        claimed_at = excluded.claimed_at,
        last_success_at = NULL,
        updated_at = excluded.updated_at
    `).run(userId, now, now);

    return { allowed: true, retryAfterMs: 0 };
  });
  // immediate: acquire the write lock up front → serialized claims, no races.
  return tx.immediate();
}

/** Called after the Supabase Storage upload SUCCEEDS — starts the 1-hour window. */
export function confirmUpload(userId: string): void {
  db.prepare(`
    UPDATE image_upload_limits
    SET last_success_at = ?, updated_at = ?
    WHERE user_id = ?
  `).run(Date.now(), Date.now(), userId);
}

/**
 * Called when the upload FAILS — frees the slot so a failed attempt
 * never consumes the user's 1-hour allowance.
 */
export function releaseClaim(userId: string): void {
  db.prepare(`DELETE FROM image_upload_limits WHERE user_id = ?`).run(userId);
}

/** Test/dev helper: clear the window for a user (not exposed via any route). */
export function resetUploadWindowForTests(userId: string): void {
  db.prepare(`DELETE FROM image_upload_limits WHERE user_id = ?`).run(userId);
}

export const IMAGE_UPLOAD_WINDOW_MS = HOUR_MS;
