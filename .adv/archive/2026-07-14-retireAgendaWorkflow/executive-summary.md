# Executive Summary — Retire Agenda Workflow

## Outcome

Agenda is removed as an ADV work-management surface. Follow-ups now retain typed report provenance and promote to tasks, advisory fast-follow children, or existing typed operational children. Conflict analysis uses typed change/Epic evidence; snapshot repair uses a dedicated audit record; and approved local-store cleanup deletes legacy Agenda data with per-store manifests.

## Why It Matters

Work no longer accumulates in an unowned queue. Required obligations, operational dependencies, and initiative context remain governed by typed state with explicit release and cleanup boundaries.

## What Was Built

- Removed Agenda tools, storage, registrations, writers, path handling, specs, docs, agent permissions, and stale briefing labels.
- Added stable report follow-up references and promotion into pre-planning tasks or post-planning same-project fast-follow children.
- Added advisory Epic fast-follow lineage without direct task ownership or release gating.
- Replaced discovery/proposal Agenda conflict input with typed, fail-closed change/Epic inventory.
- Added purpose-specific snapshot repair audit records.
- Added approval-gated local-store legacy cleanup with dry-run hash, manifest-before-delete, lock/consolidation refusal, and retryability.

## What Was Verified

- Acceptance reviewer: READY; manifest-before-delete and stale documentation/assets remediated.
- Contract review matrix: 29/29 rows pass, respected, or correctly out of scope; zero failing rows.
- Focused post-review tests: 25 passed.
- Full verification: `pnpm run check`, `bin/oc-test full` (341 files, 5,086 tests), and `pnpm run build` passed.
- Worktree/index clean after reviewed remediation checkpoint.

## Risks / Follow-ups

- Legacy records retain parse-only Agenda compatibility; new mutation paths do not accept Agenda sources.
- Cleanup remains explicitly approval-gated and retains unsafe/unavailable stores for retry.
- No release-blocking or open ops follow-up exists for this change.

## Acceptance Status

Implementation and independent review are complete. User acceptance is the remaining checkpoint before release hardening and archive sign-off.
