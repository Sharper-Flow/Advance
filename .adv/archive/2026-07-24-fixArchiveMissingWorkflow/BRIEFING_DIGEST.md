# Archive Briefing Digest

**Change ID:** fixArchiveMissingWorkflow
**Title:** Fix archive missing-workflow recovery
**Status:** archived
**Generated:** 2026-07-24T17:49:56.828Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage #253

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

Showing 19 of 19 durable facts.

- **[archive_only_evidence]** decisions: Probe-first missing-workflow recovery uses isWorkflowAbsentByExactName only. — Untyped describe errors must not authorize disk recovery based on broad message text.
- **[archive_only_evidence]** decisions: Retained isWorkflowCompletedError and recoveryReasonFromError in signal-error path. — Signal-error behavior remains unchanged, including query_failed operator-required handling.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/monotonic-recovery.test.ts (1) — RED: new typed WorkflowNotFoundError describe() test failed as expected; old probe path returned proceed_with_signal.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/monotonic-recovery.test.ts (0) — GREEN: 19 focused monotonic-recovery tests passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/monotonic-recovery.test.ts (0) — VERIFY: 19 focused monotonic-recovery tests passed.
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY: schemas, typecheck, manifest checks, isolation, lockfile policy, lint, and formatting passed.
- **[unresolved_action]** required_main_agent_actions: Restore or provide the ADV worktree at the packet's WORKING DIRECTORY, then re-dispatch this task.
- **[unresolved_action]** blockers: Provided worktree path is inaccessible, preventing preflight, edits, and verification.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (1) — Not run: worktree path unavailable; shell spawn failed with ENOENT.
- **[archive_only_evidence]** decisions: Mocked exact-name WorkflowNotFoundError from the probe describe call. — The archive path's probe-first classifier authorizes disk recovery only after the exact typed absence signal.
- **[archive_only_evidence]** decisions: Used valid pending entries for every disk gate in the AC5 fixture. — Exercises the existing typed incomplete-gates proof rather than passing malformed gate data.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (0) — 48 Phase 9 archive tests pass, including absent-workflow disk recovery and incomplete-projection refusal.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schema, type, manifest, isolation, lockfile, lint, and format checks pass.
- **[research_citation]** sources: Completed-workflow recognizer: Exact-name checks are followed by broad, unanchored message-substring checks; generic not-found text is excluded from isWorkflowCompletedError itself. (plugin/src/temporal/recovery-classification.ts:65-105)
- **[research_citation]** sources: Recognition tests: Tests lock WorkflowNotFoundError and the generic mid-string phrase 'already completed' as recognized. (plugin/src/temporal/recovery-classification.test.ts:25-69)
- **[research_citation]** sources: Recovery requirement: Direct convergence requires unambiguous structured evidence; reachable authority disagreement must fail closed without overwriting authority. (docs/specs/advance-workflow.md:6287-6342)
- **[research_citation]** sources.omitted: 1 additional source omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Catching describe() at the probe-first boundary is structurally appropriate: successful output can still flow through poisonedDescriptionEvidence, while an exact WorkflowNotFoundError can route to missing_workflow. However, isWorkflowCompletedError also accepts broad message substrings, so using it directly as authority for a caught describe failure does not meet the spec's unambiguous-evidence requirement.
- **[unresolved_action]** validation.blockers: The proposed catch path treats unanchored message substrings, including 'already completed', as sufficient authority to overwrite the disk projection even though they need not identify a completed/absent Temporal workflow.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| OOS1 | out_of_scope | missing |

## Unresolved Actions

- Restore or provide the ADV worktree at the packet's WORKING DIRECTORY, then re-dispatch this task.
- Provided worktree path is inaccessible, preventing preflight, edits, and verification.
- The proposed catch path treats unanchored message substrings, including 'already completed', as sufficient authority to overwrite the disk projection even though they need not identify a completed/absent Temporal workflow.
