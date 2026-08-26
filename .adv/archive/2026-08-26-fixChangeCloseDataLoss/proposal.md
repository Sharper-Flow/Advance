# Fix change close data loss

## Why

`adv_change_close` verifies a durable closed record, then deletes the directory that holds it. The operator loses the change and receives `success: true`. Reproduced live on 2026-08-26.

This change also absorbs `fixArchiveLifecycleLeak` (see `## Supersession`), because both defects share one root: a terminal lifecycle transition that does not leave a readable terminal record.

## Root Cause Analysis

**Defect origin:** `adv_change_close` reports success while destroying the change.

### Evidence gathered

**Tier 1 (local) — reproduction.** Called against `enableMergeQueue` in project `4d6b589871e3687c746bf043301cfb4ac98ea049`:

| Probe | Before | After |
|---|---|---|
| `adv_change_list status:"draft"` total | 90 | 89 |
| `adv_change_list status:"closed"` total | 5 | 5 |
| `adv_change_show changeId:"enableMergeQueue"` | change returned | `{"error":"Change not found"}` |

Response: `{"success": true, "changeId": "enableMergeQueue", "message": "Closed change enableMergeQueue as not_planned."}`

**Tier 1 (local) — source.** `plugin/src/tools/change/handlers-lifecycle.ts`, `advChangeCloseHandler` (from line 742):

- Lines 833-844 set `status: "closed"` and `lifecycleState: "closed"` and write the `closure` block.
- Lines 845-847 `verifyProjection` reads back and confirms both fields.
- Lines 859-869 then call `removeChangeDir(activeStore.paths.changes, changeId)`, deleting `changes/<id>/`.
- The inline comment asserts *"the closed status is durable"* and treats cleanup failure as a non-fatal warning.

**Tier 1 (local) — history.**

