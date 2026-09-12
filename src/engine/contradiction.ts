/**
 * Contradiction classification — pure, deterministic, no LLM call.
 *
 * The adapter (src/adapter/extractFacts.ts) already did the hard NLU part
 * and told us whether it saw an explicit negation marker. This module's only
 * job is the part that has to be inspectable and testable at exact boundary
 * values: given "does the new fact's topic already have an active record,
 * and did the adapter flag a negation", what happens to confidence and
 * status. See ARCHITECTURE.md for why this split (adapter finds candidates,
 * engine decides consequences) is the same shape as the previous challenge's
 * domain/engine split.
 */

import type { ExtractedFact, MemoryRecord } from "./types";

export interface ConflictAssessment {
  kind: "none" | "explicit" | "implicit" | "reconfirmation";
  /** The active record on the same topic, if one exists. */
  prior: MemoryRecord | null;
}

/** Finds the current active (or needs_verification) record for a topic, if any. */
export function findActiveOnTopic(
  records: MemoryRecord[],
  topicKey: string,
  subject: string,
): MemoryRecord | null {
  const candidates = records.filter(
    (r) =>
      r.topicKey === topicKey &&
      r.scope.subject === subject &&
      (r.status === "active" || r.status === "needs_verification"),
  );
  if (candidates.length === 0) return null;
  // Most recently written wins as "the current one to compare against" —
  // there should only ever be one active record per (topicKey, subject) in
  // steady state, since writing always supersedes; this is a defensive
  // tie-breaker, not the primary mechanism.
  return candidates.reduce((latest, r) =>
    r.writtenAt > latest.writtenAt ? r : latest,
  );
}

export function assessConflict(
  fact: ExtractedFact,
  records: MemoryRecord[],
): ConflictAssessment {
  const prior = findActiveOnTopic(records, fact.topicKey, fact.scope.subject);
  if (!prior) return { kind: "none", prior: null };
  // Saying the same thing again isn't a new fact — it's evidence the old one
  // is still true. Handled as a reconfirmation, not a fresh record, so a
  // memory a person repeats often doesn't fork into a pile of duplicates.
  if (prior.content === fact.content) return { kind: "reconfirmation", prior };
  if (fact.negatesExisting) return { kind: "explicit", prior };
  return { kind: "implicit", prior };
}

/**
 * Confidence assigned to a brand-new record with no conflict.
 * User-stated facts start high but not at 1.0 — the demo's failure tests
 * lean on there being room to move up (confirm) and down (decay) from here.
 */
export function baseConfidence(fact: ExtractedFact): number {
  switch (fact.type) {
    case "fact":
      return 0.85;
    case "preference":
      return 0.8;
    case "procedure":
      return 0.8;
    case "episode":
      return 0.7;
    default:
      return 0.75;
  }
}

/** Confidence for a new record that explicitly supersedes an old one. */
export function explicitReplacementConfidence(): number {
  return 0.85;
}

/**
 * Both records involved in an *implicit* conflict get knocked down — neither
 * is confirmed wrong, but neither should be handed out as settled fact
 * either. STALE-style benchmarks show even strong models catch implicit
 * (unstated) contradiction only ~55% of the time; treating "uncertain" as a
 * first-class outcome here, instead of forcing a yes/no, is the point.
 */
export function implicitConflictConfidence(priorConfidence: number): {
  newConfidence: number;
  priorConfidence: number;
} {
  return {
    newConfidence: 0.5,
    priorConfidence: Math.max(0.15, priorConfidence - 0.3),
  };
}
