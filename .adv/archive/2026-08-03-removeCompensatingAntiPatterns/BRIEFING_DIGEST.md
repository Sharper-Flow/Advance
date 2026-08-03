# Archive Briefing Digest

**Change ID:** removeCompensatingAntiPatterns
**Title:** Remove compensating anti-patterns
**Status:** archived
**Generated:** 2026-08-03T03:45:49.732Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

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

Showing 34 of 34 durable facts.

- **[archive_only_evidence]** decisions: Centralized access, read, JSON.parse, and schema validation in private parseProjectConfigFile with an exhaustive discriminated union. — Removes duplicate classification logic while keeping both public adapters thin and preserving the intentional read_error rethrow.
- **[archive_only_evidence]** decisions: Classified non-ENOENT access/read failures as read_error and retained diagnostic message formats for not_found, malformed JSON, filesystem errors, and schema errors. — The shared boundary must distinguish missing files from real filesystem failures while existing diagnostic strings remain caller-visible.
- **[archive_only_evidence]** verification: npx vitest run src/storage/json.test.ts -t "uses one read/parse boundary" (1) — RED: failed before implementation because json.ts contained two JSON.parse calls.
- **[archive_only_evidence]** verification: npx vitest run src/storage/json.test.ts -t "uses one read/parse boundary" (0) — GREEN: malformed JSON throws SyntaxError through loadProjectConfig and reports read_error through diagnostics; one read/parse boundary remains.
- **[archive_only_evidence]** verification: npx vitest run src/storage/json.test.ts (0) — All 85 storage/json tests pass unchanged, including the existing malformed-JSON throw case.
- **[archive_only_evidence]** decisions: Replaced parseJson with local discriminated GhJsonParse and parseGhJson, preserving parseability separate from endpoint shape validation. — Empty stdout, successful JSON, and malformed JSON now have explicit states; endpoint-specific Array.isArray and field checks remain at callers.
- **[archive_only_evidence]** decisions: Used exhaustive switches with default assertNever at every former parseJson call site. — Future parser-union variants cannot be silently ignored, while existing terminal routes remain explicit.
- **[archive_only_evidence]** decisions: Malformed endpoint responses retain the existing terminal reason but carry the parser message in details; empty responses retain their prior empty/falsy behavior. — This distinguishes malformed wire output without changing established endpoint state contracts.
- **[archive_only_evidence]** verification: npx vitest run src/tools/archive-helpers/git-finalize.test.ts (1) — RED: new malformed-vs-empty PR JSON assertion failed as expected; 128 existing tests passed.
- **[archive_only_evidence]** verification: npx vitest run src/tools/archive-helpers/git-finalize.test.ts (0) — GREEN: focused git-finalize test file passed, 129/129 tests.
- **[report_follow_up]** follow_ups: Decision 1: fix documented rationale from '5 callers catch' to '2 catch / 4 propagate'; decide whether follow-up cleanup targets propagating callers (fail-loud contract review) or the 2 catchers.
- **[report_follow_up]** follow_ups: Decision 2: enforce exhaustive union switches at all 6 sites in implementation/review.
- **[report_follow_up]** follow_ups: Decision 3: phrase existsSync claim as 'never throws for string arguments (DEP0187 only affects invalid arg types).'
- **[research_citation]** sources: Node.js fs.existsSync docs: existsSync returns boolean, no throw for valid path args. (https://nodejs.org/docs/latest-v24.x/api/fs.html#fsexistssyncpath)
- **[research_citation]** sources: Node.js DEP0187: existsSync may throw in future ONLY for unsupported arg types; string args immune. (https://nodejs.org/docs/latest-v24.x/api/deprecations.html#dep0187)
- **[research_citation]** sources: index.ts reachability deps: existsSync catch at 421-426 is dead; sibling store.changes.get catches at 414-419/428-434 are real schema_error throws. (plugin/src/index.ts:414-434)
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Decision 3 is sound (existsSync cannot throw for string args; catch is dead). Decision 2 is sound (six call sites exact; three-arm union preserves behavior since no site consumes empty-as-null as a valid value; reject-Zod rationale is layer-correct). Decision 1's structural refactor (extract union) is sound and satisfies AC2 at the classification layer, BUT its documented scope rationale contains a factual miscount (claims 5 callers catch; actual is 2 catch + 4 propagate), which mischaracterizes the throw's blast radius and must be corrected before implementation.
- **[unresolved_action]** required_main_agent_actions: Investigate or rerun plugin/src/tools/worktree/state-snapshot-budget.test.ts under full-suite conditions, then obtain and record a green bin/oc-test full result before accepting AC9.
- **[unresolved_action]** required_main_agent_actions: Review and checkpoint the two scoped test-strengthening edits in the change worktree.
- **[archive_only_evidence]** changes_made: plugin/src/storage/json.test.ts: Strengthened malformed-config test to prove diagnostics retain the same SyntaxError message thrown by loadProjectConfig, in addition to its existing structural single-boundary assertions.
- **[archive_only_evidence]** changes_made: plugin/src/tools/archive-helpers/git-finalize.test.ts: Added direct coverage that discoverMergedPr retains NO_MERGED_PR_FOUND for empty and malformed gh output while retaining malformed diagnostics.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/storage/json.test.ts src/tools/archive-helpers/git-finalize.test.ts, pnpm run check, bin/oc-test targeted -- src/tools/_adapters.test.ts, bin/oc-test full, bin/oc-test targeted -- src/tools/worktree/state-snapshot-budget.test.ts results=fail — Targeted changed tests: 215/215 passed. _adapters: 48/48 passed. pnpm run check passed; eslint emitted four existing warnings outside the diff. Full suite: 1 failed, 8241 passed, 1 expected fail, 1 skipped, 12 todo; state-snapshot-budget.test.ts:216 expected candidateCount 2 but received 0. That source and test are unchanged from trunk...HEAD, and its focused rerun passed 7/7.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/storage/json.test.ts src/tools/archive-helpers/git-finalize.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/_adapters.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/worktree/state-snapshot-budget.test.ts
- **[unresolved_action]** required_main_agent_actions: Proceed with normal archive Phase 9 finalization when ready; no hardening remediation is required.
- **[unresolved_action]** required_main_agent_actions: Do not deploy from this worktree. If finalization routes through GitHub, ensure GitHub CLI authentication and repository auto-merge/branch policy are available; otherwise surface the intentional blocked outcome and follow its remediation.
- **[archive_only_evidence]** verification: tests_run=pnpm run build, pnpm run verify:worker-bundle, bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts results=pass — Build completed successfully with plugin, MCP, Temporal worker, declarations, and build-identity artifacts. Worker-candidate verification built the workflow bundle and replayed the captured histories successfully. Targeted git-finalize suite passed 130/130. An initial targeted invocation with an incorrect repository-relative filter found no test files; it was diagnosed as a path-prefix issue and the corrected command passed. Build emitted no new warnings. schemas:check and generate:manifests:check were not rerun because the successful build showed no schema/manifest drift; their clean results are established acceptance context.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run verify:worker-bundle
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

- Investigate or rerun plugin/src/tools/worktree/state-snapshot-budget.test.ts under full-suite conditions, then obtain and record a green bin/oc-test full result before accepting AC9.
- Review and checkpoint the two scoped test-strengthening edits in the change worktree.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/storage/json.test.ts src/tools/archive-helpers/git-finalize.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/_adapters.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/worktree/state-snapshot-budget.test.ts
- Proceed with normal archive Phase 9 finalization when ready; no hardening remediation is required.
- Do not deploy from this worktree. If finalization routes through GitHub, ensure GitHub CLI authentication and repository auto-merge/branch policy are available; otherwise surface the intentional blocked outcome and follow its remediation.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run verify:worker-bundle
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts
