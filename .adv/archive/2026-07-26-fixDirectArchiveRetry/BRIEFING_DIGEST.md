# Archive Briefing Digest

**Change ID:** fixDirectArchiveRetry
**Title:** Fix direct archive retry
**Status:** archived
**Generated:** 2026-07-26T14:23:07.452Z

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

Showing 48 of 48 durable facts.

- **[unresolved_action]** required_main_agent_actions: Record durable RED/GREEN/VERIFY evidence with adv_run_test before task completion.
- **[archive_only_evidence]** decisions: Made releasedCommitSha required on every reachable ReleaseReachabilityProof — Every successful reachability proof must carry exact released commit identity.
- **[archive_only_evidence]** decisions: Populated releasedCommitSha within all successful reachability branches — Reachability authority owns local HEAD, verified remote SHA, or PR merge OID.
- **[archive_only_evidence]** decisions: Consumed reachability.releasedCommitSha directly in archive evidence verification — Prevents route/status inference and keeps proof structural.
- **[archive_only_evidence]** decisions: Kept mergeCommitSha PR-specific — Preserves compatibility while route-neutral SHA drives projection proof.
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/tools/change/archive-gate.test.ts --reporter=verbose (0) — 37 tests passed
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/tools/archive-helpers/git-finalize.test.ts --reporter=verbose (0) — 144 tests passed
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/tools/change.archive-phase9.test.ts --reporter=verbose (0) — 54 tests passed
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — All schema, type, manifest, isolation, lockfile, lint, and format checks green
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: shell-archive-gate-2026-07-26
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: shell-git-finalize-2026-07-26
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: shell-archive-phase9-2026-07-26
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: shell-static-check-2026-07-26
- **[archive_only_evidence]** decisions: Require releasedCommitSha on every reachable release proof — Release authority and immutable commit identity remain structurally coupled.
- **[archive_only_evidence]** decisions: Allow archived existing-bundle retry without worktreePath — Retry performs read-only projection verification and bounded metadata reconciliation; original worktree may already be deleted.
- **[archive_only_evidence]** verification: baseline releasedCommitSha reproduction (1) — RED: baseline shipped reachability evidence lacks route-neutral releasedCommitSha.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change/archive-gate.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts (0) — VERIFY: 236 focused archive and finalization tests pass after acceptance remediation.
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY: schemas, typecheck, manifests, isolation, lockfile, lint, and format all pass.
- **[report_follow_up]** follow_ups: Regression targets: archive-gate.test.ts direct origin_default result must carry releasedCommitSha and PR result must retain mergeCommitSha plus releasedCommitSha; git-finalize tests must assert remote default SHA propagation/fail-closed SHA resolution; change.archive-phase9.test.ts needs archived + bundle + non-empty deltas + matching projection manifest direct retry noOp success, equivalent PR route, and missing releasedCommitSha/mismatching projection blockers. Current createMockStore hard-codes deltas {}, so add fixture option and mock projection-proof boundary or use focused archive integration fixture.
- **[research_citation]** sources: Git finalization types and reachability: GitFinalizeOutcome currently has only mergeCommitSha; reachability's direct proof carries no commit SHA. (file:///home/jon/dev/advance/plugin/src/tools/archive-helpers/git-finalize.ts#L11-L27)
- **[research_citation]** sources: Direct reachability implementation: Direct release proof establishes local HEAD equals remote default SHA, but discards that SHA. (file:///home/jon/dev/advance/plugin/src/tools/archive-helpers/git-finalize.ts#L1259-L1300)
- **[research_citation]** sources: Archived retry guard: Archived retry requires release.mergeCommitSha and passes it to immutable Git projection verification. (file:///home/jon/dev/advance/plugin/src/tools/change.ts#L4041-L4087)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: NEEDS_AMENDMENT. Preserve mergeCommitSha as PR-specific compatibility evidence and add a route-neutral releasedCommitSha to typed successful reachability/finalization results. For direct proof, set it to exact remote default SHA proved equal to local HEAD; for PR proof, set it to merge commit OID. Consume only releasedCommitSha in projection proof paths. Do not infer from archive status, route-name strings, or a later unconstrained ref resolution.
- **[research_citation]** sources: Amended design artifact: Design explicitly defines route-neutral releasedCommitSha, exact direct remote-default source, PR merge OID source, both call-site migration, and fail-closed behavior. (adv://change/fixDirectArchiveRetry/design)
- **[research_citation]** sources: Typed reachability baseline: Existing successful reachability union is the correct structural owner for a required released SHA. (file:///home/jon/dev/advance/plugin/src/tools/archive-helpers/git-finalize.ts#L343-L363)
- **[research_citation]** sources: Direct equality proof baseline: remoteSha is the exact value compared to local HEAD and should be propagated when equal. (file:///home/jon/dev/advance/plugin/src/tools/archive-helpers/git-finalize.ts#L1259-L1300)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: READY. Amended design places releasedCommitSha at typed reachability/finalization authority, derives direct evidence from exact remote SHA already matched to HEAD, preserves PR-only mergeCommitSha semantics, migrates both consumers, and retains fail-closed projection verification.
- **[unresolved_action]** required_main_agent_actions: Create a task checkpoint for the two reviewer remediation files before acceptance-gate completion.
- **[unresolved_action]** required_main_agent_actions: Re-evaluate acceptance using this report; no remaining blocker or scope drift found.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Existing-bundle archived retries with accepted deltas must bypass the generic worktree-required projection-write guard: their path reads the committed manifest and verifies it against the released SHA, without writing specs, docs, or archive artifacts.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.ts: Allowed an already-archived retry with an existing bundle and accepted deltas to proceed without a worktree; this branch only verifies immutable released projection and reconciles metadata, so it does not write specs or bundles.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.archive-phase9.test.ts: Added behavioral AC1 regression coverage for direct archived retry: verified default-branch SHA is supplied to projection proof, matching proof returns no-op success, and archive bundle is not rewritten.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts, bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts, bin/oc-test smoke, git diff --check results=pass — Direct regression: 55 tests passed. Focused archive tests: 3 files, 236 tests passed. Smoke ran schemas:check, typecheck, generated-manifest check, isolation/lockfile checks, lint, format check, plus 94 tests; all passed. git diff --check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test smoke
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Create the required task checkpoint for the two reviewer remediation files, then resume normal release/archive evidence flow.
- **[unresolved_action]** required_main_agent_actions: Do not revisit unrelated archive/recovery behavior; reviewed scope limited to release reachability, retry preflight, and projection-proof safety.
- **[wisdom_candidate]** wisdom_candidates: [pattern] A zero-exit git push is transport success, not release proof. Direct Phase 9 must fetch and compare origin/default before treating a SHA as released or using it for immutable projection verification.
- **[archive_only_evidence]** changes_made: plugin/src/tools/archive-helpers/git-finalize.ts: Direct Phase 9 finalization now post-fetches and compares origin/default after a successful push; it blocks on mismatch and uses verified remote SHA as releasedCommitSha for projection proof.
- **[archive_only_evidence]** changes_made: plugin/src/tools/archive-helpers/git-finalize.test.ts: Converted direct-finalization artifact test to a local bare origin and asserted releasedCommitSha equals verified origin/trunk.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change/archive-gate.test.ts, pnpm run check, git diff --check origin/trunk...HEAD results=pass — 236 targeted tests passed across 3 files. schemas check, TypeScript, manifest generation, isolation, lockfile policy, ESLint, and Prettier all passed. git diff --check clean.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change/archive-gate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- Record durable RED/GREEN/VERIFY evidence with adv_run_test before task completion.
- verification_missing: No durable adv_run_test evidence found for run_id: shell-archive-gate-2026-07-26
- verification_missing: No durable adv_run_test evidence found for run_id: shell-git-finalize-2026-07-26
- verification_missing: No durable adv_run_test evidence found for run_id: shell-archive-phase9-2026-07-26
- verification_missing: No durable adv_run_test evidence found for run_id: shell-static-check-2026-07-26
- Create a task checkpoint for the two reviewer remediation files before acceptance-gate completion.
- Re-evaluate acceptance using this report; no remaining blocker or scope drift found.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test smoke
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Create the required task checkpoint for the two reviewer remediation files, then resume normal release/archive evidence flow.
- Do not revisit unrelated archive/recovery behavior; reviewed scope limited to release reachability, retry preflight, and projection-proof safety.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change/archive-gate.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
