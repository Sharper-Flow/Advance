# Design — advStabilityHardening

## Architecture Overview

Three additive guards, each mirroring an existing battle-tested precedent in the codebase. No new architectural concepts; no schema changes; no Temporal workflow signature changes. Two of three guards are unflagged or default-on (their off-path is the bug we are fixing or pure cargo-cult). One guard (worktree mutation) keeps a flag for risk reasons during canary period.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Plugin init                                                        │
│                                                                     │
│   plugin-init.ts:138 ──[was]── shouldSpawnWorker = true            │
│                       ──[is]──→ acquireWorkerLock (v2 w/ heartbeat) │
│                                  ├─ owned: true  → spawn worker     │
│                                  ├─ owned: false → client-only mode │
│                                  └─ stale       → reclaim & retry   │
│                                                                     │
│   Flag: worker_singleton_enforce (DEFAULT TRUE; escape hatch only)  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Tool mutation surface                                              │
│                                                                     │
│   adv_gate_complete ──┐                                             │
│   adv_task_add     ──┼──→ checkWorktreeIsolation(cwd)              │
│   adv_task_update  ──┘     ├─ ok      → proceed                    │
│      (mutation modes)        └─ BLOCK   → structured refusal       │
│                                                                     │
│   Flag: worktree_guard_enforce (DEFAULT FALSE for one release;      │
│         canary opt-in on this repo + example-web from day 0;       │
│         flip default to TRUE in next minor release)                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Status / diagnostic surface                                        │
│                                                                     │
│   adv_status view: health                                           │
│       ├─ getTemporalHealth        ─┐                                │
│       ├─ probeTaskQueuePollers     ├─→ probeCache.fetch(key,signal) │
│       └─ getTemporalWorkerDiagnostics  └─ TTL + SWR + coalescing    │
│                                          (lru-cache)                │
│                                                                     │
│   NO FLAG — always on. Failure mode falls through to direct probe. │
└─────────────────────────────────────────────────────────────────────┘
```

## Rollout philosophy

| Component | Flag exists? | Default | Verification signal | Canary opt-in? |
|---|---|---|---|---|
| Worker singleton | `worker_singleton_enforce` | `true` | `worker_role: host/client` in `adv_status`; `ps` shows 1 worker per project | n/a — on by default |
| Worktree guard | `worktree_guard_enforce` | `false` (one release) | `errorClass: WorktreeIsolationViolation` on `adv_gate_complete` from main checkout | YES — this repo + `example-web` from day 0 |
| Probe cache | none (no flag) | always on | `_freshness.cached_at` in `view: health` output; p95 latency drop | n/a — always on |

### Rationale

1. **Worker singleton — flag stays as escape hatch, default on.** `rq-workerSingleton01` is an existing spec the implementation drifted from. Wiring it up is bug-fixing. The lock primitive is battle-tested in `git-worktree-flock.ts`. Flag default-off would hide the verification signal in the only environments where the bug bites. `ADV_FORCE_IN_PROCESS_WORKER` remains the more-aggressive escape; this flag is the gentler one.

2. **Worktree guard — flag default off for one release, canary opt-in immediate.** Only guard that BLOCKS calls succeeding today. Operators with in-flight changes in main checkout will hit refusals. Mitigated by project-scoped opt-in on the two canary projects from this change's archive day.

3. **Probe cache — no flag at all.** Failure mode is functionally identical to current code (cache miss → direct probe). Hiding it behind a flag means maintaining two code paths forever to mitigate a risk class that does not exist.

## Component 1 — Worker Singleton (AC-1, AC-5)

### Existing machinery (re-use as-is)

| File | Role | Reuse |
|---|---|---|
| `plugin/src/temporal/worker-lock.ts` | O_EXCL lock acquire, contents schema, release | Extend to v2 schema only |
| `plugin/src/utils/git-worktree-flock.ts` | Battle-tested wrapper used for git ops | Pattern reference, no change |
| `plugin/src/tools/temporal-ops.ts:103-113` | `classifySuspectWorkerLock` already implements `suspect_live_legacy_lock` for v1 — currently returns `undefined` for v2 (latent bug per validator finding) | Extend for v2 suspect case as part of this change |

### Changes

| File | Change | LOC est. |
|---|---|---|
| `plugin/src/temporal/worker-lock.ts` | Add `schema_version: 2` branch with `last_heartbeat` field; widen `WorkerLockContents` union type; backward-compatible read of v1; add `tryReclaimStaleLock()` for ESRCH + stale-heartbeat | +60 |
| `plugin/src/temporal/worker-heartbeat.ts` (new) | Heartbeat writer: setInterval renewer at 10s cadence, JSON atomic-rewrite of `last_heartbeat` field; self-expiry hook per `rq-workerSingleton01.8`; `timer.unref()` to not pin process | +80 |
| `plugin/src/plugin-init.ts:138-142` | Replace `const shouldSpawnWorker = true` with lock-acquire branch gated by `worker_singleton_enforce` flag (DEFAULT TRUE) | +30 |
| `plugin/src/plugin-init.ts` `getTemporalWorkerDiagnostics()` (line ~282) | Add `worker_role: "host" \| "client" \| "degraded"` to return shape | +10 |
| `plugin/src/tools/status.ts` `view: "health"` output | Surface `worker_role` from diagnostics | +5 |
| `plugin/src/tools/temporal-ops.ts:103-113` `classifySuspectWorkerLock` | Extend to classify v2 alive-PID + unserviceable as `suspect_live_unserviceable_lock` per `rq-workerSingleton01.7` (currently `undefined` — latent bug fix) | +15 |

### Implementation sketch (plugin-init.ts)

```ts
// Was:
const shouldSpawnWorker = true;

