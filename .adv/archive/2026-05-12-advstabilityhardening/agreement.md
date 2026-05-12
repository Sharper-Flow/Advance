# Agreement — advStabilityHardening

## Objectives (durable, contract-level)

| # | Objective |
|---|---|
| O-1 | Make the worker singleton (`rq-workerSingleton01`) machine-enforced. Implementation must conform to existing spec — not the other way around. |
| O-2 | Make the "always isolate in worktree" worktree policy machine-enforced for mutating gate/task operations. Agent-self-enforcement is insufficient by observed failure record. |
| O-3 | Make `adv_status view: health` reliably responsive under multi-session load, with bounded, explicit staleness — never silent masking of unhealthy state. |
| O-4 | Preserve revertibility per component. Each fix individually revertible without code redeploy when its risk profile justifies a flag; permanent merge when failure mode is functionally identical to current behavior. |
| O-5 | All three changes additive — no schema, no Temporal workflow signature changes, no breaking API surfaces. |

## Acceptance Criteria (final, formalized from proposal SC-1…SC-5)

### AC-1 — Worker singleton conformance

GIVEN N ≥ 2 concurrent opencode sessions on the same project (same project-id from `git rev-list --max-parents=0 HEAD`)
WHEN each session executes the plugin init path
THEN exactly one of them acquires `worker.lock` via O_EXCL atomic create at `{project-state-dir}/worker.lock`
AND exactly one Temporal worker child process exists for the project's queue
AND the holder writes heartbeat (timestamp) every ≤ 30s
AND non-holders skip `createInProcessWorker` / `createOutOfProcessWorker` and instead initialize a Temporal client only
AND on holder crash, the next session reclaims via dead-PID detection (`process.kill(pid, 0)` ESRCH) per `rq-workerSingleton01.3`
AND on stale heartbeat, the next session reclaims per `rq-workerSingleton01.5`
AND suspect-live cases (alive PID + unserviceable queue) require explicit approval per `rq-workerSingleton01.6/.7`

### AC-2 — Worktree isolation guard

GIVEN an ADV change with status `active` (post-proposal)
WHEN `adv_gate_complete` is invoked for any gate ∈ {`discovery`, `design`, `planning`, `execution`, `acceptance`, `release`} OR `adv_task_add` is invoked OR `adv_task_update` is invoked with `status: 'in_progress' | 'done' | 'cancelled'`
AND the resolved `cwd` of the invoking session is the project's main checkout (`resolveGitSessionContext().isMainCheckout === true`)
AND `feature_flags.worktree_guard_enforce` is true (this repo opted in from day 0; `pokeedge-web` opts in via documented archive step; broad default flips after one minor release)
THEN the tool MUST return a structured BLOCK response:
  - `errorClass: "WorktreeIsolationViolation"`
  - `mainCheckoutPath: <resolved-path>`
  - `reason: <human-readable>`
  - `remediation: "Create or resume an ADV worktree (adv_worktree_create / adv_worktree_resume) and retry from inside the worktree."`
AND no ADV state mutation occurs (no signal fired, no `change.json` write)
AND when the same call originates from a worktree (`isMainCheckout === false`), the tool proceeds normally
AND the `proposal` gate remains permitted in main checkout

### AC-3 — Status probe TTL + SWR + coalescing

GIVEN repeated `adv_status view: health` calls
WHEN each probe class (Temporal server reachable, worker process alive, queue serviceability, search-attribute health, worktree census) is queried
THEN the call is served from an LRU cache via `lru-cache.fetch(key, { signal })` with documented per-probe TTL
AND N concurrent calls for the same cache key invoke the underlying `fetchMethod` exactly once (request coalescing built into `lru-cache.fetch()`)
AND each cached value returned includes `_freshness.cached_at` and `_freshness.stale` metadata in the status output
AND when the underlying probe times out under `AbortSignal.timeout(2000)`, the stale value is returned immediately with `stale: true` and refresh continues in background
AND when the underlying probe rejects, the last-known-good value is returned with `stale: true` and `error: <message>` attached
AND under the AC-1+AC-2 workload (3 concurrent peer sessions, hot worktree, active changes), `adv_status view: health` p95 ≤ 2000ms
AND the cache is always active (no feature flag) — failure mode is functionally identical to current direct-probe path

### AC-4 — Risk-tiered revertibility

GIVEN the three components have different risk profiles
WHEN they ship
THEN:
  - **AC-1** SHALL be gated by `feature_flags.worker_singleton_enforce` (default `true`); flag is a WSL2/NFS escape hatch, not a canary gate. `ADV_FORCE_IN_PROCESS_WORKER` remains the more-aggressive escape per `rq-workerSingleton01.4`.
  - **AC-2** SHALL be gated by `feature_flags.worktree_guard_enforce` (default `false` for the first release; this repo + `pokeedge-web` opt in from day 0; default flips to `true` in next minor release after canary period clean).
  - **AC-3** SHALL have no flag — the cache is always active because its failure mode (cache miss → direct probe) is functionally identical to current behavior. Revert requires PR revert if needed.
