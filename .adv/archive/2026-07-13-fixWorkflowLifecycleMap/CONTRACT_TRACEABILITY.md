# Contract Traceability

**Change ID:** fixWorkflowLifecycleMap
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T20:46:13.078Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Per-Gate Line-Item Map in docs/adv-gates.md:156-271 covers all 7 gates + Post-Release with artifacts, writer roles, approval types, sub-agents |
| SC2 | success_criterion | pass | review | adv-workflow.md:20 now says 'problem-statement.md + proposal.md'; ownership table:65 lists both artifacts — consistent with adv-gates.md:13 |
| SC3 | success_criterion | pass | review | 16 presence-based assertions in adv-workflow-docs-assets.test.ts pin stable anchors; RED→GREEN verified |
| AC1 | acceptance_criterion | pass | test | Test asserts no 'success criteria' + both artifacts in ownership table; tr_mrjoffxd GREEN 3/3 pass |
| AC2 | acceptance_criterion | pass | test | Map covers 7 gates + Post-Release with ordered line items, artifacts, writer roles, approval types, sub-agent contributors; HTML source anchors per gate |
| AC3 | acceptance_criterion | pass | test | Worktree Isolation (adv_worktree_create), adv_design_concern_disposition, checkOpsFollowupReleaseBlockers, Wisdom capture (advisory), adv_reflect all present; VERIFICATION_EVIDENCE_MISSING absent (negative assertion passes) |
| AC4 | acceptance_criterion | pass | test | New test file (previously zero coverage for adv-workflow.md); 16 assertions pin stable anchors; tr_mrjol9tj GREEN 16/16 pass |
| AC5 | acceptance_criterion | pass | test | pnpm run check green (schemas, typecheck, isolation, lockfile, lint, format); 71/71 targeted tests pass |
| C1 | constraint | respected | static_check | git diff: exactly 3 files changed (docs/adv-workflow.md, docs/adv-gates.md, plugin/src/adv-workflow-docs-assets.test.ts) — no runtime/tool/schema/command files |
| C2 | constraint | respected | static_check | Single ownership table remains in adv-gates.md; adv-workflow.md:75 cross-references it — no competing table |
| C3 | constraint | respected | static_check | Anchors are tool names (adv_worktree_create, adv_design_concern_disposition, adv_reflect), rq-IDs (rq-designQualityEvidence01), vocabulary tokens (userApproved: true, Tier B) — not prose |
| DONT1 | avoidance | respected | review | Negative test assertions confirm VERIFICATION_EVIDENCE_MISSING and 'verification-evidence disposition' absent from map |
| DONT2 | avoidance | respected | review | Every gate subsection has HTML source anchor (command file + phase, tool name, or rq-ID); all rows verified during discovery explore scan |
| DONT3 | avoidance | respected | review | Approval types match: planning=machine-enforced (userApproved: true), proposal/discovery/acceptance=Tier A inline, archive sign-off=Tier B whitelist-only — consistent with rq-inlineApproval01 |
| OOS1 | out_of_scope | not_applicable | not_applicable | No command files edited; discovery proved command contracts correct at source |
| OOS2 | out_of_scope | not_applicable | not_applicable | ADV_INSTRUCTIONS.md not modified |
| OOS3 | out_of_scope | not_applicable | not_applicable | No runtime/tool/schema behavior changes |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-59ad6979e13c | AC1, AC4, SC2 | AC1, AC4 | C1, C2, C3 |  |
| tk-7688ebc8df77 | AC2, AC3, SC1 | AC2, AC3 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-c78138fa6ff7 |  | AC1, AC2, AC3, AC4, AC5, SC3 | C1, C3 |  |
