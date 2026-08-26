# Design

## Architecture Overview

Close is the only terminal transition without a durable destination. Archive writes a bundle to `paths.archive` before cleanup; Epic retirement writes a projection to `paths.retiredEpics`. Close writes nothing and then deletes its own record.

The design adds the missing destination rather than changing the cleanup primitive, and mirrors the two retirement patterns already working in this repo:

| Transition | Durable destination | Loader | Status |
|---|---|---|---|
| archive | `paths.archive` | `loadArchivedChanges()` `store-disk.ts:182-193` | exists |
| epic retire | `paths.retiredEpics` | `listRetiredEpicProjections()` `epics-disk.ts:234` | exists |
| **close** | **`paths.closed`** | **`loadClosedChanges()` + get-path probe** | **added here** |

Both read surfaces matter. A durable bundle that only `list` can see still fails a lookup by id, which is how the defect presents to an operator.

## Key Decisions

### KD1 — Add `paths.closed` as a sibling of `paths.archive`

**Lever:** `json.ts:70-74` declares the mutable path block. `store-disk.ts:175-180` creates those directories at init — the call site where a new path takes effect. A path added to the type without an `mkdir` here is inert on fresh stores.

Reusing `paths.archive` with a status marker was rejected: `loadArchivedChanges()` filters `status === "archived"` at `store-disk.ts:192`, so closed records placed there would be invisible to it and would force that filter to serve two populations.

### KD2 — Bundle directory named by plain change id, not date-prefixed

**Lever:** `json.ts:515-542` (`hasArchiveBundle`). Archive bundle names are not canonical, which forced a fallback enumerating every archive directory and parsing each `change.json` to match on `id` (`json.ts:523-530`).

Closed bundles use `closed/<changeId>/change.json` so lookup is a direct path probe. This is the one place the design deliberately does **not** mirror archive. Accepted cost: closed bundles carry no date in the directory name.

### KD3 — Write and verify the bundle before any cleanup

**Lever:** `handlers-lifecycle.ts:824-849` (the `coordinateChangeMutation` setting closed state) and `:865` (`removeChangeDir`). New ordering, matching archive's proven sequence at `handlers-archive.ts:708-715` → `:975-1025` → `:1125`:

1. Write closed state to the active record (existing mutation, unchanged).
2. Write the closed bundle to `paths.closed`.
3. Read the bundle back; confirm it parses with matching `id` and `status: "closed"`.
4. Only then call `removeChangeDir`.

Step 3 follows the read-after-write proof already used by `verifyStatusRepairReadAfterWrite` (`recovery.ts:26-87`). Satisfies AC1 and C5.

### KD4 — Bundle-write failure is fatal; cleanup failure stays non-fatal

**Lever:** `handlers-lifecycle.ts:859-869`, whose comment asserts *"the closed status is durable"* and treats cleanup failure as a warning.

C4 forbids non-fatal cleanup failure **"while cleanup can destroy the only copy."** KD3 removes that precondition, so the clause no longer binds and the existing non-fatal treatment becomes lawful — matching the zombie-shadow class archive already tolerates (`json.ts:506-513`, `handlers-archive.ts:1124-1130`). What inverts is the new step: bundle-write or readback failure returns an error and does **not** delete. Satisfies AC4 and C4, and honors C1 by repairing ordering rather than wrapping the destructive path.

Validator specifically examined this tension and confirmed the reading.

### KD5 — `loadClosedChanges()` mirroring `loadArchivedChanges()`

**Lever:** `store-disk.ts:413-414` reads `includeClosed` but only widens a filter over the active-directory enumeration; `:431-434` is where archived records merge in from a second source. The closed merge goes alongside it, filtering `status === "closed"`. Satisfies AC3.

### KD10 — Closed probe in `changes.get` *(added after validation)*

**Lever:** `store-disk.ts:484-539` (`changes.get`), which already carries archive dominance and self-heal but has no closed source. Mirror the archive fallback at `:510-526` with a direct probe of `closed/<changeId>/change.json`.

