# Failure tests

Four scenarios, each targeting one of the ways a memory system quietly
becomes dangerous. Each is scripted in `src/scenarios/index.ts` and
runnable two ways: interactively in the app (Scenarios tab → pick one → step
through), or all at once from the terminal with `npm run memories`. The
transcript excerpts below are the actual output of that command, not
hand-written.

---

## 1. Explicit contradiction — supersession, not deletion

**Setup:** "I live in Cairo." → "Actually, I moved to Alexandria, I don't
live in Cairo anymore."

**What's being tested:** does a clear correction *replace* the old fact
without erasing the record of what used to be true?

```
USER SAYS: "I live in Cairo."
    -> wrote mem_0001 "Lives in Cairo" [active, confidence 85%, scope personal]

USER SAYS: "Actually, I moved to Alexandria, I don't live in Cairo anymore."
    -> wrote mem_0002 "Lives in Alexandria" [active, confidence 85%, scope personal]
    -> EXPLICIT conflict with mem_0001

USER ASKS (personal): "Where do I live?"
    [DIRECT] Lives in Alexandria
    (withheld mem_0001: superseded by a newer record)
```

**The hard question this raises, deliberately left open:** `mem_0001` still
exists, marked `superseded`, with a full audit trail (`supersededBy:
mem_0002`). Nothing deletes it. But *something else might have already
cited it* — a summary, a downstream note, another system that read it
before the correction landed. Superseding the source record doesn't reach
back and fix derivatives that already copied the old value. This build
doesn't solve that (no derivative-tracking exists here) — it's flagged as
future work in `THESIS.md` and `NOTES.md`, because pretending the chain
alone solves it would be the more dangerous failure.

---

## 2. Implicit contradiction — admitting uncertainty instead of guessing

**Setup:** "I'm vegetarian." → (later, no negation) "The grilled chicken at
that new place downtown was incredible."

**What's being tested:** with no explicit correction, can the system resist
the temptation to silently pick a side?

```
USER SAYS: "I'm vegetarian."
    -> wrote mem_0001 "Diet: vegetarian" [active, confidence 80%, scope global]

USER SAYS: "The grilled chicken at that new place downtown was incredible."
    -> wrote mem_0002 "Mentioned eating grilled chicken" [needs_verification, confidence 50%, scope global]
    -> IMPLICIT conflict with mem_0001

USER ASKS (personal): "Am I vegetarian?"
    [UNSURE] I have conflicting information here and I'm not confident
    which is current: "Diet: vegetarian". Could you confirm?
```

**This is the intentionally weak point.** Benchmarks built specifically for
unstated contradiction (STALE-style evaluations) put even strong models
around 55% accuracy at catching this case at all. Rather than pretend this
build does better, both records are demoted to `needs_verification` and
neither is presented as settled. That's a worse user experience in the
moment (an extra question instead of a clean answer) and a better one
overall (no confidently wrong answer). The failure being demonstrated here
*is* the honest admission that automatic resolution isn't safe to attempt —
which is the thing the challenge brief asks for.

---

## 3. Privacy revocation — actually gone, not just hidden

**Setup:** "My phone number is 555-0142." → user asks to forget it.

**What's being tested:** does revocation remove the fact from retrieval,
from the inspector's default view, and from anything chained to it — or
does it just get grayed out while still quietly answerable?

```
USER SAYS: "My phone number is 555-0142."
    -> wrote mem_0001 "Phone number is 555-0142." [active, confidence 85%, scope personal]

USER ASKS (personal): "What's my phone number?"
    [DIRECT] Phone number is 555-0142.

USER REVOKES topic "user.phone": User asked to forget their phone number
    -> revoked 1: mem_0001

USER ASKS (personal): "What's my phone number?"
    [NONE_FOUND] I don't have anything on file for that yet.
    (withheld mem_0001: revoked by user — excluded, not just hidden)
```

**What actually happens under the hood** (`forgetting.ts`'s `revoke()`):
the record's status flips to `revoked`, `invalidAt` is stamped, and a
`closedReason` is recorded — but critically, `revoke()` also walks the
supersession chain outward, so anything built *on top of* the revoked fact
(a correction, a follow-up note) is cascaded into revocation too, not left
dangling as an orphaned reference to something that no longer exists. The
Memory Inspector's "Forget everything about X" button (the bonus
"privacy controls demoed, not claimed" signal) calls exactly this function.

**What this does not solve:** if a *summary* generated before the
revocation already baked the phone number into its own text, that summary
is not retroactively edited — there's no derivative-tracking in this build.
Revocation guarantees the source record stops being used from this point
forward; it is not a guarantee that every possible past derivative is
unwound. Named honestly in `THESIS.md`.

---

## 4. Scope violation — a work fact should not leak into a personal answer

**Setup:** "On my work laptop, I use the company VPN profile 'corp-eu'."
(written with `scope.context = "work"`) → asked once in a personal context,
once in a work context.

**What's being tested:** does scope actually gate retrieval, or is it
metadata that gets ignored under a "just answer the question" reflex?

```
USER SAYS: "On my work laptop, I use the company VPN profile 'corp-eu'."
    -> wrote mem_0001 "Uses VPN profile 'corp-eu'" [active, confidence 80%, scope work]

USER ASKS (personal): "What VPN profile do I use?"
    [NONE_FOUND] I don't have anything on file for that yet.
    (withheld mem_0001: scoped to "work", query is in "personal" — withheld to avoid a scope leak)

USER ASKS (work): "What VPN profile do I use?"
    [DIRECT] Uses VPN profile 'corp-eu'
```

**Why this one is easy to miss:** most memory demos only test "does
retrieval find the right fact," never "does retrieval correctly refuse a
fact it found but shouldn't use here." `retrieval.ts` treats scope as a hard
filter applied *before* ranking, not a ranking signal — a `work`-scoped
record can score arbitrarily high on relevance and still never surface
outside a `work`-context query. The `withheld` list in the retrieval result
exists specifically so this refusal is visible and testable, not just
silently correct by accident.
