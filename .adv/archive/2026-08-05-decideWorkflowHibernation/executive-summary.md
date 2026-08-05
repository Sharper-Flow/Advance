# Executive Summary — Decide workflow hibernation lifecycle

## What was decided

**Yes — we will build it.** ADV will gain the ability to "park" work items that are open but inactive,
so an internal resource stops growing without anyone having to clean up by hand.

Nothing ships from this change itself. It delivers the decision, the reasoning behind it, and a
reference document. The build is separate, sequenced work.

## Why

ADV keeps one long-running background process alive for every piece of work ever created, and that
process only stops when the work item is properly finished. Two things go wrong:

- **Ordinary work items** are often started and abandoned rather than closed. The system stays tidy
  only because a person periodically notices and cleans up.
- **Initiatives ("Epics") cannot be finished at all.** 40 are open and not one has ever been closed,
  because no closing step was ever built. No amount of diligence fixes that — the capability is
  missing.

A limit that holds only while someone remembers to enforce it is not a limit. Making it automatic is
the fix, not a workaround.

## The correction that changed the answer

An earlier version of this decision said **not** to build it, on the grounds that the growth was
small. That was wrong, for a reason worth stating precisely.

**The measurements omitted a variable: a manual cleanup pass performed immediately before they were
taken.** They measured the tidied-up system rather than the normal one, which made the problem look
far smaller than it is. No "before" snapshot exists, so the real rate is unknown and unrecoverable
from that data. The decision was re-made without relying on those numbers at all.

A second error compounded it: the earlier version treated "people should close their work items" as
the proper fix. But *needing a person to do that repeatedly is the problem being described*, not its
solution.

This finding was significant enough that one of the change's own acceptance criteria had to be
rewritten. The original criterion stated those measurements as fact; once they were established as
invalid, an independent reviewer ruled the criterion impossible to satisfy. Rather than argue around
that ruling, the criterion was formally amended to record what actually happened — that the
measurement missed the cleanup variable.

Worth noting: the criterion only broke because the work got **better**. Discovering the measurement
was invalid is a better outcome than passing the original check would have been.

## Verification

Nine independent review passes examined this work across its cycles. Between them they caught:

- a claim about how the underlying platform behaves that was **flatly contradicted by the platform's
  own documentation** — and which this project's own reference notes had already flagged as unverified
- a statement about an available capability that was **false while citing the source that disproved it**
- three further claims that asserted more than their evidence supported

Every one was corrected. Each correction is recorded **in the decision document itself** rather than
quietly removed, so a future reader can see what was wrong and why. Nine such corrections are now
catalogued there.

This is worth stating plainly: the decision is *about* the danger of asserting things without
checking, and writing it produced repeated instances of exactly that. Review caught them. The
corrections are part of what is being delivered.

## Risk and readiness

**Nothing deploys.** No production code was modified — verified, the code difference is empty. There
is nothing to roll back and no user-visible behaviour is affected.

The build work carries **real, named risks**, and the decision records how each must be handled
before anything goes live:

- Other parts of the system must never mistake a parked item for a finished one. Parked items stay
  fully visible, and an existing system rule will need formally amending — that amendment is recorded
  as an obligation, not a suggestion.
- Parking increases the moments where a message could be silently lost. The fix for that invisibility
  is a **hard prerequisite** and must ship first.
- Resuming a parked item must not restore stale information, so resumption is gated on
  verified-good saved state.

A **smaller first phase is recommended**: apply this only to Initiatives, which are the clear-cut case
— 100% affected, no closing step at all, and a small footprint. That delivers the structural fix
without introducing a new state for ordinary work items. Planning decides.

## One caveat on the follow-up records

Three of the follow-up items created earlier in this work are **listed but not openable** through the
system's own tools — their records were written but their document folders were never created,
because the operations that created them timed out partway. Their content is intact on disk. The
one constraint that actually gates shipping — that the message-loss fix must come first — is recorded
in a record that *is* readable, so nothing load-bearing was lost. The underlying fault is separately
tracked and is not repaired here.

## Follow-on work

Five items tracked, none blocking this change: the prerequisite message-loss fix, the hibernation
build itself, the Initiative closing path, an investigation into roughly 93 MB of separately stranded
storage, and a process improvement so findings like these are handled consistently in future.

## Bottom line

A reversal, made deliberately after the original reasoning was shown to rest on a measurement taken
under the wrong conditions. The decision is to automate a limit that currently depends on someone
remembering. Nothing deploys today; the implementation is separate, sequenced, and its prerequisites
are written down.
