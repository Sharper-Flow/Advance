# Executive Summary — Resolve ADV persistence recovery architecture

## What this delivers

Two architectural decisions, recorded and justified, about how ADV behaves when its own storage
layer is unhealthy. No code ships here — this change exists to decide, so the implementation work
that follows is unambiguous.

**Decision 1 — ADV stays readable during a storage outage.** Today, when Temporal is unreachable,
ADV goes dark: you cannot see what state a change is in, precisely when you most need to. The
decision accepts a read-only recovery surface that serves the existing on-disk copy when Temporal
is down. Reads are marked as potentially stale so nobody mistakes them for authoritative. Writes
are deliberately excluded from this first step — allowing writes during an outage raises
reconciliation questions that deserve their own change.

**Decision 3 — the health check stops lying.** `adv_doctor` currently reports "healthy" by
checking that the server is reachable, the worker is alive, and the queue is serviceable. None of
those touch the path a user actually reads through. The decision requires the doctor to exercise
that real path with a short, bounded probe, and to report `degraded` when it fails.

## Why it matters

These two together change ADV's failure behavior from "silently unusable" to "visibly degraded
but still diagnosable." That is the difference between an outage you can reason about and one you
cannot.

Decision 3 ships first, deliberately: until the health signal is trustworthy, no other rollout in
this area can be judged safe.

## How it was verified

An independent reviewer checked the decision record against the agreed contract and returned
READY. All twelve contract items were confirmed. Every source reference in the document was
checked to resolve to what it claims, and the four prior changes this work builds on were each
verified as genuinely shipped by locating their archive commits.

The document also passed a check that it contains no implementation — this change was agreed to be
decision-only, and the branch is clean with no commits.

## What changed along the way

The change originally carried a third decision, on workflow hibernation. Five independent review
rounds each found a different assumption in it that did not survive verification — in every case
the design claimed an existing ADV mechanism already guaranteed something it did not. Decisions 1
and 3 passed clean in all five rounds.

Rather than force it through, hibernation was split into its own change,
`decideWorkflowHibernation`, carrying the accumulated analysis: six mechanisms ruled out with
reasons, and the two open questions its discovery must answer. That is a scope correction, not a
deferral — the reviewer assessed it explicitly and agreed.

## Risks and follow-ups

Nothing here is user-visible yet; both decisions still require implementation changes.

Three follow-ups are open:
- **`decideWorkflowHibernation`** — the split-out hibernation decision. ADV still has no way to
  reclaim Temporal resources from stale changes (191 running workflows observed, unaffected by
  closing 74 changes). Unresolved.
- **`clampDoomLoopAccumulator`** — a real ADV defect found during this work. A retry guardrail
  writes a record that ADV's own reader rejects, which can make a change unreadable and
  unwritable. Systemic: any task accumulating four blocked reviews can trigger it. This change hit
  it and was recovered without data loss.
- **Limited-write recovery** — deliberately deferred from Decision 1.

One notable detail: while recovering from that defect, `adv_doctor` reported fully healthy while
a routine read timed out. The problem Decision 3 exists to fix demonstrated itself, unprompted,
during this change's own incident. It is cited as supporting evidence.

## Bottom line

Two decisions ready to implement, one honestly deferred rather than forced, and one previously
unknown defect found and documented. The decision record is accurate, independently verified, and
carries its full review history — including its own failures — rather than a cleaned-up version.
