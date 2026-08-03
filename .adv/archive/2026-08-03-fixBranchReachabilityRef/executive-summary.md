# Fix branch reachability ref resolution

## What changed for you

Completed work can now be released. Before this change, a change that had genuinely shipped — its code merged and live on the main branch — could be permanently stuck in an unfinished state, because the safety check that confirms "is this actually merged?" was asking the wrong question and getting a misleading answer.

**26 changes in this repository are affected.** They shipped, but could not be closed out.

## Why it mattered

The release gate is a safety check: it refuses to mark work as released until it can prove the work actually reached the main branch. That refusal is correct and deliberate.

The problem was that the check could not tell the difference between two very different situations:

- *"This work is not merged yet"* — a genuine reason to block
- *"I could not find the branch to look at"* — a tooling failure, not a fact about the work

It reported both as the first one. Because branches are routinely deleted after merging, the check was looking for something that no longer existed, failing to find it, and concluding the work was unmerged. The proof it needed was sitting in the repository the whole time and was never consulted.

## What was done

The check now asks a direct question — *is this work an ancestor of the main branch?* — and answers it from durable evidence rather than from a branch name that may have been cleaned up. When the tooling genuinely cannot resolve what it needs, it now says exactly that, with its own distinct message, instead of falsely claiming the work is unmerged.

The safety property is unchanged: work that truly has not shipped still blocks release, and anything the tool cannot prove still fails safe.

## How it was verified

- A live reproduction on a real stuck change confirmed the diagnosis before any code was written
- Independent design review rejected the first proposed approach for creating a subtle safety hole, and the design was reworked; the second review approved it
- Independent acceptance review raised one objection, which was tested against the original code and withdrawn on evidence
- All 12 agreed criteria pass, with zero failures
- Dedicated regression tests lock in each specific mistake found during design, so they cannot silently return

## Risks and follow-ups

**One disclosed caveat.** A pre-existing test failure in the archive split-brain suite remains red. It was verified — independently, twice — to be failing before this change and unrelated to it. This change neither causes nor fixes it. It should be tracked separately.

**Scope boundary.** This change makes the 26 stuck records recoverable; it does not itself recover them. That reconciliation is a deliberate follow-up, and each record should be confirmed individually rather than swept in bulk.

**A secondary safety improvement.** Preview mode (`dryRun`) previously reported success without ever checking the step most likely to block. It now states plainly that the check was not performed, so a clean preview is no longer mistaken for a guarantee.