// Is:
const flagOn = readFeatureFlag(projectId, "worker_singleton_enforce", true /* default */);
const forceInProcess = process.env.ADV_FORCE_IN_PROCESS_WORKER === "1";
let workerRole: WorkerRole;
let shouldSpawnWorker: boolean;

if (forceInProcess || !flagOn) {
  // Escape hatches: ADV_FORCE_IN_PROCESS_WORKER per rq-workerSingleton01.4,
  // or operator explicitly set worker_singleton_enforce: false in project.json.
  shouldSpawnWorker = true;
  workerRole = "host"; // best-effort label; lock not acquired in escape path
} else {
  const lockResult = await tryAcquireWorkerLockWithReclaim(projectStateDir, {
    expected_queue: expectedQueue,
    schema_version: 2,
  });
  shouldSpawnWorker = lockResult.owned;
  workerRole = lockResult.owned ? "host" : "client";
  profilePluginInit("worker_lock_resolved", {
    owned: lockResult.owned,
    role: workerRole,
    ownerPid: lockResult.owned ? process.pid : (lockResult as any).ownerPid,
  });
}
```

Where `tryAcquireWorkerLockWithReclaim` is a new helper that:
1. Calls `acquireWorkerLock` (existing).
2. If `owned: false`, reads existing lock contents.
3. If lock's PID is dead (`process.kill(pid, 0)` ESRCH) → `releaseWorkerLock` + retry once (per `rq-workerSingleton01.3`).
4. If lock's `last_heartbeat` is older than `STALE_HEARTBEAT_GRACE_MS` (default 60s, env-tunable) → release + retry once (per `rq-workerSingleton01.5`).
5. Otherwise return `owned: false` for client-only mode. **Satisfies `rq-workerSingleton01.6` and `.7`: alive PID + serviceability-not-verified (v1) OR alive PID + fresh-heartbeat + unserviceable queue (v2) → no automatic reclaim from the init path; session participates as client. Manual recovery via `adv_temporal_diagnose` / `adv_temporal_worker_restart` which surface `suspect_live_legacy_lock` / `suspect_live_unserviceable_lock` classifications and require explicit user approval evidence to reclaim.**

`workerRole = "degraded"` is set in a post-init health probe if neither `owned: true` nor a serviceable peer worker is detected for the project queue.

### Heartbeat lifecycle

- Owner starts heartbeat timer on lock acquire success.
- Timer cadence: 10s (1/6 of stale grace, gives 5 missed beats before reclaim eligible).
- Atomic rewrite: write to `worker.lock.tmp`, `fs.renameSync` over `worker.lock`.
- Self-expiry per `rq-workerSingleton01.8`: if local worker reports unserviceable past `SERVICEABILITY_GRACE_MS` (default 90s), STOP renewing — let v2 lock age out naturally.
- `timer.unref()` so the heartbeat never pins the OpenCode process at exit.
- Cleanup on SIGINT/SIGTERM: existing shutdown bounded-flush path (`rq-advshut1.1`) releases the lock.

### Feature flag

`feature_flags.worker_singleton_enforce` — **default `true`**.

When explicitly set `false` in `project.json`: existing `shouldSpawnWorker = true` behavior preserved. No lock acquire. Escape hatch for WSL2/NFS O_EXCL edge cases. `ADV_FORCE_IN_PROCESS_WORKER` is the more-aggressive escape (skips out-of-process worker entirely per `rq-workerSingleton01.4`); this flag is the gentler one (keeps out-of-process worker, just allows multiple per project).

## Component 2 — Worktree Isolation Guard (AC-2)

### Existing machinery (re-use as-is)

| File | Role | Reuse |
|---|---|---|
| `plugin/src/tools/trunk-write-firewall.ts` | ALLOW/BLOCK pattern, `getDefaultBranch`, `getWorktreePaths`, `getProjectRoot`, `getRepoState` deps | Shape mirror |
| `plugin/src/index.ts:245-272` `resolveGitSessionContext` | `--git-common-dir` vs `--show-toplevel` worktree detection | Extract & reuse |

### Changes

| File | Change | LOC est. |
|---|---|---|
| `plugin/src/utils/git-session.ts` (new) | Extract `resolveGitSessionContext` from `index.ts`; export shared util; index.ts becomes a re-export passthrough | +40 (mostly move) |
| `plugin/src/tools/worktree-isolation-guard.ts` (new) | `checkWorktreeIsolation(cwd, deps) → { decision, reason?, mainCheckoutPath? }` mirroring `checkTrunkWrite` shape | +90 |
| `plugin/src/tools/gate.ts:405` | Insert guard check after sequence enforcement, before signal fire; skip when `gateId === 'proposal'` | +25 |
| `plugin/src/tools/task.ts` `adv_task_add` execute | Insert guard check at entry | +15 |
| `plugin/src/tools/task.ts` `adv_task_update` execute | Insert guard check when `status` transitions to mutating value (`in_progress`, `done`, `cancelled`) | +20 |
| `plugin/src/tools/apply-helpers/pre-rebase.ts:245-252` | Fix `defaultIsWorktree`: replace `git rev-parse --git-dir` existence with `--git-common-dir` vs `--show-toplevel` comparison | +10 (drive-by) |
| `oc-plugins/advance/project.json` | Set `feature_flags.worktree_guard_enforce: true` (self-canary) | +1 |
| `example-web/project.json` | Set `feature_flags.worktree_guard_enforce: true` — operator-side step documented in archive notes (cross-project; not modified in this change) | docs only |

### Guard shape

```ts
// plugin/src/tools/worktree-isolation-guard.ts
export type WorktreeIsolationDecision = "ALLOW" | "BLOCK";

