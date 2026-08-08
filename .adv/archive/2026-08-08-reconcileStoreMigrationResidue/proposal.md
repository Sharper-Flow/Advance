# Reconcile Temporal→disk migration residue

## Why
The Temporal removal left projection/summary/Epic residue that degrades ADV aggregation (`adv_status` degraded), loses coordination for four Epics (~9 active changes orphaned from their Epic owner records), and surfaced at least one schema-drift corruption. Per-change reads remain functional, but the aggregate consistency and Epic coordination layer are not trustworthy until reconciled — and no exposed command can repair any residue class.

## Root Cause Analysis

**Defect origin:** Temporal removal completed before disk-store reconciliation; residue degrades projection consistency and four Epic owner records were lost from disk.

**Evidence gathered:**
- Tier 1 (local, explore subagent, file:line verified): internal modules exist but are operation-scoped; `reconcileHistoricalArchiveDeltas` is an orphan export with zero production callers; no store-wide reconcile/migrate/backfill command in the tool registry or `bin/adv` (subcommands: `status`, `slop-scan`, `census`, `epic`, `dashboard` only); `adv_doctor` applies only `clear_session_pointer` + dead worker-lock reclaim; no legacy→canonical writer exists; `epic-convergence.ts` flows Epic→child only; `evidence_kind` narrowed to `unit|other` in `c231b2eb` (retired `build_worker`, `replay_determinism`); `authority_kind` kept `temporal` as legacy-read; `adv_launcher_projection_rebuild` regenerates summary shards from canonical first. Consumer evidence (pokeedge): doctor `canonical_projection_consistent: false` (200 findings omitted at budget), health `unmigrated: 9`, `migration_status: null`, `degraded: true`; `EPIC_NOT_FOUND` ×4 (user-reported; firsthand probe timed out — consistent with the degraded-store symptom).
- Tier 2 (external): not applicable — internal-only surface.

**Leading hypothesis:** migration sequencing defect — Temporal deleted before a reconcile pass existed; the reconcile pass was never built.

**Ruled-out paths:** self-heal via existing tools (doctor, quarantine, launcher-rebuild — verified insufficient individually and in combination); Epic convergence (top-down only); historical-repair (orphan export, wrong reconciliation target).

**Spec-law impact:** change required — new operator-facing reconciliation capability; `adv_spec` search confirms no existing capability covers store reconciliation.

— RCA produced via `/adv-problem` triage (full record in session transcript); no bypass.

## What Changes
Add a **runnable reconciliation pass** (an `adv` CLI subcommand and/or MCP tool, e.g. `adv reconcile` / `adv_reconcile_store`) that wires the existing internal modules into a single idempotent, dry-run-first pass over a project store:

1. **Schema-drift normalization** — scan change records against the current `plugin/schemas/change.schema.json`; normalize retired enum values (confirmed: `evidence_kind` `build_worker`/`replay_determinism` → `"other"`) in place with validation; refuse to synthesize fields with no valid mapping (quarantine + report instead). Runs FIRST: summary rebuild depends on canonical parseability.
2. **Summary-shard rebuild** — wire the existing `rebuildSummaryIndex` path (`change-summary-shard.ts:614`, as exercised by `adv_launcher_projection_rebuild`) to rebuild summary shards + pointers from canonical projections for every change with a missing/stale pointer. Target: eliminate all "summary index degraded: missing current summary pointer" findings.
3. **Legacy-envelope reconciliation** — new writer (greenfield: none exists): for each "legacy envelope behind/differs" finding, reconcile the legacy flat envelope up to the canonical revision and record the reconciliation (before-state preserved). Canonical is authoritative post-migration; never overwrite canonical with legacy.
4. **Complete pending migrations** — run artifact-metadata migration + session-registry completion beyond the store-init path to clear the `unmigrated` set and set `migration_status`.
5. **Epic backfill** — for each `EPIC_NOT_FOUND` Epic referenced by active-change `epic_membership`, enumerate surviving child fragments (full scan), reconstruct an owner record **only where fragments are sufficient**, stamped `reconstructed: true` with explicit gap flags (missing entries, reconstructed narrative). Where insufficient, emit a bounded "formally lost" report and offer to clear dangling child memberships.
6. **Validation gate** — re-run `adv_doctor` until `canonical_projection_consistent: true`; emit before/after divergence counts.

## User Outcomes
1. An operator can run one command to bring any ADV project store back to a consistent, trustworthy state after an incomplete migration — previewable before any write, safe to re-run.
2. Aggregate views and Epic coordination on the affected store become trustworthy again (doctor consistent, migrations complete).
3. The four lost Epics are either recovered — with clear provenance distinguishing reconstructed content from gaps — or formally closed out so no dangling references remain.
4. No previously-readable change or Epic regresses as a result of the pass.
5. Ambiguous records are surfaced as reports for human decision, never silently guessed.

