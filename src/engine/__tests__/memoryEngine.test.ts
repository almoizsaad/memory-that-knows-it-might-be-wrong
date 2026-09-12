import { describe, expect, it } from "vitest";
import { confirm, emptyStore, ingest, reject } from "../memoryEngine";
import type { ExtractedFact } from "../types";

function fact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  return {
    content: "Lives in Khartoum",
    type: "fact",
    topicKey: "user.address",
    scope: { subject: "user", context: "personal" },
    sourceQuote: "I live in Khartoum.",
    turnRef: "t1",
    negatesExisting: false,
    ...overrides,
  };
}

describe("ingest — fresh write, no conflict", () => {
  it("creates an active record at base confidence with no supersession", () => {
    const store = emptyStore("2026-01-01T00:00:00.000Z");
    const result = ingest(store, fact());

    expect(result.conflict).toBeNull();
    expect(result.record.status).toBe("active");
    expect(result.record.confidence).toBe(0.85); // baseConfidence("fact")
    expect(result.record.supersedes).toBeNull();
    expect(result.record.id).toBe("mem_0001");
    expect(result.state.records).toHaveLength(1);
  });

  it("assigns sequential, deterministic ids across writes", () => {
    let store = emptyStore("2026-01-01T00:00:00.000Z");
    const r1 = ingest(store, fact({ topicKey: "user.diet", content: "Diet: vegetarian" }));
    store = r1.state;
    const r2 = ingest(store, fact({ topicKey: "user.favorite_color", content: "Favorite color is teal" }));
    expect(r1.record.id).toBe("mem_0001");
    expect(r2.record.id).toBe("mem_0002");
  });
});

describe("ingest — explicit contradiction", () => {
  it("supersedes the prior record instead of deleting it", () => {
    let store = emptyStore("2026-01-01T00:00:00.000Z");
    const first = ingest(store, fact({ content: "Lives in Cairo" }));
    store = first.state;

    store = { ...store, now: "2026-06-01T00:00:00.000Z" };
    const second = ingest(
      store,
      fact({
        content: "Lives in Alexandria",
        sourceQuote: "Actually, I moved to Alexandria, I don't live in Cairo anymore.",
        negatesExisting: true,
      }),
    );

    expect(second.conflict).toEqual({ kind: "explicit", priorId: first.record.id });

    const prior = second.state.records.find((r) => r.id === first.record.id)!;
    expect(prior.status).toBe("superseded");
    expect(prior.supersededBy).toBe(second.record.id);
    expect(prior.invalidAt).toBe("2026-06-01T00:00:00.000Z");
    expect(prior.confidence).toBe(0.85); // untouched — the record isn't rewritten, just closed

    expect(second.record.status).toBe("active");
    expect(second.record.supersedes).toBe(first.record.id);
    expect(second.record.confidence).toBe(0.85);

    // Both records still exist — nothing was deleted.
    expect(second.state.records).toHaveLength(2);
  });

  it("does not treat a restatement of the same content as a conflict", () => {
    let store = emptyStore("2026-01-01T00:00:00.000Z");
    const first = ingest(store, fact({ content: "Lives in Cairo" }));
    store = first.state;
    const second = ingest(store, fact({ content: "Lives in Cairo", negatesExisting: false }));
    expect(second.conflict).toBeNull();
    expect(second.state.records).toHaveLength(1); // no duplicate record created
  });
});

describe("ingest — implicit contradiction", () => {
  it("marks both records needs_verification and lowers both confidences, without picking a winner", () => {
    let store = emptyStore("2026-01-01T00:00:00.000Z");
    const first = ingest(
      store,
      fact({ topicKey: "user.diet", type: "preference", content: "Diet: vegetarian" }),
    );
    store = first.state;

    const second = ingest(
      store,
      fact({
        topicKey: "user.diet",
        type: "episode",
        content: "Mentioned eating grilled chicken",
        sourceQuote: "The grilled chicken at that new place was incredible.",
        negatesExisting: false, // no explicit negation marker
      }),
    );

    expect(second.conflict).toEqual({ kind: "implicit", priorId: first.record.id });

    const prior = second.state.records.find((r) => r.id === first.record.id)!;
    expect(prior.status).toBe("needs_verification");
    expect(prior.confidence).toBe(0.5); // 0.8 (preference base) - 0.3
    expect(prior.supersededBy).toBeNull(); // linked, not superseded — we don't know which is right

    expect(second.record.status).toBe("needs_verification");
    expect(second.record.confidence).toBe(0.5);
    expect(second.record.supersedes).toBe(first.record.id);
  });

  it("floors the prior's confidence drop at 0.15 rather than going negative", () => {
    let store = emptyStore("2026-01-01T00:00:00.000Z");
    const first = ingest(
      store,
      fact({ topicKey: "user.diet", type: "episode", content: "Diet: vegetarian" }),
    );
    // Manually depress confidence to simulate a fact that already decayed low.
    store = {
      ...first.state,
      records: first.state.records.map((r) => ({ ...r, confidence: 0.2 })),
    };
    const second = ingest(
      store,
      fact({ topicKey: "user.diet", type: "episode", content: "Mentioned eating steak", negatesExisting: false }),
    );
    const prior = second.state.records.find((r) => r.id === first.record.id)!;
    expect(prior.confidence).toBe(0.15); // max(0.15, 0.2 - 0.3) = max(0.15, -0.1)
  });
});

describe("confirm / reject", () => {
  it("confirm raises confidence, updates lastConfirmedAt, and clears needs_verification", () => {
    let store = emptyStore("2026-01-01T00:00:00.000Z");
    const w = ingest(store, fact({ topicKey: "user.diet", content: "Diet: vegetarian" }));
    store = {
      ...w.state,
      now: "2026-07-01T00:00:00.000Z",
      records: w.state.records.map((r) => ({ ...r, status: "needs_verification", confidence: 0.5 })),
    };

    const confirmed = confirm(store, w.record.id);
    const rec = confirmed.records.find((r) => r.id === w.record.id)!;
    expect(rec.confidence).toBe(0.75); // min(1, 0.5 + 0.25)
    expect(rec.status).toBe("active");
    expect(rec.lastConfirmedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("confirm caps confidence at 1.0", () => {
    let store = emptyStore("2026-01-01T00:00:00.000Z");
    const w = ingest(store, fact());
    store = {
      ...w.state,
      records: w.state.records.map((r) => ({ ...r, confidence: 0.9 })),
    };
    const confirmed = confirm(store, w.record.id);
    expect(confirmed.records[0].confidence).toBe(1);
  });

  it("reject revokes the record with a closedReason, without inventing a superseding fact", () => {
    let store = emptyStore("2026-01-01T00:00:00.000Z");
    const w = ingest(store, fact());
    store = { ...w.state, now: "2026-02-01T00:00:00.000Z" };
    const rejected = reject(store, w.record.id);
    const rec = rejected.records.find((r) => r.id === w.record.id)!;
    expect(rec.status).toBe("revoked");
    expect(rec.invalidAt).toBe("2026-02-01T00:00:00.000Z");
    expect(rec.closedReason).toBe("Rejected by user as incorrect");
  });
});
