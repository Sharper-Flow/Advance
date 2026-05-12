# Proposal — advStabilityHardening

## Goal

Eliminate the silent-freeze + diagnostic-timeout compound failure mode by making three existing ADV contracts **structurally enforced** instead of agent-self-enforced. All three fixes are mechanical: the machinery already exists in the codebase; this change wires it up.

## Success Criteria

### SC-1 — Worker singleton enforced (resolves GH #117)

GIVEN N concurrent opencode sessions on the same project (same root-commit SHA)
WHEN each session initializes its ADV plugin
THEN exactly one Temporal worker child process exists for that project
AND the lock-holding session reports `worker_role: "host"` in `adv_status`
AND non-holding sessions report `worker_role: "client"` and skip worker spawn
AND on lock-holder crash, the next session reclaims via dead-PID detection within heartbeat TTL

### SC-2 — Worktree isolation enforced for mutating gates/tasks (resolves GH #118)

GIVEN an ADV change is past the `proposal` gate
WHEN an agent calls `adv_gate_complete` (any gate past `proposal`) or `adv_task_add` or mutating `adv_task_update` with CWD resolving to the main checkout
THEN the tool MUST refuse with a structured BLOCK response (mirroring `trunk-write-firewall.ts` shape)
AND the error MUST include the resolved main-checkout path, the expected worktree pattern, and the corrective command (`adv_worktree_create` or `adv_worktree_resume`)
AND the `proposal` gate itself remains writable in main checkout (proposal drafting is non-mutating)

### SC-3 — Status freshness with bounded staleness (resolves GH #107)

GIVEN repeated `adv_status view: health` calls within TTL window
WHEN each probe (Temporal server reachable, worker process alive, queue serviceability, search-attribute health) is queried
THEN the probe is served from cache with the documented TTL per probe type
AND concurrent peer-session calls for the same probe key share one in-flight fetch (request coalescing)
AND the response surfaces per-probe `cached_at` / `stale: bool` / `error?` metadata
AND under-load response time stays under 2s p95
AND genuinely unhealthy state surfaces at most TTL seconds late (never permanently masked)

### SC-4 — Regression coverage

GIVEN the three contracts above are now machine-enforced
WHEN the test suite runs
THEN test coverage exists for each: peer-session worker-spawn test (SC-1), main-checkout gate-completion refusal test (SC-2), cache hit / coalescing / staleness-bound test (SC-3)
AND drift tests on `ADV_INSTRUCTIONS.md` confirm the agent-side guidance still references the now-machine-enforced contracts

### SC-5 — Diagnostic visibility

GIVEN any peer session in any project
WHEN the operator runs `adv_status view: health`
THEN the output distinguishes worker host vs client role
AND surfaces per-probe freshness for cached probes
AND completes within 2s p95 even under multi-session load

## Scope

### In Scope

| Area | Files (anchor only — final list assessed in discovery/design) | Change type |
|---|---|---|
| Worker singleton wire-up | `plugin/src/plugin-init.ts`, `plugin/src/temporal/worker-lock.ts` | Modify (wire existing lock primitive; add heartbeat v2) |
| Worktree isolation guard | `plugin/src/tools/gate.ts`, `plugin/src/tools/task.ts`, new `plugin/src/utils/git-session.ts`, new `plugin/src/tools/worktree-isolation-guard.ts` | Add guard + extract shared utility |
| `defaultIsWorktree` bug fix | `plugin/src/tools/apply-helpers/pre-rebase.ts:245-252` | Drive-by bug fix |
| Status probe TTL cache | `plugin/src/tools/status.ts`, new `plugin/src/tools/probe-cache.ts`, `plugin/package.json` | Add `lru-cache` dep; wrap probes; add freshness metadata |
| Diagnostic surface | `adv_status view: health` output schema | Extend (additive — `worker_role`, per-probe `cached_at`/`stale`) |
| Tests | `plugin/src/temporal/worker-singleton.test.ts` (new), `plugin/src/tools/gate.test.ts` (extend), `plugin/src/tools/probe-cache.test.ts` (new) | Add |
| Specs | `rq-workerSingleton01` (existing — verify implementation now conforms), worktree-lifecycle spec (extend with mutation-guard requirement), advance-meta or new spec for status TTL (decided in design) | Verify / extend |

### Out of Scope

