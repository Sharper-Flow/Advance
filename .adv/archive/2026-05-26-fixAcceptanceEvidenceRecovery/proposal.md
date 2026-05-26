# Fix Acceptance Evidence Recovery

## Why

Acceptance evidence durability is inconsistent. ADV’s review flow can present or receive user acceptance before all required evidence is durably owned by Temporal or recoverable from completed-workflow state. When a workflow completes or becomes unavailable during this window, agents cannot persist the executive summary, review matrix, or acceptance gate completion, leaving changes blocked despite valid verification and approval.

Motivating incident from PokeEdge `fixSetPriceSorting`:

- `adv_gate_status` showed proposal/discovery/design/planning/execution done, acceptance pending, release pending.
- `adv_change_update`, `adv_contract_review_matrix_set`, and `adv_gate_complete acceptance` failed with `workflow execution already completed`.
- User acceptance was already approved with exact reply `approve` after verification passed.
- Release/archive was blocked because acceptance proof could not be reconciled.

## What Changes

- Make acceptance evidence ordering structural: evidence required for acceptance must be persisted and visible to the workflow before the acceptance approval prompt or before acceptance gate completion can succeed.
- Close completed-workflow recovery gaps for acceptance evidence reconciliation, including executive summary persistence, contract review matrix persistence, and acceptance gate completion.
- Decide whether executive summary remains communication-only or becomes workflow-known pre-acceptance evidence; implement the chosen model structurally, not as a prompt-only convention.
- Ensure Temporal receives and checks required evidence markers at the appropriate gate so agents cannot satisfy acceptance by writing proof after approval or after workflow termination.
- Add audited recovery for poisoned/completed workflow states that writes disk projection only when precise evidence and compatibility/recovery rationale are present.
- Update specs and command contracts so `/adv-review` cannot ask for acceptance until required evidence preflight passes.

## Success Criteria

1. Acceptance gate completion fails with deterministic blockers when required acceptance evidence is missing, stale, or not workflow-visible.
2. `/adv-review` persists and verifies required evidence before presenting the user acceptance prompt; no post-approval write is required to make acceptance valid.
3. `contract.reviewMatrix` evidence is sent through Temporal and checked before acceptance can be marked done.
4. Executive summary handling is structurally defined: either workflow-known and preflighted before acceptance, or explicitly excluded from acceptance gate evidence while still recoverable for archive sign-off.
5. Completed-workflow/poisoned-history recovery exists for acceptance evidence reconciliation with explicit audit fields and precise evidence checks.
6. Recovery paths do not silently bypass gate readiness; they record compatibility/recovery rationale and leave durable audit metadata.
7. Existing healthy acceptance flows remain signal/query based and do not reintroduce Temporal update handlers on the change workflow surface.
8. Specs and `/adv-review` docs encode the no-late-homework rule: acceptance proof must exist before acceptance approval/gate completion, not after.
9. Targeted regression tests cover normal path, missing evidence blockers, completed-workflow recovery, and rejection without recovery evidence.
10. `pnpm run check`, `pnpm run build`, and relevant/full tests pass.

## Scope

### In Scope

- Acceptance/review evidence ordering in `/adv-review` and related command contracts.
- Temporal workflow readiness for acceptance evidence and artifact metadata.
- `adv_contract_review_matrix_set` recovery behavior for completed/poisoned workflows.
- `adv_change_update executiveSummary` recovery behavior or replacement with a structurally recoverable evidence path.
- `adv_gate_complete acceptance` recovery behavior and readiness checks.
- Specs for `advance-workflow` acceptance evidence, gate artifact enforcement, and acceptance projection.
- Regression tests for acceptance evidence timing and recovery.

### Out of Scope

- Fixing PokeEdge application behavior or changing `fixSetPriceSorting` implementation.
- Manual ADV state-file edits as a supported recovery mechanism.
- Broad release/archive ordering, dirty-main checkpointing, or worktree cleanup behavior covered by `fixArchiveReleaseOrdering`.
- Making all narrative artifacts gate evidence unless discovery proves that is required.
- Reworking proposal/discovery/design/planning/execution gates except where shared artifact evidence infrastructure must be generalized.

### Must Not

- Must not allow acceptance proof to be submitted only after user approval when the proof was required to justify the prompt.
- Must not mark acceptance done from caller-supplied evidence alone; workflow validation remains authoritative.
- Must not use heuristic chat history as acceptance evidence.
- Must not silently recover completed workflows without precise recovery evidence and an audit trail.
- Must not weaken the signal/query-only workflow architecture by reintroducing Temporal update handlers.
- Must not require manual edits under ADV state directories.

## Discovery Findings

### Discovery Checklist

