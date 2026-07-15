# Archive Briefing Digest

**Change ID:** alignToolSurface
**Title:** Align tool surface
**Status:** archived
**Generated:** 2026-07-14T23:02:01.845Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 100 of 126 durable facts (26 omitted).

- **[archive_only_evidence]** decisions: Return audit_history entries newest-first (reverse of append order) — Bounded recent-history read view; storage remains append-only oldest-first, reader reverses the tail slice.
- **[archive_only_evidence]** decisions: Clamp limit at runtime (1..100, non-finite → 20) in addition to Zod min/max — Mirrors the existing REPAIR_ACTION_ENUM belt-and-suspenders pattern for direct callers that bypass registry Zod validation; boundedness is the safety property, clamping preserves it without rejecting.
- **[archive_only_evidence]** decisions: Reject scope:'global' for audit_history instead of aggregating — DONT6/DDC2: audit logs are per-project; refusing cross-project audit reads is the structural way to prevent unrelated-project data exposure.
- **[archive_only_evidence]** decisions: Export REPAIR_ACTION_ENUM from snapshot.ts for the parity test — Single source of truth — the test compares spec prose against the actual runtime whitelist instead of a duplicated literal.
- **[archive_only_evidence]** decisions: Preflight policy limit:{zero:'omit'} on adv_snapshot_health — Established precedent (adv_epic_list.limit, adv_backlog_state.top): strict-mode providers fill optional positive ints with 0; omitting lets the handler default 20 apply. Bounded read, no safety impact.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/validator/snapshot-health-spec.test.ts src/tools/snapshot.test.ts (phase:red, tr_mrl53j2i_63d17786) (1) — RED: 8 failures as expected — parity test (spec 3 actions vs runtime 4) + 7 audit_history tests (action not yet wired)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/validator/snapshot-health-spec.test.ts src/tools/snapshot.test.ts (phase:green, tr_mrl568mo_ff0d1004) (0) — GREEN: 27/27 pass after spec amendment + audit_history implementation
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/snapshot.test.ts src/tools/snapshot-scan.test.ts src/storage/snapshot-repair-audit.test.ts src/validator/snapshot-health-spec.test.ts src/tool-registry.test.ts src/utils/tool-arg-preflight.test.ts src/adv-temporal-repair-assets.test.ts src/adv-reviewer-asset.test.ts src/cli-bridge-contract.test.ts src/deploy-local.test.ts (phase:verify, tr_mrl5e5ke_e19bb9df) (0) — VERIFY: 362/362 pass across 10 adjacent files including registry, preflight drift guards, and spec-asset consumers
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm exec eslint <touched> && pnpm exec prettier --check <touched> && pnpm run schemas:check (0) — typecheck clean; eslint clean on all touched files; prettier clean after one --write on snapshot.ts; generated JSON schemas in sync
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/validator/snapshot-health-spec.test.ts src/tools/snapshot.test.ts (phase:red, tr_mrl53j2i_63d17786)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/validator/snapshot-health-spec.test.ts src/tools/snapshot.test.ts (phase:green, tr_mrl568mo_ff0d1004)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/snapshot.test.ts src/tools/snapshot-scan.test.ts src/storage/snapshot-repair-audit.test.ts src/validator/snapshot-health-spec.test.ts src/tool-registry.test.ts src/utils/tool-arg-preflight.test.ts src/adv-temporal-repair-assets.test.ts src/adv-reviewer-asset.test.ts src/cli-bridge-contract.test.ts src/deploy-local.test.ts (phase:verify, tr_mrl5e5ke_e19bb9df)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck && pnpm exec eslint <touched> && pnpm exec prettier --check <touched> && pnpm run schemas:check
- **[archive_only_evidence]** decisions: Relocated cleanup_merged as `mode=archived_branches` on adv_worktree_cleanup with optional changeId restriction, routed before the worktree-DB/timeout machinery — Branch cleanup is pure git hygiene (no workflow signals), so it needs no cleanup-queue DB or poisoned-workflow timeout handling; early routing keeps target_path support and preserves old cleanup_merged semantics including changeId restriction
- **[archive_only_evidence]** decisions: Extracted the handler body into plugin/src/tools/archive-helpers/archived-branch-cleanup.ts returning structured payloads — Keeps adv-worktree.ts thin, co-locates with git-finalize helpers it composes, and makes the mode output self-describing (mode: "archived_branches")
- **[archive_only_evidence]** decisions: Documented the reconcile vs change_status_repair decision matrix in four places: both tool descriptions, rq-archiveRecoveryConsistency01 body, docs/specs/advance-workflow.md, ADV_INSTRUCTIONS.md Worktree Cleanup section — AC5 requires operator guidance distinguishing the paths; tool descriptions are the agent-facing surface while spec+docs are the durable law/mirror
- **[archive_only_evidence]** decisions: Replaced the brittle `change.ts:4436-4441` citation in rq-archiveBranchCleanup01.5 with the structural `archiveMode === "direct"` gate reference — Line citations drift on every edit (this task alone moved the gate ~1300 lines); the source-level non-regression test already asserts the structural marker
- **[archive_only_evidence]** decisions: Added blank→omit preflight policies for adv_worktree_cleanup mode and changeId — Strict-mode providers fill optional enums/strings with empty strings; without the policy a blank mode would fail Zod enum validation instead of normalizing to omitted (mirrors adv_run_test.phase precedent)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/archive-branch-cleanup-assets.test.ts (phase:red) (1) — RED confirmed: assets test fails — change.ts still contains cleanup_merged, spec/doc prescribe old surface
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/adv-worktree.archived-branches.test.ts src/tools/status-hygiene.test.ts (phase:red) (1) — RED confirmed: archived_branches mode unrecognized, status-hygiene recommendation still points at adv_archive_repair action=cleanup_merged
- **[archive_only_evidence]** verification: pnpm exec vitest run src/archive-branch-cleanup-assets.test.ts src/tools/adv-worktree.archived-branches.test.ts src/tools/status-hygiene.test.ts src/tools/change.archive-repair.test.ts src/tools/adv-worktree.test.ts (phase:green) (0) — GREEN: 5 files, 53 tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- 14 files incl. change.status-repair, change.archive-phase9, status*, cli-bridge-contract, manifest-doc-drift, tool-arg-preflight (phase:verify) (0) — VERIFY: 14 files, 307 tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck (tsc --noEmit), test-isolation, lockfile-policy, eslint, prettier format:check all green
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive-branch-cleanup-assets.test.ts (phase:red)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/adv-worktree.archived-branches.test.ts src/tools/status-hygiene.test.ts (phase:red)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive-branch-cleanup-assets.test.ts src/tools/adv-worktree.archived-branches.test.ts src/tools/status-hygiene.test.ts src/tools/change.archive-repair.test.ts src/tools/adv-worktree.test.ts (phase:green)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- 14 files incl. change.status-repair, change.archive-phase9, status*, cli-bridge-contract, manifest-doc-drift, tool-arg-preflight (phase:verify)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Kept legacy/prohibitive agenda references instead of removing all mentions — Parse-only compatibility (OpsFollowupSourceSchema still accepts source_kind='agenda') and prohibitions (MUST NOT create agenda items) remain valid and explicit per task instructions
- **[archive_only_evidence]** decisions: Replaced agenda item creation with typed follow-up promotion/report retention in subagent-reports spec — Matches the implemented consumer behavior in subagent-report.ts where follow_ups are retained as source-attributed report metadata and promoted only via adv_report_followup_promote/adv_followup_promote
- **[archive_only_evidence]** decisions: Replaced design-concern agenda promotion with design_concern_promoted consumer warning — Matches the implemented consumeDesignerDesignConcerns behavior which surfaces consumer warnings instead of writing agenda items
- **[archive_only_evidence]** decisions: Removed stale rq-agendaDurableParse01 section from docs/specs/advance-meta.md — The requirement no longer exists in advance-meta/spec.json; docs mirror was stale
- **[archive_only_evidence]** verification: npx vitest run src/tools/agenda-retirement.test.ts src/adv-review-assets.test.ts src/adv-tron-assets.test.ts src/adv-triage-relevance-assets.test.ts src/subagent-reports-spec-assets.test.ts src/tools/subagent-report.test.ts --reporter=dot (0) — All 95 tests pass across 6 test files covering agenda retirement, subagent reports, review assets, tron assets, triage relevance, and spec assets
- **[archive_only_evidence]** verification: python3 -c "import json; json.load(open('.adv/specs/subagent-reports/spec.json')); json.load(open('.adv/specs/backlog-coordination/spec.json')); json.load(open('.adv/specs/advance-workflow/spec.json')); json.load(open('.adv/specs/advance-meta/spec.json'))" (0) — All 4 modified spec.json files parse as valid JSON
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/tools/agenda-retirement.test.ts src/adv-review-assets.test.ts src/adv-tron-assets.test.ts src/adv-triage-relevance-assets.test.ts src/subagent-reports-spec-assets.test.ts src/tools/subagent-report.test.ts --reporter=dot
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: python3 -c "import json; json.load(open('.adv/specs/subagent-reports/spec.json')); json.load(open('.adv/specs/backlog-coordination/spec.json')); json.load(open('.adv/specs/advance-workflow/spec.json')); json.load(open('.adv/specs/advance-meta/spec.json'))"
- **[report_follow_up]** follow_ups: includeDiskBundle does NOT remove the in-repo git-tracked .adv/archive/<date>-<id>/ bundle copy (spec covers the external archive store; deleting git-tracked content is a commit-level operation). Surface in the ownership-matrix/catalog docs task so operators know full erasure also needs git rm of the in-repo copy.
- **[archive_only_evidence]** decisions: Terminate-then-remove ordering; abort purge when terminate fails with anything other than WorkflowNotFoundError (which is idempotent success) — Never leaves a live workflow serving reads while disk artifacts are gone — no partial purge state; recorded workflowTerminated:false in the structured error for audit
- **[archive_only_evidence]** decisions: includeDiskBundle also removes legacy changes/<id>/ dir snapshot and flat changes/<id>.json workflow projection — Spec body says 'remove its archive bundle and disk projection'; without removing both, reseedChangeFromDisk / disk-terminal fallback would keep adv_change_show returning content, violating rq-archivePurge01.2's not-found outcome
- **[archive_only_evidence]** decisions: No target_path or dryRun args — Spec scenarios and design define exactly two escalation levels; adding unrequested surface expands scope (YAGNI) and the cross-project mutation guard matrix wasn't part of AC1
- **[archive_only_evidence]** decisions: approvedByUser + approvalEvidence required at the Zod schema level (not optional + handler-only check) — Approval is unconditional for this tool; schema-required is structurally stronger (DDC1); handler re-checks both for direct-execute callers bypassing registry validation
- **[archive_only_evidence]** decisions: Tests use a real temp-dir archive bundle and real fs removal instead of mocking findArchiveBundle/rm — Higher-fidelity verification of the recursive-removal contract (asserted via real fs state), matching P24/P07 evidence standards; test-isolation checker satisfied via createTempDir
- **[archive_only_evidence]** decisions: Operator-only classification encoded in the tool description + primary adv.md allowlist only; no leaf-agent manifest entries — Matches adv_archive_repair precedent (absent from adv-engineer/adv-reviewer manifests); AC7/DDC5 ownership-matrix documentation is owned by tk-936177b08749
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-purge.test.ts (1) — RED (tr_mrl6wmrg_2528d6b8): 10/10 fail — adv_archive_purge undefined on changeTools before implementation
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-purge.test.ts (0) — GREEN (tr_mrl6yixq_541f6481): 10/10 pass — refusal paths, workflow-only default, includeDiskBundle escalation, WorkflowNotFoundError idempotence, Temporal-unavailable + terminate-failure structured errors
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-purge.test.ts src/tools/change.status-repair.test.ts src/tools/change.archive-repair.test.ts src/tools/change.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/cli-surface-matrix.test.ts src/tool-name-assets.test.ts src/deploy-local.test.ts src/utils/tool-arg-preflight.test.ts src/utils/tool-title.test.ts src/__tests__/spec-deltas-cull.test.ts (0) — VERIFY (tr_mrl71ysd_5bf4246e): 382/382 pass across 12 adjacent files (registry, frozen snapshot, matrix, title map, preflight drift guard, deploy-local assets)
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY (tr_mrl74nh6_75d0562f): schemas:check, tsc --noEmit, test-isolation, lockfile-policy, eslint, prettier format:check all green (after one prettier --write on the two touched source files)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-purge.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/utils/tool-title.test.ts (0) — VERIFY post-format (tr_mrl752im_0f8e1f74): 65/65 pass confirming prettier reformat changed nothing behavioral
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-purge.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-purge.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-purge.test.ts src/tools/change.status-repair.test.ts src/tools/change.archive-repair.test.ts src/tools/change.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/cli-surface-matrix.test.ts src/tool-name-assets.test.ts src/deploy-local.test.ts src/utils/tool-arg-preflight.test.ts src/utils/tool-title.test.ts src/__tests__/spec-deltas-cull.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-purge.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/utils/tool-title.test.ts
- **[report_follow_up]** follow_ups: Pre-existing store-cleanup.test.ts unused import (paginateCleanupPlan) from another task in shared worktree needs cleanup by owning task
- **[archive_only_evidence]** decisions: Used parallel-coexistence framing for adv_backlog_state description — Runtime evidence shows adv_roadmap is still a full tool with its own file/live modes and Visibility queries — it does not delegate to adv_backlog_state. Both tools read the same snapshot with different interfaces.
- **[archive_only_evidence]** decisions: Updated authoritative spec.json alongside generated docs — spec.json is the source of truth; docs/specs/advance-delivery.md is generated from it. Both must stay in sync.
- **[archive_only_evidence]** decisions: Added description-guard tests as static-check evidence — Task specifies static_check evidence_policy; description-guard tests prevent regression of the exact stale text patterns fixed.
- **[archive_only_evidence]** verification: npx vitest run --reporter=verbose src/tools/backlog.test.ts src/tools/project-metadata.test.ts (0) — 26/26 tests pass — including 3 new description-guard tests
- **[archive_only_evidence]** verification: npx vitest run --reporter=verbose src/tool-registry.test.ts (0) — 29/29 tests pass — comment change safe
- **[archive_only_evidence]** verification: npx vitest run --reporter=verbose src/cli-bridge-contract.test.ts (0) — 19/19 tests pass — frozen snapshot intact
- **[archive_only_evidence]** verification: pnpm run check (schemas:check → typecheck → lint → format:check) (0) — All static checks pass on changed files; pre-existing store-cleanup.test.ts lint error from another task in shared worktree is not in scope
- **[archive_only_evidence]** verification: npx eslint src/tools/backlog.ts src/tools/backlog.test.ts src/tools/project-metadata.ts src/tools/project-metadata.test.ts src/tool-registry.ts (0) — All changed files lint clean
- **[archive_only_evidence]** verification: npx prettier --check src/tools/backlog.ts src/tools/backlog.test.ts src/tools/project-metadata.ts src/tools/project-metadata.test.ts src/tool-registry.ts (0) — All changed files format clean
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run --reporter=verbose src/tools/backlog.test.ts src/tools/project-metadata.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run --reporter=verbose src/tool-registry.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run --reporter=verbose src/cli-bridge-contract.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check (schemas:check → typecheck → lint → format:check)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx eslint src/tools/backlog.ts src/tools/backlog.test.ts src/tools/project-metadata.ts src/tools/project-metadata.test.ts src/tool-registry.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx prettier --check src/tools/backlog.ts src/tools/backlog.test.ts src/tools/project-metadata.ts src/tools/project-metadata.test.ts src/tool-registry.ts
- **[archive_only_evidence]** decisions: Extended the operator-only family beyond the named 7 with adv_change_status_repair, adv_change_repair_origin, and adv_temporal_register_search_attributes — All three are approval-gated audited recovery/repair tools in the same posture as adv_archive_repair; AC5 requires operator guidance distinguishing reconcile vs adv_change_status_repair, and the task's operator-only list is a minimum ('Include:'), not exhaustive. Documented as an explicitly-labeled extended recovery family.
- **[archive_only_evidence]** decisions: Classifications documented as advisory reachability policy, not tool-manifest gating — C5 requires operator-only tools to remain discoverable; the adv agent manifest intentionally enables them (e.g. adv_archive_purge: true). Doc states agents invoke them only on explicit operator instruction with approval evidence.
- **[archive_only_evidence]** decisions: Added rq-toolOwnership01 directly to .adv/specs/advance-meta/spec.json and synced docs/specs/advance-meta.md (version 1.23.0 → 1.24.0, updated_at 2026-07-14) — Sibling tasks in this change edited spec.json + mirror directly; deploy-local.test.ts 'advance-meta markdown mirror is synced to spec metadata and new laws' enforces header sync, and spec-citation-invariant requires external citation (provided by the new test and doc).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tool-ownership-assets.test.ts (0) — PASS — 6/6 tests in new static-check file (runId tr_mrl80jpc_703d1176)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts src/deploy-local.test.ts src/tool-registry.test.ts src/cli-surface-matrix.test.ts src/manifest-doc-drift.test.ts (0) — PASS — 122/122 across 5 neighboring suites pinning spec citations, advance-meta mirror sync, and registry surface
- **[archive_only_evidence]** verification: pnpm run check (0) — PASS — schemas:check, typecheck, isolation/lockfile checks, eslint, prettier all clean (runId tr_mrl85jfa_46073ee4)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tool-ownership-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts src/deploy-local.test.ts src/tool-registry.test.ts src/cli-surface-matrix.test.ts src/manifest-doc-drift.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: plan_hash computed over the full plan (full stores + summary) before any render slicing; paginateCleanupPlan is a pure render helper — DDC3/rq-storeCleanupCoupling01.4: an approval pinned to any render's hash must authorize exactly one full plan; execute calls buildCleanupPlan unpaged so paged dry_run renders always match (proven end-to-end)
- **[archive_only_evidence]** decisions: Added optional outcome filter (delete/skip/retain) alongside offset/limit — AC9 contract language requires 'paged/delete-only review data'; the filter maps that clause structurally (outcome=delete) and is render-only, so hash determinism is preserved
- **[archive_only_evidence]** decisions: Default limit 20, max 100 with runtime clamp in paginateCleanupPlan — Mirrors the sibling snapshot audit_history precedent (default 20/max 100 + belt-and-suspenders clamp for direct callers bypassing registry Zod)
- **[archive_only_evidence]** decisions: Spec requirement placed in advance-delivery next to rq-storeConsolidation01, version bumped 1.4.0 → 1.5.0 — P04 locality: coupling requirement belongs beside the consolidation law it couples with; design sanctioned 'advance-meta or advance-delivery'
- **[archive_only_evidence]** decisions: Added dedicated pagingRoot fixture instead of asserting against shared dataHomeRoot — Existing execute describes mutate the shared fixture (delete storeA agenda, append manifests); order-dependent assertions failed on first green attempt (tr_mrl6yvvs_40dcdcbe). Dedicated root matches the file's established pattern for mutation-sensitive tests
- **[archive_only_evidence]** decisions: Spec body names `adv_store_consolidate` explicitly — Assets test asserts both tool names appear in the requirement body; first draft said only 'store consolidation' prose
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts (phase:red, tr_mrl6tuf7_05ee32dc) (1) — RED: 12 failures as expected — summary/has_more/paginateCleanupPlan/outcome filter/tool paging missing; rq-storeCleanupCoupling01 absent from spec
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts src/utils/tool-arg-preflight.test.ts (phase:green, tr_mrl71oww_dbdc3dbc) (0) — GREEN: 127/127 pass (intermediate attempt tr_mrl6yvvs_40dcdcbe failed 4: shared-fixture mutation → dedicated pagingRoot; spec body missing literal tool name → fixed)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts src/utils/tool-arg-preflight.test.ts src/tools/store-consolidate.test.ts src/tools/store-consolidate.lifecycle.test.ts src/tool-registry.test.ts src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/validator/snapshot-health-spec.test.ts src/archive-branch-cleanup-assets.test.ts (phase:verify, tr_mrl72glt_b2a08cff) (0) — VERIFY: 219/219 pass across 10 adjacent files including consolidation, registry, preflight drift guards, and spec-citation invariant
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm exec eslint <5 touched ts files> && pnpm exec prettier --check <5 touched ts files> && pnpm run schemas:check (0) — typecheck clean; eslint clean; prettier clean; generated JSON schemas in sync (store-cleanup not in schema-registry)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts (phase:red, tr_mrl6tuf7_05ee32dc)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts src/utils/tool-arg-preflight.test.ts (phase:green, tr_mrl71oww_dbdc3dbc)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts src/utils/tool-arg-preflight.test.ts src/tools/store-consolidate.test.ts src/tools/store-consolidate.lifecycle.test.ts src/tool-registry.test.ts src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/validator/snapshot-health-spec.test.ts src/archive-branch-cleanup-assets.test.ts (phase:verify, tr_mrl72glt_b2a08cff)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck && pnpm exec eslint <5 touched ts files> && pnpm exec prettier --check <5 touched ts files> && pnpm run schemas:check
- **[report_follow_up]** follow_ups: CANDIDATE 1 [surface_to_user | payoff:high risk:low | tie:AC2] Snapshot whitelist spec amendment must fix the requirement's own 'Only three repair actions' + closed-set prose (rq-snapshotHealthRepairWhitelist01), not only bump the count — evidence: spec body says 'Only three' while snapshot.ts:29-34 and rq-snapshotHealthProbe01 (7-pattern scan) require four. Prior: new.
- **[report_follow_up]** follow_ups: CANDIDATE 2 [surface_to_user | payoff:medium risk:medium | tie:AC5] cleanup_merged relocation to adv_worktree_cleanup has real blast radius: 12 tests in change.archive-repair.test.ts:214-524 and operator hints at status-hygiene.ts:299-307 must migrate atomically; deleteChangeBranch (git-finalize.ts:380) is already reusable so the mechanics are simple but the surface migration is not free. Prior: new.
- **[report_follow_up]** follow_ups: CANDIDATE 3 [adopt_now | payoff:high risk:low | tie:AC3,AC8] Wire existing listSnapshotRepairAudits (snapshot-repair-audit.ts:172-197) rather than build a new reader — it is already bounded, project-arg'd, and malformed-tolerant; only the tool-surface action + limit + project-scope enforcement is new work. This is design #3's stated path. Prior: new.
- **[report_follow_up]** follow_ups: CANDIDATE 4 [adopt_now | payoff:medium risk:low | tie:AC6] backlog_state description fix is pure parallel-coexistence correction: roadmap.ts:648 is still a full 2-mode handler and backlog.ts:402/414 comments already say 'mirror adv_roadmap semantics' — the 'thin delegation wrapper in task C4' text (backlog.ts:372) is factually false since C4 never landed. Do NOT build the delegation; just correct prose. Prior: new.
- **[report_follow_up]** follow_ups: CANDIDATE 5 [surface_to_user | payoff:medium risk:medium | tie:AC4,AC11] Coordinate with active addAdvanceFrictionTriage (draft, planning phase, 4 tasks, epic improveAdvanceFrictionLoop) before amending report/triage-adjacent specs (rq-subagentReports03/08) — discovery findings flagged possible audit/report-triage surface overlap. Evidence: adv_change_list. Prior: conflict:addAdvanceFrictionTriage.
- **[report_follow_up]** follow_ups: WARNING: Episode recall returned only advisory project-context memories (no authoritative alignToolSurface history); global-namespace hit was test noise. Not used as workflow evidence.
- **[report_follow_up]** follow_ups: NOTE: StoreCleanupPlan summary/pagination (design #9) and cleanup/consolidation coupling doc (design #10) were verified as accurate gaps (store-cleanup.ts:118-128) but did not rank in the top-5 leverage set — they are straightforward additive schema/doc work with no reuse/simplification leverage beyond what the design already states.
- **[archive_only_evidence]** sources: snapshot.ts REPAIR_ACTION_ENUM (runtime whitelist, 4 actions): Runtime accepts delete_stale_locks, delete_zero_byte_objects, delete_orphan_bare_repos, delete_fsck_corrupt_repos. Only action enum is scan|repair (no audit_history).

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/validator/snapshot-health-spec.test.ts src/tools/snapshot.test.ts (phase:red, tr_mrl53j2i_63d17786)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/validator/snapshot-health-spec.test.ts src/tools/snapshot.test.ts (phase:green, tr_mrl568mo_ff0d1004)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/snapshot.test.ts src/tools/snapshot-scan.test.ts src/storage/snapshot-repair-audit.test.ts src/validator/snapshot-health-spec.test.ts src/tool-registry.test.ts src/utils/tool-arg-preflight.test.ts src/adv-temporal-repair-assets.test.ts src/adv-reviewer-asset.test.ts src/cli-bridge-contract.test.ts src/deploy-local.test.ts (phase:verify, tr_mrl5e5ke_e19bb9df)
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck && pnpm exec eslint <touched> && pnpm exec prettier --check <touched> && pnpm run schemas:check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive-branch-cleanup-assets.test.ts (phase:red)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/adv-worktree.archived-branches.test.ts src/tools/status-hygiene.test.ts (phase:red)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/archive-branch-cleanup-assets.test.ts src/tools/adv-worktree.archived-branches.test.ts src/tools/status-hygiene.test.ts src/tools/change.archive-repair.test.ts src/tools/adv-worktree.test.ts (phase:green)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- 14 files incl. change.status-repair, change.archive-phase9, status*, cli-bridge-contract, manifest-doc-drift, tool-arg-preflight (phase:verify)
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/tools/agenda-retirement.test.ts src/adv-review-assets.test.ts src/adv-tron-assets.test.ts src/adv-triage-relevance-assets.test.ts src/subagent-reports-spec-assets.test.ts src/tools/subagent-report.test.ts --reporter=dot
- verification_missing: No adv_run_test evidence found for reported command: python3 -c "import json; json.load(open('.adv/specs/subagent-reports/spec.json')); json.load(open('.adv/specs/backlog-coordination/spec.json')); json.load(open('.adv/specs/advance-workflow/spec.json')); json.load(open('.adv/specs/advance-meta/spec.json'))"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-purge.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-purge.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-purge.test.ts src/tools/change.status-repair.test.ts src/tools/change.archive-repair.test.ts src/tools/change.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/cli-surface-matrix.test.ts src/tool-name-assets.test.ts src/deploy-local.test.ts src/utils/tool-arg-preflight.test.ts src/utils/tool-title.test.ts src/__tests__/spec-deltas-cull.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.archive-purge.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/utils/tool-title.test.ts
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run --reporter=verbose src/tools/backlog.test.ts src/tools/project-metadata.test.ts
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run --reporter=verbose src/tool-registry.test.ts
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run --reporter=verbose src/cli-bridge-contract.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check (schemas:check → typecheck → lint → format:check)
- verification_missing: No adv_run_test evidence found for reported command: npx eslint src/tools/backlog.ts src/tools/backlog.test.ts src/tools/project-metadata.ts src/tools/project-metadata.test.ts src/tool-registry.ts
- verification_missing: No adv_run_test evidence found for reported command: npx prettier --check src/tools/backlog.ts src/tools/backlog.test.ts src/tools/project-metadata.ts src/tools/project-metadata.test.ts src/tool-registry.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tool-ownership-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts src/deploy-local.test.ts src/tool-registry.test.ts src/cli-surface-matrix.test.ts src/manifest-doc-drift.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts (phase:red, tr_mrl6tuf7_05ee32dc)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts src/utils/tool-arg-preflight.test.ts (phase:green, tr_mrl71oww_dbdc3dbc)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/store-cleanup.test.ts src/store-cleanup-consolidation-assets.test.ts src/utils/tool-arg-preflight.test.ts src/tools/store-consolidate.test.ts src/tools/store-consolidate.lifecycle.test.ts src/tool-registry.test.ts src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/validator/snapshot-health-spec.test.ts src/archive-branch-cleanup-assets.test.ts (phase:verify, tr_mrl72glt_b2a08cff)
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck && pnpm exec eslint <5 touched ts files> && pnpm exec prettier --check <5 touched ts files> && pnpm run schemas:check
