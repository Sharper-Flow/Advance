# Archive Briefing Digest

**Change ID:** fixValidationInputTimeout
**Title:** Fix validation input timeout
**Status:** archived
**Generated:** 2026-07-17T04:15:13.312Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage #227

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

Showing 59 of 59 durable facts.

- **[archive_only_evidence]** decisions: Kept loadValidationContext signature backward-compatible with an optional 4th options object for the deadline, and created a fresh deadline internally when not supplied. — The two existing callers (change.ts adv_change_validate and adv_change_archive) both load the target change before invoking the helper; internal deadline creation satisfies the acceptance criteria that the helper starts the deadline before its own input reads, without forcing a signature break.
- **[archive_only_evidence]** decisions: Used Promise.allSettled plus per-branch raceWithDeadline wrappers rather than a single Promise.all. — Lets the function return a typed snapshot when a branch times out or fails, instead of propagating an exception and losing partial diagnostics. The inventory branch already degrades gracefully; specs/proposal/git default to empty/scaffold/undefined and any rejection forces canConcludeClean false.
- **[archive_only_evidence]** decisions: Implemented boundedMap with a worker pool of 4 to load specs, preserving input order. — Replaces the old sequential spec loop with bounded concurrency that respects the AC2 cap of 4 and keeps deterministic output ordering.
- **[archive_only_evidence]** decisions: Made validator pass computation depend on context.conflictInventory?.canConcludeClean !== false. — Fail-closed semantics: incomplete/degraded/non-conclusive inventories cannot produce a passed:true verdict, while preserving existing diagnostics and hydrated-peer checks as warnings.
- **[archive_only_evidence]** decisions: Deep-froze the returned validation snapshot. — Ensures late-settled background work cannot mutate the result the caller receives, satisfying AC6.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test isolation, lockfile policy, lint, and format checks all pass
- **[archive_only_evidence]** verification: npx vitest run src/tools/change/create-clarify.test.ts src/validator/validator.test.ts src/tools/change/validation-projection.test.ts (0) — 23 new TDD tests pass (concurrency, deadline, immutability, canConcludeClean)
- **[archive_only_evidence]** verification: npx vitest run src/tools/change.test.ts src/validator/conflict-inventory.test.ts (0) — 151 existing tests pass; no regressions in adv_change_validate or conflict inventory behavior
- **[archive_only_evidence]** verification: pnpm run build (0) — Plugin + Temporal worker bundle build succeeds
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/tools/change/create-clarify.test.ts src/validator/validator.test.ts src/tools/change/validation-projection.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/tools/change.test.ts src/validator/conflict-inventory.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test isolation, lockfile policy, lint, and format checks all pass
- **[archive_only_evidence]** verification: npx vitest run src/tools/change/create-clarify.test.ts src/validator/validator.test.ts src/tools/change/validation-projection.test.ts (0) — 23 new TDD tests pass (concurrency, deadline, immutability, canConcludeClean)
- **[archive_only_evidence]** verification: npx vitest run src/tools/change.test.ts src/validator/conflict-inventory.test.ts (0) — 151 existing tests pass; no regressions in adv_change_validate or conflict inventory behavior
- **[archive_only_evidence]** verification: pnpm run build (0) — Plugin + Temporal worker bundle build succeeds
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; report used the user's explicit research request without inferring missing contract sections.
- **[report_follow_up]** follow_ups: Add deterministic deferred-promise/fake-timer tests rather than wall-clock sleeps.
- **[report_follow_up]** follow_ups: Decide explicitly whether an enumerated peer hydration failure remains warning-level degraded (current contract) or becomes blocking; do not change this implicitly while optimizing latency.
- **[report_follow_up]** follow_ups: Assess whether archive's separate loadValidationContext call at plugin/src/tools/change.ts:2740-L2751 should consume the same optimized helper without adopting adv_change_validate's tool-specific no-verdict output shape.
- **[research_citation]** sources: Issue #227 requirement: Observed healthy-system timeout; requires authoritative conflict validation, bounded concurrency, degraded semantics, multiple-peer and slow-read tests. (https://github.com/Sharper-Flow/Advance/issues/227)
- **[research_citation]** sources: loadValidationContext local implementation: Specs and active peers hydrate sequentially; proposal and git divergence start only after those loops. (file:///home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixValidationInputTimeout/plugin/src/tools/change/create-clarify.ts#L919-L1051)
- **[research_citation]** sources: adv_change_validate budget implementation: Input budget is 8 seconds below 10-second outer ceiling and must not produce a verdict on exhaustion. (file:///home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixValidationInputTimeout/plugin/src/tools/change.ts#L439-L450)
- **[research_citation]** sources.omitted: 13 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Current path fails the linked requirement. loadValidationContext serializes spec gets and peer gets, while the Temporal Store specs.list has already loaded every full spec once and change listing has already deeply hydrated candidates before stripping them to summaries. adv_change_validate adds an outer non-cancelling 8-second Promise.race, so nested Store work can consume the same budget and continue after timeout. Preferred boring design: retain typed conflict inventory, run independent context branches concurrently, use a small shared bounded-map helper for spec/peer reads, propagate one request-scoped deadline into Store aggregate reads, consume Store warnings/hydrationStats, and preserve input order when assembling results. Enumeration/source incompleteness must be blocked; an enumerated peer hydration failure may retain existing degraded warning semantics; outer budget exhaustion remains no-verdict degraded containment.
- **[unresolved_action]** validation.blockers: Sequential and duplicated hydration can exhaust the 8-second input budget under healthy load, reproducing #227 and preventing validation from producing a verdict.
- **[unresolved_action]** validation.blockers: loadValidationContext ignores ChangeListResponse warnings/hydrationStats, so a deadline-truncated Store inventory can be labeled complete, violating authoritative completeness semantics.
- **[report_follow_up]** follow_ups: Agreement has an internal tension: AC5 requests a degraded warning for one peer failure, while the objective and AC4 prohibit clean validation from incomplete hydration. Orchestrator must resolve this contract before design approval.
- **[report_follow_up]** follow_ups: Do not describe Promise.race deadline behavior as cancellation unless each underlying operation consumes an AbortSignal; otherwise call it deadline admission plus late-result isolation.
- **[research_citation]** sources: Issue #227 evidence: Documents the 8-second failure and sequential spec enumeration/hydration, change inventory, peer hydration, then proposal/context loading; requires authoritative conflict validation and bounded complete loading. (https://github.com/Sharper-Flow/Advance/issues/227)
- **[research_citation]** sources: Current loadValidationContext source: Current implementation serially hydrates specs, lists changes, hydrates each active peer, then loads proposal and Git context. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/change/create-clarify.ts#L919-L1059)
- **[research_citation]** sources: Current conflict inventory validator: Blocked completeness emits an error, but degraded completeness emits warnings only. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/validator/conflicts.ts#L308-L371)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The proposed one-pass validation projection, stable ordered bounded mapping at concurrency 4, shared deadline admission, and typed blocked inventory for enumeration/deadline failure match the issue and existing Store architecture. The design nevertheless fails its primary authority contract: it maps a single peer capability-hydration failure to degraded warning while preserving current validator semantics. Current validator code treats degraded inventory as warnings and computes passed from absence of errors, so the unknown peer can overlap the validated change while validation still returns clean/pass. Deadline handling is directionally correct but must explicitly create one deadline before the complete validate-input read, pass remaining budget through own-change read and all context branches, and isolate late settlements with task-local immutable values plus a sealed result; Promise.race is containment, not cancellation.
- **[unresolved_action]** validation.blockers: An enumerated peer with unknown capabilities can produce completeness=degraded, warnings only, and passed=true. This contradicts the agreement objective that incomplete inventory never yields a false-clean result and means authoritative conflict validation is not preserved.
- **[unresolved_action]** validation.blockers: The design does not explicitly place deadline creation before the full validate-input operation, including the initial authoritative store.changes.get. Starting a fresh inner deadline only inside loadValidationContext permits the outer 8-second race to remain the correctness mechanism for earlier work, contrary to the shared aggregate-deadline architecture.
- **[research_citation]** sources: Current degraded inventory handling: Current source emits only warnings for degraded inventory, identifying the exact implementation seam the revised canConcludeClean contract must close. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/validator/conflicts.ts#L308-L371)
- **[research_citation]** sources: Current validation pass computation: Current passed state depends on errors.length === 0, so consuming canConcludeClean in pass computation is necessary to prevent false-clean output. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/validator/validator.ts#L127-L202)
- **[research_citation]** sources: Current validation input ordering and outer containment: Current target change read precedes loadValidationContext inside the outer timeout; revised design now requires the shared deadline to begin before this and every other input read. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/change.ts#L2460-L2518)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Prior blocker is resolved at design-contract level. The revised agreement and design retain degraded diagnostics and continue checks for hydrated peers while adding typed canConcludeClean:false as a machine-enforced pass-computation input. This closes the current source gap where degraded inventory is warning-only and passed depends solely on errors. Enumeration truncation/deadline remains blocked. One deadline now begins before target/change/store and all other input reads, so the outer 8-second timeout can remain containment. Immutable settled snapshot plus deterministic deferred-promise tests is structurally sufficient for late-result isolation without falsely claiming cancellation of underlying promises.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A one-pass validation projection can still violate its concurrency contract when it delegates to a generic Store list with a wider internal hydration batch. Thread the validation-specific cap through both Temporal and disk Store paths, while retaining generic defaults for unrelated callers.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change/validation-projection.ts: Passed validation-specific `validationConcurrency: 4` to the one-pass Store inventory request, closing the review finding that the projection otherwise inherited broader Store hydration concurrency.
- **[archive_only_evidence]** changes_made: plugin/src/storage/store-types.ts: Added internal validation-only Store hydration cap contract.
- **[archive_only_evidence]** changes_made: plugin/src/storage/store-temporal/changes.ts: Forwarded the validation cap from the Store list filter to resolved-change hydration.
- **[archive_only_evidence]** changes_made: plugin/src/storage/store-temporal/index.ts: Applied requested hydration concurrency to Temporal resolved-change batches while preserving the existing default batch size for other callers.
- **[archive_only_evidence]** changes_made: plugin/src/storage/store-temporal/shared.ts: Aligned Store dependency typing with the optional hydration-concurrency control.
- **[archive_only_evidence]** changes_made: plugin/src/storage/store-disk.ts: Applied the same cap to disk Store loading, preventing unbounded peer hydration for validation inventory.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change/validation-projection.test.ts: Asserted the projection requests the four-read validation cap.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change/validation-projection.test.ts src/tools/change/create-clarify.test.ts src/validator/validator.test.ts src/validator/conflict-inventory.test.ts src/storage/store-temporal/changes.test.ts, pnpm --dir plugin run check results=pass — Focused suite: 5 files, 53 tests passed. Static/schema/typecheck/isolation/lockfile/lint/format check passed.
- **[unresolved_action]** required_main_agent_actions: Restore or restart the ADV plugin/Temporal worker, then rerun adv_change_show with agreement, acceptance, briefing packet, and persisted reports to complete contract-evidence review.
- **[unresolved_action]** required_main_agent_actions: Diagnose and complete bin/oc-test smoke; inspect and remediate any actual failing test before release.
- **[unresolved_action]** required_main_agent_actions: Leave implementation files unchanged: static checks and both scoped test groups passed; no clear in-scope release defect was found.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Validation inventory sends an internal validationConcurrency: 4 cap through Store list to bound disk and Temporal per-change hydration; keep a targeted projection test and storage-path regression coverage when changing this contract.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change/validation-projection.test.ts, pnpm --dir plugin run check, bin/oc-test smoke, bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/storage/store-temporal/index.test.ts results=fail — Targeted validation projection: 10/10 passed (529ms). Static release checks (schemas, typecheck, isolation, lockfile policy, lint, format): passed. Targeted Temporal storage tests: 50/50 passed (3.32s). bin/oc-test smoke exceeded the bounded 300000ms timeout and emitted no test result.
- **[unresolved_action]** required_main_agent_actions: Release gate may proceed; no implementation edits or additional opaque smoke composite rerun are required for this hardening reassessment.
- **[wisdom_candidate]** wisdom_candidates: [success] Chunking release evidence into exact affected test slices produces actionable verification without rerunning an opaque long-running composite; retain suite names, counts, duration, and static-check evidence in acceptance.
- **[archive_only_evidence]** verification: tests_run=pnpm run check, smoke exact two-test slice (68/68, 4.43s), focused validation projection slice (10/10), Temporal storage slice (50/50) results=pass — Supplied release evidence: pnpm run check passed; exact smoke two-test slice passed 68/68 in 4.43s; focused projection passed 10/10; Temporal storage passed 50/50. Worktree is clean and git diff --check is clean. Durable acceptance matrix marks SC1-SC3, AC1-AC7, C1-C5, and DONT1-DONT3 pass/respected; acceptance gate is done. No visual review applies: agreement declares backend-only visual_surface: false.

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/tools/change/create-clarify.test.ts src/validator/validator.test.ts src/tools/change/validation-projection.test.ts
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/tools/change.test.ts src/validator/conflict-inventory.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- Sequential and duplicated hydration can exhaust the 8-second input budget under healthy load, reproducing #227 and preventing validation from producing a verdict.
- loadValidationContext ignores ChangeListResponse warnings/hydrationStats, so a deadline-truncated Store inventory can be labeled complete, violating authoritative completeness semantics.
- An enumerated peer with unknown capabilities can produce completeness=degraded, warnings only, and passed=true. This contradicts the agreement objective that incomplete inventory never yields a false-clean result and means authoritative conflict validation is not preserved.
- The design does not explicitly place deadline creation before the full validate-input operation, including the initial authoritative store.changes.get. Starting a fresh inner deadline only inside loadValidationContext permits the outer 8-second race to remain the correctness mechanism for earlier work, contrary to the shared aggregate-deadline architecture.
- Restore or restart the ADV plugin/Temporal worker, then rerun adv_change_show with agreement, acceptance, briefing packet, and persisted reports to complete contract-evidence review.
- Diagnose and complete bin/oc-test smoke; inspect and remediate any actual failing test before release.
- Leave implementation files unchanged: static checks and both scoped test groups passed; no clear in-scope release defect was found.
- Release gate may proceed; no implementation edits or additional opaque smoke composite rerun are required for this hardening reassessment.
