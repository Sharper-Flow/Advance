# Contract Traceability

**Change ID:** tightenToolOutputDefaults
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-22T19:05:58.365Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Executive summary records ~3.4 KB/session snapshot-volume reduction; tk-14a8e307034d byte-budget analysis completed (~2140 bytes schema impact, keep decision). |
| SC2 | success_criterion | pass | review | AC1 default/opt-in behavior covered by tk-775dfac8e67a and tk-f64ea513f734; docs and agent workflow guidance updated by tk-878b67f87827; 371/371 original and 406 current targeted tests pass. |
| SC3 | success_criterion | pass | review | Recorded adv-researcher design report documents concise-result plus JIT-retrieval alignment with cited Anthropic/LangChain/OpenAI guidance. |
| AC1 | acceptance_criterion | pass | test | tk-775dfac8e67a gates 5 ticker tools; tk-f64ea513f734 gates 3 full-box tools; per-tool absence-by-default and include.snapshot opt-in tests pass. |
| AC2 | acceptance_criterion | pass | test | tk-e6433ddc1d16 adds shared includeSnapshotSchema; tk-0af83bddb1c4, tk-775dfac8e67a, and tk-f64ea513f734 wire it across all 8 tools; shared-args and behavioral tests pass. |
| AC3 | acceptance_criterion | pass | test | tk-4a2433e9e75f adds resolveOutputMode precedence tests; tk-83760592f580 adds outputMode to adv_change_show, adv_task_list, and adv_status; explicit arg > env > compact behavior verified. |
| AC4 | acceptance_criterion | pass | test | tk-83760592f580 verifies existing adv_change_show include.snapshot opt-in behavior remains unchanged; tk-6318a7bb7b83 targeted suite passes. |
| AC5 | acceptance_criterion | pass | test | tk-878b67f87827 updates adv-apply.md, adv-prep.md, .opencode/agents/adv.md, related docs, and ADV_INSTRUCTIONS.md; 30/30 asset tests pass. |
| AC6 | acceptance_criterion | pass | test | tk-27324dfdeacc verifies recorded modify deltas dl-xtxFRdk1ybRO→rq-ctxsnap2, dl-tb1q3HJWCv2u→rq-ctxticker2, and dl-dExfd5Lb947l→rq-advStatusLazyView01; all targets confirmed present in current specs; adv-reviewer report PASS. |
| AC7 | acceptance_criterion | pass | test | tk-775dfac8e67a and tk-f64ea513f734 add absence/opt-in pairs in task.test.ts, wisdom.test.ts, change.test.ts, and gate.test.ts; status recommendation-list assertion remains green and untouched. |
| AC8 | acceptance_criterion | pass | test | tk-878b67f87827 updates opt-in wording assertions in plugin/src/adv-instructions-assets.test.ts; asset suite passes. |
| AC9 | acceptance_criterion | pass | test | tk-6318a7bb7b83 records pnpm run check exit 0 and 371/371 targeted tests; executive summary records this session's 406 targeted tests and pnpm run check exit 0. |
| C1 | constraint | respected | static_check | Implementation gates emission only; formatter output shape remains outside touched behavior. Context-snapshot helper tests pass. |
| C2 | constraint | respected | static_check | tk-83760592f580 limits read-tool change to outputMode on the three named heavy reads; precedence tests pass. |
| C3 | constraint | respected | static_check | AC7 retains the status.test.ts recommendation-list assertion unchanged; status-enrich recommendation snapshots remain untouched. |
| C4 | constraint | respected | static_check | No truncation-threshold change is recorded in implementation tasks; change scope stays emission/output-mode only. |
| C5 | constraint | respected | static_check | Shared includeSnapshotSchema provides uniform dispatch shape; no tool-registry edits; task verification records invoke-path compatibility. |
| C6 | constraint | respected | static_check | tk-83760592f580 changes shared read-tool output formatting only; no MCP-surface code change recorded. |
| C7 | constraint | respected | static_check | tk-e6433ddc1d16 supplies shared includeSnapshotSchema; implementation remains isolated from recoveryMode/recoveryEvidence work. |
| C8 | constraint | respected | static_check | tk-14a8e307034d records completed schema-byte analysis (~2140 bytes) and DDC6 keep decision; executive summary records net-positive session savings. |
| DONT1 | avoidance | respected | review | Only snapshot emission is gated; no formatter-shape change recorded. |
| DONT2 | avoidance | respected | review | tk-775dfac8e67a and tk-f64ea513f734 verify include.snapshot:true attaches the expected ticker/full snapshot. |
| DONT3 | avoidance | respected | review | tk-83760592f580 and tk-6318a7bb7b83 preserve and verify existing adv_change_show include.snapshot opt-in behavior. |
| DONT4 | avoidance | respected | review | AC6 has three recorded modify deltas covering rq-ctxsnap2, rq-ctxticker2, and rq-advStatusLazyView01. |
| DONT5 | avoidance | respected | review | Shared includeSnapshotSchema implementation avoids tool-registry edits; no task records a tool-registration change. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |
| OOS6 | out_of_scope | missing | not_applicable |  |
| OOS7 | out_of_scope | missing | not_applicable |  |
| OOS8 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e6433ddc1d16 | AC2 |  | DONT5 |  |
| tk-0af83bddb1c4 | AC1, AC2 |  | DONT2 |  |
| tk-4a2433e9e75f | AC3 |  | C2 |  |
| tk-32aa7e0a3408 | AC6 |  | DONT4 |  |
| tk-7a7346dd81d4 | AC6 |  | DONT4 |  |
| tk-21dc45c92650 | AC6 |  | DONT4, OOS2, C3 |  |
| tk-83760592f580 | AC3 | AC4 | C2, C6 |  |
| tk-f64ea513f734 | AC1, AC2 | AC7 | DONT2 |  |
| tk-878b67f87827 | AC5 | AC5, AC8 |  |  |
| tk-775dfac8e67a | AC1, AC2 | AC7 | DONT2, DONT5 |  |
| tk-14a8e307034d |  | C8 | C8 |  |
| tk-6318a7bb7b83 |  | AC9, AC4, AC8 |  |  |
| tk-27324dfdeacc |  | AC6 |  |  |