- OpenCode-core snapshot `index.lock` cross-process race (upstream Sharper-Flow/Opencode-Advance#1)
- TypeScript LSP / tsserver initialization timeout (downstream OpenCode / tsserver tuning)
- Auto-materialize worktree on `adv_change_create` (deferred — couples worktree setup hooks to proposal drafting; tool-level guard sufficient per research)
- Standalone worker daemon with IPC socket pattern (deferred — lockfile + heartbeat is LBP per research)
- Cross-process shared probe cache (deferred — in-process LRU sufficient when all sessions share one plugin host)
- Agent-instruction-only enforcement (insufficient by definition — that is what is broken now)
- Cross-project `target_path` worktree-guard semantics (deferred — separate enhancement; this change covers local mutations)

## Approach Summary (one-line per gap)

| Gap | Mechanism | LOC est. | Risk |
|---|---|---|---|
| #117 worker singleton | Wire existing `acquireWorkerLock()` into `plugin-init.ts:138`; upgrade lock to v2 with heartbeat; add `worker_role` to status | ~80 | Low — additive, lock primitive already battle-tested in git-worktree-flock |
| #118 worktree guard | Extract `checkWorktreeIsolation()` parallel to `checkTrunkWrite()`; wire into `adv_gate_complete`, `adv_task_add`, mutating `adv_task_update` | ~120 | Low — mirrors trunk-write-firewall precedent; agents in worktrees unaffected |
| #107 status TTL cache | Add `lru-cache` dep; wrap probes in `cache.fetch()` (TTL+SWR+coalescing built-in); add freshness metadata to status output | ~100 | Low — one zero-dep package; existing partial cache pattern extended |
| #118 drive-by | Fix `defaultIsWorktree()` in `plugin/src/tools/apply-helpers/pre-rebase.ts:245-252` (currently detects "git repo" not "worktree") | ~10 | Low — bug fix, no API change |

## Migration / Rollback

- All three changes are additive guards / wraps over existing functions. No schema changes. No Temporal workflow signature changes.
- Worker singleton rollout: old sessions that already spawned without holding the lock continue running until their session exits. New sessions acquire the lock cleanly. Brief 2-worker transient during rollout is acceptable.
- Worktree guard rollout: existing in-flight changes that have ALREADY advanced past `proposal` in main checkout will hit the guard on next gate completion. Migration is "create a worktree, resume there." No automatic conversion (the user's main checkout state may not be safe to move).
- Rollback path: feature flag each guard (`worker_singleton_enforce`, `worktree_guard_enforce`, `status_probe_cache`) so any one can be disabled without redeploy.

## Composes with existing precedent

| Existing | New |
|---|---|
| `plugin/src/tools/trunk-write-firewall.ts` (P32 file-write firewall) | `checkWorktreeIsolation()` for gate/task mutations |
| `plugin/src/temporal/worker-lock.ts` (lock primitive, used by git-worktree-flock) | Wire into worker spawn path |
| `plugin/src/tools/status.ts` `healthSnapshotCache` (Map + 30s TTL) | Migrate onto `lru-cache.fetch()` for full probe coverage |
| Planning gate `userApproved: true` machine guard | Same shape: machine-enforced precondition |

## Verification Strategy

| SC | Test type | Location |
|---|---|---|
| SC-1 | Integration: spawn 3 mock opencode-host processes for same project-id, assert worker count == 1, kill holder, assert next-host reclaims | `plugin/src/temporal/worker-singleton.test.ts` (new) |
| SC-2 | Unit: invoke `adv_gate_complete discovery` with mocked main-checkout `_contextSnapshot`, assert structured BLOCK; invoke from worktree, assert pass | `plugin/src/tools/gate.test.ts` (extend) |
| SC-3 | Unit + property: call `cache.fetch()` 10× concurrently, assert `fetchMethod` invoked once; call after TTL, assert refresh; mock probe failure, assert `stale: true` returned | `plugin/src/tools/probe-cache.test.ts` (new) |
| SC-5 | Manual + smoke test: `adv_status view: health` with stopwatch under 2-session pokeedge-web load | Verification checklist in change archive notes |

## Linked Issues

- Primary (closes on archive per `rq-issueChangeLinkage02`): #118 — Discovery gate ran in main checkout — caused snapshot index.lock recurrence + agent freeze
- Linked: #117 — Temporal worker singleton broken
- Linked: #107 — Add TTL caching for ADV status health probes

## Why one umbrella change

The three gaps share one observed failure mode (silent freeze under concurrency) and one verification surface (`adv_status view: health` returns in <2s while peers actively work). Splitting them defers the operator-visible improvement until all three independently ship and archive. Bundling them keeps the rollout coherent — feature flags preserve revertibility per gap.