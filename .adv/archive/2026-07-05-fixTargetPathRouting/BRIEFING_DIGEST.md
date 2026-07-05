# Archive Briefing Digest

**Change ID:** fixTargetPathRouting
**Title:** Fix target path routing
**Status:** archived
**Generated:** 2026-07-05T17:36:28.268Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #192

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

Showing 90 of 90 durable facts.

- **[agenda]** follow_ups: Unrelated pre-existing failures in src/tools/archive-helpers/git-finalize.test.ts surfaced during full-suite run (status 'blocked' due to push behavior/environment) and are out of scope for this task.
- **[archive_only_evidence]** decisions: Route target artifact reads through withTargetPathStore with stateRequirement:temporal-required and mutation:false — Ensures artifact include flags read from the target project's Temporal documents and fail closed when the target Temporal layer is unreachable, instead of returning disk-snapshot scaffold content.
- **[archive_only_evidence]** decisions: Keep no-artifact target show calls on withOptionalTargetPathStore snapshot-ok — Preserves existing snapshot behavior for target show calls that do not request artifact content.
- **[archive_only_evidence]** decisions: Reuse readArtifacts and loadProposalForContext unchanged — Both helpers already operate on a Store; passing the Temporal-backed target store gives Temporal-first reads without duplicating read logic.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (1) — RED phase: new target-artifact-routing regression tests failed before implementation (2 failed as expected)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (0) — GREEN phase: all 85 change.test.ts tests pass after implementation
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts src/tools/cross-project-coordination.test.ts (0) — Targeted verification: 93 tests pass including cross-project coordination
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — Repo check gate passes: schemas:check, typecheck, lint, format:check, lockfile policy, test isolation
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts src/tools/cross-project-coordination.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- **[archive_only_evidence]** decisions: Extracted runClose(activeStore, projectContext?) inner function and routed target_path through withTargetPathStore with stateRequirement: 'temporal-required' and mutation: !dryRun. — Matches the task contract, keeps same-project path identical, and makes the target store (not source store) own lookup, signal, refresh, cleanup, and recovery.
- **[archive_only_evidence]** decisions: Used context.projectId for the target workflow handle, falling back to getProjectId(activeStore.paths.root) for same-project closes. — Ensures getChangeHandle targets the correct project ID when operating across projects.
- **[archive_only_evidence]** decisions: Included _projectContext directly in the close output object for target closes instead of appending via appendTargetProjectContextOutput. — Consistent with runRepair/runUpdate patterns in the same file and keeps the dry-run/read paths simpler.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.test.ts -t "target_path routing" (0) — 4 new target close tests pass (temporal-required routing, dry-run read-only, untrusted rejection, recovery path)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.test.ts -t "adv_change_close" (0) — 13 adv_change_close tests pass (9 same-project + 4 target_path)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change*.test.ts (0) — 183 tests across change tool files pass
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes
- **[archive_only_evidence]** verification: pnpm run lint (0) — ESLint passes
- **[archive_only_evidence]** verification: pnpm run format:check (0) — Prettier formatting check passes
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.test.ts -t "target_path routing"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.test.ts -t "adv_change_close"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change*.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run lint
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- **[archive_only_evidence]** decisions: Mirrored adv_change_close runClose/withTargetPathStore pattern for bulk close — Keeps target routing consistent: selection, signaling, recovery, and disk sweep all use the target store; dry-run stays read-only via mutation:false
- **[archive_only_evidence]** decisions: Resolved projectId from projectContext when available, falling back to getProjectId(activeStore.paths.root) — Target close must use target project ID for getChangeHandle; same-project path keeps existing behavior
- **[archive_only_evidence]** decisions: Attached _projectContext to all runBulkClose outputs when targeting a project — Contract requires target responses include _projectContext
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts -t "target_path routing" (1) — RED phase: 4 new target bulk-close tests failed before implementation (selection still used source store)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts -t "target_path routing" (0) — GREEN phase: target bulk-close tests pass after implementation
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts -t "adv_change_bulk_close" (0) — Same-project bulk-close behavior remains green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (0) — Full change.test.ts suite passes (93/93)
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — schemas:check, typecheck, lint, format:check, isolation, lockfile policy all green
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts -t "target_path routing"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts -t "target_path routing"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts -t "adv_change_bulk_close"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- **[agenda]** follow_ups: Acceptance criteria (implementation-free): (a) adv_change_show target_path include.proposal/problemStatement returns real target state.documents content (not scaffold) for an active target change with a serviceable target worker; (b) adv_change_show target_path readback for an archived/closed target change returns terminal document content via archive-bundle/disk fallback without requiring a live target workflow; (c) adv_change_close target_path against a change owned by the target project completes without WorkflowNotFoundError and the target change reaches closed status; (d) adv_change_bulk_close target_path closes multiple same-project target changes and rejects a selection spanning >1 project with a clear error; (e) untrusted target close without target_confirmed+confirmationEvidence fails before any target mutation; (f) target close when the target queue is not serviceable fails closed with the target queue name + actionable worker-restart instruction (reuse formatTargetMutationReadinessError); (g) tool describe text for adv_change_show target_path no longer claims a disk snapshot for artifact content.
- **[agenda]** follow_ups: Open question for orchestrator: confirm desired readback semantics for an ACTIVE target change when the target worker is DOWN — fail closed (consistent with mutation readiness) vs degrade to disk-snapshot placeholders with an explicit staleness warning. Recommendation: fail closed for active changes, disk/archive fallback only for terminal changes.
- **[agenda]** follow_ups: Verify no other target_path read tool (e.g. adv_gate_status, adv_task_list, adv_status target_path) silently relies on snapshot-ok where document content is expected; scope this fix's related-scan (P25) to the target_path read surface.
- **[archive_only_evidence]** sources: Temporal TS message-passing (Query state): handle.query() reads workflow state from running or closed executions; a Worker must be online to serve the query. Canonical read-state mechanism — workflow state.documents, not disk, is source of truth.
- **[archive_only_evidence]** sources: Temporal CLI query reference: Query exposes internal state and works on running AND completed workflow executions — confirms Temporal-backed readback is valid for terminal changes, not only active ones.
- **[archive_only_evidence]** sources: Temporal getHandle addressing (Nexus feature guide): client.workflow.getHandle(workflowId) addresses exactly one workflow by ID; the workflow ID is derived deterministically from domain identity. Wrong ID derivation yields WorkflowNotFound.
- **[archive_only_evidence]** sources: Temporal WorkflowHandle API: WorkflowHandle is a client-side handle to a single workflow; can query running/completed and signal running workflows. Handle correctness depends entirely on the workflow ID passed to getHandle.
- **[archive_only_evidence]** sources: Repo: target-project.ts withTargetPathStore: stateRequirement='temporal-required' builds a Temporal-backed target store bound to the target projectId (createStore + projectIdOverride) with queue-serviceability gating; 'snapshot-ok' builds a disk-only legacy store that reads change.json projections.
- **[archive_only_evidence]** sources: Repo: adv_change_show target routing (readback bug): adv_change_show routes target_path through withOptionalTargetPathStore → stateRequirement='snapshot-ok'. activeStore.changes.get reads target DISK change.json; readArtifacts/loadProposalForContext then return scaffold placeholders because target state.documents is never queried.
- **[archive_only_evidence]** sources: Repo: adv_change_close / bulk_close (WorkflowNotFound bug): Neither tool declares a target_path arg. Both resolve getProjectId(store.paths.root) — the SOURCE project — then getChangeHandle(client, sourceProjectId, changeId) builds a source workflow ID via buildChangeWorkflowId. Target change lives under target projectId workflow → WorkflowNotFoundError.
- **[archive_only_evidence]** sources: Repo: adv_change_update correct reference pattern: adv_change_update declares target_path/target_confirmed/confirmationEvidence and routes through withTargetPathStore(stateRequirement='temporal-required'); all store.changes.* operations then address the target workflow correctly. This is the in-repo canonical fix pattern.
- **[archive_only_evidence]** sources: Spec: rq-crossProjectCoordination01: MUST: cross-project tools use explicit target_path routing through the target project's Temporal-backed store; never read ADV state files directly; derive target identity from the target repo. Create must avoid synchronous target getState from source; readback/close are not create and legitimately query the target workflow.
- **[archive_only_evidence]** sources: Spec: rq-crossProjectTaskMutation01 + advance-meta target routing: Target store MUST own every lookup, signal, cache refresh, and snapshot when target_path targets project B with a changeId in project B. Establishes the governing invariant for close/bulk-close routing.
- **[archive_only_evidence]** architecture_assessment: Root cause is a store-selection / workflow-addressing mismatch, not a Temporal misuse. Temporal TS best practice is unambiguous: a change workflow's state.documents is the source of truth and is read via handle.query() (valid on running and completed executions, worker online), and a workflow is addressed by a deterministic workflow ID derived from OWNING-project identity. The repo already encodes this correctly for adv_change_update via withTargetPathStore(stateRequirement='temporal-required'), which binds a Temporal-backed store to the target projectId so buildChangeWorkflowId(targetProjectId, changeId) resolves the right workflow. Two tools deviate: (1) adv_change_show routes target_path through 'snapshot-ok' (disk legacy store), so it reads the target's change.json projection and returns scaffold placeholders instead of querying target state.documents — a wrong-source read; (2) adv_change_close and adv_change_bulk_close have no target_path arg at all and hardcode getProjectId(store.paths.root) = source projectId, producing a source-scoped workflow ID for a change that only exists under the target project's workflow → WorkflowNotFoundError — a wrong-address write. The correct, boring fix is to make show/close/bulk-close mirror the existing update routing: temporal-required target store for reads that need documents and for all close mutations, with the target confirmation/queue-serviceability gates the helper already enforces. No new abstraction, protocol, or Temporal feature is required.
- **[agenda]** follow_ups: Confirm non-show withOptionalTargetPathStore callers are snapshot-safe before narrowing it.
- **[archive_only_evidence]** sources: target-project.ts withTargetPathStore: withTargetPathStore switches store by stateRequirement. withOptionalTargetPathStore hardcodes snapshot-ok, root cause of empty active artifact readback. targetPathSchema line 70 is canonical reused arg-shape.
- **[archive_only_evidence]** sources: change.ts adv_change_show: Routes target_path through withOptionalTargetPathStore snapshot-only; readArtifacts returns empty disk documents for active changes.
- **[archive_only_evidence]** sources: change/artifacts.ts readArtifacts: Already Temporal-first then disk/archive fallback; fix is store selection only, not readback rewrite.
- **[archive_only_evidence]** sources: change.ts close + bulk_close: Use source store: getProjectId(store.paths.root), getChangeHandle, fireSignalAndRefresh(handle,store), recoverCompletedWorkflowClose({store}), sweepClosedChangesFromDisk(store.paths.changes). All source-coupled.
- **[archive_only_evidence]** sources: targetPathSchema.shape reuse: Spread of ...targetPathSchema.shape is established idiom for target_path/target_confirmed/confirmationEvidence on mutation tools.
- **[archive_only_evidence]** architecture_assessment: Draft design is a correct tool-layer-only fix matching established ADV cross-project patterns. Root cause confirmed structural: show routes target_path through snapshot-ok store; readArtifacts on disk-snapshot has empty documents for active changes. Close/bulk_close lack target_path and are hard-coupled to source projectId/store/paths. Fix leverages existing Temporal-first readArtifacts and fireSignalAndRefresh cache discipline. Refinements tighten store-selection, projectId sourcing, and schema reuse so avoidances hold structurally.
- **[agenda]** follow_ups: Implementation: in KD3 projectId derivation, ensure target_path calls use target context.projectId (from projectIdOverride), and pass activeStore (not source store) to fireSignalAndRefresh, recoverCompletedWorkflowClose, and removeChangeDir.
- **[agenda]** follow_ups: Tests (AC5/AC6): add an explicit case where an active target change's workflow is unreachable during adv_change_show artifact readback and assert fail-closed target-scoped error/warning with no scaffold substitution (KD2).
- **[archive_only_evidence]** sources: target-project.ts withTargetPathStore: temporal-required branch (311-334) creates target Temporal store with projectIdOverride + queue readiness; withOptionalTargetPathStore (383) hardcodes snapshot-ok. Confirms KD1/KD3/KD5 reuse points exist and the show-path root cause.
- **[archive_only_evidence]** sources: artifacts.ts readArtifacts: Temporal-first: single store.changes.get().documents query, then per-kind disk/archive fallback. Proves readArtifacts already returns real workflow content when given a Temporal-backed store — no rewrite needed (KD1).
- **[archive_only_evidence]** sources: change.ts show artifact branch: show wraps in withOptionalTargetPathStore (snapshot-only) and calls readArtifacts against that store, so target workflow documents are never queried — confirms design problem statement and SC1/AC1 gap.
- **[archive_only_evidence]** sources: change.ts close/bulk-close: close derives projectId from store.paths.root, getChangeHandle, fireSignalAndRefresh(handle,store), removeChangeDir(store.paths.changes), recoverCompletedWorkflowClose({store}); bulk-close resolves selection from source store.changes.list/get. All source-store-bound — confirms SC2/AC2/AC3/KD3/KD4 targets.
- **[archive_only_evidence]** sources: advance-workflow spec rq-crossProjectCoordination01: [MUST]: target_path tools derive target identity from the target repo, route mutation through target Temporal-backed store, never read ADV state files directly; untrusted mutation requires confirmation before any target state change. Design KD1-KD5 conform to this law.
- **[archive_only_evidence]** sources: Temporal TS message-passing docs: A Workflow acts like a stateful service; clients use Queries to read state and Signals to control execution. Confirms the query(read)/signal(mutate) boundary the design relies on is the canonical pattern.
- **[archive_only_evidence]** sources: Temporal WorkflowHandle + workflow determinism: WorkflowHandle targets exactly one workflow execution (deriving target handle from target project identity is correct); workflow code must be deterministic with I/O outside the replay path — design adds no workflow code and keeps disk cleanup in the tool layer, so no determinism risk.
- **[archive_only_evidence]** architecture_assessment: The design is a tool-layer routing correction, not a workflow redesign, and each decision is backed by repo code and the canonical Temporal read(query)/mutate(signal) model. Root cause is verified: adv_change_show routes artifact reads through withOptionalTargetPathStore (hardcoded snapshot-ok at target-project.ts:383), so readArtifacts — which IS already Temporal-first (artifacts.ts:169-180) — queries a disk snapshot store and never sees target workflow documents, producing scaffolds instead of real content (SC1/AC1). KD1 fixes this by routing the artifact-include branch through withTargetPathStore({stateRequirement:'temporal-required', mutation:false}) and reusing changes.get/loadProposalForContext/readArtifacts unchanged. close/bulk-close are verified source-store-bound (change.ts:1696 projectId from store.paths.root; :1703 getChangeHandle; :1712 fireSignalAndRefresh(handle,store); :1725 removeChangeDir; :1845 bulk selection from source store.changes.list/get), so KD3/KD4 correctly route identity, handle, signal, recovery, cleanup, and selection through the target store for target calls while leaving same-project behavior untouched. KD2 (fail-closed on unreachable active target workflow, no scaffold substitution, terminal archived/closed disk/archive fallback only when clearly identified) is consistent with the existing readArtifacts fallback ordering and with rq-crossProjectCoordination01.6 terminal-projection semantics. KD5 reuses existing primitives (withTargetPathStore, changes.get, changeCancelledSignal, fireSignalAndRefresh, recovery helpers) — no new Temporal primitives, satisfying the avoidance. Spec-law alignment holds: rq-crossProjectCoordination01 [MUST] requires target identity derivation and Temporal-backed routing with no direct state-file reads, which is exactly what the design implements. The mutation:!dryRun / mutation:false split for dry-run correctly reuses the documented target-store contract (target-project.ts:276-280 comment: dry-run may read Temporal-backed while non-mutating). One low-risk watch item: KD3 says derive projectId 'from context.projectId when available or activeStore.paths.root for same project' — for target calls the design must use the target context.projectId (target-project.ts sets context.projectId via projectIdOverride), never the source; the design text and KD4 already state this, so it is a naming-precision caution for implementation, not a design defect.
- **[unresolved_action]** required_main_agent_actions: Proceed with acceptance if orchestrator agrees with source-backed review evidence.
- **[unresolved_action]** required_main_agent_actions: Keep release/deployment/archive readiness for harden scope as requested.
- **[archive_only_evidence]** verification: tests_run=Path preflight: test -e plugin/src/tools/change.ts / change.test.ts / target-project.ts, bin/oc-test targeted -- src/tools/change.test.ts src/tools/cross-project-coordination.test.ts, git diff --check && git grep -n "fireSignal(handle" -- plugin/src/tools ':!plugin/src/tools/**/*.test.ts' ':!plugin/src/tools/*.test.ts' || true, pnpm run check results=pass — Path preflight OK for all referenced files. Targeted tests passed: 2 files, 101 tests. git diff --check clean; direct fireSignal(handle grep produced no matches. pnpm run check passed schemas:check, typecheck, test-isolation, lockfile policy, lint, and format:check.
- **[unresolved_action]** required_main_agent_actions: Before live tool validation or release use, run plugin build/deploy and restart OpenCode/plugin host as documented in AGENTS.md Source-vs-Dist Reload Gotcha.
- **[unresolved_action]** required_main_agent_actions: Proceed with release/archive flow if other harden scanners and gate evidence remain green.
- **[archive_only_evidence]** verification: tests_run=test -e 'plugin/src/tools/change.ts' && echo OK || echo MISSING, test -e 'plugin/src/tools/change.test.ts' && echo OK || echo MISSING, bin/oc-test targeted -- src/tools/change.test.ts src/tools/cross-project-coordination.test.ts, grep -rn "fireSignal(handle" plugin/src/tools/ | grep -v ".test.ts" | grep -v rq-cacheRefresh01-exempt || true, git diff --check origin/trunk...HEAD -- 'plugin/src/tools/change.ts' 'plugin/src/tools/change.test.ts', rg -n "TODO|FIXME|eslint-disable|@ts-ignore|as any|console\.log|process\.env|catch \{\}" 'plugin/src/tools/change.ts' 'plugin/src/tools/change.test.ts' || true, pnpm run check results=pass — Path preflight OK for both reviewed files. Targeted tests passed: 2 files, 101 tests. Cache-refresh direct fireSignal grep produced no matches. git diff --check produced no output. Scoped slop scan for TODO/FIXME/eslint-disable/@ts-ignore/as any/console.log/process.env/empty catch in reviewed files produced no output. pnpm run check passed: schemas:check, typecheck, test-isolation, lockfile policy, lint, format:check.
- **[agenda]** follow_ups: Add regression test: initRepo(trunk) with no local init.defaultBranch + simulated global init.defaultBranch=main must resolve source=local-trunk.
- **[agenda]** follow_ups: After fix, run full suite (bin/oc-test full) to confirm AC8; classify any residual red as unrelated with evidence before acceptance.
- **[archive_only_evidence]** sources: git-config official docs (--local read scope): Default read merges system+global+local config. --local restricts reads to repository .git/config only. Confirms `git config --local --get init.defaultBranch` excludes global ~/.gitconfig, which is the root cause of tests picking up global init.defaultBranch=main.
- **[archive_only_evidence]** sources: git/git Documentation/git-config.txt: --local for reading options: read only from repository .git/config rather than from all available files. Missing local key returns non-zero, enabling clean fallthrough to local main/trunk branch probing.
- **[archive_only_evidence]** sources: Spec rq-releaseFinalization01.7 / .8: Dirty default-branch checkpoint must continue to remote freshness/merge/push and record mainCheckpointCommitSha. Wrong-branch/missing-identity/in-progress/checkpoint-failure/merge-conflict blockers preserved. All keyed on the RESOLVED default branch, which detectDefaultBranch computes.
- **[archive_only_evidence]** sources: Current code + tests: detectDefaultBranch order: origin/HEAD → git config --get init.defaultBranch → refs/heads/{main,trunk}. initRepo uses `git init -b trunk` and sets NO local init.defaultBranch, so global default (main) wins step 2 → MAIN_BRANCH_MISMATCH → blocked. Existing unit test sets init.defaultBranch LOCALLY (no --global), so --local read preserves that assertion.
- **[archive_only_evidence]** architecture_assessment: The blocked MAIN_BRANCH_MISMATCH is a test-environment leak, not a real safety failure: detectDefaultBranch step 2 reads global git config, so a dev/CI machine with global init.defaultBranch=main forces resolution to `main` even when the repo was created on `trunk` and has no remote. The proposed change scopes that config read to --local (repository .git/config only). Behavior by tier: (1) origin/HEAD unchanged and still first — production repos with a remote are unaffected; (2) --local init.defaultBranch only matches when the repo itself set it, matching git's own per-repo semantics; (3) fallthrough to local main/trunk branch probing correctly resolves real single-branch repos. The fix is confined to resolution; verifyMainInvariants, the dirty-checkpoint path (rq-releaseFinalization01.7), and every unsafe-state blocker (rq-releaseFinalization01.8) are downstream and unchanged, so no release-safety expectation is weakened. Genuine wrong-branch situations still block because resolution yields the true default and the actual-vs-expected comparison is preserved. This is the boring, correct fix: it aligns the heuristic with git's documented scoping instead of adding test-only shims or env overrides (respects P33 structural-correctness and P35 architecture-over-hacks).
- **[wisdom_candidate]** wisdom_candidates: [success] Archive-finalization default branch detection should ignore global init.defaultBranch; repository-local config plus origin/HEAD/local-branch fallback gives deterministic release safety across user environments.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.test.ts, rg 'fireSignal\(handle' plugin/src/tools --glob '!*.test.ts' results=pass — Focused reviewer verification passed: change.test.ts 93 tests, git-finalize.test.ts 82 tests, total 175 passed. Cache-refresh direct fireSignal grep returned no matches. git diff --check produced no output. git status --short clean after review. Prompt SCOPE KEY reviewer:acceptance-expanded was represented by allowed durable reviewer scope review:acceptance due report schema constraint.
- **[unresolved_action]** required_main_agent_actions: Archive sign-off can use existing check/build/full-suite evidence plus this final targeted hardening pass.
- **[unresolved_action]** required_main_agent_actions: After merge, perform normal plugin build/deploy/restart before relying on live ADV tool behavior in an OpenCode session.
- **[wisdom_candidate]** wisdom_candidates: [convention] For bin/oc-test targeted from the repository root, pass test paths relative to plugin/ (for example src/tools/change.test.ts), because the wrapper executes Vitest with plugin/ as cwd.
- **[archive_only_evidence]** verification: tests_run=test -e plugin/src/tools/change.ts && test -e plugin/src/tools/change.test.ts && test -e plugin/src/tools/archive-helpers/git-finalize.ts && test -e plugin/src/tools/archive-helpers/git-finalize.test.ts, git status --short && git diff --check, grep -rn "fireSignal(handle" plugin/src/tools/ | grep -v ".test.ts" | grep -v rq-cacheRefresh01-exempt || true, bin/oc-test targeted -- src/tools/change.test.ts src/tools/archive-helpers/git-finalize.test.ts results=pass — Path preflight OK. Worktree clean and git diff --check clean. Cache-refresh grep returned no non-test direct fireSignal(handle occurrences. Targeted release-hardening tests passed: change.test.ts 93 tests, git-finalize.test.ts 82 tests, total 175 passed. Packet evidence also reports pnpm run check passed, pnpm run build passed, bin/oc-test full passed (tr_mr7z02p3_1997709b), target-path tests passed 101, archive-finalize tests passed 82.

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
| DONT8 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts src/tools/cross-project-coordination.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.test.ts -t "target_path routing"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change.test.ts -t "adv_change_close"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/change*.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm run lint
- verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts -t "target_path routing"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts -t "target_path routing"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts -t "adv_change_bulk_close"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- Proceed with acceptance if orchestrator agrees with source-backed review evidence.
- Keep release/deployment/archive readiness for harden scope as requested.
- Before live tool validation or release use, run plugin build/deploy and restart OpenCode/plugin host as documented in AGENTS.md Source-vs-Dist Reload Gotcha.
- Proceed with release/archive flow if other harden scanners and gate evidence remain green.
- Archive sign-off can use existing check/build/full-suite evidence plus this final targeted hardening pass.
- After merge, perform normal plugin build/deploy/restart before relying on live ADV tool behavior in an OpenCode session.
