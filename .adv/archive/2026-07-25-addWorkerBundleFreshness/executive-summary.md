# Executive Summary — Add worker-bundle freshness release gate

## Outcome
The ADV release gate now enforces **worker-bundle freshness + replay-determinism provenance** for worker-impacting changes. A change declared `worker_bundle_impact: required` is blocked at release unless durable, change-bound evidence shows `build:worker` succeeded and the replay-determinism suite passed (a typed provenance receipt: `source_sha` + `build_run_id` + `replay_run_id`). Non-worker changes get a typed `not_applicable` disposition (not a path heuristic). The check is hard/blocking, lives in `evaluateGateReadiness`, and is replay-safe under a `wf.patched("worker-bundle-freshness-v1")` branch.

## Why it matters
Previously, a change modifying workflow-reachable code (`workflows.ts`/`worker.ts`) could be archived+released without durable proof that the worker bundle was rebuilt and replay-deterministic for the released source. A silently non-deterministic workflow change would surface only as production workflow failures after deploy. This gate closes that gap at archive time with commit-bound provenance — exactly the class of gap observed this session when a worker-impacting change shipped and the loaded plugin ran a stale bundle until a manual restart.

## How it works (KD decisions)
- **Typed applicability (KD1):** `worker_bundle_impact: { kind: "required"|"not_applicable"; rationale? }` on the change, set/confirmed at planning via `adv_change_set_worker_bundle_impact`. Authority is the typed declaration — never a path heuristic; absent → block.
- **Hard readiness (KD2):** `evaluateWorkerBundleProvenance` in `evaluateGateReadiness` (blocking), not the advisory `CRITERION_EVALUATORS`.
- **Typed evidence (KD3):** matches `build:worker` + `replay-determinism` runs by typed `evidence_kind`, not command substring.
- **Provenance receipt (KD4):** `adv_worker_bundle_provenance_record` fires `workerBundleProvenanceRecordedSignal` with `{ source_sha, build_run_id, replay_run_id }` — source SHA captured in the payload (deterministic), not derived via git at gate time.
- **Durability (KD6):** `testRuns` + `worker_bundle_impact` + `workerBundleProvenance` now survive `continueAsNew` + disk reseed (fixed a real defect where the seed wasn't read at workflow start — caught in verification).
- **Replay safety (KD7):** `wf.patched("worker-bundle-freshness-v1")` — old histories keep prior release-readiness behavior; new histories enforce. Legacy replay fixture committed.
- **Out of scope (KD5):** post-deploy/runtime freshness (loaded vs deployed generation) is a separate lifecycle.

## Verification
- `pnpm run check` clean (schemas/typecheck/manifests/isolation/lockfile/lint/format).
- 128+ targeted tests green; 48 workflow itests green (replay-determinism, signal-handlers, continue-as-new).
- Independent `adv-reviewer` acceptance review: **READY** (initial BLOCKED on missing legacy replay fixture + 2 validation gaps, all remediated in `5687a5a6`, re-reviewed 0 findings).
- Design independently validated by `adv-researcher` (NEEDS_WORK → adopted: KD4 typed provenance receipt, KD6 durability fix, KD3 typed identities, KD7 wf.patched).

## Risks / Follow-ups
- **Post-deploy runtime health** (loaded plugin generation == deployed == worker generation after restart) is OOS1 — a separate follow-up (the archive gate enforces provenance, not runtime freshness).
- The gate depends on the change recording its provenance during execution (build:worker + replay pass → `adv_worker_bundle_provenance_record`); this is the change's documented responsibility.
- Worktree was 6 commits behind trunk at acceptance — rebase before release.

## Supporting evidence
Commits on `change/addWorkerBundleFreshness`: `eb95dfac` (spec) → `8c97ed49` (model/signals) → `42182704` (durability) → `5fa98356` (gate) → `36fdc17a` (recording surface) → `120e3e62` (verification) → `5687a5a6` (remediation). Durable TDD via `adv_run_test` for code tasks; reviewer-owned static-check for the spec.