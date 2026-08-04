# Executive Summary — Fix artifact read fallback

## Outcome

ADV can now read a change's written record even when the background process that normally serves it has gone away, and its health check now tells you when that has happened instead of reporting all-clear.

## Why it matters

Work in ADV is tracked by a long-running background process, one per working session. When a session ends, its process can be left stranded: still holding real, completed work, but with nobody left listening to answer questions about it. Before this change, that produced a silent, misleading failure.

- **The record looked lost.** Asking ADV for a change's proposal, design, or agreement returned nothing — as though the work had never been done. The content was never actually lost; a durable copy was always on disk. ADV simply never looked there.
- **The health check said everything was fine.** Running the diagnostic reported "System healthy; no action needed" while reads were actively failing, sending anyone investigating in the wrong direction.

This change was validated against itself. While the work was being finished, this very change hit the exact fault it fixes: its own task list became unreadable, and the diagnostic reported full health. Diagnosing that took a dedicated investigation session — precisely the wasted effort this change eliminates.

## What was delivered

- **Reads fall back to the durable copy.** When the live source cannot answer, ADV now reads the durable on-disk copy instead of reporting the content missing. The fallback works even when the time budget for the live attempt is already spent, which is the common case in this fault.
- **Every read says where it came from.** Results are tagged with their source, so content served from a fallback can never be mistaken for a confirmed-live read. This preserves the ability to detect the underlying fault rather than hiding it.
- **No wasted retries.** A live source that has already failed for this reason is not asked again; the fallback is used directly.
- **The diagnostic now surfaces the real condition.** It reports the serving status of both the session and the project queue, graded as fresh, stale, none, or unavailable rather than a single pass/fail flag.
- **Stranded work is flagged without noise.** A quiet queue from an ended session is normal and is deliberately not reported on its own. It is reported only when it still holds unfinished work — the genuinely abnormal case, and the one behind the original outage. This is capped at a bounded number of checks so the diagnostic stays cheap.

## Verification

- Full test suite: 541 files, 8298 tests, 0 failures.
- Static checks, type checks, schema, manifest, and formatting checks: all clean, 0 errors.
- A test reproducing the original production fault fails before the fix and passes after it.
- Two independent review passes. The first blocked the change on a real gap: the diagnostic did not cover queues from ended sessions, so the original outage would still have gone undetected. That gap was closed and re-reviewed.
- A second gap found during re-review — status rows appearing only after a repair ran, not on a normal diagnostic run — was also corrected.

## Risks and follow-ups

- **Deployment required before any benefit is visible.** These are read and diagnostic paths in the plugin. Nothing changes for a running system until the change is merged to the default branch, rebuilt, deployed, and the host restarted.
- **Diagnostic coverage is intentionally bounded.** It checks the oldest few stranded queues, not all of them, to keep the check cheap. If more are stranded than the cap, the diagnostic says so rather than silently truncating.
- **One flaky test, unrelated to this work.** A gate test is sensitive to ordering when the full suite runs in parallel. It passes in isolation and on rerun, and does not involve this change's code. Logged as a low-priority follow-up.
- **No change to how work is written or stored.** This change only affects reading and diagnostics, so it carries no data migration and no impact on recorded history.
