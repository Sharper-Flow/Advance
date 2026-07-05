# Archive Briefing Digest

**Change ID:** updateCoordinateFreshness
**Title:** Update coordinate freshness
**Status:** archived
**Generated:** 2026-07-05T18:38:39.806Z

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

Showing 15 of 15 durable facts.

- **[agenda]** follow_ups: Planning: pin the new/updated spec requirement ID before writing asset-test anchors so the doc mirror and test target a stable ID.
- **[agenda]** follow_ups: Planning: write the exact bounded git-freshness command list into the command contract with an explicit no-merge/no-rebase/no-checkout guarantee and freshness_limited offline fallback.
- **[agenda]** follow_ups: Planning: add asset-test assertions for the four classification labels (repo_backed_fact/adv_backed_fact/judgment_call/freshness_limited) and the freshness-failure limitation to make AC4/AC6 machine-checked.
- **[archive_only_evidence]** sources: Command contract .opencode/command/adv-coordinate.md: Existing /adv-coordinate is a prose/agent-driven read-first, approval-gated Epic workflow with 7 phases (Inventory→Alignment→Sequencing→Membership Health→Report→Approval→Apply). No TS git execution; freshness lane fits as agent instruction between Inventory (Phase 1) and Alignment (Phase 2).
- **[archive_only_evidence]** sources: advance-epics spec rq-epicCoordinateCommand01: Current spec law requires typed reads, alignment/narrative/dependency/sequencing/capstone/membership findings, evidence-vs-judgment separation, advisory order, approval-gated typed mutations, no Jira-like/CLI-mutation/direct-state-edit. Does NOT mention repository-current evidence. Adding an adjacent scenario or new requirement is the correct AC5 path.
- **[archive_only_evidence]** sources: Asset tests plugin/src/advance-epics-assets.test.ts: /adv-coordinate describe block asserts typed reads, approval-gating, optional membership/advisory order/never-block/target_unreachable, and negative boundary checks (no direct-state-edit, no CLI mutation verbs). No freshness/overlap/current-code anchors yet — a real red→green surface exists for AC6.
- **[archive_only_evidence]** sources: Manually-maintained spec doc docs/specs/advance-epics.md: Spec doc is a manually-maintained mirror asserted by test line 28-49 (no generate:docs script per AGENTS.md). rq-epicCoordinateCommand01 section present. Design correctly targets it as a manual-mirror update surface, not generated output.
- **[archive_only_evidence]** sources: Repo git-exec precedent (execFile/spawnSync argv-based): Where ADV runs external commands it uses argv-based execFile/spawnSync (not shell-string). Freshness lane here is agent-executed shell within a prose command, consistent with the existing prose-command design; no new TS surface is required, which keeps the change command/spec/test-scoped as intended.
- **[archive_only_evidence]** architecture_assessment: Design is architecturally sound and consistent with the existing ADV Epic-coordination surface. It correctly chooses to extend the existing prose command + spec law + manual spec-doc mirror + asset test rather than add a new tool or CLI mutation verb (matches Constraints and rq-epicCoordinateCommand01.4). The Repository Freshness lane is placed before Alignment Audit, matching AC1 ordering. Evidence classification (repo_backed_fact / adv_backed_fact / judgment_call / freshness_limited) makes correctness structural in spec/asset anchors rather than prose-only (P33), satisfying AC4. Boundary preservation (no merge/rebase/checkout/product-code mutation; only bounded remote-ref freshness) is explicit and matches AC7 and the trunk-worktree isolation policy. The freshness-failure behavior (report freshness_limited, avoid evidence-backed conclusions on missing repo state) satisfies AC2 and avoids inventing facts. All four target surfaces (command, spec.json, docs/specs mirror, asset test) are the correct and complete set for the 8 ACs. Verification strategy (red asset test first, targeted run via adv_run_test/bin/oc-test, schema check only if schema artifacts change) is correct: editing spec.json requirements/scenarios does not change the generated JSON schema shape, so schemas:check is a conditional not a hard requirement — design already scopes it conditionally.
- **[unresolved_action]** required_main_agent_actions: Review and checkpoint the reviewer hardening edit in plugin/src/advance-epics-assets.test.ts before final acceptance/archive.
- **[unresolved_action]** required_main_agent_actions: Optionally run broader pre-release checks if the orchestrator needs evidence beyond the targeted asset suite.
- **[wisdom_candidate]** wisdom_candidates: [pattern] When adding command/spec safety law, asset tests should assert the spec requirement body/scenarios include both the positive behavior and the failure/limitation behavior, not only the presence of the new requirement id or label strings.
- **[archive_only_evidence]** changes_made: plugin/src/advance-epics-assets.test.ts: Strengthened the spec asset test so rq-epicCoordinateRepoFreshness01 must include overlap, failure behavior that avoids evidence-backed conclusions when repo state is missing, adv_backed_fact classification, bounded git fetch wording, and no-merge guard; updated header citations to include the new requirement id.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/advance-epics-assets.test.ts results=pass — Targeted asset suite passed in plugin context: src/advance-epics-assets.test.ts (52 tests) in 3.41s after reviewer hardening change.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/advance-epics-assets.test.ts results=pass — Path preflight OK for all scoped files. Reviewed command/spec/manual docs/test anchors for contract/spec drift, docs mirror, weak asset anchors, prohibited direct state reads/CLI mutation verbs/mandatory membership/Jira-like primitives/order hard blocks, and unsafe git freshness wording. Test passed: 1 file, 52 tests. Worktree clean before and after verification. Initial task-scoped report submission failed because release-harden is not an existing ADV task anchor; resubmitted as change-scoped harden:release per tool guidance.

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
| OOS1 | out_of_scope | respected |
| OOS2 | out_of_scope | respected |
| OOS3 | out_of_scope | respected |
| OOS4 | out_of_scope | respected |

## Unresolved Actions

- Review and checkpoint the reviewer hardening edit in plugin/src/advance-epics-assets.test.ts before final acceptance/archive.
- Optionally run broader pre-release checks if the orchestrator needs evidence beyond the targeted asset suite.