Without this, AC2 fails even with KD1–KD5 complete: `adv_change_show` on a closed change still returns "Change not found", reproducing the original symptom. `list` and `get` are separate read surfaces and the agreement covers both. This gap was found by the independent validator, not by the original design pass.

### KD11 — One guarded cleanup helper *(added after validation)*

**Lever:** `handlers-lifecycle.ts:865`, plus the latent pair `closeBatch` (`store-disk.ts:621-680`) and `sweepClosedChangesFromDisk` (`disk-sweep.ts:52-81`), which delete closed records with no durable destination. That pair is unreachable today — `tool-registry.ts:777` registers only `adv_change_close` — but it is the same defect waiting to be wired.

Cleanup of a closed record routes through a single helper that requires proof of a readable bundle before deleting. Making the unsafe ordering unrepresentable is structural correctness (P33); leaving the latent path intact would mean fixing this defect once and leaving a copy of it in the store layer.

### KD6 — Typed outcome discriminant on the close response

**Lever:** `handlers-lifecycle.ts:806-816` (preview) and `:870-877` (commit). Both lead with `success: true` and differ only by an optional `dryRun` flag and prose in `message`.

Add `outcome: "previewed" | "closed"` to both. `success` and `dryRun` are retained for existing callers. Satisfies AC5.

### KD7 — Archive noOp retires the active record

**Lever:** `archive-gate.ts:854-862` (the `phase9: "skip"` early return) and `:907-919` (post-finalization return). Neither mutates `lifecycleState`; the early branch performs no mutation at all. Both retire the active record before returning. `completeArchivedBundleRelease` (`:511-680`) needs no change — validator confirmed its guard at `:772-784` means it only runs when the record is already gone. Satisfies AC6.

### KD12 — `terminal-history` gains a closed source *(added after validation)*

**Lever:** `terminal-history.ts:378-414`, which enumerates `changes/` for closed rows. Test-only consumer today, but it belongs to the cross-surface terminality invariant family and would silently lose closed rows once they move to `paths.closed`.

### KD8 — Legacy reconciliation ships as a doctor-CLI repair

**Lever:** `doctor-cli.ts:165`, which already hosts `--purge-archive`. The five affected records live in *other projects'* stores, so a repo-local script cannot reach them. The reconcile is an idempotent, operator-invoked CLI repair setting `lifecycleState: "closed"` where `status === "closed"`, leaving `closure` untouched. Satisfies AC7 and C2.

### KD9 — Skill routes operators to the CLI

**Lever:** `skills/adv-cleanup/SKILL.md` lines 37, 92, 176, 308 — four sites instructing agents to recommend `adv_archive_purge`, a handler at `handlers-archive.ts:1222-1289` absent from the agent catalog. Text routes the operator to the doctor CLI. Guidance is corrected, not deleted, per DONT4, and states plainly that remediation requires an operator, per DONT1.

## Implementation Strategy

1. **Path and loaders** — `paths.closed` (`json.ts`), `mkdir` at init, `loadClosedChanges()` and its list merge, closed probe in `changes.get` (KD1, KD5, KD10). Verifiable against a hand-placed fixture bundle before close can produce one.
2. **Guarded cleanup** — single helper requiring bundle proof; close rewired to it (KD3, KD4, KD11). This stops the bleeding.
3. **Response discriminant** (KD6).
4. **Archive noOp retirement** (KD7).
5. **Terminal-history closed source** (KD12).
6. **Doctor CLI reconcile** (KD8).
7. **Skill text** (KD9).

Steps 1–2 together satisfy AC1–AC4 and are the shippable core. Steps 3–7 are independent afterwards.

## LBP Analysis

The long-term-correct shape is the one this repo already chose twice. Archive and Epic retirement both express terminal state as a record moved to a retired projection, not a status flag on a live record. Close is the outlier, and the outlier is what loses data.

