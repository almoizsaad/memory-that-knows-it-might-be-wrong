import { describe, expect, it } from "vitest";
import {
  assessConflict,
  baseConfidence,
  explicitReplacementConfidence,
  findActiveOnTopic,
  implicitConflictConfidence,
} from "../contradiction";
import type { ExtractedFact, MemoryRecord } from "../types";

function record(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "mem_0001",
    content: "Lives in Cairo",
    type: "fact",
    topicKey: "user.address",
    source: { kind: "user_stated", quote: "I live in Cairo.", turnRef: "t1" },
    scope: { subject: "user", context: "personal" },
    writtenAt: "2026-01-01T00:00:00.000Z",
    validAt: "2026-01-01T00:00:00.000Z",
    invalidAt: null,
    lastConfirmedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    confidence: 0.85,
    status: "active",
    supersedes: null,
    supersededBy: null,
    ...overrides,
  };
}

function fact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  return {
    content: "Lives in Alexandria",
    type: "fact",
    topicKey: "user.address",
    scope: { subject: "user", context: "personal" },
    sourceQuote: "I moved to Alexandria.",
    turnRef: "t2",
    negatesExisting: false,
    ...overrides,
  };
}

describe("findActiveOnTopic", () => {
  it("ignores superseded/revoked/expired records", () => {
    const records = [
      record({ id: "a", status: "superseded" }),
      record({ id: "b", status: "revoked" }),
      record({ id: "c", status: "expired" }),
    ];
    expect(findActiveOnTopic(records, "user.address", "user")).toBeNull();
  });

  it("ignores records scoped to a different subject", () => {
    const records = [record({ id: "a", scope: { subject: "other-user", context: "personal" } })];
    expect(findActiveOnTopic(records, "user.address", "user")).toBeNull();
  });

  it("prefers the most recently written active candidate", () => {
    const records = [
      record({ id: "a", writtenAt: "2026-01-01T00:00:00.000Z" }),
      record({ id: "b", writtenAt: "2026-03-01T00:00:00.000Z" }),
    ];
    expect(findActiveOnTopic(records, "user.address", "user")?.id).toBe("b");
  });
});

describe("assessConflict", () => {
  it("returns none with no prior record", () => {
    expect(assessConflict(fact(), [])).toEqual({ kind: "none", prior: null });
  });

  it("returns reconfirmation when content is identical", () => {
    const prior = record();
    const result = assessConflict(fact({ content: prior.content }), [prior]);
    expect(result.kind).toBe("reconfirmation");
    expect(result.prior?.id).toBe(prior.id);
  });

  it("returns explicit when content differs and a negation marker was found", () => {
    const prior = record();
    const result = assessConflict(fact({ negatesExisting: true }), [prior]);
    expect(result.kind).toBe("explicit");
  });

  it("returns implicit when content differs with no negation marker", () => {
    const prior = record();
    const result = assessConflict(fact({ negatesExisting: false }), [prior]);
    expect(result.kind).toBe("implicit");
  });
});

describe("confidence assignment", () => {
  it("baseConfidence varies by memory type but stays below 1.0", () => {
    expect(baseConfidence(fact({ type: "fact" }))).toBe(0.85);
    expect(baseConfidence(fact({ type: "preference" }))).toBe(0.8);
    expect(baseConfidence(fact({ type: "procedure" }))).toBe(0.8);
    expect(baseConfidence(fact({ type: "episode" }))).toBe(0.7);
  });

  it("explicit replacements start at a fixed, high-but-not-certain confidence", () => {
    expect(explicitReplacementConfidence()).toBe(0.85);
  });

  it("implicit conflicts pull both sides toward uncertainty", () => {
    const { newConfidence, priorConfidence } = implicitConflictConfidence(0.8);
    expect(newConfidence).toBe(0.5);
    expect(priorConfidence).toBe(0.5); // 0.8 - 0.3
  });

  it("implicit conflicts never drop the prior below the 0.15 floor", () => {
    const { priorConfidence } = implicitConflictConfidence(0.2);
    expect(priorConfidence).toBe(0.15); // max(0.15, -0.1)
  });
});
