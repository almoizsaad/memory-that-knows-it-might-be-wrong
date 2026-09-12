/**
 * Scripted scenarios for the demo UI. Each is a sequence of steps a
 * "director" (useMemorySession.ts) plays through one at a time so the video
 * walkthrough is reproducible instead of relying on live improvisation.
 * The four `failure` scenarios map 1:1 to FAILURE_TESTS.md.
 */

export type ScenarioStep =
  | { kind: "note"; text: string }
  | { kind: "say"; text: string }
  | { kind: "ask"; text: string; context: string }
  | { kind: "wait"; days: number }
  | { kind: "confirmLast" }
  | { kind: "revokeTopic"; topicKey: string; label: string };

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  category: "core" | "failure";
  steps: ScenarioStep[];
}

export const scenarios: Scenario[] = [
  {
    id: "might-be-wrong",
    title: "\u201cI might be wrong\u201d moment",
    subtitle: "The 90-second core loop: write \u2192 stale \u2192 hedge \u2192 confirm",
    category: "core",
    steps: [
      { kind: "note", text: "User mentions their address in passing." },
      { kind: "say", text: "I live in Khartoum." },
      { kind: "note", text: "Six months pass with no further mention of it." },
      { kind: "wait", days: 185 },
      { kind: "note", text: "Something else now needs the address." },
      { kind: "ask", text: "What's my address?", context: "personal" },
      { kind: "note", text: "Confidence has decayed \u2014 the engine hedges instead of stating it flatly, and asks." },
      { kind: "confirmLast" },
      { kind: "note", text: "Confirmed: confidence jumps back up and last_confirmed_at updates." },
      { kind: "ask", text: "What's my address?", context: "personal" },
    ],
  },
  {
    id: "explicit-contradiction",
    title: "Failure test 1: explicit contradiction",
    subtitle: "A stated correction should supersede, not delete",
    category: "failure",
    steps: [
      { kind: "say", text: "I live in Cairo." },
      { kind: "say", text: "Actually, I moved to Alexandria, I don't live in Cairo anymore." },
      { kind: "ask", text: "Where do I live?", context: "personal" },
    ],
  },
  {
    id: "implicit-contradiction",
    title: "Failure test 2: implicit contradiction",
    subtitle: "No negation marker \u2014 the engine should admit it isn't sure, not guess",
    category: "failure",
    steps: [
      { kind: "say", text: "I'm vegetarian." },
      { kind: "say", text: "The grilled chicken at that new place downtown was incredible." },
      { kind: "ask", text: "Am I vegetarian?", context: "personal" },
    ],
  },
  {
    id: "privacy-revocation",
    title: "Failure test 3: privacy revocation",
    subtitle: "Revocation must remove a fact from retrieval, inspector, and anything chained to it",
    category: "failure",
    steps: [
      { kind: "say", text: "My phone number is 555-0142." },
      { kind: "ask", text: "What's my phone number?", context: "personal" },
      { kind: "revokeTopic", topicKey: "user.phone", label: "User asked to forget their phone number" },
      { kind: "ask", text: "What's my phone number?", context: "personal" },
    ],
  },
  {
    id: "scope-leak",
    title: "Failure test 4: scope violation",
    subtitle: "A work-scoped fact should not answer a personal-context question",
    category: "failure",
    steps: [
      {
        kind: "say",
        text: "On my work laptop, I use the company VPN profile 'corp-eu'.",
      },
      { kind: "ask", text: "What VPN profile do I use?", context: "personal" },
      { kind: "ask", text: "What VPN profile do I use?", context: "work" },
    ],
  },
];