| Date | Commit | Effect |
|---|---|---|
| 2026-08-05 | `45ab2ef9` (#373) | `removeChangeDir` introduced into the close path |
| 2026-08-06 | `c231b2eb` (#393) | "complete Temporal removal" — disk becomes the sole store |

**Leading hypothesis:** `removeChangeDir` was safe when Temporal held a durable projection independent of `changes/<id>/`. Temporal removal one day later made the on-disk directory the only copy of the record. The cleanup step outlived its safety precondition. Verification still passes because it runs *before* the delete, so the handler returns `success: true` honestly and the data is destroyed immediately afterward.

**Ruled-out paths:**

- *Close never writes a terminal record.* Rejected — the code writes and verifies `status` and `lifecycleState`, and `changes.close-storage.test.ts` asserts `lifecycleState: "closed"`.
- *`lifecycleState` desync is a live defect.* Rejected — the desync visible on the five July records predates `c231b2eb` (2026-08-06), which is when close began writing the field. Those records survive only because they also predate `removeChangeDir` (2026-08-05). Legacy residue, not active behavior.
- *Client timeout with server-side persistence.* Rejected for this defect — the reproduction returned immediately with no timeout.

**Spec-law impact:** the close contract promises an auditable terminal record with approval metadata. Current behavior makes that record unreadable, so closure audit trails cannot exist. Any capability spec asserting closure auditability is unsatisfiable as built.

**Bypass rationale:** RCA was produced inline because the reproduction, source trace, and history bisect were completed during the diagnostic session that created this change, before `/adv-problem` could add information.

## Supersession

This change supersedes `fixArchiveLifecycleLeak`, whose evidence is preserved verbatim below. **That change must not be closed with `adv_change_close` until this defect is fixed** — closing it would destroy the evidence it carries.

Its two defects, restated:

- **Archive noOp path never retires the active record.** When `adv_change_archive` runs against a change already carrying `status: "archived"` plus an existing bundle, it short-circuits with `noOp: true` and leaves `lifecycleState: "open"`. Reproduced on 7 changes in the pokeedge batch of 2026-08-24: `defineProductionSupportControl`, `fixMigrationLifecycleSafety`, `addGradedWritePauseControl`, `addGradedLabelMigration`, `fixPriceRefreshCadence`, `fixMarketPriceProvenance2`, `honorWriterFenceDeploys`. Fresh archives with no pre-existing bundle retire correctly. Consequence: in-flight count read 74 against a true count near 67.
- **`adv_archive_purge` does not exist.** The bundled `adv-cleanup` skill routes Surface-4 state leaks to it. The 35-tool catalog confirms absence, and `adv_worktree_cleanup` describes the archive-repair surface as retired. Operators have no remediation path, and direct state-file edits are forbidden.

Independently confirmed while scoping: there is no `adv_backlog_*` tool either, though `adv_status` surfaces 18 backlog items under `future_work.backlog`. Same shape — state that is visible but not addressable.

## What Changes

Behavior, stated without prescribing mechanism:

- A close leaves a terminal record that survives and remains readable, or the close fails loudly and changes nothing.
- Archive on the already-bundled path retires the active record rather than short-circuiting.
- A preview outcome is not mistakable for a committed outcome at the response-contract level.
- The documented remediation surface either exists or stops being documented.
- Legacy residue from before 2026-08-06 is reconciled or explicitly declared out of scope.

## User Outcomes

- [ ] An operator who closes a change can still find that change afterward, with its reason and approval evidence intact.
- [ ] An operator who closes many changes in a batch can tell how many actually closed.
- [ ] An operator can distinguish a rehearsal from a real closure without reading prose in a message field.
- [ ] A change that has been archived stops appearing in active work and portfolio counts.
- [ ] An operator who finds a leaked or inconsistent record has a supported way to repair it.
- [ ] Operators can determine whether changes destroyed by earlier batch closures are recoverable.
- [ ] Discovery will firm acceptance criteria and success criteria.

## Affected Code

- `plugin/src/tools/change/handlers-lifecycle.ts` — `advChangeCloseHandler`, close ordering and response contract
- `plugin/src/tools/change/` — archive noOp short-circuit path
- `plugin/src/tool-registry.ts` — tool surface, including any remediation tool
- `skills/adv-cleanup/` — references a tool that does not exist
- Close and archive storage tests asserting terminal-state contracts

## Related Repositories

Single repo. Symptoms observed in the pokeedge project store; the defect is entirely owned by this repo.

## Constraints

- Repair the owning invariant. Do not wrap the destructive path in caller-side verification, retry, or a guard that leaves the delete intact (P40).
- The five surviving July closed records must survive any migration or reconciliation.
- Investigate recoverability of already-destroyed changes before remediation code lands, so a fix does not overwrite surviving residue.
- Do not close `fixArchiveLifecycleLeak` until this defect is fixed.

## Impact

Operator-facing data loss, already realized at unknown scale. Every batch closure run since 2026-08-06 destroyed its changes. Portfolio metrics across projects are unreliable in both directions: closed work vanished, archived work never retired.

## Risks

- Recovery may be impossible for already-destroyed changes; the failed operations left nothing to inspect, which is itself the defect.
- Legacy records straddle three code eras (pre-`removeChangeDir`, pre-Temporal-removal, current). Reconciliation may need era detection.
- The archive noOp path and close path may not share an owner, so a single fix may not cover both.

## Scope

### In Scope

- Close path: terminal record durability and ordering relative to cleanup
- Close path: response contract distinguishing preview from commit
- Archive noOp path: retiring the active record
- Existence or removal of the documented purge/remediation surface
- Recoverability assessment for already-destroyed changes
- Reconciliation of pre-2026-08-06 legacy residue, or explicit deferral with rationale

### Out of Scope

- The `status: "draft"` with `phase: "release"` strand cohort, where a shipped change never resumes archive after a pending merge. Related, separately owned, and needs its own change.
- Intermittent ADV mutation timeouts that persist server-side while the client sees failure. Carried forward from `fixArchiveLifecycleLeak` as an observation only.
- Absence of `adv_backlog_*` tooling.
- Any change to approval semantics for closing.

### Must Not

- Must not add a verification wrapper, retry, or fallback around a close path that still deletes the record.
- Must not delete or rewrite the five surviving July closed records.
- Must not close `fixArchiveLifecycleLeak` using `adv_change_close` before the defect is fixed.
- Must not treat cleanup failure as non-fatal while cleanup can destroy the only copy.
- Must not resolve the missing purge surface by deleting the skill documentation alone, leaving operators with no remediation path.

## Discovery Agenda

1. Does any durable record survive `removeChangeDir`, or is the directory the sole copy? Determines whether recovery is possible at all.
2. Are destroyed changes recoverable from filesystem backups, snapshots, or an append-only log? Time-sensitive — backups may rotate.
3. How many changes were destroyed since 2026-08-06, and across which projects?
4. Does the archive noOp path share an owner with the close path, or need a separate fix?
5. What did `adv_archive_purge` do before retirement, and what replaced it?
6. Why did `verifyProjection` succeed against a record about to be deleted — is verification reading a cache rather than the durable surface?
7. Do the five July records need migration to the current field contract, or should they stay as-is?
8. Is `removeChangeDir` used on any other path that also lost its Temporal precondition in #393?

## Context

Discovered while diagnosing why bulk closures in the pokeedge project did not persist: 276 open changes against 5 closed records, all 5 from July 2026. The reproduction that proved the defect destroyed `enableMergeQueue`, whose content is unrecoverable.
