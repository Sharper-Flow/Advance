## Executive Summary

### Outcome
The two operator maintenance scans — `adv_store_cleanup action:scan` and `adv_store_consolidate action:scan` — no longer time out on machines with many local ADV stores. Both were rewritten from serial per-store loops to bounded-concurrency probing, and the store-cleanup scan now reads each store's `agenda.jsonl` exactly once instead of twice.

### Why it matters
On this machine the store data-home holds 400+ stores (≈379 orphan-shard + ≈32 drain-* + others). The serial scans exceeded the hard 10-second tool ceiling (which cannot be raised — SDK cap plus `rq-boundedAuthoritativeRead01`), so operators could not inventory or clean inert store cruft at all. The consolidate scan was worst-hit because it spawned a git subprocess per store (~758 serial git spawns for 379 stores). Parallelizing to a bounded pool (16) cuts wall-time by roughly the concurrency factor while a bounded pool avoids file-descriptor exhaustion (EMFILE) that naive `Promise.all` would cause.

### What changed
- New `plugin/src/utils/concurrency.ts` — `mapWithConcurrency(items, concurrency, fn)`: order-preserving, bounded worker pool. `STORE_SCAN_CONCURRENCY=16`.
- `store-cleanup.ts`: parallelized `scanStoresForCleanup`; single-read `analyzeAgenda(content)` helper removes the redundant second file read.
- `store-consolidate.ts`: parallelized the `scanStoresForRepo` per-store loop (git identity probes + fs summary batched).
- Behavior is preserved exactly: classification, safety flags, warning order, and deterministic `project_id`-sorted output are byte-identical to the serial implementation.

### Verification
- `pnpm run check` green (schemas, typecheck, manifests, isolation, lockfile, lint, format).
- 84/84 targeted tests green: `mapWithConcurrency` unit tests (order, bounded in-flight, rejection, clamp, empty); store-cleanup large-N parity + determinism + single-read; store-consolidate 52-store parity + determinism + orphan-suspect + live-lock warning.
- CI on PR #242: 6/6 checks green.

### Risks / follow-ups
- Low risk: pure behavior-preserving refactor of read-only maintenance scans; no timeout/deadline constants touched, no new dependency, no mutation-path changes.
- Out of scope (separate ownership): the archived/terminal change-enumeration timeout family (`adv_status view:hygiene`, `adv_worktree_cleanup mode:archived_branches`) is owned by `fixChangeEnumerationStarvation` and a planned fast-follow.
- Live post-deploy `adv_store_cleanup action:scan` under-budget confirmation is pending the build+deploy+restart step.
