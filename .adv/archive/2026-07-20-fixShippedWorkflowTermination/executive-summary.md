# Executive Summary: Fix shipped workflow termination

## Outcome

Added a "shipped_terminal" eligibility branch to `adv_change_workflow_terminate`. Operators can now recover a shipped change whose Temporal workflow remains `RUNNING`/`PAUSED` with no poisoned-history evidence — the exact deadlock that blocked `fixWorkflowReliabilityDefects` recovery. The existing poisoned-history path is preserved unchanged.

## Why It Matters

A shipped change can retain a live workflow whose describe shows no poison even though all terminal disk evidence (7 gates done, phase9 done, archive bundle written) proves the change is shipped. The recovery tools deadlocked: `adv_change_workflow_terminate` refused (no poison), `adv_archive_purge` refused (live status still draft). This stale live authority degraded conflict inventory, archive reads, and merged-branch cleanup project-wide.

## What Was Built

- **Two eligibility classes** in one tool: `poisoned_history` (existing — terminate + cache refresh) and `shipped_terminal` (new — terminate + atomic status/lifecycleState=archived convergence + readback).
- **Structural proof helper** `computeShippedTerminalProof` with 6 typed refusal codes: PROOF_INVALID_DISK_PROJECTION, PROOF_MISSING_GATES, PROOF_MISSING_PHASE9, PROOF_NO_BUNDLE, PROOF_INVALID_BUNDLE, PROOF_BUNDLE_ID_MISMATCH.
- **`convergeTerminalAuthority`** function funnels all convergence through one path with two successor-race checks (#1 pre-write, #2 post-readback TOCTOU).
- **Typed partial-recovery shapes** for every convergence failure: `successorRace`, `lateSuccessorRace`, `writeFailed`, `readbackFailed` — all return `success:false, partialRecovery:true, pinnedRunTerminated:true, converged:false, remediation`.
- **Atomic lifecycleState write** in `saveRecoveredChangeStatus` (closes the stale `lifecycleState:"open"` literal leak).
- **Extended `verifyStatusRepairReadAfterWrite`** with `requireLifecycleState` flag (asserts both `status` AND `lifecycleState` converged).
- **Tool description** documents both classes, refusal codes, and convergence semantics.

## Verification

- **93 unit tests pass** across 5 affected files (change.workflow-terminate: 29, change.status-repair: 15, _recovery-writers: 30, shipped-terminal-proof: 12, recovery-readback: 7).
- **Typecheck clean**, **lint clean**.
- **AC9 E2E regression** reproduces the `fixWorkflowReliabilityDefects`-shaped wedge: dryRun qualifies as `shipped_terminal`; execution terminates exact pinned run + converges; readback proves `show=archived, in-flight=0, archived=1`; idempotent re-invoke routes to `adv_archive_purge`.
- **Independent reviewer** (adv-reviewer) returned BLOCKED with 2 blockers + 1 doc issue; all three remediated inline with new tests added.
- **Design validated** twice by adv-researcher; all 14 design decisions (D1-D14) mapped to AC1-AC10.

## Risks and Follow-ups

- **Delta hydration defect**: `adv_delta_add` returned `success:true` for `dl-shippedWorkflowTermination01` but `adv_change_show deltas:{}` reads empty. Tool contract authoritative; sibling fast-follow needed if it persists project-wide.
- **`adv-engineer` sub-agent** failed twice with empty returns during execution; switched to inline per dispatch-failure rules. Underlying spawn defect not investigated here.
- **Pre-existing format warning** on `adv-arch-scan-assets.test.ts` (from prior `addCapabilityConsistency` change, not this work).
- **Live recovery of `fixWorkflowReliabilityDefects`** still pending: requires plugin rebuild + redeploy + OpenCode restart before the new tool behavior is available to the host. After redeploy, re-run `adv_change_workflow_terminate` with shipped_terminal evidence to recover the wedge.
- **Compatibility with active `fixPoisonedRecovery`**: this change is its fast-follow. Touch regions are non-overlapping (terminate tool vs probe-first recovery sites); rebase may be needed if `fixPoisonedRecovery` lands first.

## Spec-law

Adds `rq-shippedWorkflowTermination01` to `advance-workflow` (delta `dl-shippedWorkflowTermination01`, 4 scenarios). Existing `rq-toolOwnership01`, `rq-changeLifecycleState01`, `rq-fix-archive-recovery-disk-write` remain authoritative.

## Release Readiness Summary

- **Value**: Unblocks recovery of shipped-terminal workflows that deadlock existing tools; restores project-wide read consistency.
- **Enabling-only/follow-up dependency**: none blocking; live recovery of `fixWorkflowReliabilityDefects` is the first consumer after redeploy.
- **Ops readiness**: operator-only, approval-gated, opt-in via explicit `approvedByUser:true` + `approvalEvidence`. No automatic bulk repair.
- **Migration/data impact**: none. No schema migration, no DB changes.
- **Frontend/preview impact**: none. Tool/recovery surface only.
- **Collision/release risk**: low. Non-overlapping touch regions with active `fixPoisonedRecovery`.
- **Open follow-ups**: delta hydration defect (sibling fast-follow); adv-engineer spawn defect (separate investigation).
- **Next action**: rebuild plugin (`pnpm run build`), redeploy (`scripts/deploy-local.sh --fix`), restart OpenCode, then run `adv_change_workflow_terminate changeId:"fixWorkflowReliabilityDefects" approvedByUser:true approvalEvidence:"..."` to recover the original wedge.