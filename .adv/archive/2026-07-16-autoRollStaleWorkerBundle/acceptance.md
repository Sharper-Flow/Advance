# Acceptance

Reviewed at: 2026-07-16T01:14:12.463Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1** `worker.lock` V2 (`WorkerLockContentsV2`) carries a `bundle_hash`, written on acquire and preserved across heartbeats. | pass | worker.lock V2 bundle_generation written on acquire + preserved by heartbeat; worker-lock/worker-heartbeat suites green. |
| AC2 | acceptance_criterion | **AC2** A stable content hash of the deployed worker bundle is computable at runtime (hash of `dist/temporal/worker.js`, or a build-emitted stamp). | pass | build:worker emits bundle-manifest.json (SHA-256 over worker.js+workflows.js) E2E; generation d04435fd. |
| AC3 | acceptance_criterion | **AC3** On session start/election (`plugin-init.ts`), deployed-bundle hash ≠ lock `bundle_hash` ⇒ lock treated as stale ⇒ graceful reclaim + re-elect on the new bundle. | pass | worker-roll.ts drift monitor rolls via first-class restartChild on manifest-generation mismatch; worker-roll suite green. |
| AC4 | acceptance_criterion | **AC4** Deployed hash == lock `bundle_hash` ⇒ live holder retained, no reclaim (singleton preserved, no thrash). | pass | Same-generation no-op via in-memory generation tracking; 'lagging lock stamp cannot trigger re-roll' regression green. |
| AC5 | acceptance_criterion | **AC5** Reclaim reuses the existing respawn-elect path; no lost updates under concurrent load (`rq-temporalConcurrentLoad01` preserved). | pass | AC5 lost-update race closed via single-writer heartbeat (updateWorkerLockBundleGeneration deleted); red-on-old/green-now interleave regression; crash counter untouched. |
| AC6 | acceptance_criterion | **AC6** In-process worker path (Node hosts) is unaffected. | pass | Drift/roll wired OOP-only in plugin-init; in-process worker path unchanged. |
| AC7 | acceptance_criterion | **AC7** Unit tests cover hash-mismatch reclaim + same-hash no-op; existing `worker-lock` / `worker-heartbeat` tests stay green. | pass | Roll test matrix green: drift/no-op/single-flight/crash-counter/grace ordering; 53/53 worker suites. |
| C1 | constraint | OOP model only (Bun hosts). Replay determinism preserved. `workflows.ts` worker-bundle import-graph rules respected (no new `node:*`/tools reach; no `defineUpdate`). | respected | workflows.ts diff vs trunk empty; zero defineUpdate; OOP-only; determinism preserved. |
| DONT1 | avoidance | No time-only staleness as the sole trigger. No forced kill of live peer workers mid-workflow. No change to the fixed `worker.js` output path the spawner expects unless the spawner is updated in lockstep. | respected | Manifest-generation trigger (not time-only, not worker.js-only); owner-self-roll only, no cross-session force-kill, no alive-owner reclaim. |
| OOS1 | out_of_scope | SQLite→Postgres persistence backend. In-process worker migration. The `/tmp` test-server leak (change `reapLeakedTestServers`). | not_applicable | Postgres backend / in-process migration / test-server leak excluded as agreed. |

