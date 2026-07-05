# Archive Briefing Digest

**Change ID:** validateReleaseRecovery
**Title:** Validate release recovery
**Status:** archived
**Generated:** 2026-07-05T19:07:31.490Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage #194

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

Showing 27 of 27 durable facts.

- **[agenda]** follow_ups: AC6/AC7 live validation likely gated by source-vs-dist reload boundary — plan a documented typed recovery path as the fallback outcome.
- **[agenda]** follow_ups: AC8 process guardrail (future Advance source fixes start as ADV changes unless emergency) is untied to code and must be surfaced to user, not auto-adopted.
- **[archive_only_evidence]** sources: gate.ts recovery trust path: hasCompatibilityRecoveryEvidence() trusts gate.recovery_audit.reason|evidence; preferRecoveredDiskGates() prefers disk gates when disk done-count exceeds stale workflow projection.
- **[archive_only_evidence]** sources: archive-gate.ts durable proof path: releaseGateHasRecoveryAudit() (duplicate predicate) + loadAuditedDiskReleaseGate() + verifyReleaseGateDurableForArchive() accept audited disk release gate when store-backed proof stale.
- **[archive_only_evidence]** sources: recovery writer (audit shape source): saveRecoveredGateCompletion() is single writer of recovery_audit {reason, evidence, recovered_at}; structurally requires RecoveryWriteAuthorization.
- **[archive_only_evidence]** sources: existing tests: PR #193 already ships tests for both read surfaces plus writer-shape assertions.
- **[archive_only_evidence]** sources: GitHub issue #194: Tracks post-hoc validation of ad-hoc PR #193 after PokeEdge neutralizePricingDtos stale release-pending incident.
- **[archive_only_evidence]** architecture_assessment: PR #193 is present and structurally sound in the worktree base. Both required read paths trust the audited recovery shape (gate.recovery_audit.reason|evidence), and a single authorized writer produces that shape. The draft design (keep PR #193 as baseline, review + targeted tests + deploy/restart evidence + live-or-documented validation) is correct and low-risk. One real structural leverage point: the recovery-audit trust predicate is duplicated across gate.ts (hasCompatibilityRecoveryEvidence) and archive-gate.ts (releaseGateHasRecoveryAudit) with the same reason||evidence logic — divergence risk if one is later tightened. No architecture replacement warranted; this is a validation change, not a redesign.
- **[agenda]** follow_ups: AC6/AC7 live validation likely gated by source-vs-dist reload boundary; plan a documented typed recovery path (typed ADV reads, target_path for PokeEdge only after explicit approval) as the fallback outcome.
- **[agenda]** follow_ups: AC8 process-guardrail decision (future Advance source fixes start as ADV changes unless emergency hotfix) is untied to code and must be surfaced to the user, not auto-adopted.
- **[agenda]** follow_ups: If consolidating the trust predicate, verify the shared helper does not cross the workflow-bundle/layer boundary (gate.ts and change/archive-gate.ts both live in tools/, so a tools/-local helper is safe); record source evidence either way.
- **[archive_only_evidence]** sources: gate.ts status recovery-trust predicate: hasCompatibilityRecoveryEvidence() trusts recovery_audit.reason||recovery_audit.evidence (plus legacy compatibility_reason). preferRecoveredDiskGates() adopts disk gates only when they carry recovery evidence AND gateDoneCount(disk) > gateDoneCount(current) — satisfies DDC1 (arbitrary disk gates cannot override live projection).
- **[archive_only_evidence]** sources: archive-gate.ts durable release proof: verifyReleaseGateDurableForArchive() falls back to loadAuditedDiskReleaseGate() when store release gate not done; disk fallback requires status==='done' AND releaseGateHasRecoveryAudit() AND releaseGateEvidenceMatches(evidence). Preserves DDC2: matching Phase 9 evidence still required (line 732 + 768).
- **[archive_only_evidence]** sources: duplicate recovery-audit trust predicate: Two independent encodings of the same reason||evidence trust predicate (hasCompatibilityRecoveryEvidence per-gate vs releaseGateHasRecoveryAudit release-only). Same semantics today; divergence risk if one is later tightened. Design already flags this as auto-adopt consolidation candidate.
- **[archive_only_evidence]** sources: single authorized recovery writer (audit shape source): saveRecoveredGateCompletion() is the sole writer of gate.recovery_audit; assertRecoveryAuthorization() structurally forces a RecoveryWriteAuthorization {reason, evidence}. Read-path trust semantics match exactly what this writer emits — closes the projection-drift class the incident exposed.
- **[archive_only_evidence]** sources: existing regression tests for both surfaces: gate.test asserts audited disk recovery preferred over stale workflow gates; archive-phase9.test asserts releaseGateStatus pending then accepts audited disk recovery with matching evidence; _recovery-writers.test locks recovery_audit writer shape. All four AC2/AC3-relevant surfaces already have structural coverage in the worktree base (DDC3 partially satisfied).
- **[archive_only_evidence]** sources: GitHub issue #194: Tracks post-hoc validation of ad-hoc PR #193 after PokeEdge neutralizePricingDtos stale release-pending archive incident; source of AC7/AC8.
- **[archive_only_evidence]** architecture_assessment: Design is a validation-of-existing-implementation change, not a redesign, and every core claim is source-backed in the worktree base (origin/trunk aa5681d). Both read/proof surfaces trust the typed recovery_audit shape written by the single authorized writer, so the read-vs-write projection-drift class that caused the incident is structurally closed for the audited path. Correctness invariants hold: DDC1 enforced by gateDoneCount(disk) > gateDoneCount(current) + recovery-evidence gate (gate.ts:129-132); DDC2 enforced by releaseGateEvidenceMatches on the disk fallback (archive-gate.ts:732,768) so audited disk recovery still requires matching Phase 9 evidence. Regression tests already exist for both read surfaces plus the writer shape. The one real structural finding is the duplicated trust predicate across gate.ts and archive-gate.ts — same semantics now, drift risk later; the design already captures this as an auto-adopt consolidation candidate tied to AC2/AC3 consistency, which is the correct disposition. The runtime source-vs-dist reload boundary is correctly identified as the main execution risk for AC6/AC7 live validation, with a documented typed recovery path as the agreement-permitted fallback. No simpler viable approach and no spec-law contradiction found.
- **[unresolved_action]** required_main_agent_actions: Record acceptance evidence and proceed with orchestrator-owned gate handling if desired; reviewer performed no ADV gate/task/archive mutations.
- **[unresolved_action]** required_main_agent_actions: Before relying on deployed runtime behavior, restart OpenCode sessions/plugin host per documented build/deploy boundary.
- **[unresolved_action]** required_main_agent_actions: If release/archive proceeds from this branch, refresh or merge/rebase against current origin/trunk through normal orchestrator workflow.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For release-recovery repairs, keep a single shared typed predicate for recovery_audit/compatibility evidence and use it from both status read paths and durable archive proof paths to prevent trust-shape drift.
- **[archive_only_evidence]** verification: tests_run=Path preflight for plugin/src/tools/recovery-audit.ts, plugin/src/tools/gate.ts, plugin/src/tools/change/archive-gate.ts, plugin/src/tools/recovery-audit.test.ts, docs/scope-discovery-protocol.md, git diff origin/trunk...HEAD -- plugin/src/tools/recovery-audit.ts plugin/src/tools/gate.ts plugin/src/tools/change/archive-gate.ts plugin/src/tools/recovery-audit.test.ts, gh pr view 193 --repo Sharper-Flow/Advance --json number,state,mergedAt,headRefName,baseRefName,title,url,reviewDecision,comments,reviews, gh issue view 194 --repo Sharper-Flow/Advance --json number,title,state,url,comments, bin/oc-test targeted -- src/tools/gate.test.ts src/tools/change.archive-phase9.test.ts src/tools/recovery-audit.test.ts, pnpm run build, adv_gate_status changeId=neutralizePricingDtos target_path=/home/jon/dev/pokeedge, adv_change_show changeId=neutralizePricingDtos target_path=/home/jon/dev/pokeedge limit=5 results=pass — Path preflight OK. Diff limited to shared recovery-audit helper, gate/archive consumers, and tests. PR #193 is MERGED into trunk and has follow-up comment linking #194. Issue #194 comment records process guardrail and validation evidence. Targeted tests passed: 3 files, 62 tests. Build passed: tsup plugin + temporal worker bundles succeeded. PokeEdge typed read validation returned release.status done, incomplete [], canArchive true, nextGate null, _recovery.reason poisoned_history; change_show returned status archived and lifecycleState archived. No PokeEdge mutations performed.
- **[unresolved_action]** required_main_agent_actions: Restart OpenCode/plugin host before relying on deployed live tool code in the current running process.
- **[unresolved_action]** required_main_agent_actions: Do not revisit PokeEdge historical phase9_status.status unless canonical gate/status/lifecycle reads regress.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Shared recovery predicates should live in a small helper with direct unit coverage, then be reused by both read/status preference paths and release/archive proof paths to avoid recovery-shape drift.
- **[archive_only_evidence]** verification: tests_run=test -e 'plugin/src/tools/recovery-audit.ts' && test -e 'plugin/src/tools/recovery-audit.test.ts' && test -e 'plugin/src/tools/gate.ts' && test -e 'plugin/src/tools/change/archive-gate.ts' && echo OK || echo MISSING, git status --short --branch, git diff --stat origin/trunk...HEAD && git diff --check origin/trunk...HEAD, git diff --find-renames origin/trunk...HEAD -- plugin/src/tools/recovery-audit.ts plugin/src/tools/recovery-audit.test.ts plugin/src/tools/gate.ts plugin/src/tools/change/archive-gate.ts, bin/oc-test targeted -- src/tools/gate.test.ts src/tools/change.archive-phase9.test.ts src/tools/recovery-audit.test.ts, pnpm --dir plugin run check, pnpm --dir plugin run build, git status --short --branch results=pass — Path preflight OK. Worktree clean and ahead 2 on change/validateReleaseRecovery vs origin/trunk. Diff limited to 4 expected files: recovery-audit helper/tests plus gate/archive-gate consumers; git diff --check passed. Targeted release recovery suite passed: 3 files, 62 tests. pnpm --dir plugin run check passed: schemas:check, typecheck, test isolation, lockfile policy, lint, format:check. pnpm --dir plugin run build passed for plugin and Temporal worker bundles. Final git status remained clean.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- Record acceptance evidence and proceed with orchestrator-owned gate handling if desired; reviewer performed no ADV gate/task/archive mutations.
- Before relying on deployed runtime behavior, restart OpenCode sessions/plugin host per documented build/deploy boundary.
- If release/archive proceeds from this branch, refresh or merge/rebase against current origin/trunk through normal orchestrator workflow.
- Restart OpenCode/plugin host before relying on deployed live tool code in the current running process.
- Do not revisit PokeEdge historical phase9_status.status unless canonical gate/status/lifecycle reads regress.
