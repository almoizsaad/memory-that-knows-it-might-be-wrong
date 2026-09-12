/**
 * The Memory Engine — retrieve path.
 *
 * answer() never returns a bare fact. It returns a hedge level, a natural-
 * language answer whose phrasing is *derived from* (not decorated with) the
 * confidence number, and the exact record(s) relied on so the caller can
 * render a source panel. Ranking order is scope → relevance → recency,
 * deliberately in that order — see ARCHITECTURE.md for why "most recent" is
 * ranked last, not first.
 */

import type {
  HedgeLevel,
  MemoryRecord,
  MemoryStoreState,
  RetrievalResult,
  RetrievedItem,
} from "./types";

export interface RetrievalQuery {
  text: string;
  /** The context the question is being asked *in* — drives scope filtering. */
  context: string;
  subject: string;
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "my", "what", "do", "you", "know", "about",
  "for", "to", "of", "in", "on", "am", "i", "still", "does",
]);

/**
 * Deliberately naive suffix stripping — not a real stemmer — so that
 * "live"/"lives" or "move"/"moved" count as the same signal. This is the
 * plain-keyword stand-in for what a production system would get for free
 * from embedding similarity; see ARCHITECTURE.md for the swap point.
 */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

function relevance(query: string, record: MemoryRecord): number {
  const qTokens = new Set(tokenize(query));
  const topicTokens = tokenize(record.topicKey.replace(/[._]/g, " "));
  const contentTokens = tokenize(record.content);
  let hits = 0;
  let total = 0;
  for (const t of [...topicTokens, ...contentTokens]) {
    total += 1;
    if (qTokens.has(t)) hits += 1;
  }
  if (total === 0) return 0;
  // Topic-token hits count double: matching "address" against a query about
  // "address" should outrank matching one incidental content word.
  const topicHits = topicTokens.filter((t) => qTokens.has(t)).length;
  return Math.min(1, (hits + topicHits) / (total + topicTokens.length || 1));
}

function scopeMatches(record: MemoryRecord, query: RetrievalQuery): boolean {
  if (record.scope.subject !== query.subject) return false;
  if (record.scope.context === "global") return true;
  return record.scope.context === query.context;
}

function isUsable(record: MemoryRecord): boolean {
  return record.status === "active" || record.status === "needs_verification";
}

function hedgeFor(record: MemoryRecord): HedgeLevel {
  if (record.status === "needs_verification") return "unsure";
  if (record.confidence >= 0.75) return "direct";
  if (record.confidence >= 0.4) return "hedged";
  return "unsure";
}

function phraseFor(item: RetrievedItem): string {
  const { record } = item;
  const ageDays = Math.max(
    0,
    Math.round(
      (Date.parse(record.lastConfirmedAt ?? record.writtenAt) -
        Date.parse(record.writtenAt)) /
        86_400_000,
    ),
  );
  const pct = Math.round(record.confidence * 100);
  switch (hedgeFor(record)) {
    case "direct":
      return record.content;
    case "hedged":
      return `${record.content} — I'm not fully certain about this (confidence ${pct}%, last confirmed ${ageDays >= 0 ? "a while back" : "recently"}). Want to confirm it's still right?`;
    case "unsure":
      return record.status === "needs_verification"
        ? `I have conflicting information here and I'm not confident which is current: "${record.content}". Could you confirm?`
        : `I might be wrong about this — my confidence has dropped to ${pct}%: "${record.content}". Can you tell me if it's still accurate?`;
    default:
      return record.content;
  }
}

export function retrieve(
  state: MemoryStoreState,
  query: RetrievalQuery,
): RetrievalResult {
  const withheld: RetrievalResult["withheld"] = [];
  const matched: { record: MemoryRecord; relevance: number }[] = [];

  for (const record of state.records) {
    const rel = relevance(query.text, record);
    if (rel <= 0) continue;
    if (!isUsable(record)) {
      withheld.push({
        record,
        reason:
          record.status === "revoked"
            ? "revoked by user — excluded, not just hidden"
            : record.status === "expired"
              ? "expired (past its TTL)"
              : "superseded by a newer record",
      });
      continue;
    }
    if (!scopeMatches(record, query)) {
      withheld.push({
        record,
        reason: `scoped to "${record.scope.context}", query is in "${query.context}" — withheld to avoid a scope leak`,
      });
      continue;
    }
    matched.push({ record, relevance: rel });
  }

  matched.sort((a, b) => {
    // scope exactness (non-global beats global when both match) → relevance → recency
    const aExact = a.record.scope.context !== "global" ? 1 : 0;
    const bExact = b.record.scope.context !== "global" ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    if (Math.abs(a.relevance - b.relevance) > 0.001) return b.relevance - a.relevance;
    return Date.parse(b.record.writtenAt) - Date.parse(a.record.writtenAt);
  });

  if (matched.length === 0) {
    return {
      hedgeLevel: "none_found",
      answer: "I don't have anything on file for that yet.",
      used: [],
      withheld,
    };
  }

  const top = matched[0];
  const item: RetrievedItem = {
    record: top.record,
    relevance: top.relevance,
    matchReason: `matched "${query.text.trim()}" against topic "${top.record.topicKey}" in scope "${top.record.scope.context}"`,
  };

  return {
    hedgeLevel: hedgeFor(top.record),
    answer: phraseFor(item),
    used: [item],
    withheld,
  };
}
