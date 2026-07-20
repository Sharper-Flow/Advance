# Contract Traceability

**Change ID:** fixRecoverySchemaDrift
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-20T15:00:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | isSchemaError predicate at plugin/src/storage/json.ts:59 returns true on type:'schema_error'; loadDiskTerminalProjection L873 throws on schema_error propagating to all 6 AC1 tools via existing if(!result.success) return formatToolOutput({error: result.error}) patterns. Verified at change.ts:837-840 (adv_change_show main), :2679-2684 (adv_change_archive), :3989-3998 (adv_change_workflow_terminate), :1993-1998 (adv_change_close main), gate.ts:1504-1506 (adv_gate_complete), verification-evidence.ts:268-295 (adv_verification_evidence_disposition). Schema-error message preserved verbatim — no rewording. Tests: schema-error-propagation.test.ts 4 cases pass. |
| SC2 | success_criterion | pass | review | DesignConcernDispositionSchema and VerificationEvidenceDispositionSchema extended with recovery_audit: GateRecoveryAuditSchema.optional() at subagent-reports.ts:217 + :249. Recovery-audit-roundtrip.test.ts cases 1-4 verify ChangeSchema.parse succeeds on each. _recovery-writers.test.ts extended with ChangeSchema.parse step on persisted files. |
| SC3 | success_criterion | pass | review | TaskScopedBaseSubagentReportSchema L61 and ChangeScopedBaseSubagentReportSchema L70 extended with recovery_audit: SubagentReportRecoveryAuditSchema.optional(). Inherits to all 9 subagent report schemas. Recovery-audit-roundtrip.test.ts cases 5-13 verify ChangeSchema.parse succeeds for each agent type. |
| SC4 | success_criterion | pass | review | AC4/AC7 serial-disposition test in _recovery-writers.test.ts: two saveRecoveredVerificationEvidenceDisposition calls on tk-first/tk-second with disk reload between. Both persist, both carry recovery_audit, ChangeSchema.parse succeeds on final projection. 28 tests in file pass. |
| SC5 | success_criterion | pass | review | All 13 workflow-touching swallow sites in store-temporal/index.ts (L544, L592, L873, L1287, L1329, L1387), changes.ts (L285, L876, L1360), gates.ts (L108, L131), shared.ts (L226), terminal-history.ts (L219) apply isSchemaError early-return before fall-through. 3 archive-bundle sites (L484-489, L516-521, hasArchiveBundle L980) intentionally reverted with explanatory comments — split-brain recovery MUST be able to overwrite corrupt bundles. |
| AC1 | acceptance_criterion | pass | test | Per-AC1 tool layer verified: adv_change_show (change.ts:837 propagate, :1793 split-check fix), adv_change_archive (:2679 propagate), adv_gate_complete (gate.ts:1504 propagate), adv_task_show (task.ts resolveChangeId schema-error rethrow via substring heuristic), adv_change_workflow_terminate (:3989 propagate), adv_verification_evidence_disposition (verification-evidence.ts:268-295 outer catch). Schema-error-propagation.test.ts cases 1+2 confirm 'Schema validation failed' surfaces, 'Failed to query Workflow' does not. |
| AC2 | acceptance_criterion | pass | test | Recovery-audit-roundtrip.test.ts cases 1-2 (dispositions) and _recovery-writers.test.ts ChangeSchema.parse step (T6/T11/T13 + new saveRecoveredVerificationEvidenceDisposition describe block). All pass. |
| AC3 | acceptance_criterion | pass | test | Recovery-audit-roundtrip.test.ts cases 5-13 (9 subagent report variants). All pass. |
| AC4 | acceptance_criterion | pass | test | AC4/AC7 serial-disposition test in _recovery-writers.test.ts. |
| AC5 | acceptance_criterion | pass | test | plugin/src/storage/store-temporal/schema-error-propagation.test.ts: 4 cases covering getTemporalChange (surfaces schema_error), store.changes.get (returns type:schema_error), store.gates.get (throws schema_error), round-trip after fix. |
| AC6 | acceptance_criterion | pass | test | plugin/src/types/recovery-audit-roundtrip.test.ts: 20 cases covering gates, 2 dispositions, 9 subagent reports — each round-trips ChangeSchema.parse. |
| AC7 | acceptance_criterion | pass | test | AC4/AC7 serial-disposition test (two serial poisoned_history writes on tk-first/tk-second). |
| C1 | constraint | respected | static_check | schemas:check deterministic (no diff after regeneration). All 4 base schemas retain .strict() at subagent-reports.ts:230, :262, :68, :72. Optional field added inside .strict() boundary — strictness preserved for unknown fields. |
| C2 | constraint | respected | static_check | pnpm run schemas:check passed. pnpm run build succeeded with build identity sha256:69ec0d2055419e11b8342e68e5b198115fef9694dee276b041187545b40a2e64. |
| C3 | constraint | respected | static_check | GateRecoveryAuditSchema unedited at plugin/src/types/gates.ts:120-124. SubagentReportRecoveryAuditSchema extends it via GateRecoveryAuditSchema.extend({persisted_via}). |
| C4 | constraint | respected | static_check | loadAuthoritativeBundleProjection skip-ChangeSchema.parse path preserved at _recovery-writers.ts:341. Comment at L330-341 updated to reflect new defense-in-depth status (not load-bearing post-fix). |
| C5 | constraint | respected | static_check | isSchemaError predicate at json.ts:59 + 13 propagation sites throw new Error(result.error) verbatim. Tool-layer fix at change.ts:1793 splits check to propagate existing.error before not-found overwrite. resolveChangeId rethrows on substring match 'Schema validation failed'. |
| C6 | constraint | respected | static_check | LoadResult type unchanged at json.ts:34-44. isSchemaError inspects result.type === 'schema_error' for narrowing. Producer-side loadChange at json.ts:479-522 unchanged. Consumer-side is the only addition. |
| C7 | constraint | respected | static_check | as Change / as Gates casts in _recovery-writers.ts at L93/115/148/150/173/200/243/287/511/513/528/529 unchanged. Schema-extension makes the casts safe in practice. |
| C8 | constraint | respected | static_check | fixPoisonedRecovery untouched. No overlap with sibling change. |
| DONT1 | avoidance | respected | review | No edits to GateRecoveryAuditSchema (gates.ts:120) or GatesSchema (gates.ts:441) or ChangeSchema.gates (changes.ts:934). |
| DONT2 | avoidance | respected | review | No edits to plugin/src/archive/archive.ts:112 ChangeSchema.parse path. |
| DONT3 | avoidance | respected | review | All new isSchemaError propagation sites throw the SAME error class (plain Error with result.error as message). No new error class introduced. |
| DONT4 | avoidance | respected | review | as Change casts in _recovery-writers.ts preserved. T4 comment update was the only edit to that file. |
| DONT5 | avoidance | respected | review | fixPoisonedRecovery change files untouched. |
| DONT6 | avoidance | respected | review | store-disk.ts not modified. 13 disk-only swallow sites remain as documented out-of-scope. |
| DONT7 | avoidance | respected | review | No new schema-drift prevention test added (e.g., Zod round-trip on every writer). Out of scope per agreement. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-737d2ebe792b | AC1, SC5 |  | C6 |  |
| tk-b465a35e1bc9 | AC2, AC3 |  |  |  |
| tk-182e87172416 |  | AC1, AC5, SC1 |  |  |
| tk-4e68cfb5655a |  | AC2, AC3, AC6 |  |  |
| tk-1840b5aa024c |  |  | C4 |  |
| tk-8d96d9a67b0e | AC1 |  | C5 |  |
| tk-5dfe1218c9d4 |  | AC1, AC2, AC4, AC7 |  |  |
| tk-66fce014fcbf |  |  | C1, C2 |  |
| tk-8ffb615cd253 |  |  | C2 |  |
