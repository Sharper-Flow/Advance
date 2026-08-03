## Outcome

Advance had accumulated code that quietly worked around problems instead of fixing them. This change found the real ones, fixed those, and — just as importantly — proved which ones were doing legitimate work and should be left alone.

Seven suspect spots were examined. **Two were genuine defects. One was dead code. Four were doing their job correctly** and were kept, with the reasoning written down so nobody has to re-litigate them later.

## Why it matters

The headline number looked alarming at the start: roughly 837 places in the codebase where an error is caught without inspection. Treated as a to-do list, that is months of churn and a large risk of breaking working safety nets.

Investigation showed that number was a **search result, not a defect count**. Around 40% of those sit inside machinery that already classifies the specific failure it is handling — they are deliberate engineering, not neglect. Acting on the raw number would have removed protections the system depends on.

What shipped instead is small, targeted, and evidence-backed.

## What was fixed

**Project settings could be read two different ways, with two different answers.** Two functions each independently opened, read, and validated the same configuration file — and disagreed about what to do when that file was corrupt. Callers had grown their own workarounds to paper over the inconsistency. There is now one implementation both share, so the answer is the same regardless of the caller.

**Release automation couldn't tell "no answer" from "garbled answer."** When Advance talks to GitHub during a release, it reads structured responses. If a response arrived damaged, the code silently treated it identically to no response at all — across six separate places. A release could therefore report a clean, confident result derived from corrupted input. Those two situations are now distinguished, and the damaged case carries diagnostic detail explaining what went wrong. This path had no test coverage at all before; it does now.

**A guard that could never fire was removed.** One safety check wrapped an operation that cannot fail in the way the check anticipated — confirmed against Node.js documentation. It implied a hazard that does not exist.

## What was deliberately left alone

Four candidates were investigated and cleared:

- Two safety nets in the session-pointer logic that catch a real error and are required by spec
- A "limited freshness" fallback that is a legitimate typed status, not a swallowed error
- A compatibility path that lets Advance still read archives written by older versions — removing it would have broken reading historical data

A fifth turned out not to be a defect at all; the original suspicion about it was simply wrong, and that correction is recorded.

Each verdict is written into the change record with its supporting evidence. This is the durable part: a future cleanup pass will find the reasoning already done rather than re-flagging the same code.

## Verification

- Full test suite green: **8,242 tests passing, 0 failures**
- All static checks, type checking, linting, and formatting pass
- Every fix was written test-first — a failing test proving the problem, then the fix
- The final diff touches exactly five files; every protected area was confirmed untouched by direct inspection
- No new suppressions, escape hatches, or type overrides were introduced

## Independent scrutiny

The design was reviewed by an independent validator before any code was written. It **caught a factual error** in the plan: the design claimed five callers were working around the config inconsistency when the real split was two working around it and four letting the error through. That correction changed the reasoning and is reflected in the final approach.

An acceptance reviewer then flagged a failing test in the full suite. Investigation showed it was a **pre-existing flaky test unrelated to this work** — it asserts against a 10-millisecond stopwatch and loses that race under heavy parallel load. Confirmed by re-running the identical code to a green suite, and by tracing that the failing test shares no code path with anything changed here. That test's fragility is recorded as a separate follow-up rather than being quietly patched.

## Risks and follow-ups

No known risk to shipped behavior. The one edit in the plugin entry point sits inside a function called during normal tool use, not during startup.

Follow-ups recorded, none blocking:

- Harden the flaky timing test by injecting a controllable clock instead of using the real one
- Review how the four callers that let a config error through actually handle a corrupt settings file
- Two remaining duplicate safety nets in the session-pointer logic could later be consolidated into the single layer that already covers them