export interface WorktreeIsolationResult {
  decision: WorktreeIsolationDecision;
  reason?: string;
  mainCheckoutPath?: string;
  remediation?: string;
}

export interface WorktreeIsolationDeps {
  getSessionContext: (cwd: string) => GitSessionContext; // from utils/git-session.ts
  getProjectRoot: () => string;
}

export function checkWorktreeIsolation(
  cwd: string,
  deps: WorktreeIsolationDeps,
): WorktreeIsolationResult {
  const ctx = deps.getSessionContext(cwd);
  if (!ctx.isMainCheckout) {
    return { decision: "ALLOW" };
  }
  return {
    decision: "BLOCK",
    reason: `Worktree isolation: ADV mutating operations require a worktree, not the main checkout (${ctx.mainCheckoutPath}).`,
    mainCheckoutPath: ctx.mainCheckoutPath,
    remediation: "Create or resume an ADV worktree (adv_worktree_create / adv_worktree_resume) and retry from inside the worktree.",
  };
}
```

### Gate hook (gate.ts, after line 502 sequence check)

```ts
// Insert after canCompleteGate check, before handlePlanningGateCompletion etc.
if (gateId !== "proposal" && readFeatureFlag(projectId, "worktree_guard_enforce", false)) {
  const isolation = checkWorktreeIsolation(process.cwd(), {
    getSessionContext: resolveGitSessionContext,
    getProjectRoot: () => activeStore.paths.root,
  });
  if (isolation.decision === "BLOCK") {
    return formatToolOutput({
      error: isolation.reason,
      errorClass: "WorktreeIsolationViolation",
      changeId,
      gateId,
      mainCheckoutPath: isolation.mainCheckoutPath,
      remediation: isolation.remediation,
    });
  }
}
```

### Task hooks (task.ts)

Same shape on `adv_task_add` and `adv_task_update` when status ∈ {`in_progress`, `done`, `cancelled`}. `pending` → `pending` (annotation-only) and read-only field changes (`notes`, `implementation_summary` without status change) are allowed in main checkout (non-mutating to repo files).

### Feature flag

`feature_flags.worktree_guard_enforce` — **default `false` for first release**, flip to `true` after one minor release of clean canary.

### `defaultIsWorktree` bug fix (drive-by)

Current `pre-rebase.ts:245-252` returns `true` whenever `git rev-parse --git-dir` succeeds — that's "git repo exists," not "worktree." Replace with `--git-common-dir` vs `--show-toplevel` comparison (same as `resolveGitSessionContext`). Could be replaced entirely by importing the shared util; will be in implementation.

## Component 3 — Status Probe TTL Cache (AC-3, AC-5)

### Existing machinery

| File | Role | Reuse |
|---|---|---|
| `plugin/src/tools/status.ts:107-110` `healthSnapshotCache` (Map+TTL) | Existing partial cache (only covers `computeHealthSnapshot`) | Migrate onto `lru-cache` |
| `plugin/src/temporal/health-probe.ts` `getTemporalHealth` | Probe target (250ms TCP timeout already in place) | Wrap |
| `plugin/src/temporal/queue-serviceability.ts:152` `probeTaskQueuePollers` | gRPC `DescribeTaskQueue` probe | Wrap |
| `plugin/src/plugin-init.ts:282` `getTemporalWorkerDiagnostics` | In-memory PID/queue read | Wrap (cheap but coalesce concurrent callers) |

### Changes

| File | Change | LOC est. |
|---|---|---|
| `plugin/package.json` | Add `"lru-cache": "^11.0.0"` (latest stable, zero transitive deps) | +1 |
| `plugin/src/tools/probe-cache.ts` (new) | `createProbeCache<T>(name, ttl, fetchFn)` factory returning typed `LRUCache.fetch` wrapper with `cached_at`/`stale`/`error` metadata | +110 |
| `plugin/src/tools/status.ts` | Replace direct probe calls with cache-wrapped fetches; surface freshness metadata in `view: "health"` output | +60 |
| `plugin/src/tools/temporal-ops.ts:125-133` | Wrap same probes for `adv_temporal_diagnose` / restart paths | +20 |

### Probe cache shape

```ts
// plugin/src/tools/probe-cache.ts
import { LRUCache } from "lru-cache";