No external library is relevant; this is an internal storage-layout defect, so the External-Solution Check is skipped.

The "never delete" alternative was rejected in discovery for layout consistency. Validation strengthened that rejection: a MUST-removal requirement exists in spec law, so never-delete is not merely inconsistent but unlawful.

## Affected Components

| Component | Change |
|---|---|
| `plugin/src/storage/json.ts` | `AdvPaths.closed` |
| `plugin/src/storage/store-disk.ts` | init `mkdir`; `loadClosedChanges()`; list merge; **closed probe in `changes.get`**; `closeBatch` routed through guarded cleanup |
| `plugin/src/storage/disk-sweep.ts` | `sweepClosedChangesFromDisk` routed through guarded cleanup |
| `plugin/src/tools/change/handlers-lifecycle.ts` | close ordering, readback proof, fail-closed, `outcome` field |
| `plugin/src/tools/change/archive-gate.ts` | retire active record on both noOp branches |
| `plugin/src/storage/terminal-history.ts` | closed-path source |
| `plugin/src/doctor-cli.ts` | legacy reconcile repair |
| `skills/adv-cleanup/SKILL.md` | four routing sites |

## Design-Derived Criteria

DDC1: The closed bundle must be read back and parse with matching `id` and `status: "closed"` before cleanup runs. A write not proven readable is a failed write.

DDC2: `paths.closed` must be created at store init. A fresh store must list closed changes without error and return an empty set.

DDC3: The legacy reconcile must be idempotent — a second run over reconciled records makes no writes and reports zero changes.

DDC4: Closed bundle lookup must resolve by direct path probe on `closed/<changeId>/change.json`, without enumerating and parsing sibling directories.

DDC5: The `outcome` discriminant must be present on both preview and committed close responses.

DDC6: `changes.get` must return a closed change by id after its active directory is gone, including `closure.reason` and `closure.approval_evidence`.

DDC7: No code path may delete a closed record without first proving a readable bundle. The unsafe ordering must be unrepresentable, not merely unused.

## Validation Result

Independent validator (`adv-researcher`, `researcher:design-validation`, attempt 1): **caution**, confidence high, risk medium. All nine original KD levers verified at file:line. Architecture deviation assessed MINOR — the gaps were additive read-surface coverage, not architecture.

Required amendment, now integrated as KD10: closed fallback in `changes.get`. The validator carried this in `validation.notes` rather than as a typed blocker because the contract registry had not yet machine-indexed the inline-approved `AC2` id, and it declined to invent a registry id.

Advisory items integrated as KD11 and KD12. One advisory deferred — see Risks.

Recorded tradeoffs: a third terminal tree multiplies consistency surfaces; zombie closed shadows become legal after proof; plain-id directories drop date metadata; the doctor CLI writes across projects.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Fresh or existing stores lack `closed/`, so listing throws | DDC2 — `mkdir` at init beside the existing `changes`/`activeEpics`/`retiredEpics` calls |
| A read surface is missed again, as `changes.get` was | DDC6 and DDC7 name both surfaces explicitly; `terminal-history` added as KD12 |
| Latent `closeBatch`/sweep path destroys data once wired | KD11 makes unguarded cleanup unrepresentable rather than merely unreachable |
| Closed bundles accumulate without bound | Accepted. Identical to archive; `adv_archive_purge` sets the operator-gated disposal precedent |
| Reconcile writes to other projects' stores | Operator-invoked, idempotent per DDC3, touches one field, leaves `closure` intact per C2 |
| Changes destroyed before this fix stay unrecoverable | Not mitigable. Recorded as SC4 — operators are told plainly |
| `fixArchiveLifecycleLeak` closed with the broken tool, destroying its evidence | C3 holds it open until AC1–AC4 pass |
| **Deferred:** no spec requirement governs close retirement, so this contract is code-only and can regress silently | Validator advised a spec delta. Out of approved scope for this change; routed to prep as a named follow-up rather than left unowned |
