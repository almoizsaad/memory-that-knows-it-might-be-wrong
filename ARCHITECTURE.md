# Architecture

## The bet

Every competing submission to this challenge will show up with "memory plus
RAG." The brief explicitly disqualifies that: *"Plain vector RAG with no
confidence/forgetting model."* So the bet here isn't a feature bolted onto a
vector store — it's that **forgetting and doubt are load-bearing parts of the
schema itself**, not UI dressing on top of retrieval:

> Every fact carries two timestamps (when it was written vs. when it was/is
> true), an explicit lifecycle status, and a scope. Retrieval always shows
> its sources and phrases its answer according to how sure it actually is.

That single sentence is the whole design. Everything below is just what it
takes to make it real and testable.

## Why three separate paths, not one "memory service"

```
   raw text                MemoryRecord[]              natural-language
      │                          │                        answer + sources
      ▼                          ▼                              ▲
 ┌──────────┐   ExtractedFact ┌─────────┐   query   ┌──────────────────┐
 │ ADAPTER  │ ───────────────▶│  WRITE  │◀─────────▶│     RETRIEVE      │
 │(pattern- │                 │  PATH   │            │  (scope→relevance │
 │ matching)│                 │(ingest) │            │   →recency, hedge) │
 └──────────┘                 └────┬────┘            └──────────────────┘
                                    │
                              MemoryStoreState
                                    │
                               ┌────▼────┐
                               │ FORGET  │  tick() — TTL + decay
                               │  PATH   │  revoke() — cascade
                               └─────────┘
```

- **`src/adapter/extractFacts.ts`** is the only file that touches raw text.
  It is intentionally *not* an LLM call (see NOTES.md for why that's a
  deliberate scope cut, not an oversight) — it's a small set of pattern
  rules that produce a structured `ExtractedFact`. Swap it for a real
  extraction model in production and nothing downstream changes, because
  nothing downstream knows it exists.
- **`src/engine/memoryEngine.ts` (write path)** takes an `ExtractedFact` and
  the current store and returns a new store. It is pure and synchronous —
  no I/O, no clock reads (the "current time" is a field on the store,
  advanced explicitly). That's what makes the failure tests exact-value
  tests instead of flaky ones.
- **`src/engine/retrieval.ts` (retrieve path)** takes a query and returns a
  hedged answer plus the exact records used *and* the ones that were found
  but withheld, with a reason. The withheld list is what makes scope leaks
  and revocations demonstrable instead of just claimed.
- **`src/engine/forgetting.ts` (forget path)** is the one path split into
  two genuinely different mechanisms rather than one "cleanup" job — decay
  is passive and gradual, revocation is willed and cascading. Conflating
  them would hide the difference the failure tests are built to expose.

## The record shape

```ts
MemoryRecord {
  id, content, type,                  // preference | fact | procedure | episode
  topicKey,                           // coarse bucket for conflict + relevance matching
  source: { kind, quote, turnRef },   // never paraphrased away
  scope: { subject, context },        // "global" or must match the query's context

  writtenAt, validAt, invalidAt,      // bi-temporal: written vs. true-in-the-world
  lastConfirmedAt, expiresAt,

  confidence,                         // 0..1 — moves on write, confirm, decay. Never hand-edited.
  status,                             // active | needs_verification | superseded | revoked | expired
  supersedes, supersededBy,           // chain — a contradiction adds a record, never deletes one
  closedReason,                       // set only on revoked/expired, shown in the inspector
}
```

Two decisions carry most of the weight:

