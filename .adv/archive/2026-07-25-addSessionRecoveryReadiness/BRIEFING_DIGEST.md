# Archive Briefing Digest

**Change ID:** addSessionRecoveryReadiness
**Title:** Add session recovery readiness barrier
**Status:** archived
**Generated:** 2026-07-25T07:24:22.345Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Showing 80 of 80 durable facts.

- **[archive_only_evidence]** decisions: evaluateQueueReadiness takes granular serviceability signals (localRegistered, localWorkerAlive, localOwnership, serverPollerStatus, staleRunningWorkflowCount) — Blockers need the individual local signals and peer ownership check; this avoids forcing an artificial {worker, client} shape and keeps the helper reusable across both cross-project and same-project readiness paths.
- **[archive_only_evidence]** decisions: classifyQueueServiceability still computes final status from ready + server/stale signals — The helper contract is exactly {ready, blockers, probeKind}; preserving the not_serviceable vs unknown distinction in classify keeps behavior identical without expanding helper return shape.
- **[archive_only_evidence]** decisions: probeKind reuses QueueServiceabilityConfidence union — It already classifies strongest evidence (combined/local/server/none) and keeps type surface small.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/queue-serviceability.test.ts (1) — RED phase: 5 new evaluateQueueReadiness tests fail as expected because helper does not yet exist
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/queue-serviceability.test.ts (0) — GREEN phase: all 12 queue-serviceability tests pass after extraction
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/queue-serviceability.test.ts src/tools/target-project.test.ts (0) — Parity: all 46 existing tests in queue-serviceability and target-project remain green
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean inside plugin/
- **[archive_only_evidence]** decisions: Inserted rq-sessionReadinessBarrier01 immediately after rq-isolSessionTaskQueue05 — Keeps session-queue/recovery requirements adjacent and makes the additive relationship explicit
- **[archive_only_evidence]** decisions: Added a per-scenario 'warrant' field for AC/C references — The method asked for warrant annotations and the spec schema allows additionalProperties on scenarios; this preserves the canonical id/title/given/when/then shape while carrying the acceptance-criterion warrants
- **[archive_only_evidence]** decisions: Created plugin/src/session-readiness-barrier-assets.test.ts as an enforcement-path asset test — The existing spec-citation-invariant test requires every requirement to have an external citation in plugin/src/**/*.ts, .opencode/**/*.md, skills/**/*.md, docs/ (excl. specs/), ADV_INSTRUCTIONS.md, AGENTS.md, or CHANGELOG.md. A dedicated asset test provides that citation and verifies the requirement shape/scenarios
- **[archive_only_evidence]** verification: node -e 'JSON.parse(...); validate id uniqueness' (0) — spec.json parses as valid JSON; rq-sessionReadinessBarrier01 id and scenario ids are unique; no collisions with existing ids
- **[archive_only_evidence]** verification: pnpm exec tsx -e "import {SpecSchema} from './src/types/index.ts'; SpecSchema.parse(JSON.parse(readFileSync('../.adv/specs/advance-workflow/spec.json','utf8')));" (0) — spec.json validates against the authoritative Zod SpecSchema
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/__tests__/spec-id-shape-invariant.test.ts src/session-readiness-barrier-assets.test.ts src/__tests__/spec-citation-invariant.test.ts (0) — spec id-shape invariant, new requirement asset tests, and citation invariant all pass
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/session-readiness-barrier-assets.test.ts && pnpm exec eslint src/session-readiness-barrier-assets.test.ts (0) — New asset test file passes Prettier and ESLint checks
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-json-parse-uniqueness
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-zod-specschema
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-spec-validators
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-prettier-eslint
- **[unresolved_action]** required_main_agent_actions: No remediation required; accept reviewer-owned static-check evidence for tk-4cb5785d8e89.
- **[unresolved_action]** required_main_agent_actions: Before checkpointing, reconcile the worktree's reported one-commit behind status if upstream may affect .adv/specs/advance-workflow/spec.json or plugin/src/session-readiness-barrier-assets.test.ts.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/session-readiness-barrier-assets.test.ts, pnpm --dir plugin run schemas:check, git diff --check results=pass — review_evidence_ref: task tk-4cb5785d8e89 / rq-sessionReadinessBarrier01. Static review confirmed MUST shape, five required tags, six ordered Given/When/Then scenarios, warrants, and additive relationship to rq-isolSessionTaskQueue05.3. Scenario 1 fail-closes without signal; 2 is per-target-queue; 3 states bounded successful Query, failed Query override, local-worker new-workflow proof, and advisory-only DescribeTaskQueue; 4 re-closes after death/TTL; 5 bypass default OFF; 6 explicitly keeps startup non-blocking and moves barrier to post-init exposure/execution. Asset suite passed 8/8; schema check and whitespace check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/session-readiness-barrier-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run schemas:check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[archive_only_evidence]** decisions: Created dedicated plugin/src/temporal/readiness-types.ts module — Keeps the ADV_SESSION_NOT_READY envelope distinct from Temporal diagnostics and plugin init failed payload; aligns with repo discriminated-union conventions (kind field, type guards).
- **[archive_only_evidence]** decisions: Retry hint is a stable string plus a structured AdvSessionNotReadyRetryHint type — Requirement asks for stable caller-parseable string referencing ~10s orphan-adoption cadence and retry-after-heartbeat, without an ETA; structured type allows programmatic access.
- **[archive_only_evidence]** decisions: Plumbed the envelope type into plugin/src/tools/_adapters.ts as imports/re-exports only — T5 will wire the gate; _adapters.ts already defines return-shape types for the signal/query surface, so importing/exporting here is the correct seam.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/temporal/readiness-types.test.ts src/temporal/session-readiness.test.ts (0) — 2 passed files, 24 passed tests (8 envelope tests + 16 session-readiness tests)
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-readiness-20260725-001
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tsc-typecheck-20260725-001
- **[archive_only_evidence]** decisions: Use module-level cache + probe registry for the readiness state machine — Matches the public surface requirement (inject/replace probes for tests and real client) and keeps the API synchronous for cache hits while remaining async for probes
- **[archive_only_evidence]** decisions: Clamp cache TTL at 10s and probe budget at 2s — DDC2 and DDC1 specify upper bounds; clamping enforces them even if a caller passes a larger value
- **[archive_only_evidence]** decisions: For no-workflow case, pass serverPollerStatus='unavailable' to evaluateQueueReadiness — KD3 requires local-worker readiness as the sole required proof for first mutation; server poller evidence is advisory-only and must not make a target ready when local signal is missing
- **[archive_only_evidence]** decisions: When hasWorkflow=true, do not run DescribeTaskQueue probe after a failed Query — KD3 invariant: a failed Query overrides fresh DescribeTaskQueue; running DTQ would waste budget and could leak misleading diagnostics
- **[archive_only_evidence]** decisions: Return ADV_SESSION_NOT_READY as the primary blocker on any fail-closed path — KD3 truth table specifies this blocker for both missing Query proof and missing local-worker readiness
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/session-readiness.test.ts (1) — RED phase: tests fail because session-readiness.ts module does not yet exist
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/session-readiness.test.ts (0) — GREEN phase: 14 tests pass after initial implementation
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/session-readiness.test.ts src/temporal/queue-serviceability.test.ts (0) — GREEN phase final: 28 tests pass (16 new + 12 existing)
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean; no new type errors
- **[archive_only_evidence]** verification: pnpm exec eslint src/temporal/session-readiness.ts src/temporal/session-readiness.test.ts && pnpm exec prettier --check src/temporal/session-readiness.ts src/temporal/session-readiness.test.ts (0) — ESLint and Prettier clean for new files
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-lint-format
- **[archive_only_evidence]** decisions: Resolved the mutation's target queue from handle.describe() and cached by workflowId to avoid repeated RPCs — The target queue is the only authoritative source for where the signal will land; inferring from projectId alone would mis-handle session queues (AC2/C6).
- **[archive_only_evidence]** decisions: Made EvaluateTargetReadinessInput.localSignal optional — The per-mutation gate always uses hasWorkflow:true with a queryProbe, so localSignal is not required on this call path; the no-workflow branch remains guarded.
- **[archive_only_evidence]** decisions: Threw the AdvSessionNotReady envelope as a rejected value rather than changing the function return type — Keeps the Promise<void> contract and avoids editing all 52 callers while still failing closed (signal/receipt/refresh never execute).
- **[archive_only_evidence]** decisions: Inserted the gate before fireSignal and the receipt/refresh path — Preserves gateMutationSuccessDisk typing: MutationApplicationUnconfirmedError, waitForAppliedReceipt, and isOuterSignalRetryAllowed are untouched.
- **[archive_only_evidence]** decisions: Left the exposure-time tool-map wrapper unchanged — KD4 mandates a single authoritative per-mutation gate; index.ts/tool-registry.ts cannot know the target queue and must not become a second authority.
- **[archive_only_evidence]** verification: ADV_SESSION_READINESS_BYPASS=1 ./bin/oc-test targeted -- src/tools/_adapters.test.ts (1) — RED phase: the two new KD4 AC tests fail when the readiness gate is bypassed (gate not yet enforced)
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/tools/_adapters.test.ts src/tools/_adapters.mutation-safety.test.ts src/temporal/session-readiness.test.ts src/temporal/readiness-types.test.ts src/storage/store-temporal/mutation-safety-wiring.test.ts src/storage/store-temporal/gates.durability.test.ts src/storage/store-temporal/wisdom.durability.test.ts src/storage/store-temporal/tasks.durability.test.ts src/temporal/mutation-safety.test.ts (0) — GREEN phase: 130 targeted tests pass across adapters, mutation-safety, session-readiness, readiness-types, and durability suites
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit is clean after the mutation-path type changes
- **[archive_only_evidence]** verification: cd plugin && files=(src/storage/store-temporal/*.test.ts) && cd .. && ./bin/oc-test targeted -- src/tools/_adapters.test.ts src/tools/_adapters.mutation-safety.test.ts src/temporal/mutation-safety.test.ts src/temporal/session-readiness.test.ts src/temporal/readiness-types.test.ts src/session-readiness-barrier-assets.test.ts \"${files[@]}\" (0) — Broader regression sweep: 28 test files / 356 tests pass, including store-temporal durability suites
- **[archive_only_evidence]** decisions: Wired markStale on both registerQueue rejection and timeout paths in runOneAdoptionTick — Both paths are worker-death/unresponsive signals observed during the ~10s orphan-adoption heartbeat; a rejected registerQueue (explicit shutdown or transport failure) and a tick-timeout (unresponsive worker) both mean the target queue must be re-proven before the next mutation (KD5/AC4). Existing retry/cooldown/shutdown-suppression logic is preserved unchanged (DONT3).
- **[archive_only_evidence]** decisions: Added two AC4 tests covering shutdown rejection and timeout worker-death signals — The task asks for a red/green AC4 test; covering both observed failure modes gives confidence the hook fires regardless of which worker-death path is hit.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/orphan-queue-adopter.test.ts (1) — RED phase: 2 new AC4 worker-death staleness tests fail as expected before wiring markStale
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/orphan-queue-adopter.test.ts (0) — GREEN phase: 19 orphan-queue-adopter tests pass after wiring markStale
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/orphan-queue-adopter.test.ts src/temporal/session-readiness.test.ts (0) — Verification: 35 tests pass (19 adopter + 16 session-readiness) including new AC4 tests
- **[archive_only_evidence]** verification: pnpm run check (0) — Full check clean: schemas:check, typecheck, manifest checks, test-isolation, lockfile policy, lint, format:check
- **[archive_only_evidence]** decisions: Added informational session-readiness hint only to createDegradedToolMap payload and description. — KD4 requires exposure-time degraded-mode hint only; the degraded stub cannot know per-target queue state so it cannot become a second eligibility authority. Per-mutation gate in fireSignalAndRefresh (T5) remains the sole authority.
- **[archive_only_evidence]** decisions: Used direct process.env manipulation with try/finally for AC5 bypass test instead of vi.stubEnv/vi.unstubEnv. — The local Vitest version supports vi.stubEnv but lacks vi.unstubEnv; direct env manipulation is portable and avoids leaking ADV_SESSION_READINESS_BYPASS into other tests.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/_adapters.test.ts src/tool-registry.test.ts src/session-readiness-barrier-assets.test.ts (1) — RED phase: 2 expected failures (degraded readiness-hint stub not yet implemented; AC5 harness used unsupported vi.unstubEnv). T5 bypass behavior already present.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/_adapters.test.ts src/tool-registry.test.ts src/session-readiness-barrier-assets.test.ts (0) — GREEN phase: all 86 targeted tests pass after adding degraded readiness hint and fixing AC5 env cleanup.
- **[archive_only_evidence]** verification: cd plugin && pnpm run typecheck (0) — TypeScript typecheck clean inside plugin/.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tool-registry.test.ts src/tool-registry.inventory.test.ts src/tool-catalog.test.ts src/tools/_adapters.test.ts src/session-readiness-barrier-assets.test.ts (0) — Parity: 128 registry/catalog/_adapters/spec-asset tests pass; no second-gate regression.
- **[archive_only_evidence]** decisions: Created a single unit-level integration test file with mocked Temporal probes rather than an .itest.ts workflow test — The task scope is the cohesion/verification layer across T1-T7; no live workflow behavior is required, and the existing per-AC unit tests already cover the pieces. Mocked probes keep the suite fast and deterministic.
- **[archive_only_evidence]** decisions: Reused the existing module-mock patterns from target-project.test.ts and _adapters.test.ts — Keeps integration test consistent with project conventions and avoids leaking real plugin-init / Temporal connection state into unit tests.
- **[archive_only_evidence]** decisions: Verified cross-project parity via a golden-value matrix over ensureTargetMutationQueueReady — AC7 requires behavior-identical output after the T1 refactor; the matrix asserts status/confidence/blockers for (owned/peer) × (local up/down) × (server fresh/stale/none/unavailable) combinations.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/session-readiness.integration.test.ts src/temporal/session-readiness.test.ts src/tools/_adapters.test.ts src/temporal/orphan-queue-adopter.test.ts src/tools/target-project.test.ts (0) — 5 test files, 136 tests passed: integration matrix + existing readiness/adapters/adopter/target-project suites all green
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean inside plugin/
- **[unresolved_action]** required_main_agent_actions: Rebase the change worktree if clean, remediate correctness-1 and security-1 within the approved session-readiness scope, then rerun targeted readiness and safe-execute tests plus `pnpm run check`.
- **[unresolved_action]** required_main_agent_actions: Do not revisit unrelated queue-serviceability, target_path, startup, or gateMutationSuccessDisk code; reviewed evidence supports AC2, AC3, AC4, AC6, AC7, C1/C2/C3/C6, and the informational-only tool-registry wrapper.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Throwing a structured non-Error from a tool helper loses its discriminated shape in safeExecute, which serializes unknown throws with String(value). Acceptance tests must exercise the registered tool wrapper, not only helper-level catch behavior.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/_adapters.test.ts src/temporal/session-readiness.test.ts src/temporal/readiness-types.test.ts src/temporal/orphan-queue-adopter.test.ts src/temporal/session-readiness.integration.test.ts src/utils/safe-execute.test.ts, pnpm run check results=pass — Targeted suite: 6 files, 160 tests passed. `pnpm run check` passed schemas, TypeScript, generated manifests, test isolation, lockfile policy, ESLint, and Prettier. Passing tests do not cover safeExecute serialization of the actual readiness rejection.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/_adapters.test.ts src/temporal/session-readiness.test.ts src/temporal/readiness-types.test.ts src/temporal/orphan-queue-adopter.test.ts src/temporal/session-readiness.integration.test.ts src/utils/safe-execute.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** required_main_agent_actions: Sync/rebase the change worktree before subsequent integration or release steps, per freshness policy.
- **[archive_only_evidence]** verification: tests_run=pnpm run check, bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/_adapters.test.ts src/temporal/readiness-types.test.ts, git diff --check 23ed585f^ 23ed585f results=pass — pnpm run check passed: schemas, TypeScript, generated manifests, isolation, lockfile, ESLint, and Prettier. Targeted suite passed: 3 files, 108 tests. Diff check clean. safeExecute and safeExecuteSimple catch paths both route thrown AdvSessionNotReady envelopes through formatErrorResponse, which returns JSON with error and kind ADV_SESSION_NOT_READY, blockers, retryHint, retryable:true, tool, and errorClass AdvSessionNotReady; the test invokes both wrappers and re-discriminates the parsed payload. This shape remains distinct from init-failure status and no_poller class envelopes. _adapters accepts bypass only when ADV_SESSION_READINESS_BYPASS is exactly "1"; tests verify "true" remains fail-closed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/_adapters.test.ts src/temporal/readiness-types.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 23ed585f^ 23ed585f

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
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: manual-json-parse-uniqueness
- verification_missing: No durable adv_run_test evidence found for run_id: manual-zod-specschema
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-spec-validators
- verification_missing: No durable adv_run_test evidence found for run_id: manual-prettier-eslint
- No remediation required; accept reviewer-owned static-check evidence for tk-4cb5785d8e89.
- Before checkpointing, reconcile the worktree's reported one-commit behind status if upstream may affect .adv/specs/advance-workflow/spec.json or plugin/src/session-readiness-barrier-assets.test.ts.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/session-readiness-barrier-assets.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run schemas:check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-readiness-20260725-001
- verification_missing: No durable adv_run_test evidence found for run_id: tsc-typecheck-20260725-001
- verification_missing: No durable adv_run_test evidence found for run_id: manual-typecheck
- verification_missing: No durable adv_run_test evidence found for run_id: manual-lint-format
- Rebase the change worktree if clean, remediate correctness-1 and security-1 within the approved session-readiness scope, then rerun targeted readiness and safe-execute tests plus `pnpm run check`.
- Do not revisit unrelated queue-serviceability, target_path, startup, or gateMutationSuccessDisk code; reviewed evidence supports AC2, AC3, AC4, AC6, AC7, C1/C2/C3/C6, and the informational-only tool-registry wrapper.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/_adapters.test.ts src/temporal/session-readiness.test.ts src/temporal/readiness-types.test.ts src/temporal/orphan-queue-adopter.test.ts src/temporal/session-readiness.integration.test.ts src/utils/safe-execute.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- Sync/rebase the change worktree before subsequent integration or release steps, per freshness policy.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/_adapters.test.ts src/temporal/readiness-types.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 23ed585f^ 23ed585f
