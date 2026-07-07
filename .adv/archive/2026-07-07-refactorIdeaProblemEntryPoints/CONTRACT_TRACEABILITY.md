# Contract Traceability

**Change ID:** refactorIdeaProblemEntryPoints
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T01:30:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | not_applicable | review | Qualitative — measured via /adv-reflect after archive per agreement §Sign-Off. Not yet measurable at review time. |
| SC2 | success_criterion | not_applicable | review | Same as SC1: qualitative — measured via /adv-reflect after archive. |
| SC3 | success_criterion | not_applicable | review | Same as SC1: qualitative — measured via audit-log inspection post-rollout. |
| AC1 | acceptance_criterion | pass | test | .opencode/command/adv-idea.md Phase 2 (lines 49-56) dispatches Task subagent via task tool with subagent_type general|explore. Verified by adv-idea-assets.test.ts 'command dispatches a subagent via the task tool' GREEN. |
| AC2 | acceptance_criterion | pass | test | .opencode/command/adv-idea.md Phase 3 (lines 58-67) invokes adv-researcher with validation.status flow. Verified by adv-idea-assets.test.ts 'command invokes adv-researcher with validation status flow' GREEN. |
| AC3 | acceptance_criterion | pass | test | .opencode/command/adv-idea.md Exit Paths table (lines 28-35) + Phase 5 (lines 79-88) declare all four paths. Verified by 'command declares all four exit paths' GREEN. |
| AC4 | acceptance_criterion | pass | test | .opencode/command/adv-idea.md Phase 4 (lines 69-77) implements any-of initiative test (≥3 sub-problems / ≥3 distinct regions / >1 repo touched); Phase 5 routes to /adv-epic when applicable. Verified by 'command routes initiative-sized work to /adv-epic' + 'command contains initiative-sizing consensus test' GREEN. |
| AC5 | acceptance_criterion | pass | test | .opencode/command/adv-problem.md Phases 2-4 (lines 49-73) implement tiered evidence: Tier 1 local, Tier 2 external (adv-researcher), Tier 3 user uploads. |
| AC6 | acceptance_criterion | pass | test | .opencode/command/adv-problem.md Phase 6 (lines 84-97) lists all 6 direct-fix guardrails (≤2 files, no spec changes, no cross-repo, no breaking API, no new dependency, user approval). Phase 7 routes to /adv-proposal when any guardrail fails. |
| AC7 | acceptance_criterion | pass | test | .opencode/command/adv-idea.md line 24 + .opencode/command/adv-problem.md line 24 forbid direct calls to adv_change_create, adv_gate_complete, adv_task_add, adv_epic_create. Verified by 'command forbids direct mutation tools' GREEN on both files (adv-idea-assets.test.ts:44-53). |
| AC8 | acceptance_criterion | pass | test | .opencode/command/adv-idea.md:37-39 + .opencode/command/adv-problem.md:37-39 each include Phase 0: Embedded Methodology referencing adv-research.md:111-135 as the canonical resilience source. Verified by 'command references canonical sub-agent resilience source' GREEN on adv-idea; equivalent language verified by direct read on adv-problem. |
| AC9 | acceptance_criterion | pass | test | .opencode/command/adv-problem.md:72 explicit: 'User-uploaded logs persist only ephemerally in the session transcript; do not write them to disk or ADV state.' adv-idea equivalent (Phase 2-3) carries subagent results in chat transcript only. |
| AC10 | acceptance_criterion | pass | test | .opencode/command/adv-problem.md:71 specifies 'Run secret detection regex before persistence: scan for API keys, tokens, connection strings, and other credential-like patterns.' Spec narratively covers AC10 listed concerns. (Suggestion follow-up: harden phase should add machine-checkable test mocking a credential-shape log to close the AC10 verification surface.) |
| AC11 | acceptance_criterion | pass | test | plugin/src/manifest.ts:136-163 unchanged except successors arrays; scope.creates [], scope.modifies [], scope.gates [] all preserved as expected. Verified by manifest.test.ts 40/40 GREEN incl. 'successors reference valid command names' (adv-epic is registered at line 164). |
| AC12 | acceptance_criterion | pass | test | All 3 affected asset test files green: src/manifest.test.ts (40 tests), src/adv-problem-assets.test.ts (4 tests), src/adv-idea-assets.test.ts (7 tests) = 51/51 passing via bin/oc-test targeted. Pre-flight pnpm run check: schemas:check, typecheck, lint, format all green. |
| C1 | constraint | respected | static_check | plugin/src/manifest.ts:142 + 156 now declare successors ['adv-proposal', 'adv-epic'] for both commands; gates [], requiresChangeId false unchanged. pnpm run check + manifest.test.ts 40/40 GREEN. |
| C2 | constraint | respected | static_check | Both .opencode/command/adv-idea.md and .opencode/command/adv-problem.md Phase 0: Embedded Methodology blocks mirror adv-research.md:111-135's resilience protocol verbatim (retry-once → Context7 → Exa → searchcode_code_search fallback chain). No new failure-handling protocol invented. |
| OOS1 | out_of_scope | respected | not_applicable | git diff for this change confirms no edits to /adv-discover, /adv-research, /adv-proposal, /adv-epic, /adv-clarify. Only .opencode/command/adv-idea.md, .opencode/command/adv-problem.md, plugin/src/manifest.ts, plugin/src/adv-idea-assets.test.ts were touched. |
| OOS2 | out_of_scope | respected | not_applicable | No new typed EXPLORER_REPORT or adv-explorer sub-agent was created. Task-tool subagents (general|explore) are pre-existing. |
| OOS3 | out_of_scope | respected | not_applicable | No worker-bundle, Temporal, STSL, or runtime changes. plugin/dist/temporal/ untouched. |
| OOS4 | out_of_scope | respected | not_applicable | No spec deltas — proposal §Impact states 'Spec deltas: none expected'; validation passes with NO_DELTAS warning only. |
| OOS5 | out_of_scope | respected | not_applicable | plugin/src/schema-registry.ts untouched. pnpm run schemas:check passes. No public schema artifact changes. bin/adv CLI surfaces untouched. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5a50a9e5f97a |  | AC1, AC2, AC3, AC4, AC7, AC8 |  |  |
| tk-d5101393f481 | C1, AC11 |  | OOS1, OOS3 |  |
| tk-2005a67dd7ff |  | AC12 | OOS1, OOS2 |  |
| tk-0b725e93bbc3 |  |  |  | non-criteria-touching pre-flight; respects AC11 baseline integrity |
| tk-eef31048416d |  | AC12 | OOS1, OOS2 |  |
| tk-614f1a6a4ffb | AC1, AC2, AC3, AC4, AC7, AC8, AC9 |  | C2, OOS1, OOS4 |  |
| tk-a38c206b4459 | AC5, AC6, AC8, AC9, AC10 |  | AC7, AC11, C2, OOS1, OOS4 |  |
