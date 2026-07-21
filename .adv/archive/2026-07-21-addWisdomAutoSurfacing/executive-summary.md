# Executive Summary

## Outcome

ADV now auto-surfaces relevant wisdom on task start and auto-suggests wisdom drafts when an agent hits a SEMANTIC fix loop, inverting the previous default from "agent must remember to capture/recall wisdom" to "context arrives automatically." The approver is deciding whether to ship this advisory-only enrichment to release.

## Why It Matters

Reflections on prior changes (e.g. `rf-5Vpj7LP2` on `addResumeFreshnessAdvisory`) showed wisdom reuse at 0 hits and capture at 0 entries per session despite reusing 7+ existing primitives and hitting 5+ SEMANTIC fix loops. The generic `[ADV:RECORD_WISDOM]` nudge fired 12× but was tuned out as noise. This change makes recall and capture structural: relevant wisdom attaches to `adv_task_show` output, drafts auto-attach to `adv_task_update` with SEMANTIC error_recovery, and a draft-aware `[ADV:WISDOM_DRAFTS]` nudge replaces the ignored generic prompt. All enrichment remains advisory-only (never gates, never overrides specs/contracts, never replaces task evidence).

## Verdict

APPROVED (after remediation)

## What Was Built

1. **Auto-load wisdom on task start** — `adv_task_show` returns `_relevantWisdom` (top 5 by recency after FTS filter) and `_episodeRecallHint` (capabilities-gated, plugin emits hint only — agent runtime executes the recall) when `contract_refs.implements` is non-empty.
2. **WisdomDraft type + task-scoped drafts field** — new `WisdomDraft` lifecycle object on Task with strict one-way state machine: `suggested → promoted | dismissed`. Typed via Zod, persisted via Temporal task signal field.
3. **Auto-suggest on SEMANTIC error_recovery** — `adv_task_update` creates exactly one WisdomDraft when `error_recovery.attempts[]` contains a SEMANTIC attempt. Trigger is structural (error_class enum), not heuristic. Covers both normal and blocked-status transitions.
4. **Atomic draft promotion via `from_draft_id`** — `adv_wisdom_add` extended with optional `from_draft_id`; validates draft exists on same task, marks promoted atomically after wisdom add succeeds, pre-populates type/content (agent can override).
5. **Checkpoint auto-dismiss with counts** — `adv_task_checkpoint` surfaces `drafts_pending_review` and `drafts_auto_dismissed` counts; unreviewed drafts auto-dismiss with `dismiss_reason: "auto_checkpoint"` at completion (best-effort: signal failure does not block checkpoint).
6. **Draft-aware system-block nudge** — generic `[ADV:RECORD_WISDOM]` retired; replaced with `[ADV:WISDOM_DRAFTS]` prompt that fires only when tasks carry pending drafts. PluginState producer queries the active change's task list each turn and populates `pendingWisdomDraftTasks`.
7. **Spec law** — new `rq-wisdomAutoSurfacing01` under `advance-workflow` capability (12 scenarios covering all 10 ACs plus advisory-only invariant and backward-compat invariant). Spec version bumped 1.33.0 → 1.34.0.

## What Was Verified

- **Verdict**: APPROVED with 0 blockers, 0 unresolved issues after remediation. Original review raised 1 blocker (AC8 producer wiring dead) + 10 issues; all resolved. Two TOCTOU race conditions documented in code comments and deferred to fast-follow per user decision (single-agent session model makes them theoretical; CAS-style fix requires concurrency contract language).
- **Tests**: 235/235 affected unit tests pass across `task.test.ts`, `wisdom.test.ts`, `checkpoint.test.ts`, `wisdom-draft.test.ts`, `system-block.test.ts`, `system-block-ac.verification.test.ts`, `tasks.test.ts`, `signals.test.ts`, `messages.test.ts`, and new `advisory-only-invariant.test.ts`. `pnpm run check` green (schemas:check, typecheck, manifests, isolation, lockfile, lint, format).
- **Preview URL**: not_applicable — pure backend/tool-output change. No browser/UI component. Agreement declares `visual_surface: false`.
- **Contract matrix**: 28 rows (3 SC + 10 AC + 8 C + 7 DONT), 0 failing. All AC rows `pass`; all constraints `respected`; all avoidances `respected`.

## Remaining Concerns

- **TOCTOU races on draft lifecycle** (correctness-5/6): concurrent `from_draft_id` promotions or concurrent checkpoint-dismiss vs. promotion can produce duplicate wisdom entries or lose a promotion via Object.assign clobber. Documented in code comments at `plugin/src/tools/wisdom.ts:248` and `plugin/src/tools/checkpoint.ts:485`. CAS-style fix deferred to fast-follow child change. Single-agent session model makes this theoretical; not blocking.
- **Workflow boundary validation scope** (security-4): `applyTaskUpdatedToState` and `applyTaskBlockedToState` now validate `wisdom_drafts` partials, but other Object.assign consumers in `change-state.ts` remain unguarded. Defense-in-depth change to extend validation to all signal handlers is a separate fast-follow.
- **Temporal-unavailable draft promotion** (tdd-gap-wisdom-temporal-fallback): when Temporal handle is null, `adv_wisdom_add from_draft_id` adds wisdom via disk fallback but cannot fire `taskUpdatedSignal` to mark draft promoted. The tool now surfaces a `_warning` to the caller; draft stays `suggested` and will be auto-dismissed at checkpoint or can be re-promoted when Temporal returns.

## Supporting Evidence

- Tasks: tk-a6cf8146d380, tk-e6c18758c9d9, tk-16f8127784b7, tk-f559c1209038, tk-f0ef7d4573d1, tk-9d2d3be61d01, tk-296743071b40 (all done).
- Review: scanner-bundle:review report (2 scanners, 16 findings, all resolved or deferred).
- Remediation commits: `5ed06790` (revert drive-by) + `d305f25c` (fix AC8 producer + correctness/security gaps).
- Tests: 235/235 pass; `pnpm run check` green.
- Contract review matrix: 28 rows persisted via `adv_contract_review_matrix_set`, 0 failing.
- Spec law: `.adv/specs/advance-workflow/spec.json` rq-wisdomAutoSurfacing01 (12 scenarios, version 1.34.0).

## Consequence Context

1. **Delivered value**: Auto-surfacing of wisdom + auto-capture of SEMANTIC learning moments. Advisory-only enrichment reduces agent initiative burden; structural defaults increase capture/recall rates over the documented 0-baseline.
2. **Enabling-only/follow-up dependency**: None blocking. Fast-follow child change recommended for TOCTOU CAS-style fix and broader workflow-boundary validation (security-4 generalization).
3. **Ops readiness**: Pending — `/adv-harden` owns release/deploy/production/docs/cleanup readiness. No migrations, no deploy config changes, no monitoring hooks added.
4. **Migration/data impact**: n/a — additive change. Existing task records without `wisdom_drafts` continue to work (DDC6 backward-compat invariant); schema treats field as optional.
5. **Frontend/preview impact**: not_applicable — `visual_surface: false`. No browser/UI component; affects only `adv_task_show` JSON output (new optional fields) and system-block prompt text.
6. **Collision/release risk**: Low. Single-repo change touching only ADV plugin surfaces. No public API contract changes (all new fields optional). No collision with other active changes detected.
7. **Open follow-ups**: TOCTOU CAS fix (correctness-5/6) and workflow-boundary validation generalization (security-4) recommended as fast-follow; not blocking release.
8. **Next action**: Acceptance approval proceeds inline to `/adv-harden addWisdomAutoSurfacing`.