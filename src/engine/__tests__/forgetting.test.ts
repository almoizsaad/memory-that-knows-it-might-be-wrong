import { describe, expect, it } from "vitest";
import { isBelowRetrievalFloor, revoke, tick } from "../forgetting";
import type { MemoryRecord, MemoryStoreState } from "../types";

const DAY = 86_400_000;
const T0 = "2026-01-01T00:00:00.000Z";

function record(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "mem_0001",
    content: "Lives in Khartoum",
    type: "fact",
    topicKey: "user.address",
    source: { kind: "user_stated", quote: "I live in Khartoum.", turnRef: "t1" },
    scope: { subject: "user", context: "personal" },
    writtenAt: T0,
    validAt: T0,
    invalidAt: null,
    lastConfirmedAt: T0,
    expiresAt: null,
    confidence: 0.85,
    status: "active",
    supersedes: null,
    supersededBy: null,
    ...overrides,
  };
}

function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY).toISOString();
}

describe("tick — confidence decay", () => {
  it("does not decay within the 90-day grace period", () => {
    const state: MemoryStoreState = { records: [record()], seq: 1, now: T0 };
    const now = plusDays(T0, 90);
    const result = tick(state, now);
    expect(result.state.records[0].confidence).toBe(0.85);
    expect(result.decayed).toHaveLength(0);
  });

  it("decays to exactly half at grace-period + one half-life (180 days past grace)", () => {
    const state: MemoryStoreState = { records: [record()], seq: 1, now: T0 };
    const now = plusDays(T0, 90 + 180);
    const result = tick(state, now);
    expect(result.state.records[0].confidence).toBeCloseTo(0.85 * 0.5, 6);
    expect(result.decayed).toHaveLength(1);
    expect(result.decayed[0]).toMatchObject({ id: "mem_0001", from: 0.85 });
  });

  it("never decays below the retrieval floor's half", () => {
    const state: MemoryStoreState = { records: [record()], seq: 1, now: T0 };
    const now = plusDays(T0, 90 + 180 * 20); // absurdly long
    const result = tick(state, now);
    expect(result.state.records[0].confidence).toBe(0.1);
  });

  it("anchors decay to lastConfirmedAt, not writtenAt, when the two differ", () => {
    const state: MemoryStoreState = {
      records: [record({ writtenAt: T0, lastConfirmedAt: plusDays(T0, 200) })],
      seq: 1,
      now: T0,
    };
    // 250 days after the original write, but only 50 days after the last
    // confirmation — still inside the grace period from the confirm.
    const now = plusDays(T0, 250);
    const result = tick(state, now);
    expect(result.state.records[0].confidence).toBe(0.85);
  });

  it("does not decay superseded, revoked, or expired records", () => {
    const state: MemoryStoreState = {
      records: [
        record({ id: "a", status: "superseded" }),
        record({ id: "b", status: "revoked" }),
      ],
      seq: 2,
      now: T0,
    };
    const now = plusDays(T0, 5000);
    const result = tick(state, now);
    expect(result.decayed).toHaveLength(0);
  });
});

describe("tick — TTL expiry", () => {
  it("expires a record once now reaches expiresAt", () => {
    const state: MemoryStoreState = {
      records: [record({ expiresAt: plusDays(T0, 30) })],
      seq: 1,
      now: T0,
    };
    const result = tick(state, plusDays(T0, 30));
    expect(result.expired).toEqual(["mem_0001"]);
    expect(result.state.records[0].status).toBe("expired");
    expect(result.state.records[0].invalidAt).toBe(plusDays(T0, 30));
  });

  it("does not expire a record before its expiresAt", () => {
    const state: MemoryStoreState = {
      records: [record({ expiresAt: plusDays(T0, 30) })],
      seq: 1,
      now: T0,
    };
    const result = tick(state, plusDays(T0, 29));
    expect(result.expired).toHaveLength(0);
    expect(result.state.records[0].status).toBe("active");
  });
});

describe("isBelowRetrievalFloor", () => {
  it("flags heavily decayed records as below the default retrieval floor", () => {
    expect(isBelowRetrievalFloor(record({ confidence: 0.15 }))).toBe(true);
    expect(isBelowRetrievalFloor(record({ confidence: 0.5 }))).toBe(false);
  });
});

describe("revoke — cascade", () => {
  it("revokes a single record by id with the given reason", () => {
    const state: MemoryStoreState = { records: [record()], seq: 1, now: T0 };
    const result = revoke(state, { id: "mem_0001" }, "User asked to forget this");
    expect(result.revokedIds).toEqual(["mem_0001"]);
    expect(result.state.records[0].status).toBe("revoked");
    expect(result.state.records[0].closedReason).toBe("User asked to forget this");
  });

  it("cascades through a supersession chain built on the revoked record", () => {
    const a = record({ id: "a", supersededBy: "b" });
    const b = record({ id: "b", supersedes: "a", supersededBy: null, status: "active" });
    const c = record({ id: "c", supersedes: "b", supersededBy: null, status: "needs_verification" });
    const state: MemoryStoreState = { records: [a, b, c], seq: 3, now: T0 };

    const result = revoke(state, { id: "a" }, "User asked to forget their address");

    expect(new Set(result.revokedIds)).toEqual(new Set(["a", "b", "c"]));
    for (const r of result.state.records) {
      expect(r.status).toBe("revoked");
    }
    const direct = result.state.records.find((r) => r.id === "a")!;
    const cascaded = result.state.records.find((r) => r.id === "c")!;
    expect(direct.closedReason).toBe("User asked to forget their address");
    expect(cascaded.closedReason).toMatch(/^Cascaded:/);
  });

  it("revokes by topicKey across all matching records for a subject", () => {
    const a = record({ id: "a", topicKey: "user.phone", content: "Phone number is 555-0142" });
    const unrelated = record({ id: "z", topicKey: "user.address" });
    const state: MemoryStoreState = { records: [a, unrelated], seq: 2, now: T0 };

    const result = revoke(state, { topicKey: "user.phone", subject: "user" }, "forget my number");

    expect(result.revokedIds).toEqual(["a"]);
    expect(result.state.records.find((r) => r.id === "z")!.status).toBe("active");
  });

  it("is idempotent — revoking an already-revoked record leaves its original closedReason alone", () => {
    const already = record({ status: "revoked", closedReason: "first reason" });
    const state: MemoryStoreState = { records: [already], seq: 1, now: T0 };
    const result = revoke(state, { id: "mem_0001" }, "second reason");
    expect(result.state.records[0].closedReason).toBe("first reason");
  });
});