## Scope
### In Scope
- New reconcile command/tool in `~/dev/advance` (CLI subcommand in `bin/adv` + handler under `plugin/src`, optionally an MCP tool).
- Wiring `change-summary-shard.ts`, `artifact-metadata-migration.ts`, `session-registry.ts`, `launcher-projection.ts`; new legacy-envelope reconciliation writer; new Epic reconstruction-from-fragments path.
- Schema-drift normalization against `plugin/schemas/change.schema.json`.
- Epic reconstruction with provenance + gap flags, or formal-loss reporting + dangling-membership cleanup.
- Spec coverage for the new capability (new capability spec and/or deltas to `advance` / `advance-epics`).

### Out of Scope
- Re-introducing or depending on Temporal.
- Changing the disk-only architecture.
- Modifying consumer-project (pokeedge) code or ADV state from this change (the consumer store is a runtime target of the finished tool, driven by the operator).
- Fabricating Epic narratives/entries with no surviving evidence.

### Must Not
- Do not synthesize missing state — inherit the `adv_change_projection_quarantine` principle ("refuses to synthesize missing state"). Reconstructed Epics carry provenance + gap flags; ambiguous cases become reports, not guesses.
- Do not overwrite canonical projections with legacy envelopes (reconcile direction is legacy→canonical only).
- Do not mutate a store while `worker.lock` is live (mirror `adv_store_cleanup` guard).
- Do not run unbounded; bound per-store scan time and make the pass resumable.

## Constraints
- **Idempotent + dry-run-first**: every destructive step supports `--dry-run` / `dryRun:true` with a full plan + `plan_hash` before any write (mirror `adv_store_cleanup`).
- **Reversible where possible**: Epic reconstruction is additive; envelope/summary reconciliation records before-state.
- **Validation-gated**: success requires `adv_doctor` clean (or documented benign residual) + `adv_status health` `unmigrated: 0`.
- **No Temporal**: disk + ADV-store git history only.
- **Bounded**: per-store scan budget; resumable across runs.

## Risks
- **Epic reconstruction fidelity** — fragments are incomplete (e.g. `strengthenDataModelIntegrity` has orders 4,9–13 surviving; 1–3,5–8 missing). Mitigation: provenance + gap flags; prefer formal-loss report over fabricated entries.
- **Scale** — 209-change store; summary rebuild + schema scan must be bounded and resumable.
- **Envelope direction** — must reconcile legacy→canonical, never the reverse; unit-test the direction.
- **`bin/adv` character change** — the CLI is currently read-only diagnostics; adding a mutating subcommand changes its contract. Discovery/design must address surface placement deliberately.

## Impact
Restores operator trust in the aggregate consistency and Epic coordination layers for any store with migration residue; unblocks `/adv-coordinate` in the consumer project; establishes the reconcile pattern for future migrations.

## Context
Temporal removal commits: `c231b2eb`, `05907bbc`, `ab300f93`, `e51f6f14`, `0d565876`. Schema-drift fixture: quarantined `optimizeArchitectureTestSuite` at `.adv/quarantine/changes/optimizeArchitectureTestSuite/2026-08-07T19-01-06-109Z/change.json`. Adjacent active changes: `fixArtifactMetadataMigration` (possible subset overlap — absorb vs reference decided at discovery), `fixEpicMembershipConvergence` (adjacent, top-down direction), `replaceTemporalPersistence` (the removal work this cleans up after).

## Discovery Agenda
- Run `adv_doctor` against pokeedge with elevated budget to enumerate the full divergence set and classify each finding (summary / envelope / schema).
- Determine whether the pokeedge ADV store is git-tracked or has a pre-migration backup; if so, evaluate restore-first vs reconstruct.
- Test whether `adv_launcher_projection_rebuild` alone clears the summary-pointer class on the live store (informs whether component 2 is exposure-only).
- Full-scan active changes for `epic_membership` to enumerate surviving fragments per lost Epic; assess reconstruction sufficiency per Epic.
- Audit older records for any other retired enum values beyond `evidence_kind` (verify `authority_kind: temporal` legacy-read retention is the only other drift surface).
- Decide CLI vs MCP surface (or both) and where the handler lives; address `bin/adv`'s read-only character.
- Decide handling for the quarantined record: normalize-in-place (un-quarantine) vs leave quarantined; use it as the normalization test fixture.
- Resolve absorb-vs-reference for `fixArtifactMetadataMigration`; confirm no conflict with `fixEpicMembershipConvergence`.
- Determine spec strategy: new capability spec vs delta(s) on `advance` / `advance-epics`.
- Firm engineering AC/SC for each reconcile component (per proposal/delegation of AC firming to discovery).