# Memory That Knows It Might Be Wrong

A memory layer for agents that tags every fact with **source, confidence,
freshness, and scope** — and knows when to hedge, ask, or forget instead of
answering with false confidence.

Built for the *"Memory That Knows It Might Be Wrong"* challenge. See
`ARCHITECTURE.md` for the design, `FAILURE_TESTS.md` for the four required
failure cases with real transcripts, `THESIS.md` for the two-year bet, and
`NOTES.md` for what's deliberately out of scope.

## What it actually does

- **Write path** — every new statement is checked against what's already on
  file for that topic. A clear correction supersedes the old fact (kept,
  not deleted). An unstated conflict marks *both* facts as needing human
  verification instead of guessing which one is right.
- **Retrieve path** — answers are generated *from* confidence, not
  decorated with it. High confidence → a plain answer. Mid confidence → the
  answer plus the number plus a request to confirm. Low confidence or an
  unresolved conflict → "I might be wrong about this," with the actual
  source shown, not asserted.
- **Forget path** — confidence decays on a grace-period-then-half-life curve
  when a fact goes unconfirmed, records expire on a TTL, and revocation is
  explicit, cascading, and permanent — a "forget everything about X" button
  removes it from retrieval, from the inspector's default view, and from
  anything chained to it.
- **Memory Inspector** — the "what do you remember about me?" view: every
  record, its status, its confidence, its source quote, with confirm /
  correct / forget actions live in the UI, not just claimed in a doc.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000 — the interactive demo
npm test           # the engine test suite (vitest)
npm run memories   # terminal walkthrough of all 5 scenarios, no UI
```

> Built and verified in a sandboxed environment with no network access —
> engine logic was confirmed against the real source with a standalone
> `tsx` run rather than left unverified, but `npm install` itself was not
> run here. See `NOTES.md` for details and for what's left to do to get a
> live demo URL deployed.

## Try the required "I might be wrong" moment yourself

1. `npm run dev`, then in the **Scenarios** tab pick **"I might be wrong"
   moment**.
2. Step through it: a fact gets written, ~6 months are fast-forwarded, and
   the same question that got a plain answer now gets a hedged one with its
   confidence number shown. Confirming it snaps confidence back up live.
3. The four **Failure tests** in the same tab are the scripted versions of
   `FAILURE_TESTS.md` — explicit contradiction, implicit contradiction,
   privacy revocation, and a scope leak — each runnable step by step.

Or skip the UI and run `npm run memories` to see all five scenarios execute
straight through the engine in the terminal.

## Project layout

```
src/
  engine/           write path, retrieve path, forget path, contradiction logic
    __tests__/      vitest suite — exact-value tests at every boundary
  adapter/          the only file that touches raw text (pattern-based, not an LLM)
  scenarios/        the 4 failure tests + the core demo, scripted and reusable
  hooks/            useMemorySession — wires the engine into React state
  components/       chat log, source panel, memory inspector, scenario picker
scripts/
  print-memories.ts  terminal walkthrough of every scenario (npm run memories)
```

## License

MIT — see `LICENSE`.
