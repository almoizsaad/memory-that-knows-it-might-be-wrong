/**
 * The Memory Engine — forget path.
 *
 * Four distinct mechanisms live here, deliberately not collapsed into one
 * "cleanup" function, because they answer different questions and the
 * failure tests (FAILURE_TESTS.md) each target one of them:
 *
 *   1. tick()   — TTL expiry + confidence decay for anything not reconfirmed.
 *   2. revoke() — user-willed deletion, with cascade to derived records.
 *      (explicit supersession is handled in memoryEngine.ts's ingest(),
 *       since it only ever happens as a side effect of a new write.)
 */

import type {
  ForgetTickResult,
  MemoryRecord,
  MemoryStoreState,
  RevokeResult,
} from "./types";

const DECAY_GRACE_DAYS = 90;
const DECAY_HALF_LIFE_DAYS = 180;
const RETRIEVAL_FLOOR = 0.2;

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

/**
 * Confidence decay is not "reconfirmed" (which comes from confirm() in
 * memoryEngine.ts). It's a slow one-way slide for records nobody has
 * touched in a long time. Facts are given DECAY_GRACE_DAYS untouched before
 * decay starts, then decay on a half-life curve rather than falling off a
 * cliff — a memory from 91 days ago and one from 89 days ago should be
 * nearly indistinguishable.
 */
function decayedConfidence(record: MemoryRecord, now: string): number {
  const anchor = record.lastConfirmedAt ?? record.writtenAt;
  const age = daysBetween(anchor, now);
  if (age <= DECAY_GRACE_DAYS) return record.confidence;
  const decayDays = age - DECAY_GRACE_DAYS;
  const factor = Math.pow(0.5, decayDays / DECAY_HALF_LIFE_DAYS);
  return Math.max(RETRIEVAL_FLOOR * 0.5, record.confidence * factor);
}

export function tick(state: MemoryStoreState, now: string): ForgetTickResult {
  const expired: string[] = [];
  const decayed: { id: string; from: number; to: number }[] = [];

  const records = state.records.map((r) => {
    if (r.status !== "active" && r.status !== "needs_verification") return r;

    if (r.expiresAt && Date.parse(r.expiresAt) <= Date.parse(now)) {
      expired.push(r.id);
      return {
        ...r,
        status: "expired" as const,
        invalidAt: now,
        closedReason: `Reached its expiresAt (${r.expiresAt})`,
      };
    }

    const next = decayedConfidence(r, now);
    if (Math.abs(next - r.confidence) > 0.001) {
      decayed.push({ id: r.id, from: r.confidence, to: next });
      return { ...r, confidence: next };
    }
    return r;
  });

  return { state: { ...state, records, now }, expired, decayed };
}

/** Whether a decayed-but-not-expired record should still surface in a default retrieval, vs. only in the inspector. */
export function isBelowRetrievalFloor(record: MemoryRecord): boolean {
  return record.confidence < RETRIEVAL_FLOOR;
}

/**
 * Revoke every record on a topic (identified by id or topicKey), plus every
 * record whose supersession chain traces back to one of those — a
 * correction that cites a fact the user just revoked shouldn't survive the
 * revocation just because it was technically a separate write.
 */
export function revoke(
  state: MemoryStoreState,
  target: { id?: string; topicKey?: string; subject?: string },
  reason: string,
): RevokeResult {
  const now = state.now;
  const directHits = state.records.filter((r) => {
    if (target.id) return r.id === target.id;
    return (
      r.topicKey === target.topicKey &&
      (!target.subject || r.scope.subject === target.subject)
    );
  });
  const directIds = new Set(directHits.map((r) => r.id));

  // Cascade: anything superseded-by or supersedes-chained to a direct hit.
  const cascadeIds = new Set(directIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of state.records) {
      if (cascadeIds.has(r.id)) continue;
      const touchesCascade =
        (r.supersedes && cascadeIds.has(r.supersedes)) ||
        (r.supersededBy && cascadeIds.has(r.supersededBy));
      if (touchesCascade) {
        cascadeIds.add(r.id);
        grew = true;
      }
    }
  }

  const records = state.records.map((r) =>
    cascadeIds.has(r.id) && r.status !== "revoked"
      ? {
          ...r,
          status: "revoked" as const,
          invalidAt: now,
          closedReason: directIds.has(r.id)
            ? reason
            : `Cascaded: linked to a revoked record (${reason})`,
        }
      : r,
  );

  return { state: { ...state, records }, revokedIds: [...cascadeIds] };
}
