# Executive Summary

## Outcome
Advance now detects and safely repairs stale OpenCode `running`/`pending` tool parts alongside existing blank assistant ghost debt. Repair remains explicit, backup-gated, schema-compatible, and conservative around live/task-waiting work.

## Verdict
APPROVED / HARDENED READY

## What Was Built
1. Extended session-debt scanning with stale tool-part SQL, classification buckets, child-session task safety, repairable ID helpers, and bounded counts/samples.
2. Extended `opencode-session-doctor` dry-run/apply: DB/WAL/SHM backup gate, write busy timeout, transaction rechecks, in-place interrupted tool repair, and conditional parent completion.
3. Extended `adv_status` and formatter output to surface stale tool-part debt compactly.
4. Updated `rq-opencodeDebt01` specs and doctor docs for stale tool-part detection, repair, exclusions, and parent safety.
5. Hardened docs/spec consistency by correcting `worktree_guard_enforce` default text to match authoritative spec JSON.

## What Was Verified
- Review: APPROVED after task-tool safety remediation.
- Harden: READY after docs/spec drift correction.
- Tests/static checks: `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run check`, focused OpenCode session-debt vitest, and spec JSON parse passed.
- Merge compatibility: non-committing merge against `origin/trunk` passed and was aborted cleanly.
- Preview URL: not_applicable — agreement declares `visual_surface: false`; change affects CLI/status/doctor output and local SQLite repair behavior, not browser-visible UI.
- Investment: 5 tasks / resolved review+harden findings / tier: auto.
- Contract matrix: 18/18 required rows passed or respected; 0 failed/violated/unknown.

## Remaining Concerns
None for accepted scope. Live ADV plugin behavior requires rebuild/deploy/restart before end-to-end runtime invocation, per repo Source-vs-Dist reload gotcha.