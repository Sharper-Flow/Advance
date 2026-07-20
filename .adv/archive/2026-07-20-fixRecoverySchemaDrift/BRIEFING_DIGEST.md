# Archive Briefing Digest

**Change ID:** fixRecoverySchemaDrift
**Title:** Fix recovery schema drift
**Status:** archived
**Generated:** 2026-07-20T15:10:06.668Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #258

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

Showing 46 of 46 durable facts.

- **[report_follow_up]** follow_ups: Pre-existing prettier format failure on src/types/recovery-audit-roundtrip.test.ts (NOT touched by this task; out of scope). Detected when running pnpm run format:check. Consider a separate cleanup change.
- **[archive_only_evidence]** decisions: Restructured loadDiskTerminalProjection (EDIT 6) to pull the legacy.changes.get read OUT of the swallow try/catch, then check isSchemaError OUTSIDE the catch — Literal prompt insertion inside the existing try block would have been silently swallowed by the surrounding catch, defeating the schema-error propagation contract. Restructure preserves the I/O-error swallow (return null) while letting schema errors escape. Required for test 3 (store.gates.get throws schema_error) and test 1 (store.changes.get throws schema_error) to pass — loadDiskTerminalProjection is the first read in getTemporalChange's path.
- **[archive_only_evidence]** decisions: Made isSchemaError a TypeScript type predicate (result is { success: false; error: string; type: 'schema_error' }) instead of returning boolean — After if (isSchemaError(result)), TypeScript needs to narrow result so result.error is accessible. Plain boolean return left result as the union type, causing TS2339 on every result.error access. Typecheck failed initially; fixed by changing the predicate signature.
- **[archive_only_evidence]** decisions: Used status:archived (not draft) for the schemaValidChangeJson fixture in the round-trip test — The mock Temporal query always throws 'Failed to query Workflow'. For the round-trip case to succeed after the file fix, the change must be served from disk via loadDiskTerminalProjection's terminal-status short-circuit (rq-terminalProjectionTruth01), bypassing the broken Temporal query. status:draft would have fallen through to the query and failed. schemaInvalidChangeJson stays at status:draft because the propagation path triggers before the status check.
- **[archive_only_evidence]** decisions: Added { cause: error } to the gates.ts L137 isSchemaError throw — The throw is inside a catch block, so the preserve-caught-error ESLint rule requires attaching the outer caught error as cause. Other isSchemaError throws are not inside catch blocks and don't trigger the rule.
- **[archive_only_evidence]** decisions: Applied isSchemaError check at loadCandidate (EDITS 7-9) and changes.ts update/loadSummaryRow (EDITS 12-13) even though the surrounding try/catch swallows — These are aggregate-read paths (listResolvedChanges, listSummary) where per-candidate failure is intentionally bounded — one bad change.json should NOT abort an aggregate read (rq-terminalAggregateRead01). The inserted throws are caught by design and the candidate is omitted. The explicit isSchemaError check documents intent even though it does not propagate; this matches the prompt's mechanical-application directive.
- **[archive_only_evidence]** decisions: Corrected EDIT 10 file location: prompt says index.ts L1505 but loadActiveFact is actually in changes.ts (L1495) — Prompt's path/line annotation was wrong. Applied the edit at the actual site (changes.ts loadActiveFact, ~L1507). Behavior matches the prompt's described pattern.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: No scope drift. All 17 enumerated edits applied within the cited files. One pre-existing format issue in src/types/recovery-audit-roundtrip.test.ts noted as follow-up (not touched).
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/schema-error-propagation.test.ts (1) — RED phase: 4 tests fail pre-edit with 'Failed to query Workflow' (schema_error masked)
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/schema-error-propagation.test.ts (0) — GREEN phase: all 4 tests pass post-edit (schema_error propagates verbatim)
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes after isSchemaError type-predicate fix
- **[archive_only_evidence]** verification: pnpm run typecheck && ../bin/oc-test targeted -- src/storage/store-temporal/ src/archive/ src/storage/json.test.ts (0) — Combined typecheck + regression: all store-temporal + archive + json tests pass (no regressions)
- **[archive_only_evidence]** decisions: SubagentReportRecoveryAuditSchema kept non-strict — Matches GateRecoveryAuditSchema for cross-surface consistency.
- **[archive_only_evidence]** decisions: Removed one over-specified bogus-field test — Not in required test list; strict-rejection guard applies to report top-level only.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/types/recovery-audit-roundtrip.test.ts (1) — RED: 7 subagent-report tests fail (strict schemas reject recovery_audit). gates tests already pass.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/types/recovery-audit-roundtrip.test.ts (0) — GREEN: 20/20 recovery-audit-roundtrip tests pass after 5 schema edits.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/types/recovery-audit-roundtrip.test.ts src/types/subagent-reports.test.ts (0) — VERIFY: 75/75 pass (20 new + 55 existing). schemas:check deterministic; typecheck clean.
- **[report_follow_up]** follow_ups: LOW: Consider introducing a typed SchemaValidationError class exported from storage/json to replace the substring heuristic in resolveChangeId. This would make schema-error detection structural rather than string-based. Out of scope per prompt constraints.
- **[report_follow_up]** follow_ups: MEDIUM: Scan other tool files (gate.ts, status.ts, etc.) for similar schema-error-overwrite patterns at changes.get call sites. The 4 sites fixed here were scoped to change.ts; a broader related-scan may find more. Out of scope for this task.
- **[archive_only_evidence]** decisions: EDIT 1 applied to adv_change_update (L1793), not adv_change_show as the prompt heading stated — The prompt heading said 'adv_change_show input check' but the code reference (L1790-1800, 'verify changeId exists before writing') is inside adv_change_update (L1641-1918). Verified adv_change_show at L837-843 ALREADY has the correct split pattern (propagate error verbatim, then not-found check) — likely fixed in T1/T2. Applied the edit to the actual buggy site per the prose.
- **[archive_only_evidence]** decisions: RED test for change.test.ts targets adv_change_update, not adv_change_show — Since adv_change_show already propagates schema errors correctly, a test against it would PASS pre-edit (not RED). Wrote the test against adv_change_update (the buggy site at L1793) so it genuinely FAILS pre-edit and PASSES post-edit, satisfying the RED-GREEN protocol.
- **[archive_only_evidence]** decisions: EDIT 2 includes changeId in the early-return error output — A schema error on the just-created change means the create signal landed in Temporal but the reload failed. Returning just {error} would hide that the change exists. Added changeId: result.changeId so the operator knows the create landed and can investigate without guessing.
- **[archive_only_evidence]** decisions: EDIT 4 uses logger.warn (best-effort branch) instead of formatToolOutput propagation — The prompt offered two branches: propagate verbatim vs log warning (for best-effort re-runnable sites). This site is unambiguously best-effort: the repair mutation (fireSignalAndRefresh) ALREADY succeeded at L4405; the readback at L4419 is post-confirmation only. Propagating an error would hide the successful repair and risk a double-mutation on operator retry. Used logger.warn with the full schema error text so the operator sees the readback failure while still receiving the success response.
- **[archive_only_evidence]** decisions: EDIT 3 in adv_change_close bulk path uses `continue` after pushing the load-error result — The schema/load error means recovery cannot proceed (no readable change to recover from). Pushing the load error and continuing avoids a futile recovery attempt. The existing fallthrough (push signal error) is preserved for the genuinely-missing-data case.
- **[archive_only_evidence]** decisions: Schema error detection uses substring heuristic on err.message.includes('Schema validation failed') — Per prompt instruction. Matches the canonical format in storage/json.ts L77. A typed SchemaValidationError class would be cleaner but is explicitly out of scope (prompt: 'out of scope for this task').
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/task.test.ts src/tools/change.test.ts (1) — RED phase (runId tr_mrsxzf5v_19bb6fbd): both new tests FAIL pre-edit as expected. task.test.ts: 'propagates schema errors from store.tasks.show' failed because promise resolved with 'Task not found' instead of rejecting. change.test.ts: 'propagates schema errors from changes.get verbatim' failed because received "Change 'test-change' not found." instead of "Schema validation failed".
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/task.test.ts src/tools/change.test.ts (0) — GREEN phase (runId tr_mrsy4clj_2a37d75e): all 191 tests PASS post-edit, including both new RED tests now passing.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit passes with no errors (runId tr_mrsy4owc_dd26b72a).
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/task.test.ts src/tools/change.test.ts src/tools/verification-evidence.test.ts (0) — Full verification sweep (runId tr_mrsy4mtc_d833b0a8): 200/200 tests pass across all 3 files. No regressions in verification-evidence.
- **[archive_only_evidence]** decisions: Imported ChangeSchema from '../types/changes' instead of the '../../types/changes' suggested in the task prompt — Test file lives in plugin/src/tools/; ../../types/changes would resolve to plugin/types/changes (does not exist). ../types/changes resolves correctly to plugin/src/types/changes.ts. Verified ChangeSchema is also re-exported from ../types/index.ts.
- **[archive_only_evidence]** decisions: For mock-store tests (T6 saveRecoveredDesignConcernDisposition + new saveRecoveredVerificationEvidenceDisposition single-call test), captured the mockedSaveChange.mock.calls[0][1] argument and parsed THAT through ChangeSchema instead of reading a disk file — saveChange is globally mocked to no-op via vi.mock at the top of the file, so no disk file is written in those tests. The captured argument IS exactly the object handed to the persistence layer (what would be serialized), so ChangeSchema.parse on it is semantically equivalent to a disk round-trip for the regression under test. Rewriting the existing test infrastructure to use real disk would expand scope beyond EDIT 1's intent.
- **[archive_only_evidence]** decisions: For the AC4/AC7 serial-disposition test, overrode mockedSaveChange.mockImplementation to actually write to disk for that one test, then restored the no-op mock in a finally block — The data-loss scenario requires verifying two serial writes both persist on disk. The default no-op mock makes read-back impossible. mockImplementation scopes the real-write behavior to this test only; mockReset + mockImplementation in finally guarantees subsequent tests get the default no-op behavior back.
- **[archive_only_evidence]** decisions: Placed the new saveRecoveredVerificationEvidenceDisposition describe block (containing both single-call round-trip and AC4/AC7 serial tests) immediately after saveRecoveredDesignConcernDisposition describe, before the changeScopedReport helper — Groups the two verification-evidence tests together and keeps recovery-writer describes clustered logically before the subagent-report describe that needs the helper.
- **[archive_only_evidence]** decisions: Did NOT extend saveRecoveredGateCompletion (L143) or saveRecoveredArtifactMetadata (L207) tests with round-trip assertions despite them also stamping recovery_audit onto mocked-saveChange paths — Outside the task's enumerated scope (T6/T8/T12/T13). gates.release recovery_audit round-trip is already covered at the schema level in recovery-audit-roundtrip.test.ts L338-345. Surface as related_scan, not silent scope expansion.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts (0) — GREEN pass (runId tr_mrtbjdaa_1ef1ea7d): 28 tests passed (1 file). 24 pre-existing + 4 new (verification-evidence single-call round-trip, verification-evidence auth-required, AC4/AC7 serial-disposition, plus round-trip assertions added to 4 existing tests T6/T8/T12/T13).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/_recovery-writers.test.ts src/types/recovery-audit-roundtrip.test.ts src/storage/store-temporal/schema-error-propagation.test.ts src/tools/change.test.ts src/tools/task.test.ts (0) — REGRESSION sweep pass (runId tr_mrtbjppb_6723dd8d): 243 tests passed across 5 files. No regressions in T1/T2/T3 surfaces.
- **[unresolved_action]** required_main_agent_actions: Before marking T9 done, execute the poisoned/completed-workflow disposition case and capture output asserting _recoveryMutation:true, recovered:true, and recoveryMode:"poisoned_history".
- **[unresolved_action]** required_main_agent_actions: Immediately call adv_change_show for that same change and capture the persisted verification_evidence_dispositions[].recovery_audit reason/evidence; this proves T1 schema validation plus T3 disk-write path.
- **[unresolved_action]** required_main_agent_actions: For the bad active change.json case, capture adv_change_show output containing Schema validation failed and the Zod issue detail, and confirm it does not report generic Failed to query Workflow.
- **[unresolved_action]** required_main_agent_actions: No code/deploy action required; optional worker-manifest evidence is unavailable because plugin/dist/temporal/worker-bundle-manifest.json is absent.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A poisoned-history recovery tool can return ordinary success if the workflow signal path remains healthy; live verification must assert recovery-specific output and persisted recovery_audit, not merely success.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Read-only artifact and source review. Worktree/deployed plugin manifests are byte-identical; worktree and deployed index.js SHA-256 are both 04d46fee8b7289f6254d379c9650909cac68512b9f49367c603077ff76d6ead2. No worker manifest exists in worktree.
- **[unresolved_action]** required_main_agent_actions: Acceptance may proceed: AC1–AC7 and C1/C2/C4/C5/C6 are source-backed. Record the three suggested follow-ups as non-blocking coverage/risk debt.
- **[unresolved_action]** required_main_agent_actions: Before release-hardening, consider targeted end-to-end tests for all six AC1 named tools and the archive-only invalid-bundle/no-active-projection case.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For recoverable disk projections, preserve a typed LoadResult discriminator through every fallback boundary; only deliberate recovery exceptions should swallow schema errors, and those exceptions need explicit split-brain rationale plus focused tests.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Read-only acceptance review per scope; no tests run. Inspected implementation and regression tests. Supplied context reports full suite 6529/6531 pass, build/deploy complete.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
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
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |

## Unresolved Actions

- finish_owned_scope_then_report: No scope drift. All 17 enumerated edits applied within the cited files. One pre-existing format issue in src/types/recovery-audit-roundtrip.test.ts noted as follow-up (not touched).
- Before marking T9 done, execute the poisoned/completed-workflow disposition case and capture output asserting _recoveryMutation:true, recovered:true, and recoveryMode:"poisoned_history".
- Immediately call adv_change_show for that same change and capture the persisted verification_evidence_dispositions[].recovery_audit reason/evidence; this proves T1 schema validation plus T3 disk-write path.
- For the bad active change.json case, capture adv_change_show output containing Schema validation failed and the Zod issue detail, and confirm it does not report generic Failed to query Workflow.
- No code/deploy action required; optional worker-manifest evidence is unavailable because plugin/dist/temporal/worker-bundle-manifest.json is absent.
- Acceptance may proceed: AC1–AC7 and C1/C2/C4/C5/C6 are source-backed. Record the three suggested follow-ups as non-blocking coverage/risk debt.
- Before release-hardening, consider targeted end-to-end tests for all six AC1 named tools and the archive-only invalid-bundle/no-active-projection case.
