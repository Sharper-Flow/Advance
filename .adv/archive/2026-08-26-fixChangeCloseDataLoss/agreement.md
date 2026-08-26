# Agreement

## Scope Amendment (2026-08-26)

Scope was trimmed after execution began, by explicit user decision, because Advance is being replaced by Concord (bootstrapped 2026-08-07, 291 commits, active). The data-loss fix ships. The hardening work does not.

Retained and delivered: AC1, AC2, AC3, AC4 — the criteria that stop the loss.

Withdrawn to Out of Scope: AC5, AC6, AC7 and the skill correction. Each is real, none is load-bearing for stopping the loss, and all of them harden a tool being retired. Tasks tk-76435331f6ea, tk-049d97c06f44, tk-694eaa894127, tk-b3336de90873 and tk-0d7b1ae5c482 were cancelled with per-task reasons recorded.

The withdrawn items are recorded below rather than deleted, so the decision stays legible.

## Objectives

1. Make a successful close leave a durable, readable record of the closed change.
2. Make a failed close leave the change intact rather than destroyed.

Withdrawn objectives: make preview structurally distinguishable from committed; retire the active record on the archive noOp path; reconcile the five pre-2026-08-06 closed records; correct the `adv-cleanup` skill routing.

## Success Criteria

SC1: An operator who closes a change can still find that change afterward, with its reason and approval evidence intact.

SC4: An operator is told plainly that changes closed between 2026-08-06 and this fix are permanently unrecoverable.

Withdrawn: SC2 (batch close counts, depended on AC5) and SC3 (archived changes leaving active counts, depended on AC6).

## Acceptance Criteria

AC1: Given a change being closed, when close completes successfully, then a durable record of that change survives the operation and remains readable.

AC2: Given a closed change, when it is looked up by id, then its reason and approval evidence are returned. [warrant: tool:adv_change_show]

AC3: Given a closed change whose active directory no longer exists, when closed records are listed, then that change is returned. [warrant: tool:adv_change_list#includeClosed]

AC4: Given close cannot write a durable record, when close runs, then it returns an error and leaves the change intact.

## Constraints

C1: Must not add a verification wrapper, retry, or fallback around a close path that still deletes the record.

C2: Must not delete or rewrite the closure content of the five surviving July records. Held trivially — no migration ran.

C3: Must not close fixArchiveLifecycleLeak with adv_change_close until AC1 through AC4 pass.

C4: Must not treat cleanup failure as non-fatal while cleanup can destroy the only copy.

C5: Must write the durable record before any source cleanup runs, not after.

## Avoidances

DONT2: Do not attempt reconstruction or enumeration of already-destroyed changes.

DONT3: Do not add provenance notes to migrated records. Version control is the record. Moot — no migration ran.

Withdrawn with their task: DONT1 (do not expose adv_archive_purge as an agent tool) and DONT4 (do not resolve the skill mismatch by deleting the guidance). Both remain true as standing guidance; neither is enforced by this change. The `adv-cleanup` skill still routes agents to a CLI-only tool at lines 37, 92, 176 and 308.

## Out of Scope

OOS1: The `status: "draft"` with `phase: "release"` strand cohort, where a shipped change never resumes archive after a pending merge. Separately owned.

OOS2: Intermittent ADV mutation timeouts that persist server-side while the client sees failure. Observation only. Observed repeatedly during execution; one batch call persisted 1 of 5 items, a later one persisted 4 of 4, so the write is not atomic and not deterministic.

OOS3: Absence of `adv_backlog_*` tooling.

OOS4: Any change to approval semantics for closing.

OOS5 (withdrawn AC5): A typed outcome discriminant on the close response. `success: true` still precedes the `dryRun` and `noOp` discriminators, so a preview still reads as a commit at a glance. This is the property that made the original defect invisible.

OOS6 (withdrawn AC6): Retiring the active record on the archive noOp branches at `archive-gate.ts:843-919`. Exercised live during this change on `verifyMergedScannerImage` and behaved correctly, so it is benign in current use.

OOS7 (withdrawn AC7): Migrating the five pre-2026-08-06 closed records to carry `lifecycleState: "closed"`. Those records predate `removeChangeDir` on the close path and are already safe on disk; migration adds contract tidiness, not protection.

OOS8 (withdrawn): Correcting the `adv-cleanup` skill routing for the CLI-only purge tool.

## Preview Applicability

visual_surface: false

Rationale: the change touches plugin storage internals and tool response contracts. No front-end, browser-visible, or visual output can be affected.

preview_expectation:
- exact_route_required: not_applicable
- data_state_expectation: not_applicable
- viewport_expectation: not_applicable
- rationale: no visual surface exists for this change.

## Decisions

### User Decisions

**Closed-record destination — closed bundle mirroring archive.** Close writes a durable bundle before any cleanup, exactly as archive already does at `handlers-archive.ts:708-715`. Chosen over never-deleting because it reuses the path already proven safe and keeps closed work out of the active directory.

**Blast radius — record the loss, do not investigate.** No durable record survives `removeChangeDir` on the close path, so enumeration would rely on indirect traces and stay incomplete regardless of effort. The count of destroyed changes is unknowable. Effort goes to the fix.

**Scope trim — ship the fix, drop the hardening.** Taken 2026-08-26 with the core fix built and unmerged. The alternative workaround, "stop calling `adv_change_close`", was rejected: it is a rule agents must remember while the tool stays exposed, and it was violated within this very session. Merging a structural guard is cheaper than enforcing that discipline.

### Agent Decisions (LBP)

**Root cause is a missing destination, not a broken delete.** Three call sites reach `removeChangeDir`. Archive (`handlers-archive.ts:1125`) writes a bundle first. Purge (`:1269-1271`) is a deliberate operator-gated dual-delete. Close (`handlers-lifecycle.ts:865`) writes nothing first. The fix belongs at the missing destination, not in the cleanup primitive, which is correct for its other two callers.

**Sole-entry claim verified, not assumed.** An exhaustive scan of `rm`/`unlink`/`rmdir` against `changes/` paths across `plugin/src`, excluding tests, found exactly one destructive site lacking a backing copy.

**Two inherited claims corrected.** `adv_archive_purge` exists at `handlers-archive.ts:1222-1289` and is registered at `doctor-cli.ts:165`; the retired tool was `adv_archive_repair`, deleted in `529cb4b4` on 2026-07-22. The archive noOp path lives in `archive-gate.ts:843-919`, not `handlers-archive.ts`.

**Recoverability closed as a finding, not carried as work.** No `.bak`, snapshot, trash, or journal exists for `changes/`. `operation_ledger` is a field inside `change.json` and dies with the directory. The two append-only audit logs do not record close events. This became SC4.

**`sweepClosedChangesFromDisk` guarded rather than deleted.** It has zero production callers, which reads as dead code under P41, but it cites spec `rq-bulkCloseDiskSweep01`, making it a governance reference. A RED run showed it deleting a record outright, so wiring that spec as written would have reproduced this defect at bulk scale. The spec remains unimplemented; that is a separate finding, not work carried here.

## Deferred Questions

None.

## Sign-Off

Criteria approved inline at the Phase 4.5.1 checkpoint. Scope amended 2026-08-26 by explicit user selection at the scope checkpoint.
