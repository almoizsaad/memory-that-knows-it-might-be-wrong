/**
 * Adapter — the ONLY place that looks at raw text.
 *
 * This is a deterministic, pattern-based stand-in for what a production
 * system would do with an LLM call: turn a free-text utterance into a
 * structured ExtractedFact. Everything downstream (contradiction.ts,
 * memoryEngine.ts, retrieval.ts, forgetting.ts) only ever sees the
 * structured shape and doesn't know or care that this file exists — swap it
 * for a real extraction model and nothing else in the engine changes. See
 * NOTES.md, "explicitly out of scope", for why that swap was left out of
 * this build on purpose.
 *
 * Revocation ("forget my X") is deliberately NOT parsed from free text here
 * — it's triggered by an explicit UI action instead (see RevokeControls),
 * because a forgetting mechanism that depends on the same fuzzy pattern
 * matching as fact extraction would undercut the "explicit" in "explicit
 * forgetting policy".
 */

import type { ExtractedFact, MemoryScope } from "../engine/types";

const NEGATION_MARKERS =
  /\b(no longer|not anymore|isn't .*anymore|don't .*anymore|actually,|correction:|used to .* but|moved (away )?from)\b/i;

export function hasNegationMarker(utterance: string): boolean {
  return NEGATION_MARKERS.test(utterance);
}

interface Rule {
  pattern: RegExp;
  build: (m: RegExpMatchArray, ctx: BuildCtx) => Omit<
    ExtractedFact,
    "sourceQuote" | "turnRef" | "negatesExisting"
  >;
}

interface BuildCtx {
  subject: string;
}

const rules: Rule[] = [
  {
    // "I live in X" / "I moved to X" / "my address is X"
    pattern: /(?:i (?:live|moved)\s*(?:in|to)|my address is)\s+([a-z0-9 ,.'-]+?)(?:\.|,|$)/i,
    build: (m, ctx) => ({
      content: `Lives in ${titleCase(m[1].trim())}`,
      type: "fact",
      topicKey: "user.address",
      scope: { subject: ctx.subject, context: "personal" },
    }),
  },
  {
    // "my phone number is X"
    pattern: /my phone number is\s+([0-9()\-.\s]{6,})/i,
    build: (m, ctx) => ({
      content: `Phone number is ${m[1].trim()}`,
      type: "fact",
      topicKey: "user.phone",
      scope: { subject: ctx.subject, context: "personal" },
    }),
  },
  {
    // "on my work laptop/computer, I use the VPN profile 'X'"
    pattern: /(?:on my work (?:laptop|computer|machine)).*?vpn profile\s+['"]?([a-z0-9\-_]+)['"]?/i,
    build: (m, ctx) => ({
      content: `Uses VPN profile '${m[1]}'`,
      type: "procedure",
      topicKey: "user.vpn_profile",
      scope: { subject: ctx.subject, context: "work" },
    }),
  },
  {
    // "I'm vegetarian" / "I am vegan"
    pattern: /\bi(?:'m| am) (?:a )?(vegetarian|vegan)\b/i,
    build: (m, ctx) => ({
      content: `Diet: ${m[1].toLowerCase()}`,
      type: "preference",
      topicKey: "user.diet",
      scope: { subject: ctx.subject, context: "global" },
    }),
  },
  {
    // Mentions of meat dishes — no explicit negation, but topically conflicts
    // with a vegetarian/vegan record. This is the "implicit contradiction"
    // trigger: the adapter surfaces it as a same-topic fact; the engine
    // decides it can't resolve it on its own (see contradiction.ts).
    pattern: /\b(grilled chicken|steak|burger|bacon|beef|pork|bbq ribs)\b/i,
    build: (m, ctx) => ({
      content: `Mentioned eating ${m[1].toLowerCase()}`,
      type: "episode",
      topicKey: "user.diet",
      scope: { subject: ctx.subject, context: "global" },
    }),
  },
  {
    // Generic "my favorite X is Y" for free-chat exploration.
    pattern: /my favorite (\w+) is\s+([a-z0-9 '-]+?)(?:\.|,|$)/i,
    build: (m, ctx) => ({
      content: `Favorite ${m[1].toLowerCase()} is ${titleCase(m[2].trim())}`,
      type: "preference",
      topicKey: `user.favorite_${m[1].toLowerCase()}`,
      scope: { subject: ctx.subject, context: "global" },
    }),
  },
];

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Returns null when nothing storable was found — not every utterance is a fact. */
export function extractFact(input: {
  utterance: string;
  turnRef: string;
  subject: string;
}): ExtractedFact | null {
  for (const rule of rules) {
    const m = input.utterance.match(rule.pattern);
    if (!m) continue;
    const built = rule.build(m, { subject: input.subject });
    return {
      ...built,
      sourceQuote: input.utterance.trim(),
      turnRef: input.turnRef,
      negatesExisting: hasNegationMarker(input.utterance),
    };
  }
  return null;
}

export function defaultScope(subject: string): MemoryScope {
  return { subject, context: "global" };
}
