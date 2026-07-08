# Executive Summary

## Outcome

This change updates local deployment so known running deployed Temporal worker processes are refreshed after worker/workflow bundle sync. The acceptance decision is whether the deploy script behavior, tests, and spec coverage satisfy the approved worker-refresh contract.

## Why It Matters

Before this change, a local deploy could copy updated worker/workflow bundles while an already-running deployed `dist/temporal/worker.js` kept executing stale code. The new behavior makes that state visible and either bounces exact-path matching workers or fails with operator action evidence.

## Verdict

APPROVED

## What Was Built

1. Added advance-meta spec law for deploy worker refresh, including deploy-time worker bounce and no-silent-stale-worker requirements.
2. Implemented `scripts/deploy-local.sh` worker refresh behavior: exact deployed worker path matching, default `SIGTERM`, read-only reporting for `--check`/`--dry-run`, and `[ADV:ACTION_REQUIRED]` failure output with PID/path evidence when bounce cannot clear a worker.
3. Added and ran deploy-local tests covering worker refresh behavior, read-only modes, spec coverage, formatting, schema drift, and shell syntax.

## What Was Verified

- Verdict: reviewer READY with 0 findings; no reviewer changes made.
- Tests: passed — `bash -n scripts/deploy-local.sh`; deploy-local focused tests including RED then GREEN; full `plugin/src/deploy-local.test.ts` 70/70; `pnpm run format:check`; `pnpm run schemas:check`; strict ADV validation passed with only expected `NO_DELTAS` warning.
- Preview URL: not_applicable — approved agreement has `visual_surface: false`; change affects local shell deploy behavior, process signaling, docs/specs, and tests, with no browser-visible or visual UI output.
- Contract matrix: 20/20 rows passed/respected/not_applicable; no failing rows.

## Remaining Concerns

None blocking. Release/harden still owns final integration checks and archive/release proof.

## Supporting Evidence

- Tasks: `tk-8859433af976`, `tk-9661a4bc8ea5`, `tk-2f777ace9318` all done with checkpoint commits `e2f3e00d`, `7155ba04`, `4142bca7`.
- Verification evidence: `tr_mrcljr2y_a4ee4bd6`, `tr_mrclouwv_ab764af3` RED, `tr_mrclrnb1_d465049a`, `tr_mrclrtro_ecb1071e`, `tr_mrcls1hr_45f37242`, `tr_mrcls994_815245e2`, `tr_mrcluunl_47cd562a`, `tr_mrclui06_e3aa5aad`, `tr_mrcluo18_f4f82d45`.
- Review evidence: acceptance reviewer report verdict READY, 0 findings.
- Contract evidence: review matrix set with all success criteria, acceptance criteria, constraints, avoidances, and out-of-scope items resolved.

## Consequence Context

1. delivered value — pass: local deploy no longer silently leaves known exact-path deployed Temporal workers on stale worker/workflow bundles after sync; supported by task evidence and contract rows SC1/AC1.
2. enabling-only/follow-up dependency — n/a: this is a direct deploy-script behavior change, not only an enabling follow-up; no ops follow-up links or required follow-ups recorded.
3. ops readiness — pending: acceptance evidence proves local deploy behavior; release/harden still owns final packaging/release readiness and archive proof.
4. migration/data impact — n/a: no data migration, database change, or persistent user data path touched; scope is shell deploy behavior, specs, and tests.
5. frontend/preview impact — n/a: agreement records `visual_surface: false`; no browser-visible UI or visual output changed.
6. collision/release risk — pass: reviewer READY with 0 findings; final ADV validation passed with only expected `NO_DELTAS` warning.
7. open follow-ups — n/a: no required follow-ups, ops obligations, or blocking caveats recorded.
8. next action — pending: user acceptance proceeds inline to harden/release checks for `bounceDeployedWorkers`; fixes or re-entry remain available before acceptance.