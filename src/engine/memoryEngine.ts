/**
 * The Memory Engine — write path.
 *
 * ingest() is the entire write path. It takes an ExtractedFact (already
 * produced by the adapter — see src/adapter/extractFacts.ts) and the current
 * store, and returns a new store plus the record it created. It never
 * deletes: a contradiction always ends with an additional record and an
 * explicit supersession link, so the chain of "who said what, when, and what
 * replaced it" is always reconstructable. See ARCHITECTURE.md.
 */

import {
  assessConflict,
  baseConfidence,
  explicitReplacementConfidence,
  implicitConflictConfidence,
} from "./contradiction";
import type {
  ExtractedFact,
  MemoryRecord,
  MemoryStoreState,
  WriteResult,
} from "./types";

export function emptyStore(now: string): MemoryStoreState {
  return { records: [], seq: 0, now };
}

function nextId(state: MemoryStoreState): [string, MemoryStoreState] {
  const seq = state.seq + 1;
  return [`mem_${seq.toString().padStart(4, "0")}`, { ...state, seq }];
}

function hash(content: string): string {
  // Cheap, deterministic, non-cryptographic — good enough to dedupe exact
  // repeats without pulling in a crypto dependency.
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = (h * 31 + content.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}`;
}

export function ingest(
  state: MemoryStoreState,
  fact: ExtractedFact,
): WriteResult {
  const conflict = assessConflict(fact, state.records);
  const [id, s1] = nextId(state);

  const newRecord: MemoryRecord = {
    id,
    content: fact.content,
    type: fact.type,
    topicKey: fact.topicKey,
    source: { kind: "user_stated", quote: fact.sourceQuote, turnRef: fact.turnRef },
    scope: fact.scope,
    writtenAt: state.now,
    validAt: state.now,
    invalidAt: null,
    lastConfirmedAt: state.now,
    expiresAt: fact.expiresAt ?? null,
    confidence: baseConfidence(fact),
    status: "active",
    supersedes: null,
    supersededBy: null,
  };

  if (conflict.kind === "none") {
    return {
      state: { ...s1, records: [...s1.records, newRecord] },
      record: newRecord,
      conflict: null,
    };
  }

  const prior = conflict.prior as MemoryRecord;

  if (conflict.kind === "reconfirmation") {
    // No new record: bump the existing one exactly as an explicit confirm
    // would, since the person just said the same thing again unprompted.
    const bumped: MemoryRecord = {
      ...prior,
      confidence: Math.min(1, prior.confidence + 0.1),
      lastConfirmedAt: state.now,
      status: prior.status === "needs_verification" ? "active" : prior.status,
    };
    const records = state.records.map((r) => (r.id === prior.id ? bumped : r));
    // Roll back the id/seq we reserved for a record we didn't create.
    return { state: { ...state, records }, record: bumped, conflict: null };
  }

  if (conflict.kind === "explicit") {
    const updatedPrior: MemoryRecord = {
      ...prior,
      status: "superseded",
      invalidAt: state.now,
      supersededBy: newRecord.id,
      closedReason: `Superseded by ${newRecord.id}: explicit correction ("${fact.sourceQuote}")`,
    };
    const finalRecord: MemoryRecord = {
      ...newRecord,
      confidence: explicitReplacementConfidence(),
      supersedes: prior.id,
    };
    const records = state.records
      .map((r) => (r.id === prior.id ? updatedPrior : r))
      .concat(finalRecord);
    return {
      state: { ...s1, records },
      record: finalRecord,
      conflict: { kind: "explicit", priorId: prior.id },
    };
  }

  // implicit conflict: neither side is deleted or confirmed wrong — both
  // get marked as needing a human to settle it.
  const { newConfidence, priorConfidence } = implicitConflictConfidence(
    prior.confidence,
  );
  const updatedPrior: MemoryRecord = {
    ...prior,
    status: "needs_verification",
    confidence: priorConfidence,
  };
  const finalRecord: MemoryRecord = {
    ...newRecord,
    status: "needs_verification",
    confidence: newConfidence,
    // Linked, not superseded — we don't yet know which one is right.
    supersedes: prior.id,
  };
  const records = state.records
    .map((r) => (r.id === prior.id ? updatedPrior : r))
    .concat(finalRecord);
  return {
    state: { ...s1, records },
    record: finalRecord,
    conflict: { kind: "implicit", priorId: prior.id },
  };
}

/** Explicit user confirmation ("yes, that's still right") — the only way confidence recovers other than a fresh restatement. */
export function confirm(
  state: MemoryStoreState,
  id: string,
): MemoryStoreState {
  return {
    ...state,
    records: state.records.map((r) =>
      r.id === id
        ? {
            ...r,
            confidence: Math.min(1, r.confidence + 0.25),
            lastConfirmedAt: state.now,
            status: r.status === "needs_verification" ? "active" : r.status,
          }
        : r,
    ),
  };
}

/** Explicit user rejection ("no, that's wrong") — closes the record without pretending it was superseded by new information. */
export function reject(state: MemoryStoreState, id: string): MemoryStoreState {
  return {
    ...state,
    records: state.records.map((r) =>
      r.id === id
        ? {
            ...r,
            status: "revoked",
            invalidAt: state.now,
            closedReason: "Rejected by user as incorrect",
          }
        : r,
    ),
  };
}

export function contentHash(content: string): string {
  return hash(content);
}
