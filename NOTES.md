# Notes

## AI tools used

Built with Claude, working directly in the repo (TypeScript, tests, docs).
The build followed the same shape as the note-taker's previous challenge
submission: a pure, deterministic core engine with no LLM in the decision
path, tested at exact boundary values, with the AI-adjacent parts (fact
extraction) isolated into an adapter that's explicitly documented as a
stand-in rather than presented as more capable than it is.

## Key decisions

- **No LLM call anywhere in the write/retrieve/forget engine.** The brief
  is about the *memory model* — confidence, scope, forgetting — not about
  extraction quality. Putting a model call in the core loop would make the
  interesting logic untestable at exact values and would let extraction
  quality quietly stand in for memory-model quality in the demo. See
  `src/adapter/extractFacts.ts` for the deterministic stand-in and
  `ARCHITECTURE.md` for the seam where a real extractor would plug in.
- **Contradictions never delete.** Every conflict — explicit or implicit —
  produces a new record and a link, never a mutation-in-place of the old
  one. This is the single decision the rest of the schema (bi-temporal
  fields, `supersedes`/`supersededBy`, cascading revocation) is built
  around.
- **Implicit contradiction resolves to uncertainty, not a guess.** Given how
  poorly even strong models do at unstated-contradiction detection
  (STALE-style benchmarks put it around chance-plus), forcing a
  active/inactive decision here would be presenting a coin flip as
  confidence. `needs_verification` is a first-class status specifically so
  "I don't know which of these is right" is representable without lying
  about it.
- **Revocation is a UI action, not a parsed phrase.** Free-text commands
  like "forget my X" are not parsed from chat input — revocation happens
  through an explicit button in the Memory Inspector. A forgetting
  mechanism that runs through the same fuzzy pattern-matching as fact
  extraction would undercut the word "explicit" in "explicit forgetting
  policy." (Confirm/reject on individual records work the same way — button
  actions, not parsed text.)
- **Decay has a grace period and a floor, not a cliff or a free-fall.** A
  90-day grace period before confidence starts sliding, a 180-day half-life
  after that, and a hard floor above zero. The goal is a system that admits
  uncertainty gracefully rather than one where a fact is either "trusted"
  or "gone" with nothing in between.

## Explicitly out of scope

- **Real NLU/embedding-based extraction and matching.** The adapter is
  pattern-based and the retrieval relevance score is keyword overlap with
  light suffix-stripping — not embeddings. Both are documented as stand-ins
  in `ARCHITECTURE.md`, at the exact seam where a production system would
  swap them in, on purpose: neither the write path's contradiction logic
  nor the retrieve path's hedging logic depends on *how* the topic/relevance
  signal was produced, only on what it is once produced.
- **Derivative tracking.** If a summary or downstream note was generated
  from a fact before that fact was corrected or revoked, this build does
  not reach back and edit that derivative. Revocation and supersession
  affect the source record and its own supersession chain; they do not
  attempt to trace every place a fact's content may have been copied.
  Flagged honestly in `FAILURE_TESTS.md` #1 and #3, and in `THESIS.md`, as
  the next hard problem rather than something quietly assumed away.
- **Multi-user memory sharing / access control beyond `scope.subject`.**
  Scope here distinguishes *contexts* for one subject (personal vs. work);
  it isn't a full permissions model for memories shared across multiple
  people.
- **Persistence beyond the browser session.** The demo keeps state in
  memory for the length of a session so the scripted scenarios and the
  free-chat mode both stay simple to read and reset. Swapping in real
  persistence (IndexedDB, a backend) doesn't change any engine code — the
  engine only ever operates on a plain `MemoryStoreState` object.

## A note on the live demo requirement

This was built and verified inside a sandboxed environment with no outbound
network access, so `npm install` and a deployed live-demo URL could not be
produced as part of this session. Every piece of engine logic described
above was independently verified by running the actual source files (via
`tsx`, no test framework install required) rather than left as
unverified — see the test suite in `src/engine/__tests__/` for the same
assertions in `vitest` form, and `npm run memories` for a full end-to-end
terminal walkthrough of all five scenarios once dependencies are installed.
To finish the submission: `npm install`, `npm test`, `npm run dev` locally,
then deploy the built app (e.g. Vercel, Netlify, or Cloudflare Pages) for
the required live demo link.