AND the rationale per component is documented in design and in `rq-advcfg01.2` scenarios.

### AC-5 — Diagnostic visibility surface

GIVEN any peer session
WHEN `adv_status view: health` is invoked
THEN the response includes:
  - `worker_role: "host" | "client" | "degraded"` distinguishing whether this session owns the singleton (per `rq-workerSingleton01.9`)
  - `_freshness: { cached_at, stale, error? }` for each cached probe (per `rq-statusProbeCache01`)
  - `feature_flags.worker_singleton_enforce` and `feature_flags.worktree_guard_enforce` values (per `rq-advcfg01.2`)
AND the response remains stable for legacy consumers (additive fields only; existing shapes preserved)

### AC-6 — Regression test coverage

GIVEN the implementation lands
WHEN `pnpm test` runs
THEN coverage exists for:
  - **AC-1**: integration test spawning 3 mock host processes for same project-id, asserting worker-count == 1 and post-crash reclaim; unit tests for dead-PID + stale-heartbeat reclaim; suspect-live classification path
  - **AC-2**: unit tests for `adv_gate_complete` and `adv_task_add` from main checkout (BLOCK) vs. from worktree (PASS); proposal gate exemption; `defaultIsWorktree` bug-fix coverage
  - **AC-3**: unit tests for cache coalescing (10 concurrent calls → 1 fetchMethod invocation), TTL expiry, `allowStaleOnFetchAbort`, `allowStaleOnFetchRejection`
  - **AC-4**: feature-flag-on and feature-flag-off paths exercised for AC-1 and AC-2; AC-3 has no flag-off path
  - Drift tests confirm `ADV_INSTRUCTIONS.md` references the now-machine-enforced contracts (per `rq-proseReduction02`)

## Out of Scope

- **OpenCode-core snapshot `index.lock` cross-process race** — upstream `anomalyco/opencode` issue. ADV mitigates by enforcing worktree isolation (eliminates the trigger of multiple sessions in the same path), but cannot fix the underlying snapshot service. Already filed: Sharper-Flow/Opencode-Advance#1.
- **TypeScript LSP / tsserver init timeout in large repos** — downstream OpenCode + tsserver tuning. Out of ADV's layer.
- **Auto-materialize worktree on `adv_change_create`** — deferred. Tool-level mutation guard (AC-2) achieves the same structural outcome without the coupling cost.
- **Standalone worker daemon with IPC socket** — deferred. Lockfile + heartbeat is LBP per `rq-workerSingleton01` design intent.
- **Cross-process shared probe cache** — deferred. In-process `lru-cache` sufficient when all sessions share one plugin host.
- **Cross-project `target_path` mutation guard semantics** — deferred. AC-2 covers local mutations only.
- **Agent-instruction-only enforcement** — explicitly insufficient. The status quo failed; we are moving the enforcement layer.
- **Migration of legacy main-checkout in-flight changes** — agents must manually resume in a fresh worktree.

## Principles & Constraints

### P1 — Existing precedent governs the pattern

| Existing primitive | Reuse target |
|---|---|
| `plugin/src/temporal/worker-lock.ts` (`acquireWorkerLock`, O_EXCL) | Wire into `plugin/src/plugin-init.ts:138-142` |
| `plugin/src/utils/git-worktree-flock.ts` (proves lock primitive battle-tested) | Continue current use; no change |
| `plugin/src/tools/trunk-write-firewall.ts` (`checkTrunkWrite`, ALLOW/BLOCK shape) | Mirror as `checkWorktreeIsolation` for gate/task mutations |
| `plugin/src/index.ts:245-272` `resolveGitSessionContext` | Extract into `plugin/src/utils/git-session.ts` and reuse |
| `plugin/src/tools/status.ts:107-110` `healthSnapshotCache` (Map+TTL) | Migrate onto `lru-cache.fetch()` |
| Planning gate `userApproved: true` machine guard | Same shape: machine-enforced precondition |

### P2 — LBP technology choices (verified, not assumed)

- **`lru-cache` (`isaacs/node-lru-cache`)** — zero-dep, ~3KB, 40M+ weekly downloads. `cache.fetch()` provides TTL + SWR + request coalescing in one API. Alternatives rejected: `p-memoize` (no coalescing), `quick-lru` (no async fetch), custom Map+Promise (reinvents the wheel).
- **O_EXCL lockfile + heartbeat** — matches `rq-workerSingleton01` design intent. Alternatives rejected for current scope: standalone daemon (overkill), systemd user services (Linux-only).
- **`AbortSignal.timeout()`** — standard Node 18+; no polyfill / wrapper library required.

