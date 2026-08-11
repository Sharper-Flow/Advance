# Store Reconciliation

> **Version:** 1.1.0
> **Updated:** 2026-08-11

## Purpose

Capability: Store Reconciliation

## Requirements

### Dry-run-first plan with plan_hash approval gate

**ID:** `rq-storeReconcileDryRunPlanHash01` | **Priority:** **[MUST]**

The store reconcile pass MUST be dry-run-first: the default mode performs classification and planning only, emits a complete typed plan plus a plan_hash (SHA-256 of the canonicalized plan JSON), and writes no store records. An apply-mode invocation MUST require a confirm_plan_hash equal to a prior dry-run's plan_hash and MUST re-verify that hash against a fresh scan before mutating; a mismatch is a typed refusal, never a partial mutation. The dry-run/approval contract MUST be identical on every operator surface (MCP tool and bin/adv CLI).

**Tags:** `store`, `reconciliation`, `safety`, `dry-run`

#### Scenarios

**Dry-run emits plan and hash without writes** (`rq-storeReconcileDryRunPlanHash01.1`)

**Given:**
- a target store with residue records

**When:** the operator invokes the pass in dry-run mode (default)

**Then:**
- the pass emits a complete plan and plan_hash
- zero store records are written
- the plan_hash is stable for identical store state

**Apply with stale plan_hash refuses** (`rq-storeReconcileDryRunPlanHash01.2`)

**Given:**
- a prior dry-run emitted plan_hash H
- store state changed after the dry-run

**When:** apply is invoked with confirm_plan_hash H

**Then:**
- the pass refuses with a typed stale-plan error
- zero mutations occur

---

### Legacy-envelope reconciliation direction is legacy-to-canonical only

**ID:** `rq-storeReconcileLegacyDirection01` | **Priority:** **[MUST]**

Legacy-envelope reconciliation MUST run in the legacy→canonical direction only. When a retired flat envelope lags the canonical change.json revision, the pass rewrites the envelope in legacy shape with counters set to exactly the canonical revision, preserving full before-state bytes and before/after hashes. When an envelope is newer than canonical, the pass MUST report it only and MUST NOT modify the canonical projection. The canonical projection MUST be byte-identical before and after any envelope advancement.

**Tags:** `store`, `reconciliation`, `legacy-envelope`, `safety`

#### Scenarios

**Envelope behind canonical advances exactly** (`rq-storeReconcileLegacyDirection01.1`)

**Given:**
- a legacy envelope behind the canonical revision

**When:** the pass reconciles the record

**Then:**
- the envelope is rewritten with counters equal to the canonical revision
- before-state bytes are preserved
- the canonical projection is byte-identical before and after

**Envelope newer than canonical is report-only** (`rq-storeReconcileLegacyDirection01.2`)

**Given:**
- a legacy envelope newer than the canonical revision

**When:** the pass reconciles the record

**Then:**
- the record is reported only
- neither file is written
- the canonical projection is never modified

---

### Bounded batches with receipt-sourced resumable progress

**ID:** `rq-storeReconcileBoundedResume01` | **Priority:** **[MUST]**

The reconcile pass MUST enumerate records in bounded batches and persist resumable progress: an atomic per-record receipt is written as each record completes and a progress checkpoint is persisted after each batch. Receipts are the source of truth for resume; the progress checkpoint is derivable from receipts and MUST be rebuilt from them when corrupt. A re-invocation with resume_from MUST skip records with completed receipts without re-applying their actions. A pass that terminates without a final run report MUST be derivable as interrupted, never synthesized as success.

**Tags:** `store`, `reconciliation`, `resumability`, `crash-safety`

#### Scenarios

**Resume skips completed records** (`rq-storeReconcileBoundedResume01.1`)

**Given:**
- a store exceeding the per-batch budget
- a prior pass completed receipts for a prefix of planned records before interruption

**When:** the pass is re-invoked with resume_from referencing the interrupted run

**Then:**
- records with completed receipts are skipped
- no completed action is re-applied
- remaining records are processed

**Corrupt checkpoint rebuilds from receipts** (`rq-storeReconcileBoundedResume01.2`)

**Given:**
- an interrupted run with intact receipts and a corrupt progress checkpoint

**When:** the pass is re-invoked with resume_from

**Then:**
- the checkpoint is rebuilt from receipts
- resume proceeds correctly

---

### Epic reconstruction provenance with convergence gate and no fabrication

**ID:** `rq-epicReconstructionProvenance01` | **Priority:** **[MUST]**

Epic owner-record reconstruction MUST derive entry rows from surviving child epic_membership fragment fields only (entry_id, order, title, linked_at), MUST stamp the record with a schema-validated reconstruction provenance block (reconstructed: true, source, timestamp, run_id) plus explicit gap_flags for underivable fields, and MUST pass membership convergence verification against all referencing children before counting as successful. When surviving fragments are insufficient, the pass MUST emit a bounded formally-lost report and clear dangling child memberships as explicit dry-run-visible plan entries; it MUST NEVER fabricate Epic narratives, entries, or metadata without fragment evidence.

