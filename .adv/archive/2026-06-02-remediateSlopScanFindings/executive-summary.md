# Executive Summary — Remediate slop-scan findings

A repo-wide slop scan surfaced 10 validated findings; all 10 were remediated in one change across four workstreams, gated by a typed 28-item contract (0 failing review rows) and an independent acceptance review (verdict READY).

## What was built

- **Correctness bug (HIGH):** Fixed the Layer-1 aggregate artifact-size precheck in `store-temporal/changes.ts` — it read `.documents` off the `LoadResult` wrapper instead of `.data`, so it never counted existing persisted documents. Added a RED→GREEN regression test and corrected the wrapper-shaped mock that was masking it.
- **Structural-correctness hardening (P33):** Softened the title-heuristic TDD-inversion finding from a gate-blocking `error` to an advisory `warning` (and amended spec `prep-readiness/rq-PR003tdd.1` to match — a spec delta) so a regex no longer solely owns a gate-block; the authoritative block remains `TASK_TDD_INTENT_MISSING`. Tightened `isWorkflowCompletedError` to exact error-name membership + anchored mid-string message patterns (dropping a broad substring false-positive surface) with a canonical locked test.
- **Type safety (P33):** Authored Zod `SignalRejection`/`SignalPayloadDigest` schemas, typed three previously-untyped sidecar fields on `ChangeSchema`, and removed three `as unknown as` casts in `change-state.ts`.
- **Structure refactors (behavior-preserving):** Consolidated the duplicated completed/poisoned recovery-detection expression into a shared `classifyCompletedOrPoisonedRecovery` combinator (4 symmetric gate/contract sites); split the acceptance-specific recovery logic out of `completeGateViaRecovery`; extracted four `adv_status` probe helpers (handler complexity ~80→54).
- **Dependency/config hygiene:** Pinned `@opencode-ai/plugin` to `^1.15.7`, relocated the `postcss` security floor to a workspace override (removing a phantom direct devDep), and dropped the stale `better-sqlite3` allowBuild entry.

## What was verified

- `bin/oc-test full`: 257 files / 3469 tests / 0 failures.
- `pnpm run check` (schemas:check, typecheck, test-isolation, lockfile-policy, lint, format) + `pnpm run build`: green.
- Independent acceptance reviewer: **READY**. It caught and fixed a behavior subtlety — the recovery combinator must be called *inside* the gate/recoveryMode condition to preserve the original `&&` short-circuit (no extra `describe()` probes outside intended recovery branches). Fix verified; affected suites green.

## Remaining concerns

- One Temporal integration test (`concurrent-signaling.itest.ts`) is timing-flaky under contention; it passes in isolation and in the full gated run. Unrelated to this change.
- Three validator-spawned follow-up agenda items remain (D4 SignalPayloadDigest hardening, D5 narrow-vs-bug confirmation, D7 status recommendations test) for future consideration.
- Live ADV tool behavior changes require rebuild + session restart (source-vs-dist reload); validated via unit/integration tests in-session.
