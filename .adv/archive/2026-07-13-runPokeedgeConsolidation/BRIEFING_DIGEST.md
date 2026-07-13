# Archive Briefing Digest

**Change ID:** runPokeedgeConsolidation
**Title:** Run PokeEdge consolidation
**Status:** archived
**Generated:** 2026-07-13T16:22:50.393Z

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

Showing 71 of 71 durable facts.

- **[archive_only_evidence]** decisions: Applied the Promise.race bound at the queryLiveEpicState call site (wrapping the resolved promise) rather than inside the default impl — Guarantees the bound applies to both injected and default seams (defense-in-depth) and ensures a timeout can never reach the default impl's /not found/ -> null coercion, so it always lands as a typed failed outcome
- **[archive_only_evidence]** decisions: Introduced a dedicated EpicQueryTimeoutError class instead of reusing ConsolidationError — ConsolidationError is documented as a pre-mutation approval/safety-gate refusal; a per-item live-phase query timeout is semantically a failed item outcome, not a gate refusal
- **[archive_only_evidence]** decisions: Default bound 7000ms; injectable epicQueryTimeoutMs dep for tests — 7000ms sits within the required 6-8s window and below the 10s tool boundary; the dep keeps the timeout testable without waiting seconds (deps are test-only, omitted from the tool Zod arg schema, so no schema regen)
- **[archive_only_evidence]** decisions: Explicit no-op observer attached to the losing query in the timeout branch — Makes 'observe losing query rejection' explicit and verifiable so a late-settling Temporal query cannot surface as an unhandled promise rejection
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/store-consolidate.test.ts -t "bounded source-Epic query" (1) — RED (pre-fix): test timed out at 3013ms because the unbounded queryLiveEpicState hung on a never-settling query
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/store-consolidate.test.ts -t "bounded source-Epic query" (0) — GREEN (post-fix): 1 passed in 169ms — hung query timed out into typed failed outcome, losing rejection observed, term-a still applied, no ledger row for the failed epic
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/store-consolidate.test.ts (0) — Full file GREEN: 42 passed (38 pre-existing + bounded-query timeout test + default-bound invariant + typed-error test + no-false-timeout happy path)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, tsc --noEmit, test-isolation, lockfile-policy, eslint, prettier --check all pass (fixed one Prettier formatting nit in the test file)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.test.ts -t "bounded source-Epic query"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.test.ts -t "bounded source-Epic query"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** required_main_agent_actions: Consider adding a module-mocked default Temporal-bundle lifecycle test: assert one execute-phase bundle, one awaited close, and no recreation/ledger write after timeout.
- **[unresolved_action]** required_main_agent_actions: Leave unrelated consolidation planning, collision, terminal-first, idempotency, and JSONL append behavior unchanged.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Temporal client Connection.close() returns Promise<void>; calling it without await permits teardown to outlive the operation and can surface a late cleanup rejection.
- **[archive_only_evidence]** changes_made: plugin/src/tools/store-consolidate.ts: Awaited Temporal connection close in both live-Epic enumeration and execute-phase shared-bundle cleanup so cleanup completion/rejection remains inside the owning operation rather than floating after return.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/store-consolidate.test.ts, pnpm --dir plugin run typecheck results=pass — Focused Vitest suite passed: 42/42 tests. TypeScript check exited 0. Also ran git diff --check successfully. Initial targeted command with plugin-prefixed filter found no tests because bin/oc-test executes inside plugin; reran with src/tools/store-consolidate.test.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run typecheck
- **[archive_only_evidence]** decisions: New file store-consolidate.lifecycle.test.ts instead of extending store-consolidate.test.ts — vi.mock is file-wide; adding Temporal module mocks to the existing file would silently change the behavior of its 42 tests. A dedicated file isolates the mocks and keeps existing behavior bit-identical
- **[archive_only_evidence]** decisions: Deferred-promise close gate + 25ms pending-check to prove close is awaited — A bare call-count assertion cannot distinguish awaited vs fire-and-forget close; gating close on a test-controlled deferred makes the report's resolution ordering directly observable and fails RED on the pre-fix code
- **[archive_only_evidence]** decisions: RED via git stash of the production diff rather than writing tests against old code — Production behavior already existed from attempt 1; stashing store-consolidate.ts reproduced the exact pre-fix defect modes (early resolve, unbounded hang) without touching tracked history
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts (RED: store-consolidate.ts diff stashed) (1) — RED confirmed: test 1 failed with execResolved=true (close not awaited pre-fix); test 2 hit 3000ms timeout (unbounded Epic query pre-fix)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts (GREEN: stash popped) (0) — 2/2 lifecycle tests pass against current production code
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts src/tools/store-consolidate.test.ts (0) — 44/44 tests pass across both store-consolidate test files; no regressions in existing suite
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — schemas:check, tsc --noEmit, test-isolation checker, lockfile policy, eslint, prettier --check all green
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts (RED: store-consolidate.ts diff stashed)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts (GREEN: stash popped)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts src/tools/store-consolidate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts src/tools/store-consolidate.test.ts results=pass — Focused lifecycle and existing consolidation suites passed: 2 files, 44 tests. Lifecycle coverage uses an unconfigured execute path except required test fixtures/mocks: first case proves one shared bundle across live change and Epic paths, exactly one close call, and unresolved execute promise until deferred close settles; timeout case proves typed failure, no Epic recreation, no Epic ledger row, one default bundle, and one close. Temp XDG-style fixture roots plus per-test mock clearing prevent real-store and cross-test contamination. An initial root-relative filter attempt found no tests because the wrapper runs from plugin/; corrected to src-relative paths.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts src/tools/store-consolidate.test.ts
- **[agenda]** follow_ups: Optional: explicit target_project_id=bdf259aa on every dry_run/execute for run-location-independent target selection and cleaner AC5 evidence.
- **[agenda]** follow_ups: Optional: re-run dry_run immediately before execute approval so plan-presented equals plan-executed.
- **[archive_only_evidence]** sources: resolveConsolidationTargetIds: Target defaults to resolveProjectIdentity(directory) structural git-root identity; 'unstable' resolution refuses with guidance; SHA40-validated; source==target rejected. Confirms claim (1): true-root bdf259aa resolves as default target; stale 4d6b5898 only used if explicitly passed.
- **[archive_only_evidence]** sources: executeConsolidation guards: Hard-fails with typed ConsolidationError before any mutation: approval_required (approvedByUser!==true or blank evidence), worker_lock_live (plan.safety.source_worker_lock_live), collisions_present (>0). Confirms claims (2)+(3).
- **[archive_only_evidence]** sources: Terminal-first phased execution + abort: Phase 1 imports ALL terminal items before ANY live recreation; terminal import failure returns finishExecuteReport immediately (aborts before live phase) so history stays correct with only live work to retry. Confirms partial-failure safety (3).
- **[archive_only_evidence]** sources: Ledger-aware collision + idempotence planning: Ledger read BEFORE collision detection; ledgered items present in both stores treated as expected post-consolidation state (skip_ledgered), not collisions. Keyed on (source,target,item_id). Confirms claim (4).
- **[archive_only_evidence]** sources: Worker-lock probe (read-only, liveness-checked): probeWorkerLock parses worker.lock pid and checks isProcessAlive; source_worker_lock_live = present && live===true. Only LIVE lock blocks; stale locks do not. Never reclaims/kills (honors C3).
- **[archive_only_evidence]** sources: Guard + idempotence tests: Tests assert approval_required, worker_lock_live, collisions_present typed refusals; 'second run after success is a reported no-op via ledger' (no_op:true, all skipped, no new rows, no collisions); 'interrupted run resumes' (crash after arch-a ledgered before term-a -> re-run skips arch-a, applies term-a). Proves guards + crash-safe idempotence enforced, not just coded.
- **[archive_only_evidence]** sources: Approved strict ChangeContract (12 items): Design AC/constraints (dry_run zero mutations, approval-gated execute, halt on collision/lock/validation, preserve sources, post-execute idempotence evidence) map 1:1 to the tool's coded guards and tests.
- **[archive_only_evidence]** architecture_assessment: Design is a thin correct orchestration of an already-implemented well-guarded tool (adv_store_consolidate, parent fixShallowRepoIdentity). All four validation targets backed by source + tests: (1) target resolution defaults to structural true-root identity bdf259aa, stale 4d6b5898 superseded in agreement/design and never passed; (2) dry_run read-only, execute approval-gated with typed approval_required refusal; (3) collision per-ID halt, live worker-lock liveness-checked and never reclaimed, partial-failure terminal-first abort-before-live all coded and tested; (4) append-only ledger keyed on (source,target,item_id) yields no-op re-runs and crash-resume, ledgered-in-both exempt from collision. Design treats tool implementation as out-of-scope (OOS1) and sequences one source at a time. No architectural deviation from by-the-book recovery pattern.
- **[agenda]** follow_ups: Impl/test: verify getClient bundle memoization (lines 1340-1343) is not broken by the timeout wrapper — one bundle, one finally close.
- **[agenda]** follow_ups: Impl: attach .catch(()=>{}) to the losing query promise after Promise.race to prevent unhandledRejection when the SDK retry eventually errors post-timeout.
- **[archive_only_evidence]** sources: Local impl: store-consolidate.ts queryLiveEpicState + live-Epic recreation: handle.query(getEpicStateQuery) at line 1368 has no client-side deadline/abort. Per-item try/catch (1493-1501) already normalizes any throw into a per-item 'failed' outcome preserving item_id+action+error. writeLedger (1479) runs only AFTER successful recreate, so a thrown timeout writes no ledger row. Connection.close() is in a finally (1503-1508) closing once after the live phase.
- **[archive_only_evidence]** sources: Local impl: ConsolidationExecuteDeps seam: queryLiveEpicState is an injectable dep (projectId, epicId) => Promise<EpicWorkflowState | null>. This is the exact, minimal seam to wrap with a bounded timeout without touching terminal-first/collision/lock/idempotence logic.
- **[archive_only_evidence]** sources: Local tests: existing unavailable-state precedent: 'missing source epic workflow state fails that item without crashing the run' asserts report.success=false, epic outcome status 'failed', error /state/i, and terminal items still applied. A timeout test is a direct structural sibling of this case.
- **[archive_only_evidence]** sources: Temporal TS SDK — CallContext deadline/abortSignal: CallContext exposes deadline?: number|Date (gRPC per-request deadline) and abortSignal?: AbortSignal. These are the SDK-native client-side request-bounding primitives; deadline applies to individual requests, distinct from connectTimeout.
- **[archive_only_evidence]** sources: Temporal TS SDK — _queryWorkflowHandler retry path: queryWorkflow RPC flows through the retry interceptor (RESOURCE_EXHAUSTED/UNAVAILABLE retried). WorkflowHandle.query(queryDef) takes no per-call CallContext, so an unanswered query can retry/block up to the tool budget — confirming the unbounded-hang root cause. Deadline/abort must be applied at connection/interceptor level or via a host-side Promise.race timeout wrapper around the query seam.
- **[archive_only_evidence]** sources: Temporal TS SDK — Connection.connect default connectTimeout: Default connectTimeoutMs is 10_000ms. connectTimeout bounds only initial connection establishment, NOT the query RPC — so it does not by itself bound queryLiveEpicState.
- **[archive_only_evidence]** architecture_assessment: The design correctly targets the unbounded handle.query() at store-consolidate.ts:1368 as the sole hang source, verified against the observed 10s ToolExecutionTimeout on the 67fe3e95 execute. Three of the four required invariants are ALREADY structurally guaranteed by existing code and need only preservation, not new mechanism: (1) typed per-item 'failed' normalization exists in the live-Epic catch (1493-1501) and is proven by test 1282-1310; (2) no-ledger-write-on-failure is guaranteed because writeLedger is sequenced after recreate inside the try, so any throw skips it; (3) terminal-first/collision/lock/idempotence live in separate phases (approval check 1209-1218, lock refusal 1223, terminal Phase 1 1268-1335, ledger idempotence via skip_ledgered) untouched by wrapping the query seam. The one genuinely new element is the bounded timeout itself. SDK evidence shows WorkflowHandle.query() has no per-call deadline argument, so the correct placement is a host-side timeout wrapper (Promise.race with a timer, or AbortController) around the injectable queryLiveEpicState dep — below the ~10s tool ceiling (design says strictly below; a 6-8s bound leaves margin for the surrounding terminal phase and report assembly). This is the boring, proven approach and it composes with the existing dep seam and existing error normalization with near-zero blast radius. CAUTION (non-blocking) items: (a) client resource cleanup on timeout — current finally closes the connection once after the live phase, which is correct for a per-item timeout that does NOT abort the shared connection; but if the timeout wrapper leaves the underlying gRPC query promise pending (Promise.race does not cancel the loser), the SDK retry loop may keep the connection busy until connection.close() in finally forcibly tears it down. Design item 3 ('client resources close on timeout/failure') should be interpreted as: the existing finally close is sufficient IF the wrapper does not open a new client per item; do not add a per-item connection.close inside the loop or it will break subsequent items sharing the memoized bundle (getClient at 1340-1343 memoizes one bundle). (b) The 'not found' -> null branch (1370) must remain distinct from timeout: a timeout must throw (become 'failed'), not be coerced to null (which would be treated as unavailable-state — same outcome class, but the error text should say timeout for AC6 failure-class evidence). (c) A leaked pending query promise after Promise.race should be swallowed (attach a .catch(()=>{}) ) to avoid an unhandledRejection when the retry eventually errors post-timeout.
- **[agenda]** follow_ups: Design-validation packet anchors (TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION) were not supplied in structured form; validated against the change's own approved contract, agreement, design, and task state instead.
- **[archive_only_evidence]** sources: Approved strict ChangeContract (adv_change_show): C4 (approved, discovery gate done by user 2026-07-13T16:03:28Z): parent live-operation tasks remain cancelled; only linked child runPokeedgeRecovery may perform live recovery after parent release. AC5: parent release from branch to trunk; no live PokeEdge store consolidated by parent. OOS1/OOS3: live consolidation and source deletion deferred to child.
- **[archive_only_evidence]** sources: Task list state (adv_task_list): All four live-operation (ops/verification) tasks are status=cancelled with user-approved cancellations ('Approve cancellations'); each cancellation reason names linked child runPokeedgeRecovery as owner. Preflight (tk-23d9afbb8df8) and approval (tk-4d1d5d25340a) are done historical; code task tk-36ce494039f7 (bounded-query fix) is done, respects C1/C2/C3, contains no live-op reference.
- **[archive_only_evidence]** sources: Delivered bounded-query implementation report (tk-36ce494039f7 subagent_reports): 7s Promise.race bound at injectable query seam; typed EpicQueryTimeoutError lands in per-item failed outcome (never null-coerced); single awaited Temporal connection close. TDD RED->GREEN; 44/44 targeted tests + pnpm run check green; reviewer verdict READY. Matches AC1-AC4 and design 'Delivered implementation'.
- **[archive_only_evidence]** sources: Child change existence (adv_change_list in-flight): runPokeedgeRecovery exists (draft, fast_follow_of parent runPokeedgeConsolidation, linked 2026-07-13T12:42:15Z), confirming the designated exclusive live-recovery owner is a real linked child, not a dangling reference.
- **[archive_only_evidence]** architecture_assessment: The unchanged bounded-query release design and the explicit C4 ownership split are internally consistent and free of scope/safety conflict. Single-owner invariant is structurally enforced across contract + task state: (1) Parent scope is exclusively the bounded source-Epic query fix (AC1-AC4) plus a trunk release (AC5); the delivered code task carries no live-operation reference and respects C1/C2/C3. (2) All four parent live-operation tasks are cancelled with user approval, each explicitly transferring ownership to child runPokeedgeRecovery, satisfying C4's 'remain cancelled' clause. (3) OOS1/OOS3 defer live consolidation and source deletion to the child; agreement, design boundaries, and constraint text agree verbatim. (4) The child exists as a real linked fast-follow. No task is simultaneously parent-owned-live and child-deferred, so no double-ownership or race exists. The C4 amendment was additive (repairs historical cancelled-task C4 references for strict-contract consistency) and did not alter delivered scope, matching the reentry_history rationale. This follows the boring, proven release-first sequencing pattern (release verified tool from trunk, then run live migration from deployed trunk) with no clever coupling.
- **[unresolved_action]** required_main_agent_actions: Provide a complete Context Packet including `SCOPE KEY:` for this independent review, then respawn adv-reviewer.
- **[archive_only_evidence]** verification: tests_run= results=n/a — No repository analysis or edits performed: packet identity validation failed before scope lock.
- **[unresolved_action]** required_main_agent_actions: Record this acceptance-review evidence and complete contract review-matrix synthesis for AC1–AC5/C1–C4.
- **[unresolved_action]** required_main_agent_actions: Keep parent limited to release from its approved branch to trunk; do not perform live consolidation here.
- **[unresolved_action]** required_main_agent_actions: After parent release and deployment from trunk, hand off live recovery to linked child runPokeedgeRecovery for fresh dry-runs and explicit execute approval.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Recovery errors are part of the safety surface: even when implementation prevents manual reconstruction, actionable error text must not recommend it when the agreement prohibits it.
- **[archive_only_evidence]** changes_made: plugin/src/tools/store-consolidate.ts: Removed both manual-Epic-reconstruction remedies from unavailable-state and timeout errors; failures now direct operators to restore/restart the source workflow and rerun, preserving C1.
- **[archive_only_evidence]** changes_made: plugin/src/tools/store-consolidate.test.ts: Strengthened unavailable-state and timeout assertions to require restore/restart guidance and prohibit manual-reconstruction wording.
- **[archive_only_evidence]** verification: tests_run=../bin/oc-test targeted -- src/tools/store-consolidate.test.ts src/tools/store-consolidate.lifecycle.test.ts, pnpm run check, git diff --check results=pass — Focused Vitest suite passed 2 files / 44 tests. schemas:check, typecheck, test-isolation, lockfile policy, lint, and Prettier check all passed. Diff whitespace check passed. Reviewed parent diff against trunk: only store-consolidate implementation and focused tests. Source query has a 7s host-side bound, typed EpicQueryTimeoutError, observed late rejection, per-item failure before recreation/ledger write, terminal-first behavior, and awaited shared connection close. Lifecycle tests prove one bundle and awaited close. Child runPokeedgeRecovery exists as parent-linked draft and explicitly defers live operations until deployed trunk.
- **[unresolved_action]** required_main_agent_actions: Use existing acceptance matrix evidence for AC1–AC5 and C1–C4; it is consistent with the reviewed timeout implementation and 44-test focused suite.
- **[unresolved_action]** required_main_agent_actions: Before archive sign-off, complete release verification from change/runPokeedgeConsolidation to trunk and prove merge/reachability; do not treat local branch readiness as release completion.
- **[unresolved_action]** required_main_agent_actions: Keep parent live-operation tasks cancelled. After trunk deployment/release, route any live PokeEdge recovery only through linked child runPokeedgeRecovery.
- **[wisdom_candidate]** wisdom_candidates: [success] A host-side race around Temporal WorkflowHandle.query, paired with explicit late-rejection observation and an awaited shared connection close, gives a bounded failure path without weakening terminal-first or ledger-after-success invariants.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/store-consolidate.test.ts src/tools/store-consolidate.lifecycle.test.ts, pnpm --dir plugin run check, git status --short && git diff --check && git diff --name-status trunk...HEAD && git log --oneline trunk..HEAD results=pass — Focused suite passed: 2 files, 44 tests. Plugin check passed schemas, TypeScript, isolation, lockfile, lint, and Prettier checks. Worktree status is clean; diff check passed; branch delta is limited to store-consolidate.ts plus focused unit/lifecycle tests. Current branch is change/runPokeedgeConsolidation; commits ahead of trunk are two ADV checkpoints.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.test.ts -t "bounded source-Epic query"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.test.ts -t "bounded source-Epic query"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- Consider adding a module-mocked default Temporal-bundle lifecycle test: assert one execute-phase bundle, one awaited close, and no recreation/ledger write after timeout.
- Leave unrelated consolidation planning, collision, terminal-first, idempotency, and JSONL append behavior unchanged.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run typecheck
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts (RED: store-consolidate.ts diff stashed)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts (GREEN: stash popped)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts src/tools/store-consolidate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/store-consolidate.lifecycle.test.ts src/tools/store-consolidate.test.ts
- Provide a complete Context Packet including `SCOPE KEY:` for this independent review, then respawn adv-reviewer.
- Record this acceptance-review evidence and complete contract review-matrix synthesis for AC1–AC5/C1–C4.
- Keep parent limited to release from its approved branch to trunk; do not perform live consolidation here.
- After parent release and deployment from trunk, hand off live recovery to linked child runPokeedgeRecovery for fresh dry-runs and explicit execute approval.
- Use existing acceptance matrix evidence for AC1–AC5 and C1–C4; it is consistent with the reviewed timeout implementation and 44-test focused suite.
- Before archive sign-off, complete release verification from change/runPokeedgeConsolidation to trunk and prove merge/reachability; do not treat local branch readiness as release completion.
- Keep parent live-operation tasks cancelled. After trunk deployment/release, route any live PokeEdge recovery only through linked child runPokeedgeRecovery.
