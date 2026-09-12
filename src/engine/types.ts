/**
 * The Memory Engine — core type contracts.
 *
 * One record shape, three paths (write / retrieve / forget), one deterministic
 * cycle function per path. Nothing in this file, or in memoryEngine.ts,
 * retrieval.ts, or forgetting.ts, calls an LLM or does semantic embedding —
 * see ARCHITECTURE.md for why that separation is the point, and where a real
 * NLU/embedding step would slot in without changing any of these shapes.
 */

export type MemoryType = "preference" | "fact" | "procedure" | "episode";

export type MemoryStatus =
  | "active"
  | "needs_verification"
  | "superseded"
  | "revoked"
  | "expired";

export type SourceKind = "user_stated" | "inferred" | "imported";

export type ConflictKind = "explicit" | "implicit";

/** Where a fact came from — always visible to the person on retrieval. */
export interface MemorySource {
  kind: SourceKind;
  /** The exact clause the fact was extracted from. Never paraphrased away. */
  quote: string;
  turnRef: string;
}

/** Who/where a fact applies to. The unit that scope-leak tests are built around. */
export interface MemoryScope {
  subject: string;
  /** "global" applies everywhere; anything else must match the query context. */
  context: string;
}

export interface MemoryRecord {
  id: string;
  content: string;
  type: MemoryType;
  /** Coarse topic bucket used for conflict + relevance matching, e.g. "user.address". Stands in for a real embedding index — see ARCHITECTURE.md. */
  topicKey: string;
  source: MemorySource;
  scope: MemoryScope;

  /** Bi-temporal fields: when it was written vs. when it was/ceased being true. */
  writtenAt: string;
  validAt: string;
  invalidAt: string | null;
  lastConfirmedAt: string | null;
  expiresAt: string | null;

  /** 0..1. Moves at write time (contradiction), on confirm, and on decay — never edited by hand. */
  confidence: number;
  status: MemoryStatus;

  /** Supersession chain — a contradiction always creates a new record, never deletes the old one. */
  supersedes: string | null;
  supersededBy: string | null;

  /** Set only on revoked/expired records. Human-readable, shown in the inspector. */
  closedReason?: string;
}

export interface MemoryStoreState {
  records: MemoryRecord[];
  /** Monotonic counter so ids and turnRefs stay deterministic in tests. */
  seq: number;
  /** Simulated clock, ISO string. Advanced explicitly by tick() — see forgetting.ts. */
  now: string;
}

/** What the adapter hands the engine. The engine never reads raw text. */
export interface ExtractedFact {
  content: string;
  type: MemoryType;
  topicKey: string;
  scope: MemoryScope;
  sourceQuote: string;
  turnRef: string;
  /** True when the adapter found an explicit negation/correction marker referencing this topic. */
  negatesExisting: boolean;
  expiresAt?: string | null;
}

export interface WriteResult {
  state: MemoryStoreState;
  record: MemoryRecord;
  conflict: {
    kind: ConflictKind;
    priorId: string;
  } | null;
}

export interface RetrievedItem {
  record: MemoryRecord;
  /** Why this record was pulled in, in plain language, e.g. "matches 'address', personal scope". */
  matchReason: string;
  /** 0..1, keyword-overlap relevance to the query — independent of the record's own confidence. */
  relevance: number;
}

export type HedgeLevel = "direct" | "hedged" | "unsure" | "none_found";

export interface RetrievalResult {
  hedgeLevel: HedgeLevel;
  answer: string;
  used: RetrievedItem[];
  /** Records that matched the topic but were withheld — e.g. wrong scope, revoked. Shown in the inspector, never in the answer. */
  withheld: { record: MemoryRecord; reason: string }[];
}

export interface ForgetTickResult {
  state: MemoryStoreState;
  expired: string[];
  decayed: { id: string; from: number; to: number }[];
}

export interface RevokeResult {
  state: MemoryStoreState;
  revokedIds: string[];
}