**Tags:** `store`, `reconciliation`, `epics`, `provenance`

#### Scenarios

**Reconstructed Epic carries typed provenance and converges** (`rq-epicReconstructionProvenance01.1`)

**Given:**
- an Epic referenced by active changes but missing from disk
- surviving child fragments sufficient for reconstruction

**When:** the pass reconstructs the Epic owner record

**Then:**
- the reconstructed record validates against EpicSchema
- it carries a validated reconstruction block with gap flags
- membership convergence passes against all referencing children

**Insufficient fragments yield formal loss, never fabrication** (`rq-epicReconstructionProvenance01.2`)

**Given:**
- an Epic with insufficient surviving fragments

**When:** the pass processes the Epic

**Then:**
- a formally-lost report is emitted
- dangling child memberships are cleared as plan-visible entries
- no Epic record is written

---

### Read-only worker.lock probe with apply-mode refusal

**ID:** `rq-storeReconcileWorkerLockRefusal01` | **Priority:** **[MUST]**

The reconcile pass MUST probe the target store's worker.lock with a read-only check before any apply-mode mutation and MUST refuse with a typed error when the lock is live; dry-run mode remains permitted and writes no store records. The probe MUST NOT reclaim, unlink, or otherwise mutate the lock. Dead-lock reclamation is owned by existing store-cleanup machinery and is out of scope for the reconcile pass.

**Tags:** `store`, `reconciliation`, `safety`, `locks`

#### Scenarios

**Apply refuses on live worker.lock** (`rq-storeReconcileWorkerLockRefusal01.1`)

**Given:**
- a target store with a live worker.lock

**When:** the pass is invoked with execute intent

**Then:**
- the pass refuses with a typed error
- zero mutations occur
- the lock file is unmodified

**Dry-run remains permitted on live worker.lock** (`rq-storeReconcileWorkerLockRefusal01.2`)

**Given:**
- a target store with a live worker.lock

**When:** the pass is invoked in dry-run mode

**Then:**
- the full plan and plan_hash are emitted
- no store records are written

---

### Unbounded full-scan completion proof, fail-closed on proof error

**ID:** `rq-storeReconcileUnboundedProof01` | **Priority:** **[MUST]**

The pass's completion proof MUST be an unbounded full-scan projection-divergence check: the divergence scan is invoked with no budget cap and no record-count cap. The proof returns zero divergences or a documented, whitelisted benign residual set; a budget-capped scan is never acceptable as completion proof. A proof-scan error (I/O failure, distinct from found divergences) MUST fail closed: the run is recorded as not complete and no success is synthesized. Each migration-completion marker MUST have exactly one owner, and that owner is this reconcile pass. No other subsystem — in particular store initialization, which runs inside a bounded per-call tool budget — may scan projections to decide convergence or write a completion marker. Residue that a different repair action owns MUST NOT permanently block this pass's completion: when a projection is well-formed in the subtree a repair action rewrites, and fails whole-document validation only because of that foreign-owned residue class, it is recorded as a documented benign residual under the whitelist allowance above rather than treated as an unresolved divergence. The residual MUST remain visible in the marker so completion-with-residue is distinguishable from clean completion. Every other read failure, malformed target subtree, and validation failure with no owning action still fails closed.

**Tags:** `store`, `reconciliation`, `proof`, `safety`

#### Scenarios

**Completion proof uses unbounded scan** (`rq-storeReconcileUnboundedProof01.1`)

**Given:**
- an apply pass that completed its planned mutations

**When:** the pass computes its completion proof

**Then:**
- the divergence scan is invoked with budget and record caps unset
- the run report carries before/after divergence counts

**Proof-scan error fails closed** (`rq-storeReconcileUnboundedProof01.2`)

**Given:**
- an apply pass whose proof scan encounters an I/O error

**When:** the pass computes its completion proof

**Then:**
- the run is recorded as not complete with the scan error
- no success result is synthesized

**The reconcile pass is the sole owner of a completion marker** (`rq-storeReconcileUnboundedProof01.3`)

**Given:**
- a store whose artifact metadata has not converged

**When:** store initialization runs

**Then:**
- initialization performs no scan of change projections
- initialization writes no completion marker
- convergence and the marker remain owned by the operator-driven reconcile pass

**Foreign-owned residue is a whitelisted benign residual, not a blocker** (`rq-storeReconcileUnboundedProof01.4`)

**Given:**
- a projection that is well-formed in the subtree the running action rewrites
- the same projection fails whole-document validation only because of a residue class another action owns

**When:** the completion check runs

**Then:**
- the projection is recorded as a documented benign residual and does not block the completion marker
- the residual is retained in the marker so completion-with-residue stays distinguishable from clean completion
- a read failure, a malformed target subtree, or a validation failure with no owning action still fails closed

---
