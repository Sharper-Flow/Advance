## Summary

`adv_change_close` destroys a change instead of closing it. The change is removed from the active store, no closed record is written, and the tool returns `success: true`. Observed in the pokeedge project store (`4d6b589871e3687c746bf043301cfb4ac98ea049`), which holds 276 open changes against 5 closed records — all 5 dating from July 2026.

## Root Cause Analysis

### Defect 1 — close deletes without recording (data loss)

Reproduced live on 2026-08-26 against change `enableMergeQueue`.

Call:

```
adv_change_close changeId:"enableMergeQueue" reason:"not_planned"
                 approvedByUser:true approvalEvidence:"<cited>"
```

Response:

```json
{"success": true, "changeId": "enableMergeQueue", "message": "Closed change enableMergeQueue as not_planned."}
```

Measured before/after, same session, no other mutations:

| Probe | Before | After |
|---|---|---|
| `adv_change_list status:"draft"` total | 90 | 89 |
| `adv_change_list status:"closed"` total | 5 | 5 |
| `adv_change_show changeId:"enableMergeQueue"` | change returned | `{"error":"Change not found: enableMergeQueue"}` |

The draft count decremented. The closed count did not increment. The change is unreadable. Therefore the close path removes the change from the active store and does not persist a terminal record.

`enableMergeQueue` proposal content is unrecoverable from the store as a result of this reproduction.

Consequence at scale: the operator reported closing a large batch of changes across prior sessions and finding the closures "did not commit". Those changes were deleted, not closed. The closed list has not been written to since 2026-07-19. Any batch closure run against this code path is silent data loss.

### Defect 2 — dryRun preview is indistinguishable from a committed close

Preview response:

```json
{"success": true, "dryRun": true, "changeId": "removeUnreachableStdioBodies",
 "reason": "not_planned", "message": "Would close change removeUnreachableStdioBodies as not_planned."}
```

Committed response:

```json
{"success": true, "changeId": "enableMergeQueue", "message": "Closed change enableMergeQueue as not_planned."}
```

`success: true` is the first field in both. The only discriminators are the presence of `dryRun` and the word "Would" inside a prose message. A caller batching closures and branching on `success` — the field the name invites you to check — reports every preview as a committed closure. This is a response-contract hazard, not operator error: the two outcomes are structurally near-identical.

The two defects compound. A batch that previewed reports success and changes nothing. A batch that committed reports the same success and destroys the changes. Neither leaves a closed record, so both look the same afterward.

### Defect 3 — `lifecycleState` never advances on close

The 5 surviving closed changes carry an internally inconsistent state. Confirmed independently on `shardUnitTestLane` and `enforceFieldSemantics`:

```
status:         "closed"
lifecycleState: "open"          <- never advanced
closure:        { approved_by_user: true, approved_at: "...", reason: "...", evidence: "..." }
lastSignalAt:   <predates closure.approved_at>
```

The `closure` block is written correctly with full approval metadata. `lifecycleState` is not advanced, and no activity signal is emitted at close time (`lastSignalAt` remains earlier than `closure.approved_at`).

Consequence: any consumer reading `lifecycleState` rather than `status` counts a closed change as open. This is a candidate contributor to `portfolioState.never_terminal_share: 0.72`, though that link is inferred from the field semantics and is not yet directly proven.

### Scope note — a separate accretion source, not part of this change

Independent of the close path, a large cohort of changes sits at `status: "draft"` with `phase: "release"` or `"released"`: `fixCnVariantProjections`, `fixPriceRefreshCadence`, `fixMigrationLifecycleSafety`, `defineProductionSupportControl`, `allowlistCardProvider`, `fixCnPricechartingSubstring`, `repairAliasSplitCardRows`, `fixMigrationChecksumBypass`, and others. These completed the lifecycle and never retired.

The live example is `verifyMergedScannerImage`, whose archive returned `phase9: "pending_merge"` while its PR sits in the GitHub merge queue. If archive does not resume and finalize after the merge lands, every shipped change strands itself in `draft` permanently. This is probably the larger contributor to the 276 open count, but it is a distinct defect in the archive resume path and belongs in its own change.

## Evidence status

| Claim | Status |
|---|---|
| Close deletes without writing a closed record | Proven — before/after counts plus unreadable change |
| dryRun and committed responses are near-identical | Proven — both payloads captured verbatim |
| `status` / `lifecycleState` desync on close | Proven — 2 changes inspected independently |
| No signal emitted at close | Proven — `lastSignalAt` predates `closure.approved_at` |
| Desync drives `never_terminal_share` | Inferred, not proven |
| Prior operator batches were destroyed by this path | Consistent with all evidence, not directly proven — the failed attempts left nothing to inspect, which is itself the defect |

## Required outcome

1. A close writes a durable terminal record, or it fails loudly. It must never remove a change while reporting success.
2. Close advances `lifecycleState` to a terminal value and emits an activity signal, keeping `status`, `lifecycleState`, and `lastSignalAt` mutually consistent.
3. A preview is not mistakable for a commit at the response-contract level.
4. Determine whether the changes destroyed by prior batch closures are recoverable from any store backup, and report the finding before remediation code lands.

## Constraints

- Repair the owning persistence invariant. Do not add a caller-side guard, retry, or verification wrapper around a close path that still deletes (P40).
- The 5 existing July closed records must survive any migration.
- Investigate backup/recovery before shipping a fix, so remediation does not overwrite whatever residue remains.