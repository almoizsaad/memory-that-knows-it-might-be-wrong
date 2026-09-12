# Two-year thesis: agent memory done right

Published memory benchmarks are almost entirely self-reported, and it
shows: independent replications of LoCoMo-style evaluations have found
double-digit point swings between labs measuring the "same" system, largely
because "recall" is measured against whichever slice of ground truth the
evaluator chose to keep. Recall is also the wrong top-line metric on its
own — a system that remembers everything and never revises anything can
score well on recall while being actively unsafe, because remembering
something that should have been forgotten, corrected, or held with
uncertainty is a worse failure than not remembering it at all. A forgotten
fact costs a follow-up question. A wrongly-retained one costs a confidently
wrong action, or a fact someone explicitly asked to have removed being
served back to them anyway.

**Prediction:** within two years, memory systems will be evaluated primarily
on forgetting-aware metrics — something in the shape of the FAMA framing
(does the system drop stale, contradicted, or revoked facts, and does it
know when it doesn't know) — rather than on raw retrieval accuracy. And the
record format itself will converge on something portable: bi-temporal
timestamps (when written vs. when true), an explicit scope, and a
first-class revoked/tombstone state, in the shape early open specs like PAM
are already reaching for, because "can I take my memory somewhere else and
have it honestly represent what was revoked" is a real product and
regulatory question, not a nice-to-have.

The test of this prediction is concrete and falsifiable: if evaluation
leaderboards in 2028 are still ranking systems by recall/precision on a
static QA set with no forgetting or contradiction component, this thesis
was wrong. If a system claiming "billions of memories" can't answer "what
would you have to un-remember if I revoked X," it's optimizing for the
wrong axis regardless of its recall score — and this build tries to
demonstrate, at toy scale, why that axis is answerable at all: because
`revoked` is a status the schema always had room for, not a feature added
after the fact.