| Step | Status | Result |
|---|---|---|
| Skill Discovery | PASS | Loaded `adv-agent-tool-contracts`; no pending-review skills found. No new skill created because existing ADV tool-contract guidance matched core domain. |
| Prior Research Extension | PASS | Cited `docs/repo-improve-prep.md`; new finding: its Temporal signal/query direction supports preserving signal/query architecture, but it does not cover acceptance evidence recovery. |
| Conflict & Related-Work Scan | PASS with degraded validate | `adv_change_list` found related active/archived work; `adv_change_validate` timed out twice while `adv_temporal_diagnose` reported healthy; `adv_agenda_list` returned no pending overlap. |
| Edge Case Investigation | PASS | Covered completed workflow, poisoned history, signal-after-disk-write failure, missing matrix, failing rows, and stale metadata. |
| Design Question Depth | PASS | Executive summary classification remains joint outcome question; other technical decisions are agent-resolved. |
| Draft Spec Delta Shapes | PASS | Proposed `rq-acceptanceEvidenceTiming01`, recovery requirement, and amendments to gate artifact/acceptance projection laws. |
| Related Pattern Scan | PASS | Found similar recovery patterns in archive, gate, contract, task, and recovery-writer paths. |
| LBP Check | PASS | Preserve Temporal signal/query model; add structural evidence markers and audited disk-projection recovery. |

### Skills Considered

- `adv-agent-tool-contracts` — matched because this change touches agent-callable tool contracts, schemas, and tests. Guidance applied: align schemas, command prompts, specs, and tests; do not weaken validation to compensate for missing context.
- `adv-clarify` — considered; not loaded because discovery ambiguity is narrow and handled by required agreement questions.
- `adv-arch-detection` — considered; not loaded because issue is not broad architecture inconsistency detection.

### Extends

- `docs/repo-improve-prep.md`: prior research says ADV should preserve signal/query correctness and avoid unnecessary Temporal round trips. New finding for this change: the same signal/query model is sound, but late acceptance writes are structurally unsafe because closed workflows cannot accept signals.
- Archived `extendCompletedWorkflow`: established completed-workflow recovery for archive status using explicit `recoveryMode: "poisoned_history"`, precise recovery evidence, and `isWorkflowCompletedError`. New finding: acceptance needs the same completed-workflow classifier but must additionally validate gate readiness and evidence freshness before repairing disk projection.
- Active/archived `fixArchiveReleaseOrdering`: owns release/archive metadata ordering. New finding: acceptance evidence recovery must not absorb release finalization scope; it should hand completed acceptance to release/archive once proof is durable.
- `firstClassExecutiveSummary`: made executive summary first-class for archive consumers/read paths. New finding: it did not make executive summary workflow-owned gate evidence, so this change must explicitly classify it.

### Conflict Scan

- Related work:
  - `firstClassExecutiveSummary`: overlaps only on executive summary artifact semantics; no conflict if this change limits itself to acceptance/recovery classification.
  - `fixArchiveReleaseOrdering`: overlaps on completed workflow recovery but owns release/archive ordering, not acceptance.
  - `extendCompletedWorkflow`: archived precedent for completed-workflow recovery; useful template.
- `adv_change_validate`: timed out twice. `adv_temporal_diagnose changeId: fixAcceptanceEvidenceRecovery` returned healthy, so this is recorded as tool latency/degraded validation, not a semantic conflict.
- `adv_agenda_list`: no pending agenda overlap. Original triage agenda `ag-RBrRerdF` is recorded as origin.

### Current State

- Temporal documentation states signals can only be sent to workflow executions that have not closed; queries can be sent to closed workflows within retention if a Worker can process them. Therefore, late acceptance writes via signals after workflow closure are invalid by design.
- `contract.reviewMatrix` is persisted through `contractReviewMatrixSetSignal` and applied to workflow state.
- Acceptance readiness blocks on missing contract, missing review matrix, missing row, and failing row in `plugin/src/temporal/gate-readiness.ts`.
- `gateCompletedSignal` invokes workflow readiness and writes generated `acceptance.md` before marking acceptance done.
- `adv_change_update` writes narrative artifacts to disk first, then sends `updateArtifactMetadataSignal`. Signal failure after disk write returns a tool error and has no recovery path.
- `executive-summary.md` is required by `/adv-review` before acceptance prompt, but docs also classify it as communication-only and not workflow readiness evidence.
- `_recovery-writers.ts` has disk-projection writers for tasks, gates, and status, but no artifact-metadata/narrative-artifact recovery writer.

### Edge Cases

1. Completed workflow after disk artifact write: disk has `executive-summary.md`, but `updateArtifactMetadataSignal` fails; tool returns error and acceptance flow cannot prove whether artifact is workflow-visible.
2. Completed workflow before matrix signal: `contract.reviewMatrix` never reaches workflow; acceptance readiness correctly blocks, but recovery must require explicit evidence and row validation.
3. Poisoned workflow where signal appears accepted but is ignored/stuck: existing review-matrix recovery checks `workflowHasPoisonedRecoveryEvidence`; executive summary path lacks equivalent probe.
4. Missing or failing matrix rows: acceptance must stay stuck with deterministic blockers; recovery must not bypass row validation.
5. Caller-supplied artifact evidence on `gateCompletedSignal`: spec already says caller-provided metadata alone is not authoritative; workflow must validate independently.
6. Executive summary classification mismatch: if it remains required before prompt but not workflow-known/recoverable, agents can be blocked by a communication artifact not represented in readiness.

### Open Design Questions

1. Executive summary classification
   - Trust model: joint; user decides desired workflow semantics, agent resolves implementation.
   - Blast radius: wrong choice either blocks acceptance on narrative artifact failures or allows acceptance without release-signoff narrative material.
   - Alternatives: (A) workflow-known pre-acceptance evidence and readiness blocker; (B) sign-off/release-only artifact with recoverable persistence and `/adv-review` prompt text corrected. Recommendation: B unless user wants executive summary to be acceptance proof.
2. Recovery command surface
   - Trust model: agent-resolved LBP.
   - Blast radius: adding recovery args to a broad narrative-update tool increases misuse risk; dedicated recovery helpers add surface area but improve audit clarity.
   - Alternatives: add `recoveryMode` to `adv_change_update`; add dedicated artifact recovery writer/tool; make store-temporal `updateArtifacts` tolerate completed metadata signal failures when disk write succeeds. Recommendation: dedicated/reusable recovery writer plus explicit tool args for affected path.
3. Gate recovery validation depth
   - Trust model: agent-resolved LBP.
   - Blast radius: too weak silently bypasses readiness; too strict leaves old valid changes unrecoverable.
   - Alternatives: compatibility-only rationale, or reconstructed workflow-state readiness against disk projection. Recommendation: readiness reconstruction against disk projection, matching existing `completeGateViaRecovery` shape.

### Draft Spec Deltas

- `rq-acceptanceEvidenceTiming01` — Acceptance evidence before approval
  - Given `/adv-review` is about to present the acceptance approval prompt
  - When required acceptance evidence cannot be persisted and verified through workflow-owned state or approved recovery projection
  - Then `/adv-review` must not present the prompt and acceptance must remain pending with a deterministic blocker
- `rq-acceptanceRecovery01` — Audited completed-workflow acceptance recovery
  - Given a workflow is completed or poisoned and acceptance evidence was validly produced
  - When recovery is requested with explicit evidence and rationale
  - Then tools may repair disk projection only after deterministic validation of contract rows/artifacts and must record audit metadata
- Amend `rq-acceptanceProjection01`
  - Given a `ChangeContract` exists
  - When acceptance is completed or recovered
  - Then `contract.reviewMatrix` must be workflow-visible or validated from recovery projection before acceptance can be marked done
- Amend `rq-gateArtifactAudit01`
  - Given a gate requires artifact evidence
  - When artifact evidence is recorded or recovered
  - Then workflow/recovery validation, not caller-provided metadata, owns proof authority

### Related Pattern Scan

- Similar recovery patterns:
  - `plugin/src/tools/contract.ts`: review matrix and contract mint recovery use completed/poisoned detection plus disk projection fallback.
  - `plugin/src/tools/gate.ts`: acceptance/release gate recovery reconstructs readiness and uses `saveRecoveredGateCompletion` for completed workflow disk-direct writes.
  - `plugin/src/tools/change.ts`: archive status recovery uses `saveRecoveredChangeStatus` after completed-workflow save failure.
  - `plugin/src/tools/_recovery-writers.ts`: common recovery authorization pattern exists but lacks artifact metadata recovery.
- Similar late signal-after-disk-write pattern:
  - `plugin/src/storage/store-temporal/changes.ts updateArtifacts`: disk write happens before artifact metadata signal. This is the key same-pattern gap.

### LBP Check

- Best long-term pattern: keep Temporal signal/query workflow architecture; do not reintroduce updates.
- Temporal docs confirm signals only target open workflows, so recovery must not depend on post-completion signal success.
- LBP is structural evidence classification + deterministic readiness + audited recovery writer, not prompt-only instructions.
- External alternatives are not applicable; this is internal workflow correctness, not a library/tool selection problem.

### Discovery Opportunity Scout

- Attempted with `adv-researcher` and `adv-opportunity-scout` scope.
- Candidates considered: 5.
- Auto-adopted: 4.
  - mirror review-matrix recovery template for artifact persistence,
  - add artifact metadata recovery writer,
  - promote no-late-homework into spec law,
  - use deterministic blockers rather than prompt conventions.
- Surfaced to user: 1.
  - executive summary classification is the key user-facing semantic choice.
- Inconclusive/skipped: none.

### AMBIGUITY ANALYSIS

M1 HIGH Missing Information Executive summary semantics are unresolved.
  Evidence: "Decide whether executive summary remains communication-only or becomes workflow-known pre-acceptance evidence"
  Reason: unclear because acceptance blocking behavior changes depending on this choice.

Coverage: B:C F:C S:C M:P

Trigger evaluation: one HIGH, zero CRITICAL. Continue to agreement questions.

### Recommended Objectives

1. Define required acceptance evidence classes and their owning gate.
2. Ensure `/adv-review` never asks for acceptance before required evidence is persisted and verified.
3. Keep `contract.reviewMatrix` as authoritative acceptance proof and enforce deterministic blockers for missing/failing rows.
4. Add audited completed-workflow/poisoned-history recovery for acceptance evidence paths.
5. Decide and encode executive summary semantics so it cannot remain prompt-required but workflow-invisible.
6. Add regression tests for normal, missing-evidence, completed-workflow, poisoned-history, and no-recovery-evidence cases.

## Affected Code

- `plugin/src/tools/change.ts` — `adv_change_update` executive summary path and possible recovery args.
- `plugin/src/storage/store-temporal/changes.ts` — artifact metadata signaling and completed-workflow behavior.
- `plugin/src/tools/contract.ts` — review matrix recovery and evidence audit semantics.
- `plugin/src/tools/gate.ts` — acceptance gate recovery, compatibility reason handling, readiness-surfacing.
- `plugin/src/temporal/gate-readiness.ts` — deterministic acceptance evidence blockers.
- `plugin/src/temporal/workflows.ts` and `plugin/src/temporal/change-state.ts` — workflow-owned evidence/application paths.
- `plugin/src/types/signals.ts` — signal payload shape if new evidence markers are required.
- `.opencode/command/adv-review.md` — pre-acceptance evidence ordering and prompt guard.
- `.adv/specs/advance-workflow/spec.json` and `docs/specs/advance-workflow.md` — spec-law updates.
- Tests near `plugin/src/tools/contract.test.ts`, `plugin/src/tools/gate.test.ts`, `plugin/src/tools/change.test.ts`, `plugin/src/storage/store-temporal/changes.test.ts`, and Temporal workflow/readiness tests.

## Related Repositories

- Current repo only: `advance` OpenCode plugin.
- PokeEdge is the motivating downstream incident, not an implementation target for this change.

## Constraints

- Specs are law: update `advance-workflow` before or with implementation.
- Keep recovery explicit and audited; no implicit disk-projection repair.
- Preserve Temporal signal/query-only mutation surface for change workflows.
- Prefer structural evidence and deterministic readiness blockers over prompt-only conventions.
- Do not rely on direct reads or manual edits of ADV state files.

## Impact

- Prevents acceptance deadlocks caused by late evidence writes or completed workflows.
- Makes acceptance proof timing auditable and recoverable.
- May require tightening `/adv-review` behavior so acceptance prompts are blocked earlier when evidence persistence fails.
- May clarify or change whether executive summary is communication-only or acceptance/release evidence.

## Spec Delta Obligations

- Modify `advance-workflow/rq-gateArtifactEnforcement01` to state that required gate evidence must be durably available before gate completion and cannot be caller-forged after approval.
- Modify `advance-workflow/rq-acceptanceProjection01` to require contract review matrix evidence be workflow-visible before acceptance gate completion and to define recovery semantics for completed workflows.
- Add `advance-workflow/rq-acceptanceEvidenceTiming01`: `/adv-review` must persist and verify all required acceptance evidence before presenting acceptance approval; acceptance remains pending if required evidence cannot be persisted.
- Add `advance-workflow/rq-acceptanceRecovery01`: completed-workflow acceptance reconciliation must require precise evidence, audited reason, and deterministic readiness validation before disk-projection repair.
- Clarify executive summary law: either mark it as communication-only release/sign-off material with recoverable write semantics, or add it as workflow-known acceptance evidence with readiness blockers.

## Discovery Agenda

Resolved in discovery except the user-facing executive-summary semantic choice, carried into agreement questions.

## INVEST / Smell Check

- Independent: scoped to acceptance evidence/recovery; release ordering remains separate.
- Negotiable: executive summary classification is explicitly resolved before agreement.
- Valuable: unblocks real downstream acceptance/release failures and prevents recurrence.
- Estimable: affected surfaces are known from triage and discovery.
- Small enough: limited to acceptance evidence paths and specs, not full workflow rewrite.
- Testable: deterministic blockers, signal payloads, and recovery responses can be covered with unit/integration tests.

Smell scan:

- No manual state-edit workaround.
- No heuristic correctness boundary; workflow readiness owns enforcement.
- One user-facing semantic question remains and is handled in agreement.