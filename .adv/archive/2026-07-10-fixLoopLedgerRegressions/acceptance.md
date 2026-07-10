# Acceptance

Reviewed at: 2026-07-10T20:23:25.400Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | All asset expectations directly affected by the `subagent-reports` 1.7.1 update match the current spec. | pass | Reviewer READY; exact subagent-reports requirement and version expectations match spec 1.7.1. |
| SC2 | success_criterion | Every newly written archive-bundle JSON artifact ends with exactly one trailing newline. | pass | Archive review: bundleJsonStringify owns one newline at all bundle JSON writes and recovery sidecar. |
| SC3 | success_criterion | `plugin/src/utils/loop-ledger.ts` imports report identity from `types/`, not `temporal/`, while all existing report-key consumers retain identical keys. | pass | Reviewer confirmed types-layer ownership and all seven consumers migrated without temporal re-export. |
| SC4 | success_criterion | Full verification passes except only documented failures proven unrelated to this follow-up. | pass | Full run tr_mrfdmm62_42afd5bd has only two documented unrelated advance-workflow pin failures; reviewer confirmed parent/diff proof. |
| AC1 | acceptance_criterion | `subagent-reports-spec-assets.test.ts` expects `rq-subagentReports23` and passes. | pass | Task tk-5160f317f1cc deterministic spec-ID equality check and reviewer focused suite pass. |
| AC2 | acceptance_criterion | `ops-follow-up-assets.test.ts` asserts `subagent-reports` version `1.7.1` and passes; unrelated `advance-workflow` version-pin assertions are unchanged. | pass | Task tk-5160f317f1cc exact version check; diff preserves unrelated advance-workflow expectation. |
| AC3 | acceptance_criterion | Archive tests prove generated `change.json`, `wisdom.json`, and `multi-repo-archive.json` end with `\n` whenever each artifact is produced. | pass | Task tk-38e52641f17a archive and recovery tests pass; 39/39 full files. |
| AC4 | acceptance_criterion | `subagentReportKey` is defined in a types-layer module and all seven known consumers compile without a `temporal/contracts` import for that helper. | pass | Task tk-a02e7b6694d8: 53 helper tests, 71 boundary/purity/consumer tests, and typecheck pass. |
| AC5 | acceptance_criterion | Loop-ledger projector outputs, dedupe behavior, detail bounds, and authority semantics remain unchanged under existing targeted tests. | pass | Task tk-a02e7b6694d8 loop-ledger purity and existing behavior suite pass; reviewer confirmed no behavior change. |
| AC6 | acceptance_criterion | `git diff --check` reports no whitespace errors for the follow-up diff. | pass | git diff --check trunk...HEAD exits clean; reviewer confirmed. |
| AC7 | acceptance_criterion | `bin/oc-test full` passes, or every remaining failure is proved pre-existing and unrelated by parent/diff evidence. | pass | Full run tr_mrfdmm62_42afd5bd: only two unchanged advance-workflow 1.26.0 pins fail; reviewer verified unrelated. |
| C1 | constraint | Preserve exact report-key string format and current consumers' behavior. | respected | Four format-pinning tests preserve exact subagentReportKey output; reviewer confirmed. |
| C2 | constraint | JSON newline enforcement applies to archive writes and recovery archive-sidecar writes; do not depend on `atomicWriteFile` to add formatting. | respected | Dedicated archive serialization helper controls newline at archive and recovery write boundaries. |
| C3 | constraint | Do not rewrite the archived `addLoopLedger` bundle unless archive invariants require it; fix future generation and validate it. | respected | Parent addLoopLedger archive was not changed; diff is limited to forward generation and tests. |
| C4 | constraint | Keep task/gate/retry authority unchanged. | respected | Reviewer found no task/gate/retry authority changes. |
| DONT1 | avoidance | Do not alter unrelated `advance-workflow` baseline version-pin expectations. | respected | Unrelated advance-workflow 1.26.0 pins remain; only subagent-reports 1.6.0→1.7.1 assertion changed. |
| DONT2 | avoidance | Do not add a Temporal re-export shim for `subagentReportKey`; relocate callers to the types-layer owner. | respected | No temporal/contracts re-export remains; all seven consumers use types/subagent-reports. |
| DONT3 | avoidance | Do not broaden archive formatting changes beyond deterministic trailing newlines for bundle JSON. | respected | Review confirmed changes are limited to deterministic archive bundle JSON newlines. |
| OOS1 | out_of_scope | New loop-ledger features or retriable-loop behavior. | not_applicable | No new loop-ledger feature or retry behavior was introduced. |
| OOS2 | out_of_scope | Broad subagent-report spec gap remediation. | not_applicable | Only evidence-backed subagent-report asset repairs were made. |
| OOS3 | out_of_scope | Retrospective rewrite of historical archive bundles without a structural requirement. | not_applicable | Historical parent archive bundle was not rewritten. |
| OOS4 | out_of_scope | Unrelated asset-test cleanup. | not_applicable | Unrelated advance-workflow and other asset cleanup was left unchanged. |

