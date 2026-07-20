# Executive Summary: Fix archived branch cleanup timeout

## Outcome

`adv_worktree_cleanup mode:"archived_branches"` — the operator tool that deletes leftover local git branches for already-shipped changes — was timing out every run (hitting the 10-second tool ceiling) on this repository. It now completes in about **1 second**, well inside budget. The cleanup capability is usable again.

## Why it matters

Post-merge branch hygiene was effectively blocked: the tool could not finish, so archived-change branches accumulated with no safe automated way to remove them. This fix restores the intended maintenance workflow without weakening any safety guarantee.

## What was built

- **Root-cause fix (the real cost):** the tool used to load the *entire* archive (dozens of heavyweight change records) just to decide which local branches were eligible. It now checks archived status **per local branch** (one lightweight lookup each, capped at 4 in parallel) — work scales with the ~26 local branches, not the ~85-record archive.
- **No wasted network on previews:** `dryRun` previews no longer perform a network `git fetch`; real runs bound the fetch and cancel it (real process kill) if it is slow, degrading to a warning instead of hanging.
- **Never hangs, always answers:** every internal git and lookup step is time-bounded; if the overall budget is exhausted the tool returns a clear *partial* result listing what it could not check, rather than an opaque timeout.
- **Safety preserved:** a branch is only ever a deletion candidate when its change is provably archived. Anything unknown, unreadable, or not-yet-archived is reported and skipped (fail-closed). Merge-detection, deletion rules, and the separate `worktrees` cleanup mode are unchanged.

## How it was verified

- Full automated test suite: **6,564 tests pass** (zero regressions), including new coverage for the eliminated enumeration, the concurrency cap, fetch-skip/degrade, partial-result handling, and every fail-closed lookup outcome.
- Project quality gate (`pnpm run check`) green; production bundle builds.
- **Measured performance** on this repository: preview runs completed in **0.95–1.22 s** (target was under 5 s).
- Independent review (adv-researcher design validation + adv-reviewer acceptance review) — the reviewer found one additional unbounded-git path in setup/safety checks and fixed it; re-verified green.

## Risks / follow-ups

- **Live wet-run deletion was intentionally not exercised** during verification (it would delete real branches on the main checkout). The delete path is unchanged from the previously shipped, tested behavior; the wet run is a preview plus a bounded fetch plus per-branch deletion, projected well under its 6 s budget.
- **Unrelated pre-existing issue surfaced:** another change, `fixWorkflowReliabilityDefects`, has a schema-invalid record that currently blocks automated cross-change conflict detection project-wide. It is out of scope here and was noted for separate repair; conflict risk for this change was assessed manually as low (isolated subsystem; the one shared utility change is additive).

## Supporting evidence

- Authoritative test run: `adv_run_test` id `tr_mrtn5wq6` (141 targeted tests) + full-suite 6,564 pass.
- Contract review matrix: 18/18 items pass/respected, 0 failing.
- Perf harness: NEW dry-run 953–1219 ms vs OLD full-archive enumeration.
