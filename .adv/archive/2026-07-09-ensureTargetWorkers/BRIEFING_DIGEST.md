# Archive Briefing Digest

**Change ID:** ensureTargetWorkers
**Title:** Ensure target workers
**Status:** archived
**Generated:** 2026-07-25T19:31:20.024Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #205

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
| release | done |

## Epic Context

No Epic membership

## Durable Facts

Showing 47 of 47 durable facts.

- **[archive_only_evidence]** decisions: Placed rq-targetWorkerLifecycle01 in advance-meta spec — The requirement governs cross-project Temporal worker lifecycle, lock semantics, and serviceability verification, which are meta/worker infrastructure concerns.
- **[archive_only_evidence]** decisions: Placed rq-targetReadAuthority01 in advance-workflow spec — The requirement governs the authority boundary of snapshot-ok cross-project reads versus temporal-required mutations, which is part of the workflow cross-project coordination surface.
- **[archive_only_evidence]** decisions: Reclassified adv_temporal_worker_restart as temporal-required in the target_path matrix — A target-aware worker restart/ensure is a mutating operation that must route through the target project's Temporal queue, matching the temporal-required category.
- **[archive_only_evidence]** verification: node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('.adv/specs/advance-meta/spec.json')); const w=JSON.parse(fs.readFileSync('.adv/specs/advance-workflow/spec.json')); const ids=[...m.requirements.map(r=>r.id),...w.requirements.map(r=>r.id)]; ['rq-targetWorkerLifecycle01','rq-targetReadAuthority01'].forEach(id=>{if(!ids.includes(id)) throw new Error('missing '+id)}); console.log('OK spec IDs');" && node -e "const fs=require('fs'),path=require('path'); const dir='.adv/specs'; let ok=0; fs.readdirSync(dir).forEach(cap=>{ const f=path.join(dir,cap,'spec.json'); if(fs.existsSync(f)){ JSON.parse(fs.readFileSync(f)); ok++; }}); console.log('parsed',ok,'spec files');" && grep -q 'rq-targetWorkerLifecycle01' docs/specs/advance-meta.md && grep -q 'rq-targetReadAuthority01' docs/specs/advance-workflow.md && echo 'OK docs mirrors' (0) — All 21 spec JSON files parse; both rq-targetWorkerLifecycle01 and rq-targetReadAuthority01 exist in spec JSON and their docs/specs mirrors.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('.adv/specs/advance-meta/spec.json')); const w=JSON.parse(fs.readFileSync('.adv/specs/advance-workflow/spec.json')); const ids=[...m.requirements.map(r=>r.id),...w.requirements.map(r=>r.id)]; ['rq-targetWorkerLifecycle01','rq-targetReadAuthority01'].forEach(id=>{if(!ids.includes(id)) throw new Error('missing '+id)}); console.log('OK spec IDs');" && node -e "const fs=require('fs'),path=require('path'); const dir='.adv/specs'; let ok=0; fs.readdirSync(dir).forEach(cap=>{ const f=path.join(dir,cap,'spec.json'); if(fs.existsSync(f)){ JSON.parse(fs.readFileSync(f)); ok++; }}); console.log('parsed',ok,'spec files');" && grep -q 'rq-targetWorkerLifecycle01' docs/specs/advance-meta.md && grep -q 'rq-targetReadAuthority01' docs/specs/advance-workflow.md && echo 'OK docs mirrors'
- **[report_follow_up]** follow_ups: Next task (tk-1fa6281f46f2) should remove the NotImplemented guard and implement target project trust resolution + bounded serviceability verification for adv_temporal_worker_restart target_path.
- **[archive_only_evidence]** decisions: Spread targetPathSchema.shape into adv_temporal_worker_restart args — Reuses the canonical target_path/target_confirmed/confirmationEvidence schema and descriptions already used by other cross-project tools.
- **[archive_only_evidence]** decisions: Return NotImplemented when target_path is present — The current task owns only the tool contract/preflight; target execution is the next task. The guard prevents accidental current-project restart and preserves current-project compatibility when target_path is absent.
- **[archive_only_evidence]** decisions: Add target_path, target_confirmed, and confirmationEvidence blank:omit policies for adv_temporal_worker_restart while keeping approvalEvidence blank:reject — Matches the existing target-mutation preflight pattern and keeps lock-reclaim approval evidence as a required-when-present audit field.
- **[archive_only_evidence]** decisions: Bump docs/specs/advance-meta.md version header from 1.21.0 to 1.22.0 — deploy-local.test.ts failed because the advance-meta spec.json was already at 1.22.0 while the markdown mirror header was stale; a focused campsite fix keeps the repository test suite green.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, and format:check all pass
- **[archive_only_evidence]** verification: pnpm vitest run src/utils/tool-arg-preflight.test.ts src/tool-registry.surface.test.ts src/tools/temporal-ops.test.ts src/deploy-local.test.ts src/tool-registry.test.ts src/adv-instructions-assets.test.ts src/adv-temporal-repair-assets.test.ts src/cli-bridge-contract.test.ts (0) — 284 targeted tests pass across tool surface, preflight, temporal ops, and related asset tests
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/utils/tool-arg-preflight.test.ts src/tool-registry.surface.test.ts src/tools/temporal-ops.test.ts src/deploy-local.test.ts src/tool-registry.test.ts src/adv-instructions-assets.test.ts src/adv-temporal-repair-assets.test.ts src/cli-bridge-contract.test.ts
- **[report_follow_up]** follow_ups: Disk-snapshot read authority metadata (AC5/AC6/DONT2/DONT3) is intentionally out of scope for this task and remains for the following task before acceptance gate can complete.
- **[archive_only_evidence]** decisions: Resolved target trust/context directly with resolveTargetProject({ mutation:true, ... }) rather than withTargetPathStore. — Task contract explicitly forbids calling withTargetPathStore(... temporal-required) before repair and requires deriving target project ID/root/external root from the target.
- **[archive_only_evidence]** decisions: Used cheap ensureProjectTemporalQueue when STSL is initialized and local worker is alive; otherwise fall back to full restartCurrentProjectTemporalWorker(targetContext.root, ...). — Matches the requested lifecycle seams and avoids unnecessary worker drain when the local process can already poll the target queue.
- **[archive_only_evidence]** decisions: After a full target restart drains local queues, re-register the source project queue with ensureProjectTemporalQueue and verify both target and source serviceability before success. — Satisfies source-queue preservation requirement (KD6/DDC7) and fails closed if the source queue cannot be restored or verified.
- **[archive_only_evidence]** decisions: Used localOwnership: 'owned' for source queue verification after local restoration. — The queue was explicitly restored onto the local worker, so local-owned serviceability is the appropriate signal.
- **[archive_only_evidence]** verification: cd plugin && pnpm test src/tools/temporal-ops.test.ts (0) — 19 targeted tests pass (target root, trust, cheap ensure, full restart fallback, serviceability failure envelope, lock approval, source preservation, current-project compatibility).
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, check-test-isolation, check-lockfile-policy, lint, and format:check all green.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm test src/tools/temporal-ops.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- **[archive_only_evidence]** decisions: Added authority field only for stateMode='disk-snapshot' — Preserves backward compatibility for current/temporal/scaffold output contexts and makes the non-authoritative signal explicit exactly where the snapshot-ok path produces it.
- **[archive_only_evidence]** decisions: Merged the non-authoritative warning with the existing untrusted warning for disk-snapshot untrusted reads — Keeps the existing untrusted confirmation requirement while surfacing the degraded authority, satisfying both AC5/AC6 semantics and the existing warning contract.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/target-project.test.ts (0) — 22 target-project tests passed, including new disk-snapshot authority/warning tests and lifecycle assertions.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, and format:check all passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/target-project.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[report_follow_up]** follow_ups: Confirm with user whether ensureTargetWorkers scope includes lightweight IPC queue-registration ('ensure') or only full target worker restart.
- **[report_follow_up]** follow_ups: FIELD_POLICIES: add adv_temporal_worker_restart target_path/target_confirmed/confirmationEvidence blank:omit entries (preflight test at tool-arg-preflight.test.ts:1577 must extend).
- **[research_citation]** sources: plugin/src/plugin-init.ts:462-476 ensureProjectTemporalQueue: Existing helper registers a target project's task queue onto the already-running in-process worker via worker.registerQueue(queue) (IPC), instead of spawning a new worker process. Direct leverage for 'ensure target worker' without a full restart. (plugin/src/plugin-init.ts:462)
- **[research_citation]** sources: plugin/src/temporal/out-of-process-worker.ts:61-62 + worker-multi.ts:461 registerQueue: registerQueue sends an IPC register message to the existing worker child rather than spawning a new child; tests (out-of-process-worker.test.ts:193) confirm 'sends IPC message instead of spawning new child'. (plugin/src/temporal/out-of-process-worker.ts:61)
- **[research_citation]** sources: plugin/src/tools/temporal-ops.ts:498-553 adv_temporal_reconnect target_path pattern: Reference implementation of target_path/target_confirmed/confirmationEvidence on a temporal-ops tool: wraps runReconnect in withTargetPathStore(stateRequirement:'temporal-required') and appends formatTargetProjectContext(context) as _projectContext. (plugin/src/tools/temporal-ops.ts:538)
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Design is sound and low-blast-radius: extend the existing adv_temporal_worker_restart tool (do not add a new tool), mirroring the already-shipped adv_temporal_reconnect target_path seam. Two contract-tied leverage points strengthen it. (1) ensureProjectTemporalQueue()/registerQueue() already exists and registers a target queue onto the driving session's live worker via IPC — 'ensure target worker' can be an IPC queue-registration on the existing worker rather than always spawning/restarting a separate target worker process; this is the boring, proven, lower-risk path and directly serves the SC 'unblock cross-project Temporal ops from driving session'. (2) A real design tension: the reconnect reference uses stateRequirement:'temporal-required', which routes through ensureTargetMutationQueueReady and THROWS when the target queue is not serviceable (target-project.ts:264). Restart's whole precondition is an unserviceable queue, so restart MUST NOT reuse the temporal-required store gate for its own precondition check — it should resolve trust via resolveTargetProject (mutation:true) directly, then ensure/register/restart, then verify serviceability post-hoc (as the current-project path already does via waitForRestartServiceability). formatTargetProjectContext must gain unconditional disk_snapshot_non_authoritative authority metadata for snapshot-ok reads, consistent with the worker-free/fail-closed spec precedent.
- **[report_follow_up]** follow_ups: Add planning task + AC/test: after adv_temporal_worker_restart target full-restart, the driving (source) project queue remains serviceable (re-register via ensureProjectTemporalQueue(sourceProjectId) or prove auto-recovery). Ties to plugin-init.ts:619,633.
- **[report_follow_up]** follow_ups: Confirm FIELD_POLICIES.adv_temporal_worker_restart adds target_path/target_confirmed/confirmationEvidence blank:omit and extends preflight test at tool-arg-preflight.ts:1577 (design step 2 already scopes this).
- **[report_follow_up]** follow_ups: Traceability note: AC1/AC2 presume adv_temporal_worker_restart#target_path (built by this change) with no declared [warrant:] tag — compliant under rq-acWarrant01 proportionality; no action needed.
- **[research_citation]** sources: plugin/src/plugin-init.ts:601-651 restartCurrentProjectTemporalWorker: Derives projectId from the passed projectDir and creates a worker with queues:[buildProjectTaskQueue(projectId)]. Passing context.root (target root) therefore produces a worker polling advance-<targetProjectId>. Confirms KD2/KD4 identity seam is valid. BUT drainInProcessTemporalWorkers() (line 619) drains ALL in-process workers and the new worker registers ONLY [targetQueue] — the driving session's own queue is dropped on full restart. (plugin/src/plugin-init.ts:601)
- **[research_citation]** sources: plugin/src/plugin-init.ts:462-476 ensureProjectTemporalQueue: Registers a target queue onto the already-running in-process worker via worker.registerQueue(queue); throws if no worker registered. Confirms KD4 cheap ensure path exists and is additive (does not drop existing queues). registerQueue is idempotent (out-of-process-worker.test.ts:218). (plugin/src/plugin-init.ts:462)
- **[research_citation]** sources: plugin/src/tools/target-project.ts:218-335 ensureTargetMutationQueueReady / withTargetPathStore: temporal-required store path throws TargetProjectError when the target queue is NOT serviceable (line 265). Restart's precondition IS unserviceable, so KD2 (resolveTargetProject direct, not withTargetPathStore temporal-required) is correct — reusing the temporal-required gate would reject exactly the case restart must repair. (plugin/src/tools/target-project.ts:264)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Design is correct, boring, and spec-law compliant. All four dimensions verified against source and specs. CORRECTNESS: the identity seam is sound — restartCurrentProjectTemporalWorker(context.root) derives target projectId and creates a worker polling advance-<targetProjectId> (plugin-init.ts:605,611,633); ensureProjectTemporalQueue registers the target queue on the live worker via idempotent registerQueue; success gated on fresh waitForRestartServiceability proof (KD5/DDC2). KD2 correctly avoids withTargetPathStore(temporal-required) whose ensureTargetMutationQueueReady throws on the exact unserviceable precondition restart must repair (target-project.ts:265). SIMPLICITY: extends one existing tool that already owns lock/approval/bounded-verification (KD1), mirrors the shipped adv_temporal_reconnect target seam, and prefers cheap IPC queue-registration before full restart (KD4). No new tool, no new lifecycle surface. SPEC-LAW: complies with freshness-not-cached law (2170-2206), target-external-root law (2293-2338), warrant proportionality (1479-1518, no undeclared-warrant failure), and worker-free/disk-non-authoritative precedent (meta 381-477). One genuine correctness caution, not a blocker: the full-restart fallback drains ALL in-process workers (plugin-init.ts:619) and recreates a single worker with queues:[targetQueue] only — the driving session's OWN queue is dropped and not re-registered by the design. Because ensure-first (KD4) is preferred and the source queue can re-register on next use via ensureProjectTemporalQueue, blast radius is bounded, but this is a latent regression to the driving session's worker that the design should explicitly handle (re-register source queue after target restart, or document/verify auto-recovery). Recommend adding an AC/test asserting the source (driving) project queue remains serviceable after a target full-restart.
- **[unresolved_action]** required_main_agent_actions: Stop before acceptance prompt. Ask user to deploy/restart OpenCode or open a fresh session after deploy, then resume ensureTargetWorkers for acceptance.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Acceptance for Advance plugin changes that add MCP tool args must account for OpenCode's startup-time tool registration cache; source tests/build are not enough to prove live tool callability in the current session.
- **[archive_only_evidence]** verification: tests_run=adv_run_test tr_mrczefv2_026bf20e: bin/oc-test targeted -- temporal-ops/target-project/preflight/surface/assets suite (312 tests) passed, adv_run_test tr_mrczf9sq_2b4f1434: pnpm run check passed, adv_run_test tr_mrczfrni_686f2467: pnpm run build passed, Inline source review of plugin/src/tools/temporal-ops.ts, plugin/src/tools/target-project.ts, plugin/src/utils/tool-arg-preflight.ts and focused tests results=pass — Implementation evidence passes, but acceptance is blocked by live-session tool registration cache for the newly added MCP args.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
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
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('.adv/specs/advance-meta/spec.json')); const w=JSON.parse(fs.readFileSync('.adv/specs/advance-workflow/spec.json')); const ids=[...m.requirements.map(r=>r.id),...w.requirements.map(r=>r.id)]; ['rq-targetWorkerLifecycle01','rq-targetReadAuthority01'].forEach(id=>{if(!ids.includes(id)) throw new Error('missing '+id)}); console.log('OK spec IDs');" && node -e "const fs=require('fs'),path=require('path'); const dir='.adv/specs'; let ok=0; fs.readdirSync(dir).forEach(cap=>{ const f=path.join(dir,cap,'spec.json'); if(fs.existsSync(f)){ JSON.parse(fs.readFileSync(f)); ok++; }}); console.log('parsed',ok,'spec files');" && grep -q 'rq-targetWorkerLifecycle01' docs/specs/advance-meta.md && grep -q 'rq-targetReadAuthority01' docs/specs/advance-workflow.md && echo 'OK docs mirrors'
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/utils/tool-arg-preflight.test.ts src/tool-registry.surface.test.ts src/tools/temporal-ops.test.ts src/deploy-local.test.ts src/tool-registry.test.ts src/adv-instructions-assets.test.ts src/adv-temporal-repair-assets.test.ts src/cli-bridge-contract.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm test src/tools/temporal-ops.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/target-project.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- Stop before acceptance prompt. Ask user to deploy/restart OpenCode or open a fresh session after deploy, then resume ensureTargetWorkers for acceptance.
