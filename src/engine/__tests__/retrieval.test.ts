import { describe, expect, it } from "vitest";
import { retrieve } from "../retrieval";
import type { MemoryRecord, MemoryStoreState } from "../types";

function record(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "mem_0001",
    content: "Lives in Khartoum",
    type: "fact",
    topicKey: "user.address",
    source: { kind: "user_stated", quote: "I live in Khartoum.", turnRef: "t1" },
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

function store(records: MemoryRecord[]): MemoryStoreState {
  return { records, seq: records.length, now: "2026-01-01T00:00:00.000Z" };
}

describe("retrieve — hedging by confidence band", () => {
  it("answers directly above the direct threshold", () => {
    const s = store([record({ confidence: 0.9 })]);
    const result = retrieve(s, { text: "What's my address?", context: "personal", subject: "user" });
    expect(result.hedgeLevel).toBe("direct");
    expect(result.answer).toBe("Lives in Khartoum");
  });

  it("hedges in the middle confidence band and asks for confirmation", () => {
    const s = store([record({ confidence: 0.55 })]);
    const result = retrieve(s, { text: "What's my address?", context: "personal", subject: "user" });
    expect(result.hedgeLevel).toBe("hedged");
    expect(result.answer).toMatch(/not fully certain/i);
    expect(result.answer).toMatch(/55%/);
  });

  it("expresses explicit uncertainty below the floor", () => {
    const s = store([record({ confidence: 0.3 })]);
    const result = retrieve(s, { text: "What's my address?", context: "personal", subject: "user" });
    expect(result.hedgeLevel).toBe("unsure");
    expect(result.answer).toMatch(/might be wrong/i);
  });

  it("flags needs_verification records as unsure regardless of confidence", () => {
    const s = store([record({ confidence: 0.9, status: "needs_verification" })]);
    const result = retrieve(s, { text: "What's my address?", context: "personal", subject: "user" });
    expect(result.hedgeLevel).toBe("unsure");
    expect(result.answer).toMatch(/conflicting information/i);
  });

  it("returns none_found when nothing matches", () => {
    const s = store([record()]);
    const result = retrieve(s, { text: "What's my shoe size?", context: "personal", subject: "user" });
    expect(result.hedgeLevel).toBe("none_found");
    expect(result.used).toHaveLength(0);
  });
});

describe("retrieve — scope filtering", () => {
  it("withholds a work-scoped record from a personal-context query", () => {
    const s = store([
      record({ topicKey: "user.vpn_profile", content: "Uses VPN profile 'corp-eu'", scope: { subject: "user", context: "work" } }),
    ]);
    const result = retrieve(s, { text: "What VPN profile do I use?", context: "personal", subject: "user" });
    expect(result.hedgeLevel).toBe("none_found");
    expect(result.withheld).toHaveLength(1);
    expect(result.withheld[0].reason).toMatch(/scope leak/i);
  });

  it("surfaces the same record when the query context matches", () => {
    const s = store([
      record({ topicKey: "user.vpn_profile", content: "Uses VPN profile 'corp-eu'", scope: { subject: "user", context: "work" } }),
    ]);
    const result = retrieve(s, { text: "What VPN profile do I use?", context: "work", subject: "user" });
    expect(result.hedgeLevel).toBe("direct");
    expect(result.used[0].record.scope.context).toBe("work");
  });

  it("global-scoped records answer in any context", () => {
    const s = store([record({ scope: { subject: "user", context: "global" }, content: "Diet: vegetarian", topicKey: "user.diet" })]);
    const personal = retrieve(s, { text: "Am I vegetarian?", context: "personal", subject: "user" });
    const work = retrieve(s, { text: "Am I vegetarian?", context: "work", subject: "user" });
    expect(personal.hedgeLevel).toBe("direct");
    expect(work.hedgeLevel).toBe("direct");
  });

  it("never returns a different subject's record", () => {
    const s = store([record({ scope: { subject: "someone-else", context: "personal" } })]);
    const result = retrieve(s, { text: "What's my address?", context: "personal", subject: "user" });
    expect(result.used).toHaveLength(0);
  });
});

describe("retrieve — excludes closed records but keeps them inspectable", () => {
  it("withholds revoked records with an explicit reason", () => {
    const s = store([record({ status: "revoked" })]);
    const result = retrieve(s, { text: "What's my address?", context: "personal", subject: "user" });
    expect(result.used).toHaveLength(0);
    expect(result.withheld[0].reason).toMatch(/revoked/i);
  });

  it("withholds superseded records in favor of nothing else being present", () => {
    const s = store([record({ status: "superseded" })]);
    const result = retrieve(s, { text: "What's my address?", context: "personal", subject: "user" });
    expect(result.withheld[0].reason).toMatch(/superseded/i);
  });
});