export interface ProbeResult<T> {
  value: T;
  cached_at: number;       // epoch ms
  stale: boolean;
  error?: string;
}

export interface ProbeCacheOptions<T> {
  name: string;
  ttlMs: number;
  fetchMethod: (key: string, signal: AbortSignal) => Promise<T>;
  abortTimeoutMs?: number; // bounded wait before returning stale (default 2000)
}

export function createProbeCache<T>(opts: ProbeCacheOptions<T>) {
  const cache = new LRUCache<string, ProbeResult<T>>({
    max: 50,
    ttl: opts.ttlMs,
    allowStale: true,
    allowStaleOnFetchRejection: true,
    allowStaleOnFetchAbort: true,
    ignoreFetchAbort: true,
    fetchMethod: async (key, _staleValue, ctx) => {
      try {
        const value = await opts.fetchMethod(key, ctx.signal);
        return { value, cached_at: Date.now(), stale: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (_staleValue) {
          return { ..._staleValue, stale: true, error: msg };
        }
        throw err;
      }
    },
  });
  return {
    async get(key: string): Promise<ProbeResult<T>> {
      const result = await cache.fetch(key, {
        signal: AbortSignal.timeout(opts.abortTimeoutMs ?? 2000),
      });
      if (!result) throw new Error(`Probe cache returned no value for ${key}`);
      return result;
    },
    invalidate(key: string) { cache.delete(key); },
    _cache: cache, // test-only escape hatch
  };
}
```

### Per-probe configuration

| Probe | Cache key shape | TTL | Abort timeout |
|---|---|---|---|
| `getTemporalHealth(projectId)` | `temporal:health:${projectId}` | 30000 | 2000 |
| `probeTaskQueuePollers({namespace, taskQueue})` | `temporal:pollers:${namespace}:${taskQueue}` | 30000 | 3000 |
| `getTemporalWorkerDiagnostics()` | `temporal:diag:${projectId}` | 5000 | 500 |
| `checkAdvSearchAttributes()` | `temporal:sa:${projectId}` | 300000 | 1000 |
| `computeHealthSnapshot(store)` (existing) | `health:snapshot:${cacheKey}` | 30000 | (kept synchronous) |

### Status output extension

`view: "health"` adds `_freshness: { cached_at: number, stale: boolean, error?: string }` per cached probe section. Additive — existing consumers see unchanged top-level fields.

### No feature flag

Probe cache is always on. Failure mode (cache miss, probe throws) is functionally identical to current code path. Adding a flag would maintain two code paths forever to mitigate a non-existent regression class.

## Spec Deltas

### Delta 1 — `.adv/specs/advance-meta/spec.json`

Add new requirement `rq-statusProbeCache01`:

```jsonc
{
  "id": "rq-statusProbeCache01",
  "title": "TTL+SWR cache for ADV health probes with request coalescing",
  "body": "adv_status view: health and related diagnostic surfaces (adv_temporal_diagnose) MUST use a per-probe TTL cache (lru-cache.fetch) for Temporal server-alive, queue serviceability, worker diagnostics, and search-attribute health. Concurrent peer-session calls for the same cache key MUST share one in-flight fetch (request coalescing). Each cached probe value returned MUST carry cached_at, stale, and optional error metadata. When the underlying probe times out under AbortSignal.timeout(), the stale value MUST be returned immediately with stale: true and refresh MUST continue in background. When the probe rejects, the last-known-good value MUST be returned with stale: true and error attached. Genuinely unhealthy state MUST surface at most TTL seconds late.",
  "priority": "must",
  "tags": ["status", "diagnostics", "cache", "performance"],
  "scenarios": [
    /* scenarios .1 .. .4 — see prior design version, unchanged */
  ]
}
```

Extend `rq-advcfg01.2` for the two new flags. Add new scenario `rq-workerSingleton01.9` for `worker_role` surface. (Full scenario text identical to prior design version.)

### Delta 2 — `.adv/specs/worktree-lifecycle/spec.json`

Add new requirement `rq-worktreeMutationGuard01` with scenarios `.1`…`.5`. (Full text identical to prior design version.)

### Delta 3 — `ADV_INSTRUCTIONS.md`

Append three sections: § Worktree Policy (machine enforcement note), § Multi-Session Coordination (`worker_role` note), § Critical Protocols (Worktree Isolation Guard subsection). Full text identical to prior design version.

## Test Design

### AC-1 / AC-5 — Worker singleton

| Test | Type | File |
|---|---|---|
| Single host: process A starts, acquires lock, spawns worker; process B starts, reads lock, skips spawn | Integration | `plugin/src/temporal/worker-singleton.test.ts` (new) |
| Dead-PID reclaim: write lock with PID 99999 (non-existent), assert next acquire succeeds and removes stale file | Unit | `plugin/src/temporal/worker-lock.test.ts` (extend) |
| Stale-heartbeat reclaim: write v2 lock with `last_heartbeat` 120s ago, alive PID, assert reclaim per `rq-workerSingleton01.5` | Unit | same |
| **Init-path suspect handling** (`rq-workerSingleton01.6/.7`): write v1 lock with alive PID; with queue mocked unserviceable, assert `tryAcquireWorkerLockWithReclaim` returns `owned: false` and DOES NOT reclaim (client-only). Repeat for v2 lock with fresh heartbeat. | Unit | `plugin/src/temporal/worker-lock.test.ts` (extend) |
| **Diagnose-path suspect classification** (`rq-workerSingleton01.6/.7`): `classifySuspectWorkerLock` returns `suspect_live_legacy_lock` for v1 alive+unserviceable AND `suspect_live_unserviceable_lock` for v2 alive+fresh-heartbeat+unserviceable (latent bug fix — currently returns `undefined` for v2). Assert manual approval evidence required to reclaim. | Unit | `plugin/src/tools/temporal-ops.test.ts` (extend) |
| Self-expiry per `rq-workerSingleton01.8`: holder's local worker unserviceable past grace, assert heartbeat stops renewing | Unit | `plugin/src/temporal/worker-heartbeat.test.ts` (new) |
| `worker_role` surface in status output | Unit | `plugin/src/tools/status.test.ts` (extend) |
| `ADV_FORCE_IN_PROCESS_WORKER` bypass preserved per `rq-workerSingleton01.4` | Unit | regression test in plugin-init test |
| Feature flag off (escape hatch path): lock acquire skipped, current behavior preserved | Unit | same |
| Feature flag default ON validates: with no project.json override, lock acquire happens | Unit | same |

### AC-2 — Worktree guard

| Test | Type | File |
|---|---|---|
| Gate completion past `proposal` from mocked main-checkout cwd → BLOCK with `errorClass: WorktreeIsolationViolation` | Unit | `plugin/src/tools/gate.test.ts` (extend) |
| Gate `proposal` from main-checkout cwd → ALLOW (per `rq-worktreeMutationGuard01.2`) | Unit | same |
| `adv_task_add` from main checkout → BLOCK | Unit | `plugin/src/tools/task.test.ts` (extend) |
| `adv_task_update status: in_progress` from main checkout → BLOCK | Unit | same |
| `adv_task_update notes: ...` from main checkout → ALLOW (non-mutating) | Unit | same |
| All above from worktree cwd → ALLOW | Unit | covered by each test's worktree branch |
| `defaultIsWorktree` returns `false` for main checkout (regression test for current bug) | Unit | `plugin/src/tools/apply-helpers/pre-rebase.test.ts` (extend if exists; create otherwise) |
| Feature flag off: guard is no-op (default during canary release) | Unit | each guard test parametrized |
| Feature flag ON in this repo's project.json: confirmed via filesystem assertion | Unit | new |

### AC-3 — Probe cache

| Test | Type | File |
|---|---|---|
| Two concurrent `cache.get(key)` calls → `fetchMethod` invoked once (coalescing) | Unit | `plugin/src/tools/probe-cache.test.ts` (new) |
| Cache hit within TTL → `fetchMethod` not invoked, `stale: false`, `cached_at` populated | Unit | same |
| Cache miss after TTL → `fetchMethod` invoked, fresh `cached_at` | Unit | same |
| `fetchMethod` rejects → cached value returned with `stale: true` and `error` populated | Unit | same |
| `fetchMethod` timeout under `AbortSignal.timeout(N)` → stale value returned with `stale: true`, refresh continues | Unit + integration | same |
| Status output includes `_freshness` per probe | Unit | `plugin/src/tools/status.test.ts` (extend) |

### Cross-cutting

| Test | Type | File |
|---|---|---|
| Drift test: `ADV_INSTRUCTIONS.md § Worktree Policy` references `rq-worktreeMutationGuard01` (per `rq-proseReduction02.2`) | Drift | `plugin/src/manifest-doc-drift.test.ts` (extend) |
| Drift test: `§ Multi-Session Coordination` references `worker_role` | Drift | same |
| `plugin/src/__tests__/setup.ts` | Add `mockWorktreeContext()` helper for guard tests | Test infra |

### TDD intent per task (set at prep)

- Worker singleton wire-up: inline TDD (red: failing test asserts lock acquired, green: implement)
- Heartbeat: separate verification task (cross-cutting integration test for self-expiry)
- Worktree guard hooks: inline TDD per hook
- Probe cache: inline TDD (coalescing + SWR are critical assertions)
- Drift tests: not_applicable (drift tests verify documentation)
- Feature flag wiring: inline TDD

## Migration & Rollout

### Day 0 — merge

- **Worker singleton enforce defaults TRUE.** Every session on every project starts using the lock-acquire path on first run after upgrade. Verification signal (`worker_role` in `adv_status`) immediately visible.
- **Probe cache always on.** `_freshness` field immediately visible in `view: health` output.
- **Worktree guard enforce defaults FALSE** broadly, but `oc-plugins/advance/project.json` is updated as part of this change to set `feature_flags.worktree_guard_enforce: true` (self-canary). `example-web` operator-side opt-in is documented in archive notes (separate cross-repo step).

### Day 0 + 1 minor release — flip worktree guard default

- If canary period clean: `worktree_guard_enforce` default flips to `true` in next minor release.
- Operators who explicitly set `false` keep their override.

### Rollback per component

- Worker singleton: set `feature_flags.worker_singleton_enforce: false` in `project.json` per project. No code redeploy.
- Worktree guard: set `feature_flags.worktree_guard_enforce: false` in `project.json` per project. No code redeploy.
- Probe cache: no flag — must revert PR. Risk justifies this because failure mode is identical to current code.

### Day 0 transient — multi-worker overlap (acceptable)

Per validator Q7: when upgrade lands, old sessions already running have no lock (current code has no lock acquire). New sessions try acquire and succeed (one extra worker exists briefly) until old sessions exit naturally. Temporal workers are idempotent — multiple workers on the same queue is the standard horizontal-scaling deployment model. No data corruption. No sequence race leaves the queue unserved.

## Risks (final)

| Risk | Mitigation | Severity |
|---|---|---|
| `lru-cache` `signal` abort semantics in older Node | Pinned to Node 20.x+ already required | Low |
| Heartbeat timer keeps process alive at exit | `timer.unref()` and explicit cleanup in SIGINT path | Low |
| `resolveGitSessionContext` extraction breaks existing import paths | Module move + re-export passthrough; covered by typecheck | Low |
| Guard false-positive when CWD detected as main via symlink/mount oddity | Guard returns ALLOW on detection failure (mirrors trunk-write-firewall null-gitroot path) | Low |
| Worker singleton default-ON surprises WSL2 users with O_EXCL quirks | Documented escape hatches: `worker_singleton_enforce: false` (gentle) or `ADV_FORCE_IN_PROCESS_WORKER=1` (aggressive); heartbeat-based reclaim as secondary safety net | Medium |
| Worktree guard default-ON in next release surprises existing in-flight changes | One full canary period; clear `WorktreeIsolationViolation` error with remediation; opt-out per project still available | Medium |
| v2 suspect classification was latent bug; tests must explicitly cover both v1 and v2 paths | Test plan AC-1 row split into init-path and diagnose-path explicit assertions | Low (now mitigated) |

## Independent Validation Verdict

**VERDICT: CAUTION → resolved.**

Validator run inline. Output summary:
- **Q1 (Spec conformance)** — `rq-workerSingleton01` scenarios `.1`…`.8` all covered. Init-path step 5 now explicitly annotated as satisfying `.6/.7` (no automatic reclaim from init; client-only mode + manual recovery via existing `adv_temporal_diagnose` / `adv_temporal_worker_restart` paths). ✓
- **Q2 (Capability boundary)** — `rq-worktreeMutationGuard01` correctly belongs in `worktree-lifecycle`. ✓
- **Q3 (Recursive guard / proposal exemption)** — Proposal exemption sound; gate signal fire is post-guard. `/adv-apply` runs in worktree per implementation order. ✓
- **Q4 (Escape hatch vs spec)** — `worker_singleton_enforce: false` is same escape class as existing `rq-workerSingleton01.4` (`ADV_FORCE_IN_PROCESS_WORKER`). No new spec scenario needed. ✓
- **Q5 (Rollout coherence)** — Agreement P5 and design rollout sections consistent. ✓
- **Q6 (Test plan completeness)** — Suspect classification test row split into init-path (no reclaim, client-only) and diagnose-path (classification + manual approval). v2 latent bug fix explicitly tested. ✓
- **Q7 (Migration safety)** — Day 0 multi-worker transient is acceptable (Temporal horizontal scaling). O_EXCL atomic. No queue-unserved race. ✓

Validator-flagged latent bug: `classifySuspectWorkerLock` currently returns `undefined` for v2 schema. Fixed as part of Component 1 changes (see table row).

## Spec Files to Edit

| File | Lines changed (est.) |
|---|---|
| `.adv/specs/advance-meta/spec.json` | +90 (new `rq-statusProbeCache01` + extend `rq-advcfg01.2` + new `rq-workerSingleton01.9`) |
| `.adv/specs/worktree-lifecycle/spec.json` | +75 (new `rq-worktreeMutationGuard01`) |
| `ADV_INSTRUCTIONS.md` | +20 (three section appends) |
| `oc-plugins/advance/project.json` | +1 (canary opt-in) |

## Implementation Order (for prep gate task graph)

1. `plugin/src/utils/git-session.ts` — extract shared util (must precede guard)
2. `plugin/package.json` — add `lru-cache` dep
3. `plugin/src/tools/probe-cache.ts` — generic cache factory (must precede wraps)
4. `plugin/src/temporal/worker-lock.ts` v2 extension + widen `WorkerLockContents` union (must precede heartbeat + plugin-init)
5. `plugin/src/temporal/worker-heartbeat.ts` — new file
6. `plugin/src/plugin-init.ts:138` — wire lock acquire with flag-default-true (depends on 4, 5)
7. `plugin/src/tools/temporal-ops.ts` — extend `classifySuspectWorkerLock` for v2 (latent bug fix)
8. `plugin/src/tools/worktree-isolation-guard.ts` — new file (depends on 1)
9. `plugin/src/tools/gate.ts` — guard hook with flag-default-false (depends on 8)
10. `plugin/src/tools/task.ts` — guard hooks (depends on 8)
11. `plugin/src/tools/apply-helpers/pre-rebase.ts` — drive-by `defaultIsWorktree` fix (depends on 1)
12. `plugin/src/tools/status.ts` — wrap probes in cache + `worker_role` surface (depends on 3)
13. `plugin/src/tools/temporal-ops.ts` — wrap same probes (depends on 3, can coalesce with step 7)
14. Spec deltas: `advance-meta/spec.json`, `worktree-lifecycle/spec.json`
15. `ADV_INSTRUCTIONS.md` updates
16. `project.json` canary opt-in for this repo
17. Drift tests for documentation references
18. Integration test for cross-session worker singleton (last — needs all above)