1. **Bi-temporal timestamps.** `writtenAt` is when the system learned
   something; `validAt`/`invalidAt` is when it was actually true. Recent
   memory-benchmark work (Zep's Graphiti evaluation, LongMemEval) attributes
   a large accuracy gap to exactly this distinction — a system that only
   knows "when I wrote it" can't tell a fact that's still true from one that
   quietly expired.
2. **Contradictions never delete.** `ingest()` always keeps the old record
   and adds a new one with an explicit link. The chain is the audit trail:
   who said what, when, and what closed it. Revocation is the only path
   that removes a record from *use* (see below) — and even then the record
   stays in the store as a tombstone, inspectable, just excluded from
   retrieval.

## Write path: a gate, not a shovel

`ingest()` classifies every new fact against the current record on the same
`(topicKey, subject)`:

| Prior state | New fact | Outcome |
|---|---|---|
| none | — | fresh `active` record |
| same content | — | **reconfirmation** — bump confidence, no new record |
| different content | adapter flagged a negation | **explicit** — old → `superseded`, new → `active` |
| different content | no negation flagged | **implicit** — both → `needs_verification`, both confidences pulled toward 0.5 |

The implicit case is the one that separates this from "an if/else that picks
the newest fact." STALE-style benchmarks find even strong models catch
*unstated* contradiction only about half the time — so instead of guessing,
the engine refuses to pick a winner and surfaces the ambiguity to the next
retrieval instead. See `contradiction.ts` for the exact confidence math and
`FAILURE_TESTS.md` #2 for the demo of what a user actually sees when this
happens.

## Retrieve path: scope, then relevance, then recency — in that order

Ranking newest-first is the obvious thing to do and the wrong default: a
record from six months ago that's still active and well-scoped is often more
reliable than a passing mention from yesterday. So the ranking is:

1. **Scope match is a hard filter, not a ranking signal.** A `work`-scoped
   record never answers a `personal`-context query, full stop — see Failure
   Test 4. A `global`-scoped record answers anywhere.
2. **Relevance** — plain keyword overlap between the query and the record's
   topic + content, with light suffix-stripping so "live"/"lives" or
   "move"/"moved" count as the same signal. This is a deliberately naive
   stand-in for embedding similarity (see NOTES.md) — the ranking and
   hedging logic around it doesn't care how the relevance number was
   produced, so swapping in a real embedding search later is a one-function
   change.
3. **Recency** only breaks ties between records with the same scope-exactness
   and comparable relevance.

Every answer is generated *from* the record's confidence, not decorated with
it:

| Confidence / status | Hedge level | Phrasing |
|---|---|---|
| ≥ 0.75, active | `direct` | states the fact plainly |
| 0.4–0.75, active | `hedged` | states it, flags the confidence %, asks for confirmation |
| < 0.4, active | `unsure` | leads with "I might be wrong," gives the number, asks |
| any confidence, `needs_verification` | `unsure` | states there's a live conflict, asks which is right |

This is the "I might be wrong" moment from the brief, and it's not scripted
as a one-off UI string — it's the same `retrieve()` function every query
goes through, and the demo scenario (`might-be-wrong` in
`src/scenarios/index.ts`) just happens to land on the hedged band by forcing
enough simulated time to pass.

## Forget path: four mechanisms, one file, two functions

- **`tick(state, now)`** — advances the simulated clock and does two things
  in the same pass: expires anything past its `expiresAt`, and decays the
  confidence of anything active/needs-verification that hasn't been
  confirmed in the last 90 days, on a 180-day half-life curve with a hard
  floor. The grace period exists so a fact from 89 days ago and one from 91
  days ago don't look wildly different — decay is a slope, not a cliff.
- **`revoke(state, target, reason)`** — user-willed, immediate, and
  cascading. It doesn't just flip one record's status; it walks the
  `supersedes`/`supersededBy` chain outward and revokes everything linked to
  the target, so a correction built on top of a fact you just asked to
  forget doesn't survive the forgetting on a technicality. See Failure Test
  3 for what this looks like when it's a phone number instead of an address.

Explicit supersession (the "old fact superseded by new fact" case) lives in
`memoryEngine.ts`'s `ingest()`, not here, because it only ever happens as a
side effect of a write — there's no standalone "supersede" action a user or
scheduler triggers on its own.

## What the adapter is and isn't

`extractFacts.ts` is pattern matching, not NLU. It exists so the engine has
something realistic to operate on without this build depending on an API
key or a model call to run its own tests and demo. It is explicitly *not*
claiming to solve extraction — see `NOTES.md` for what a production swap
would look like and why it wasn't attempted here.
