# Archive Briefing Digest

**Change ID:** fixAbsentProjectionArchive
**Title:** Fix absent projection archive refusal
**Status:** archived
**Generated:** 2026-08-08T17:11:43.774Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Showing 11 of 11 durable facts.

- **[unresolved_action]** required_main_agent_actions: Add and run the missing handler-level synthetic stuck-change regression test before accepting AC1.
- **[unresolved_action]** required_main_agent_actions: After merge and deployment, run the recorded AC5 retry for fixWorktreeDeletionReliability from its approved worktree.
- **[unresolved_action]** required_main_agent_actions: Refresh/rebase the ADV worktree through the owning workflow before further implementation because oc-fresh reported behind: 1.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A typed routing helper plus its decision-table tests does not prove the handler reaches its intended fallthrough. Archive retry changes need a synthetic stateful handler test for external-store bundle plus absent committed projection.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/archive/projection-proof.test.ts, pnpm --dir plugin run check, bin/oc-test targeted -- src/archive/projection.test.ts src/archive/projection-lock.test.ts src/archive/terminal-history.test.ts src/archive/historical-repair.test.ts src/archive/delta-idempotency.test.ts src/archive/archive.test.ts src/archive/projection-proof.test.ts src/archive/archive-mesh.test.ts src/archive/terminal-summary.test.ts src/archive/archive-summary-failure.test.ts src/tools/change/clarify-readiness.test.ts src/tools/change/create-clarify.test.ts src/tools/change/archive-gate.test.ts src/tools/change/validation-projection.test.ts src/tools/change/handlers-archive.schema.test.ts src/tools/change/archive-timeout.test.ts src/tools/change/recovery-readback.test.ts results=pass — projection-proof: 13/13 passed. Plugin check passed schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint, and formatting. Archive/change regression selection: 17 files, 143/143 passed. git diff --check passed; worktree clean.
- **[unresolved_action]** required_main_agent_actions: AC1 composition-test blocker is resolved; proceed with the acceptance/review workflow.
- **[unresolved_action]** required_main_agent_actions: Leave archive routing implementation and integrity classifications unchanged; no further reviewer remediation is required.
- **[wisdom_candidate]** wisdom_candidates: [success] When handler-level archive integration cannot run in the isolated unit harness, compose the exact classifier and routing functions over real git fixtures. Include an absent state plus corrupt and repository-error controls to prove the recovery path is narrow and fail-closed.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/archive/projection-proof.test.ts, pnpm --dir plugin run typecheck results=pass — Targeted Vitest run passed 1 file / 16 tests in 3.82s. `tsc --noEmit` exited successfully. Working tree is clean. The remediation commit changes only projection-proof.test.ts; handlers-archive.ts still sends only MANIFEST_ABSENT through reconcile and returns failures for MANIFEST_INVALID and REPO_ERROR.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/projection-proof.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- Add and run the missing handler-level synthetic stuck-change regression test before accepting AC1.
- After merge and deployment, run the recorded AC5 retry for fixWorktreeDeletionReliability from its approved worktree.
- Refresh/rebase the ADV worktree through the owning workflow before further implementation because oc-fresh reported behind: 1.
- AC1 composition-test blocker is resolved; proceed with the acceptance/review workflow.
- Leave archive routing implementation and integrity classifications unchanged; no further reviewer remediation is required.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/archive/projection-proof.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
