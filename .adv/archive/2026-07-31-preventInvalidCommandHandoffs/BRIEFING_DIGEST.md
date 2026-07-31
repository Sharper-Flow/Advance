# Archive Briefing Digest

**Change ID:** preventInvalidCommandHandoffs
**Title:** Prevent invalid command handoffs
**Status:** archived
**Generated:** 2026-07-31T17:15:17.220Z

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

Showing 26 of 26 durable facts.

- **[archive_only_evidence]** decisions: Fail closed in formatDirectiveNextLine when an actionable directive lacks a registered command — AC2 requires a clear blocked state and zero runnable arrow when the canonical command is missing; returning a gate-only line would still be ambiguous.
- **[archive_only_evidence]** decisions: Reused the existing GATE_COMMAND/phase-plan mapping as the single authority for runnable wayfinder commands — Avoids a second mapping, preserves gate ownership and manifest parity, and satisfies C1/DONT1.
- **[archive_only_evidence]** decisions: Added retired /adv-accept wording correction to shared docs/agent/spec instead of registering an alias — Satisfies AC3 and C2 by correcting the stale wording without making it executable.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/phase-plan-parity.test.ts src/handoff-footer-drift.test.ts src/utils/context-snapshot.test.ts (0) — 218 tests passed across 3 targeted test files
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8ck4s5_c5274c37
- **[report_follow_up]** follow_ups: Planning must specify a test that exercises formatDirectiveNextLine rendering for actionable-but-command-absent and blocked cases to fully close AC2/DDC2 at the guidance-rendering layer.
- **[research_citation]** sources: GATE_COMMAND manifest-parity mapping: acceptance -> adv-review; all 7 gates bound to a single command each. Confirms SC2/AC1; authority already manifest-aligned. (plugin/src/utils/phase-plan.ts:75-83)
- **[research_citation]** sources: actionableGuidance / actionablePlan call sites: Read GATE_COMMAND[gateId]; emit bound command into guidance and the actionable plan command field. Cited levers behave as the design claims. (plugin/src/utils/phase-plan.ts:492-524)
- **[research_citation]** sources: Fail-closed plan kinds: recovery-required/approval-required/blocked set failClosed:true and carry NO command field; DegradedPhasePlan (:628-642) likewise. DDC2 structurally pre-supported. (plugin/src/utils/phase-plan.ts:549-586)
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Root-cause diagnosis is accurate and source-verified: the typed phase-plan path (GATE_COMMAND -> actionablePlan -> formatDirectiveNextLine) already produces only manifest-bound commands and already fails closed (no arrow) for blocked/recovery/approval/degraded/missing states. The actual defect is the free-text {next-command} blockquote in the agent Output Contract (.opencode/agents/adv.md:315-336), an independent prose authority the LLM fills unconstrained. The design fixes exactly that shared source (DONT1 honored) by binding the blockquote to the typed directive command, reuses the existing fail-closed state instead of inventing a second (DONT2 honored), leaves manifest/GATE_COMMAND/lifecycle untouched (C1/C3 honored), and treats /adv-accept as correction-only text with regressions and no alias/registration (C2 honored; no existing alias to retire). All four DDCs are structurally pre-supported. Spec-law implication: design step 2 correctly scopes spec-law edits to only surfaces defining the same shared wayfinder contract and rewrites no lifecycle (C3) or command ownership (C1); parity between agent Output Contract, command-voice-standard.md, and any matching workflow spec projection must be held together to avoid re-drifting the prose authority. One inherent property (tradeoff, not blocker): the chat-handoff binding is instruction/static-drift-test enforced, not a runtime structural interceptor that strips non-manifest commands from LLM output; structural interception would require output-filtering machinery or a lifecycle redesign, both out of scope under C3, and matches how every other ADV output contract is enforced.
- **[unresolved_action]** required_main_agent_actions: Inspect the two uncommitted reviewer remediation files and include them in the normal task checkpoint/commit; do not alter gate or task state from this report.
- **[unresolved_action]** required_main_agent_actions: Leave unchanged: command ownership, gate lifecycle mapping, /adv-accept alias absence, and unrelated handoff text outside the canonical docs/spec and snapshot renderer.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Presentation consumers that render actionable commands must validate the command against the canonical gate mapping, not merely require a non-empty command string; otherwise malformed directives can become runnable guidance.
- **[archive_only_evidence]** changes_made: plugin/src/utils/context-snapshot.ts: Fail-closed Next-line rendering now emits a runnable command only when it matches the canonical gate command; absent, mismatched, or unregistered directive commands render a blocked gate status.
- **[archive_only_evidence]** changes_made: plugin/src/utils/context-snapshot.test.ts: Added regression coverage for an actionable directive carrying an unknown command, asserting no runnable /adv-* route is rendered.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/utils/phase-plan-parity.test.ts src/handoff-footer-drift.test.ts src/utils/context-snapshot.test.ts, pnpm --dir plugin run typecheck, git diff --check ed1499a8 results=pass — Targeted suite: 3 files, 219 tests passed. `tsc --noEmit` passed. `git diff --check ed1499a8` produced no whitespace errors. Reviewed committed diff fc2d14cf against ed1499a8; no remaining contract, docs/spec parity, security, scope, or lifecycle defects found.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/phase-plan-parity.test.ts src/handoff-footer-drift.test.ts src/utils/context-snapshot.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check ed1499a8
- **[unresolved_action]** required_main_agent_actions: Before merge/release, refresh against current origin/trunk and rerun the normal clean-tree merge compatibility verification because this worktree is currently behind by one commit.
- **[unresolved_action]** required_main_agent_actions: No scoped code or documentation changes required; leave plugin/src/utils/context-snapshot.ts and plugin/src/utils/context-snapshot.test.ts unchanged.
- **[wisdom_candidate]** wisdom_candidates: [success] For user-visible command handoffs, validate a directive command against the canonical gate mapping at render time and fail closed rather than displaying a guessed runnable route.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/utils/phase-plan-parity.test.ts src/handoff-footer-drift.test.ts src/utils/context-snapshot.test.ts, git diff --check origin/trunk...HEAD results=pass — Targeted suite passed: 3 files, 219 tests, exit 0 (11.94s). Diff whitespace check exited 0. Source lines 333-337 render a route only when the directive command exactly matches GATE_COMMAND[gate]; lines 427-508 cover acceptance /adv-review plus missing and unregistered commands failing closed. Phase-plan lines 62-83 define the canonical gate mapping, including acceptance → adv-review. Current task report contains no blockers, follow-ups, or required main-agent actions; accepted review matrix records all contract rows pass/respected. User-confirmed clean, aborted dry-run merge with origin/trunk is reused as merge-compatibility evidence.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/phase-plan-parity.test.ts src/handoff-footer-drift.test.ts src/utils/context-snapshot.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms8ck4s5_c5274c37
- Inspect the two uncommitted reviewer remediation files and include them in the normal task checkpoint/commit; do not alter gate or task state from this report.
- Leave unchanged: command ownership, gate lifecycle mapping, /adv-accept alias absence, and unrelated handoff text outside the canonical docs/spec and snapshot renderer.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/phase-plan-parity.test.ts src/handoff-footer-drift.test.ts src/utils/context-snapshot.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check ed1499a8
- Before merge/release, refresh against current origin/trunk and rerun the normal clean-tree merge compatibility verification because this worktree is currently behind by one commit.
- No scoped code or documentation changes required; leave plugin/src/utils/context-snapshot.ts and plugin/src/utils/context-snapshot.test.ts unchanged.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/phase-plan-parity.test.ts src/handoff-footer-drift.test.ts src/utils/context-snapshot.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
