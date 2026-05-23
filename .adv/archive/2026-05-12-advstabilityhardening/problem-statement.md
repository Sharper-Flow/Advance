# Problem Statement — advStabilityHardening

## Symptom

ADV agents in high-concurrency projects silently freeze mid-workflow after tool calls. The diagnostic surface (`adv_status view: health`) used to investigate the freeze itself times out at 10s, masking the cause. Most acutely observed in `pokeedge-web`, but the failure modes are project-agnostic.

## Observed pattern (live evidence, 2026-05-11)

| Signal | Value | Source |
|---|---|---|
| Idle-active assistant messages | 10 sessions with `part_count: 0`, ages 31m–119m | `opencode_session_debt.idle_active_session` |
| Worker processes for `pokeedge-web` project | 8 (should be 1) | `ps -ef` |
| TypeScript LSP init in `pokeedge-web` | `Operation timed out after 45000ms` (consistent) | OpenCode log `lsp.client serverID=typescript` |
| Snapshot `index.lock` collisions during conflict window | Cross-session race on `Semaphore.makeUnsafe(1)` | OpenCode log `snapshot exitCode=128` |
| `adv_status view: health` from peer session | `ToolExecutionTimeout` after 10s | GH issue #118 evidence table |
| ADV draft change running gates in main checkout | `_contextSnapshot.Workdir = /home/jrede/dev/pokeedge-web` (no worktree) | GH issue #118 |

## Root cause — three independent ADV contract gaps that compound

### Gap 1 — Worktree policy is agent-self-enforced (GH #118)

`ADV_INSTRUCTIONS.md § Worktree Policy` mandates "always isolate" but offers no tool-level guard. Agents skip worktree creation; multiple opencode sessions end up CWD'd in the same main checkout. OpenCode's `Semaphore.makeUnsafe(1)` is per-process, so cross-process snapshot `index.lock` race re-emerges (the recurrence condition explicitly called out in the close comment on Sharper-Flow/Advance#1). Snapshot capture blocks → message processor holds the assistant message envelope open → `part_count: 0` forever.

### Gap 2 — Worker singleton spec ≠ implementation (GH #117)

Spec `rq-workerSingleton01` defines an O_EXCL lockfile singleton with heartbeat and dead-PID reclaim. `plugin/src/temporal/worker-lock.ts` implements the lock primitive correctly. `plugin/src/temporal/git-worktree-flock.ts` already uses it for git ops. But `plugin/src/plugin-init.ts:138-142` hardcodes `const shouldSpawnWorker = true` with a comment explicitly saying "No peer lock / heartbeat coordination is needed here" — directly contradicting the spec. Every opencode session unconditionally spawns its own worker child. In `pokeedge-web` right now this means 8 worker processes instead of 1, wasting ~1.6 GB. Memory pressure widens the snapshot race window.

### Gap 3 — Health probes re-probe Temporal/worker on every status call (GH #107)

`plugin/src/tools/status.ts` has a partial `healthSnapshotCache` (Map + 30s TTL) but `getTemporalHealth()`, `probeTaskQueuePollers()` (gRPC `DescribeTaskQueue`), and `getTemporalWorkerDiagnostics()` are called outside the cache. Concurrent peer sessions hit each probe independently with no request coalescing. Under load — exactly when the operator most needs to see system state — the 10s safety-net timeout fires and `adv_status` itself becomes unusable.

## Why pokeedge-web is the canary

The three gaps compound, but `pokeedge-web` is the only project that simultaneously hits all three amplifiers:
- 2+ concurrent opencode sessions on the same project (other projects: 1 each)
- 4 in-flight changes + 309 archived (highest churn)
- 1.1 GB `node_modules`, 1076 TypeScript files, 346 Svelte files (TS LSP init exceeds 45s timeout)

Other projects experience the same gaps but stay below the resource pressure / concurrency threshold where the compound failure mode manifests.

## Out of scope

- OpenCode-core snapshot `index.lock` cross-process race (upstream — already filed)
- TypeScript LSP / tsserver initialization timeout (downstream OpenCode / tsserver tuning)
- Auto-materialize worktree on `adv_change_create` (deferred — couples worktree setup hooks to proposal drafting; tool-level guard sufficient per research)
- Standalone worker daemon with IPC socket (deferred — lockfile + heartbeat is LBP per research)
- Cross-process shared probe cache (deferred — in-process LRU sufficient when all sessions share one plugin host)
- Agent-instruction-only enforcement (insufficient by definition — that's what's broken now)