### P3 — Capability assignments

| AC | Owning spec | Action |
|---|---|---|
| AC-1, AC-5 worker_role | `advance-meta` (already hosts `rq-workerSingleton01`) | Verify implementation now conforms to existing spec; add new scenario `rq-workerSingleton01.9` for `worker_role` surface |
| AC-2 worktree guard | `worktree-lifecycle` | Extend with new requirement `rq-worktreeMutationGuard01` |
| AC-3 status TTL | `advance-meta` (already hosts `rq-advcfg01` status diagnostics) | New requirement `rq-statusProbeCache01` |
| AC-4 feature flags | `advance-meta` (`rq-advcfg01.2` already covers feature flags in status) | Extend `rq-advcfg01.2` scenarios for the two new flags |

### P4 — Verification floor

- Every AC has a corresponding test type, location, and assertion shape declared (see AC-6).
- Manual smoke under multi-session `pokeedge-web` load is REQUIRED as part of archive sign-off (this is the canary scenario that motivated the change).
- TDD intent per task (set at prep gate): inline red/green for guard logic; separate verification task for the integration spawn test (cross-cutting).

### P5 — Rollout discipline (REVISED, addresses verification-gap challenge)

Risk-tiered defaults per component. **Defaults-off would hide the very signals used to verify the fix works** — so defaults match the risk profile, not a uniform rule.

| Component | Flag | Default | Rationale |
|---|---|---|---|
| Worker singleton (AC-1) | `worker_singleton_enforce` | **`true`** | Existing spec; lock primitive battle-tested in `git-worktree-flock.ts`. Flag is the WSL2/NFS escape hatch, not the canary gate. Off-path is the bug we are fixing — defaulting off keeps the bug shipping. |
| Worktree guard (AC-2) | `worktree_guard_enforce` | **`false` (one release)** then **`true`** | Only guard that BLOCKS calls succeeding today. Risk: surprise refusals on existing in-flight changes in main checkout. Mitigation: canary opt-in on this repo + `pokeedge-web` from day 0; flip default after one minor release. |
| Probe cache (AC-3) | **none** | always on | Failure mode functionally identical to current code (cache miss → direct probe). Flag would be cargo-cult — maintains two paths forever for zero risk reduction. |

Wisdom captured at archive: final TTL values (may have tuned during canary), heartbeat grace window stability, any false-positive isolation-guard refusals from canary period.

## Constraints (hard)

- ❌ No change to ADV Temporal workflow signatures (`changeWorkflow`, signal/query surfaces).
- ❌ No change to `change.json` schema.
- ❌ No new external service dependency.
- ❌ No introduction of a daemon / detached process (lockfile model only).
- ✅ One new npm dep allowed: `lru-cache` (zero transitive deps).
- ✅ Existing `worker-lock.ts` may extend to v2 schema (`schema_version: 2`, add `last_heartbeat`) — backward-compatible read of v1.

## Risks (residual, accepted)

| Risk | Mitigation |
|---|---|
| O_EXCL semantics differ on WSL2 / NFS / 9p mounts | Heartbeat-based staleness as second safety net; documented escape hatches (`worker_singleton_enforce: false`, `ADV_FORCE_IN_PROCESS_WORKER=1`); documented in test edge cases |
| Worker singleton default-ON surprises operator on first upgrade | Verification signal (`worker_role` in `adv_status`) immediately visible; escape hatches documented in ADV_INSTRUCTIONS.md |
| Worktree guard surprises agents mid-session | Default off for one release; canary opt-in on canary projects; clear error remediation message; flip schedule documented |
| `lru-cache.fetch()` `signal` abort semantics not exercised in current ADV code | Coalescing + SWR tests cover both happy path and abort path |
| Old session workers continue running during singleton rollout | Documented transient; resolves on natural session exit |

## Linked Issues

- Primary: #118 (critical) — closes on archive per `rq-issueChangeLinkage02`
- Linked: #117, #107 — closed manually with cross-reference comment on archive

## Ambiguity Scan (discovery extended set)

```
Coverage: B:C F:C S:C M:C D:C X:C Q:P I:C E:C C:N/A T:N/A
Findings: 0 CRITICAL, 0 HIGH

Note Q:P (Quality Attributes — partial):
- AC-3 p95 ≤ 2000ms latency target is set, but observed pokeedge-web baseline p95 not measured pre-change.
  Resolution: collect baseline as first apply task (cheap: 5x adv_status invocations under current load). Not a clarify-blocker — design proceeds.
```