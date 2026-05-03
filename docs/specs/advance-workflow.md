# Advance Workflow

> **Version:** 1.3.0
> **Updated:** 2026-05-02

## Purpose

Capability: Workflow contract layer for ADV — gate model, autonomy boundaries, design validation, scope management, releases, approvals, handoff voice, review remediation, and touched-scope quality. Split from `advance` capability.

## Requirements

### Adversarial Review Enforcement

**ID:** `rq-R3v13wR1` | **Priority:** **[MUST]**

/adv-review and /adv-harden must enforce a minimum findings threshold to prevent shallow 'LGTM' behavior. /adv-review must run mandatory remediation that fixes all blocker/issue findings, investigates all suggestions/questions, implements validated suggestions, and runs cleanup before final verdict.

#### Scenarios

**Minimum findings validation** (`rq-R3v13wR1.1`)

**Given:**
- A review with fewer than 3 non-nit findings

**When:** Gate completion is attempted

**Then:**
- The gate remains open and requires explicit justification for the clean result

**Review remediation is mandatory** (`rq-R3v13wR1.2`)

**Given:**
- A review produces blocker, issue, suggestion, or question findings

**When:** /adv-review enters remediation

**Then:**
- All blocker and issue findings are fixed and verified
- Each suggestion/question is investigated and marked validated or rejected with evidence
- Validated suggestions are implemented
- A cleanup pass runs before final verdict is emitted

---

### Mid-Change Scope Expansion Re-Entry

**ID:** `rq-scopeReentry01` | **Priority:** **[MUST]**

When new objectives or acceptance criteria are introduced after a change has already progressed through the gate workflow, the added scope must be routed back through the earliest invalidated pre-implementation gate via adv_change_reenter before execution continues. Agents may trigger this re-entry autonomously; explicit user approval is not required to circle back to an earlier gate. Unaffected approved scope may continue without re-entry, and non-invalidating clarifications do not require re-entry.

**Tags:** `workflow`, `re-entry`, `scope-expansion`, `gates`

#### Scenarios

**Scope expansion triggers re-entry** (`rq-scopeReentry01.1`)

**Given:**
- A change is in execution or a later gate
- New objectives or acceptance criteria are discovered that were not part of the approved agreement

**When:** adv_change_reenter is used from the earliest affected gate

**Then:**
- The newly added scope is routed back through discovery, agreement, design, and planning as needed before execution resumes
- Execution does not silently absorb the new scope without re-entry

**Unaffected approved scope continues without re-entry** (`rq-scopeReentry01.2`)

**Given:**
- A change has approved scope already in execution
- A newly discovered item does not invalidate the existing approved work

**When:** The unaffected scope is evaluated

**Then:**
- Previously approved scope may continue without reopening unrelated gates
- Only the newly invalidated scope is routed back through re-entry

**Non-invalidating clarification does not require re-entry** (`rq-scopeReentry01.3`)

**Given:**
- A change is in progress
- A clarification is discovered that does not alter objectives, acceptance criteria, or design intent

**When:** The clarification is applied

**Then:**
- adv_change_reenter is not required
- Execution may continue within the existing scope

**Re-entry may proceed without explicit user approval** (`rq-scopeReentry01.4`)

**Given:**
- A change needs scope-expansion re-entry

**When:** adv_change_reenter is executed

**Then:**
- The call may succeed without approvedByUser or approvalEvidence
- approvalEvidence is optional audit context when re-entry follows an explicit user instruction

---

### Re-Entry Cascade Reset Preserves Work

**ID:** `rq-scopeReentry02` | **Priority:** **[MUST]**

Reopening a change from gate X must reset gate X and all downstream gates to pending while preserving existing tasks and completed work. Each re-entry must append an audit entry describing the reopened gate, reason, optional scope delta, actor, timestamp, and gates reset.

**Tags:** `workflow`, `re-entry`, `audit`, `gates`

#### Scenarios

**Cascade from discovery resets downstream gates** (`rq-scopeReentry02.1`)

**Given:**
- A change has completed proposal, discovery, design, planning, execution, acceptance, and release is still pending

**When:** adv_change_reenter reopens from discovery

**Then:**
- discovery, design, planning, execution, acceptance, and release are reset to pending
- proposal remains satisfied

**Tasks remain intact after cascade reset** (`rq-scopeReentry02.2`)

**Given:**
- A change has existing tasks, including completed tasks

**When:** adv_change_reenter resets gates to pending

**Then:**
- All existing tasks remain on the change
- Task status and task content are preserved

**Re-entry appends audit history** (`rq-scopeReentry02.3`)

**Given:**
- A change has been reopened via adv_change_reenter

**When:** The re-entry is persisted

**Then:**
- A reentry_history entry is appended with from_gate, reason, reopened_by, approval_evidence, reopened_at, and gates_reset
- scope_delta is included when provided

---

### Seven-Gate Collaborative Workflow

**ID:** `rq-gatemodel01` | **Priority:** **[MUST]**

The canonical ADV workflow is seven sequential gates: proposal, discovery, design, planning, execution, acceptance, release. Gates must be completed in order. A change cannot be archived until all seven gates are satisfied (status 'done' or 'skipped').

**Tags:** `workflow`, `gates`

#### Scenarios

**Sequential gate enforcement** (`rq-gatemodel01.1`)

**Given:**
- A change with the proposal gate pending

**When:** adv_gate_complete is called for the discovery gate

**Then:**
- The call is rejected
- The response identifies proposal as the blocking gate

**Archive requires all seven gates satisfied** (`rq-gatemodel01.2`)

**Given:**
- A change with gates proposal through acceptance marked done
- The release gate still pending

**When:** adv_change_archive is called

**Then:**
- The archive is rejected with incomplete-gates error
- release is listed as the remaining gate

**Archive blocked when conformance-required spec has non-PASS verdict** (`rq-gatemodel01.3`)

**Given:**
- A change touches a spec with conformance_required: true
- All seven gates including release are otherwise satisfied
- Conformance verdict is DRIFT and no override is recorded

**When:** /adv-archive Phase 5.5 evaluates the conformance gate

**Then:**
- Archive is halted before Phase 6 (Execute Archive)
- adv_change_archive is not called
- The user is presented with the failing AC labels and three explicit options (fix locally, override, unlock + amend) per rq-confTriage01

---

### External Conformance Gate Cross-Link

**ID:** `rq-extConfGate01` | **Priority:** **[MUST]**

Archive of a change that touches a spec with `conformance_required: true` is blocked unless the external conformance verdict is PASS or a valid override is recorded. The external conformance capability is defined by `spec-conformance` (rq-confSource01 through rq-confTriage01). The conformance gate runs as `/adv-archive` Phase 5.5, between User Signoff (Phase 5) and Execute Archive (Phase 6), so active source removal (rq-archiveRetirement01) only triggers on a passing or override-approved release.

**Tags:** `workflow`, `archive`, `conformance`, `cross-link`

#### Scenarios

**Archive halts on DRIFT without override** (`rq-extConfGate01.1`)

**Given:**
- A change touches a spec with conformance_required: true
- Phase 5.5 conformance run returns verdict: DRIFT
- No valid override has been recorded for this archive attempt

**When:** The orchestrator evaluates whether to advance to Phase 6

**Then:**
- Archive halts at Phase 5.5
- adv_change_archive is not invoked
- The drift triage flow defined by rq-confTriage01 is surfaced to the user

**Archive proceeds on PASS** (`rq-extConfGate01.2`)

**Given:**
- A change touches a spec with conformance_required: true
- Phase 5.5 conformance run returns verdict: PASS

**When:** The orchestrator evaluates whether to advance to Phase 6

**Then:**
- Phase 6 (Execute Archive) runs
- rq-archiveRetirement01 source removal proceeds normally

**Archive proceeds on valid override** (`rq-extConfGate01.3`)

**Given:**
- A change touches a spec with conformance_required: true
- Phase 5.5 conformance run returns DRIFT or is unavailable
- A valid override entry has been recorded for this archive attempt with required audit fields per rq-confOverride01

**When:** The orchestrator evaluates whether to advance to Phase 6

**Then:**
- Phase 6 (Execute Archive) runs
- The override entry is preserved in the spec's append-only audit log

---

### Archive Finalization Refreshes Basis and Preserves Cleanup Safety

**ID:** `rq-releaseFinalization01` | **Priority:** **[MUST]**

Phase 9 Git Finalization must refresh the current default-branch basis before deciding local merge-back versus PR workflow. Clean low-risk cases prefer a linear-history fast path (`--ff-only` when already current, reconcile only when needed). After a successful local merge, Phase 9 must attempt safe `git push origin {default-branch}` when `origin` exists. If no remote exists or the push fails or is skipped, the archive may complete as a local-only result and must report `Merged locally.` with the explicit reason. Conflicting or risky cases must stop or route to PR workflow before cleanup. Worktree deletion remains forbidden until merged-state verification proves the change branch is fully integrated.

**Tags:** `workflow`, `archive`, `worktree`, `git`

#### Scenarios

**Clean archive refresh uses local fast path** (`rq-releaseFinalization01.1`)

**Given:**
- A change branch is already on the current default-branch basis
- No overlap-risk or PR-only policy applies

**When:** Phase 9 Git Finalization chooses an integration path

**Then:**
- The archive uses the local `--ff-only` path
- No branch rewrite is required

**Conflicting reconcile stops before cleanup** (`rq-releaseFinalization01.2`)

**Given:**
- A change branch must reconcile with a fresher default branch
- Compatibility preflight or rebase finds conflicts

**When:** Phase 9 Git Finalization evaluates the reconcile path

**Then:**
- The archive reports the conflicting files
- The archive does not delete the worktree

**Risky archive routes to PR workflow** (`rq-releaseFinalization01.3`)

**Given:**
- A change has overlap-risk, PR-only policy, or non-fast-forward publish risk

**When:** Phase 9 Git Finalization chooses an integration path

**Then:**
- The archive routes to PR workflow instead of forcing local merge-back
- Cleanup remains blocked until merged-state verification succeeds

**Successful local archive attempts origin push** (`rq-releaseFinalization01.4`)

**Given:**
- A change branch has been merged into the local default branch
- An origin remote is configured

**When:** Phase 9 Git Finalization publishes the archive result

**Then:**
- The archive attempts safe `git push origin {default-branch}`
- If the push succeeds, the archive reports `Shipped.`
- If the push fails or is skipped, the archive reports `Merged locally.` with an explicit reason

---

### Archive Retirement Removes Active Source State After Durable Archive

**ID:** `rq-archiveRetirement01` | **Priority:** **[MUST]**

When adv_change_archive completes successfully, ADV MUST create the archive bundle first, transition the change workflow/status to archived, and only then remove the active changes/<id>/ source directory. Post-archive persistence MUST NOT recreate active change.json for archived changes. Archive orphan sweep recovery MUST repair any matching non-archived workflow/source state to archived before approved source-dir removal and MUST report repair errors separately from removal errors.

**Tags:** `workflow`, `archive`, `recovery`, `cleanup`

#### Scenarios

**Archive retires active source after durable status transition** (`rq-archiveRetirement01.1`)

**Given:**
- A change has satisfied all archive gates

**When:** adv_change_archive completes successfully

**Then:**
- The archive bundle exists
- The change status is archived in durable state
- The source changes/<id>/ directory is removed
- Default active change lists do not include the archived change

**Post-archive persistence cannot resurrect active change state** (`rq-archiveRetirement01.2`)

**Given:**
- A change has been transitioned to archived

**When:** Archive completion persists final state or refreshes caches

**Then:**
- No active changes/<id>/change.json is written for the archived change
- Archived change lookups resolve from durable archived state or the archive bundle

**Sweep repairs archive zombies before source cleanup** (`rq-archiveRetirement01.3`)

**Given:**
- An archive bundle exists for a change
- A matching source changes/<id>/ directory still exists
- The workflow or source state is not marked archived

**When:** adv_archive_sweep_orphans runs in approved execute mode

**Then:**
- The change status is repaired to archived before source removal
- Repair counts and repair errors are reported separately from removal counts and removal errors
- A candidate with repair failure is not removed

---

### Human Checkpoint Contract

**ID:** `rq-autonomy01` | **Priority:** **[MUST]**

ADV must pause for human input only at explicit approval/judgment checkpoints and auto-continue through clean agent-owned workflow steps. Human checkpoints are: proposal confirmation, agreement sign-off, design approval when real tradeoffs depend on user values, when the design validator returns CONFLICT, or when contract-compromise risk is present, acceptance, archive sign-off, cancellation approval, and doom-loop recovery. All other clean workflow steps (discovery, deterministic design, prep, apply, harden, and scope-driven re-entry) proceed sequentially without prompting the user when no unresolved user-value tradeoff, contract-compromise risk, or required approval exists.

**Tags:** `workflow`, `autonomy`, `checkpoints`

#### Scenarios

**Clean agent-owned step auto-continues** (`rq-autonomy01.1`)

**Given:**
- A change has completed the proposal gate
- The next step is discovery with no unresolved user-value tradeoffs

**When:** The ADV orchestrator evaluates the next gate

**Then:**
- Discovery proceeds without prompting the user
- No question tool call is made for the gate transition

**Human checkpoint pauses for approval** (`rq-autonomy01.2`)

**Given:**
- A change has completed the acceptance gate via /adv-review
- Archive sign-off is the next step

**When:** The ADV orchestrator evaluates the next gate

**Then:**
- The orchestrator stops and presents a change report
- The user is asked for explicit sign-off via inline handoff text per docs/command-voice-standard.md § Inline Approval Voice (Tier B)

**Design approval conditional on tradeoffs** (`rq-autonomy01.3`)

**Given:**
- A change has a straightforward design with no user-value tradeoffs

**When:** The design gate completes

**Then:**
- The orchestrator proceeds to planning without a design-approval pause

**Apply auto-continues across task boundaries** (`rq-autonomy01.4`)

**Given:**
- A change is in the execution gate with multiple pending ready tasks
- No enumerated human checkpoint has triggered (no doom-loop, no environmental blocker, no cancellation, no re-entry, no unresolved judgment call)

**When:** A task completes successfully and `adv_task_ready` returns another pending task

**Then:**
- `/adv-apply` proceeds immediately to the next task's TDD loop
- No "task complete", "section complete", "progress update", or "shall I continue?" pause is emitted
- No question tool call is made between tasks

**Apply forbids execution-start approval pause** (`rq-autonomy01.5`)

**Given:**
- A change has completed planning and is entering the execution gate
- Judgment-call surfacing (Phase 1.5) has already resolved any pending user input

**When:** `/adv-apply` begins the TDD work loop

**Then:**
- No "Begin work / Modify criteria / Cancel" prompt or equivalent execution-start approval is emitted
- The first ready task's TDD phase starts directly

**Contract-compromise risk triggers design pause** (`rq-autonomy01.6`)

**Given:**
- A change is at the design gate
- The agent identifies that delivering the design would require compromising agreed acceptance criteria, explicit constraints, or stated avoidances

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**
- The orchestrator pauses for human input before proceeding
- The design approval checkpoint is triggered regardless of whether user-value tradeoffs exist

---

### Validated In-Scope Findings Resolved In-Change

**ID:** `rq-remediation01` | **Priority:** **[MUST]**

When /adv-review or /adv-harden validates an actionable finding or suggestion as in-scope, the current change must fix it before completion. No report-only, future-work, or accepted-debt path is permitted for validated in-scope findings. Findings may only be left unresolved if rejected with evidence showing they are invalid or out of scope.

**Tags:** `workflow`, `review`, `harden`, `quality`

#### Scenarios

**Validated suggestion implemented before completion** (`rq-remediation01.1`)

**Given:**
- /adv-review validates a suggestion as in-scope and correct

**When:** Remediation runs

**Then:**
- The validated suggestion is implemented and verified in the current change
- The finding status is updated to fixed

**Report-only path rejected for in-scope findings** (`rq-remediation01.2`)

**Given:**
- /adv-harden identifies an actionable in-scope finding

**When:** Remediation options are presented

**Then:**
- No report-only or future-work option is offered
- The finding must be fixed before the release gate can complete

**Rejection with evidence is permitted** (`rq-remediation01.3`)

**Given:**
- /adv-review flags a suggestion as potentially in-scope

**When:** Investigation determines the suggestion is invalid or out of scope

**Then:**
- The finding is rejected with documented evidence
- The rejection does not block gate completion

---

### Touched-Scope Quality Ownership

**ID:** `rq-touchedScope01` | **Priority:** **[MUST]**

A change owns quality and test coverage for: (1) directly touched implementation files, (2) adjacent tests and docs needed for correctness, and (3) same-pattern quality or test issues in the local touched subsystem. This ownership boundary must remain local enough to avoid implicit repo-wide refactors. /adv-prep must synthesize tasks covering touched-scope obligations, /adv-apply must verify them before execution completes, and /adv-review and /adv-harden must enforce them.

**Tags:** `workflow`, `quality`, `ownership`, `testing`

#### Scenarios

**Adjacent test gaps addressed** (`rq-touchedScope01.1`)

**Given:**
- A change modifies an implementation file
- The corresponding test file has gaps in coverage for the touched code

**When:** Execution completes

**Then:**
- The test gaps are addressed as part of the change
- The execution gate is not marked complete while known test gaps remain in touched files

**Same-pattern issues fixed in local subsystem** (`rq-touchedScope01.2`)

**Given:**
- A change fixes a defect pattern in one file
- The same pattern exists in other files within the local touched subsystem

**When:** Review or harden identifies the related instances

**Then:**
- The same-pattern instances are fixed in the current change
- The fixes are verified before gate completion

**Ownership boundary remains local** (`rq-touchedScope01.3`)

**Given:**
- A change touches files in one subsystem
- A similar pattern exists in unrelated subsystems

**When:** Ownership scope is evaluated

**Then:**
- Only the local touched subsystem is in scope
- Unrelated subsystems are not implicitly pulled into the change

---

### Design Stage Requires Independent Validation

**ID:** `rq-designval01` | **Priority:** **[MUST]**

Before the design gate can complete, /adv-design must run an independent validation pass via an independent, read-only, externally informed validator sub-agent. The validator must be a distinct agent from the designer (different model or isolated context), have read-only access to ADV state, and possess external research capabilities (documentation lookup, web search). The validator assesses correctness, simplicity, spec-law compliance, and key alternatives. The current implementation of this capability is adv-researcher. Validator failure or timeout results in an INCONCLUSIVE warning and does not block gate completion.

**Tags:** `workflow`, `design`, `validation`, `autonomy`

#### Scenarios

**Validator runs before design gate completion** (`rq-designval01.1`)

**Given:**
- A change has a confirmed agreement and completed design work

**When:** /adv-design is executed

**Then:**
- An independent validation sub-agent pass runs before adv_gate_complete is called for the design gate
- The validator is a distinct agent from the designer with read-only state access and external research capabilities
- The validator assesses at least: correctness, simplicity, spec-law compliance, and key alternatives

**Validator failure results in INCONCLUSIVE, not a block** (`rq-designval01.2`)

**Given:**
- The validator sub-agent fails, returns empty, or times out

**When:** /adv-design handles the failed validator response

**Then:**
- The result is recorded as INCONCLUSIVE with a warning
- The design gate is not blocked by the validator failure
- The warning is surfaced in the /adv-design presentation output

---

### Validation Findings Included in Design Presentation

**ID:** `rq-designval02` | **Priority:** **[MUST]**

When /adv-design summarizes the design, it must include the validator verdict and findings from the design validation step. VALIDATED shows a brief clean-pass note. CAUTION shows findings inline. CONFLICT shows conflict details. INCONCLUSIVE shows a warning. Legacy designs without validation data omit the section silently.

**Tags:** `workflow`, `design`, `presentation`

#### Scenarios

**Clean-pass note shown for VALIDATED verdict** (`rq-designval02.1`)

**Given:**
- The design validator returned VALIDATED

**When:** /adv-design presents the design summary

**Then:**
- The output includes a one-line clean-pass note (e.g. 'Validator: clean pass')
- No detailed findings are shown

**Conflict details shown for CONFLICT verdict** (`rq-designval02.2`)

**Given:**
- The design validator returned CONFLICT with findings

**When:** /adv-design presents the design summary

**Then:**
- The conflict details and unresolved findings are shown to the user
- The presentation pauses for user resolution before proceeding to planning

---

### Critical Validator Disagreement Requires Explicit Handling

**ID:** `rq-designval03` | **Priority:** **[MUST]**

When the design validator returns a CONFLICT verdict, the orchestrator must not silently auto-continue to planning. The conflict must be surfaced to the user or resolved inline before /adv-prep can proceed.

**Tags:** `workflow`, `design`, `autonomy`, `checkpoints`

#### Scenarios

**CONFLICT verdict blocks silent auto-continue to planning** (`rq-designval03.1`)

**Given:**
- The design validator returned a CONFLICT verdict with unresolved findings

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**
- The orchestrator does not silently proceed to /adv-prep
- The conflict is surfaced to the user via /adv-design presentation pause or inline resolution attempt

**VALIDATED and CAUTION verdicts auto-continue** (`rq-designval03.2`)

**Given:**
- The design validator returned VALIDATED or CAUTION

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**
- Planning proceeds without a new user-facing checkpoint (assuming no other user-value tradeoffs)

---

### Contract-Compromise Risk Requires Design Pause

**ID:** `rq-designval04` | **Priority:** **[MUST]**

When an agent identifies that a proposed design can only be delivered by compromising agreed acceptance criteria, explicit constraints, or stated avoidances, the orchestrator must pause for human input before proceeding to planning. This check is independent of the design validator verdict and must trigger even when the validator returns VALIDATED or CAUTION.

**Tags:** `workflow`, `design`, `autonomy`, `checkpoints`

#### Scenarios

**Contract-compromise risk triggers design pause** (`rq-designval04.1`)

**Given:**
- A design is being evaluated
- The agent determines that implementing the design would violate an agreed acceptance criterion or explicit constraint

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**
- The orchestrator pauses for human input
- No silent auto-continue to planning occurs

**No compromise risk auto-continues** (`rq-designval04.2`)

**Given:**
- A design is being evaluated
- The agent confirms the design can be delivered without compromising any acceptance criteria, constraints, or stated avoidances

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**
- Planning proceeds without a new design-approval checkpoint (assuming no other user-value tradeoffs)

---

### Gate Handoff Voice Spine

**ID:** `rq-handoffVoice01` | **Priority:** **[MUST]**

Every /adv-* command that emits a user-facing gate-transition message MUST use the Gate Handoff Voice spine: Problem / Chosen direction / Delivered, followed by a blockquote wayfinder block. The blockquote MUST contain three rows: bolded `**{change-id}**`, the gate transition `{gate} ✓ → {next-gate}`, and an arrow-prefixed runnable command `→ `/adv-{next-command} {change-id}``. The command shown MUST be the single command needed to continue — no redundant or alternative command lines. Canonical source: docs/command-voice-standard.md § Gate Handoff Voice.

**Tags:** `voice`, `handoff`, `presentation`

#### Scenarios

**Handoff follows spine with blockquote wayfinder block** (`rq-handoffVoice01.1`)

**Given:**
- An /adv-* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**
- All three narrative spine headings are present: Problem, Chosen direction, Delivered, followed by a blockquote wayfinder block below a --- separator
- The blockquote contains a row with `**{change-id}**` (bolded change ID)
- The blockquote contains a row with `{gate} ✓ → {next-gate}` (gate transition)
- The blockquote contains an arrow-prefixed row `→ `/adv-{next-command} {change-id}`` showing exactly one runnable command
- The archive terminal variant uses a single-line blockquote `> **{change-id}** · release ✓ ·` followed by a terminal verb (Shipped. when push succeeds and assets propagate to the global install, Merged locally. when no remote is configured or push is skipped or push fails) instead of the standard three-row wayfinder block
- When the handoff is paired with a human-checkpoint approval, reply instructions appear as plain prose below the blockquote (not inside it); the three-section spine (Problem / Chosen direction / Delivered) is unchanged

**No mechanics leakage** (`rq-handoffVoice01.2`)

**Given:**
- An /adv-* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**
- No todo checklists appear as primary handoff content
- No step-completed logs appear as primary handoff content
- No orchestration summaries appear as primary handoff content
- No sub-agent bookkeeping appears as primary handoff content
- No gate checkbox banners appear as primary handoff content

**Auto-continue transitions unaffected** (`rq-handoffVoice01.3`)

**Given:**
- rq-autonomy01 permits auto-continue between stages
- No unresolved user-value tradeoff exists
- No required approval is pending

**When:** The agent proceeds without emitting a user-facing message

**Then:**
- No handoff message is emitted
- No handoff validation is required for the silent transition

**Blockquote wayfinder block replaces Next sections** (`rq-handoffVoice01.4`)

**Given:**
- An /adv-* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**
- ## Next stage and ## Next headings are absent from the handoff
- A blockquote wayfinder block appears after ## Delivered with three rows: change-id, gate transition, arrow-prefixed runnable command
- The archive terminal variant ends with a single-line blockquote `> **{change-id}** · release ✓ ·` followed by a terminal verb (Shipped. or Merged locally. depending on push state) and no separate labeled block
- Optional reply instructions for human checkpoints (Inline Approval Voice) appear as plain prose below the blockquote, not inside it

**Blockquote wayfinder shows only the needed command** (`rq-handoffVoice01.5`)

**Given:**
- An /adv-* command completes a gate and emits a user-facing gate-transition message

**When:** The blockquote wayfinder block is inspected

**Then:**
- Exactly one runnable command is shown in the wayfinder block (in the arrow-prefixed row)
- No redundant alternative command lines appear
- The command shown is the single next action needed to continue

---

### Inline Approval at Named Human Checkpoints

**ID:** `rq-inlineApproval01` | **Priority:** **[MUST]**

ADV's seven named human checkpoints (proposal confirmation, agreement sign-off, design approval, prep approval, acceptance, archive sign-off, cancellation approval) MUST use inline handoff text — composed with the Gate Handoff Voice spine — instead of the question tool. The inline pattern MUST emit reply instructions covering approve, redirect via slash command, revise, and stop. Reply parsing tiers MUST be: Tier A (reversible — proposal/agreement/design/prep/acceptance) uses whitelist + LLM fallback for natural-language replies; Tier B (irreversible — archive sign-off, cancellation) uses whitelist-only with no LLM fallback. Non-checkpoint question tool uses (change-id selection, doom-loop recovery, drift detection, AC clarification rounds, investment check-in, judgment calls, triage commands) remain unaffected. Canonical source: docs/command-voice-standard.md § Inline Approval Voice.

**Tags:** `voice`, `checkpoints`, `approval`, `ux`

#### Scenarios

**Checkpoint approval uses inline handoff** (`rq-inlineApproval01.1`)

**Given:**
- An ADV workflow reaches a named human checkpoint

**When:** The agent presents the checkpoint to the user

**Then:**
- The presentation uses the Gate Handoff Voice spine plus inline reply instructions
- The question tool is not used for the checkpoint approval

**Tier A whitelist + LLM fallback for reversible checkpoints** (`rq-inlineApproval01.2`)

**Given:**
- A reversible checkpoint (proposal, agreement, design, prep, acceptance) is presented
- User replies with a whitelist word OR an ambiguous reply

**When:** The agent processes the reply

**Then:**
- Whitelist words (continue, go, approve, yes, ok, proceed, accept, lgtm, etc.) trigger immediate approval
- Ambiguous replies are classified by LLM into approve / revise / redirect / stop / unclear
- Unclear replies trigger re-prompt

**Tier B whitelist-only for irreversible actions** (`rq-inlineApproval01.3`)

**Given:**
- An irreversible checkpoint (archive sign-off, cancellation approval) is presented

**When:** The agent processes the reply

**Then:**
- Only exact whitelist matches trigger approval
- LLM fallback is not used
- Anything else triggers re-prompt with the same options
- Archive sign-off executes in the same response as the whitelist-match acknowledgment with no separate confirmation-echo turn

**Cancellation uses structured inline format** (`rq-inlineApproval01.4`)

**Given:**
- A cancellation approval is needed

**When:** The agent presents the cancellation

**Then:**
- The agent emits a numbered per-task list as inline prose
- Reply instructions cover approve all, reject all, keep N, cancel N, stop
- Replies are parsed by exact regex; LLM fallback is not used
- Ambiguous replies trigger re-prompt

**Prep gate machine contract preserved** (`rq-inlineApproval01.5`)

**Given:**
- The user replies with a Tier A whitelist word at the prep checkpoint

**When:** The agent calls adv_gate_complete gateId: planning

**Then:**
- userApproved: true is passed
- The machine contract is satisfied
- Inline approval is the upstream signal source independent of the API surface

**Non-checkpoint question uses unaffected** (`rq-inlineApproval01.6`)

**Given:**
- A non-checkpoint workflow step uses the question tool (change-id selection, doom-loop, drift detection, AC clarification round, investment check-in, judgment call, triage)

**When:** The step executes

**Then:**
- The question tool continues to be used
- The inline approval pattern does not apply

**Exact shown Tier A continuation command counts as approval** (`rq-inlineApproval01.7`)

**Given:**
- A Tier A checkpoint (proposal, agreement, design, prep, acceptance) is presented with a blockquote wayfinder block showing a specific continuation command (e.g., `/adv-apply {change-id}`)
- The user invokes that exact command while the checkpoint is pending

**When:** The agent processes the command invocation

**Then:**
- The invocation counts as explicit approval equivalent to a Tier A whitelist word
- The agent completes the pending gate with userApproved: true
- The agent proceeds immediately to the next stage without a second approval prompt

**Tier B remains whitelist-only with no command-as-approval bypass** (`rq-inlineApproval01.8`)

**Given:**
- A Tier B checkpoint (archive sign-off, cancellation approval) is presented

**When:** The user invokes a slash command or provides a non-whitelist reply

**Then:**
- Only exact whitelist matches trigger approval
- No slash command invocation counts as approval
- LLM fallback is not used
- Anything else triggers re-prompt with the same options

---

### Fast-Follow Schema Contract

**ID:** `rq-scopeFollowupSchema01` | **Priority:** **[MUST]**

The ChangeSchema must support an optional `fast_follow_of` field that records same-project parent lineage. The `adv_change_create` tool must accept `parent_change_id` and enforce mutual exclusion with `target_path`.

**Tags:** `schema`, `lineage`, `fast-follow`

#### Scenarios

**parent_change_id creates fast_follow_of metadata** (`rq-scopeFollowupSchema01.1`)

**Given:**
- A valid parent change ID in the current project

**When:** adv_change_create is called with parent_change_id

**Then:**
- The new change has fast_follow_of: { parent_change_id, linked_at } set
- linked_at is an ISO8601 timestamp

**Backward compatibility without fast_follow_of** (`rq-scopeFollowupSchema01.2`)

**Given:**
- A change created without parent_change_id

**When:** ChangeSchema is parsed

**Then:**
- The fast_follow_of field is absent
- Parsing succeeds normally

**Mutual exclusion with target_path** (`rq-scopeFollowupSchema01.3`)

**Given:**
- Both target_path and parent_change_id are provided

**When:** adv_change_create is called

**Then:**
- A mutual-exclusion error is returned
- No change is created

---

### Inline-Approval Protocol for Non-Campsite Scope Discovery

**ID:** `rq-scopeDiscoveryProtocol01` | **Priority:** **[MUST]**

When non-P23-campsite-eligible scope is discovered during /adv-apply, /adv-review, or /adv-harden, the agent must emit a Tier A inline prompt with options reenter/split/keep/cancel. The agent must never silently absorb discovered scope.

**Tags:** `workflow`, `scope-discovery`, `inline-approval`, `campsite-rule`

#### Scenarios

**Non-campsite scope triggers inline prompt** (`rq-scopeDiscoveryProtocol01.1`)

**Given:**
- Non-P23-campsite-eligible scope discovered during /adv-apply, /adv-review, or /adv-harden

**When:** The agent evaluates the discovered scope

**Then:**
- A Tier A inline prompt is emitted with options: reenter {gate}, split, keep, cancel
- The agent never silently absorbs the scope

**Split creates fast-follow child** (`rq-scopeDiscoveryProtocol01.2`)

**Given:**
- User replies split to the scope-discovery prompt

**When:** The agent processes the reply

**Then:**
- adv_change_create is called with parent_change_id set to the current change
- The new change is a fast-follow child

**Keep with new objectives requires re-entry** (`rq-scopeDiscoveryProtocol01.3`)

**Given:**
- User replies keep and the absorbed scope adds new objectives or acceptance criteria

**When:** The agent processes the reply

**Then:**
- adv_change_reenter is invoked per rq-scopeReentry01
- Keep does not bypass re-entry when scope adds objectives/AC

**Campsite-eligible scope applied freely** (`rq-scopeDiscoveryProtocol01.4`)

**Given:**
- P23-campsite-eligible adjacent scope (any size, clear, safe, focused)

**When:** The agent evaluates the scope

**Then:**
- The campsite-rule is applied freely without prompting
- No inline approval is required

---

### Lineage Display in List, Show, and Status

**ID:** `rq-scopeFollowupSurfacing01` | **Priority:** **[MUST]**

Tools that surface change data must display fast-follow lineage: adv_change_show includes _fastFollowOrigin, adv_change_list annotates entries with parent_change_id, and adv_status prefixes child labels and references parents in recommendations.

**Tags:** `lineage`, `surfacing`, `ui`

#### Scenarios

**adv_change_show surfaces _fastFollowOrigin** (`rq-scopeFollowupSurfacing01.1`)

**Given:**
- A change with fast_follow_of set

**When:** adv_change_show is called

**Then:**
- Output includes _fastFollowOrigin parallel to _crossProjectOrigin
- _fastFollowOrigin contains note, parent_change_id, and linked_at

**adv_change_list annotates parent_change_id** (`rq-scopeFollowupSurfacing01.2`)

**Given:**
- Changes with fast_follow_of in the list

**When:** adv_change_list is called

**Then:**
- Entries with fast_follow_of include parent_change_id at the top level
- Children remain top-level (not nested)

**adv_status prefixes and references parents** (`rq-scopeFollowupSurfacing01.3`)

**Given:**
- Changes with fast_follow_of in the project

**When:** adv_status is called

**Then:**
- Child change labels are prefixed with ↳ 
- Recommendations reference the parent change ID
- Archived parents are annotated with (archived)

---

### Size Alone Is Not Grounds for Split-Suggestion

**ID:** `rq-largeScopeValidity01` | **Priority:** **[MUST]**

Once a change has completed the prep gate with userApproved, the agent must not suggest splitting based on size, task count, or complexity alone. Size-triggered concerns route through cost-governance Phase 1.5 judgment-call surfacing only.

**Tags:** `workflow`, `scope`, `cost-governance`, `autonomy`

#### Scenarios

**No split-suggestion after prep approval** (`rq-largeScopeValidity01.1`)

**Given:**
- A change has completed the prep gate with userApproved

**When:** The agent evaluates whether to suggest splitting

**Then:**
- The agent does not emit split-suggestions based on size, task count, or complexity alone
- Execution proceeds as planned

**Size concerns route through cost-governance** (`rq-largeScopeValidity01.2`)

**Given:**
- Size-triggered concerns exist during execution

**When:** The agent evaluates how to surface concerns

**Then:**
- Concerns are routed through cost-governance Phase 1.5 judgment-call surfacing
- No split-suggestion is made

**Hardstop remains advisory** (`rq-largeScopeValidity01.3`)

**Given:**
- Cost-governance hardstop tier fires

**When:** The agent evaluates the hardstop signal

**Then:**
- The hardstop is advisory only
- It does not auto-trigger split or adv_change_reenter

---

### Autopilot Mode Records Delegation Audit and Preserves Safety Boundaries

**ID:** `rq-autopilot01` | **Priority:** **[MUST]**

The /adv-autopilot command provides a single-shot delegation surface that auto-approves the 5 routine human checkpoints (proposal, agreement, design, prep, acceptance) for a change. The change records approval_mode: 'autopilot' and autopilot_invoked_at on invocation, and each auto-approved gate is completed with completedBy: 'adv-autopilot' and notes documenting the delegation. Tier B checkpoints (archive sign-off, cancellation) remain whitelist-only and are NOT auto-approved by autopilot. All system-level interrupts (doom-loop, design validator CONFLICT, contract-compromise risk, Phase 1.5 judgment-call surfacing, drift detection in /adv-review and /adv-harden) remain active and are NOT suppressed by autopilot mode.

**Tags:** `workflow`, `autonomy`, `autopilot`, `audit`

#### Scenarios

**Autopilot invocation records change-level audit fields** (`rq-autopilot01.1`)

**Given:**
- A change has the proposal gate pending
- /adv-autopilot {change-id} is invoked

**When:** The autopilot workflow begins

**Then:**
- change.approval_mode is set to 'autopilot'
- change.autopilot_invoked_at is set to the invocation timestamp

**Auto-approved gates record adv-autopilot as completer** (`rq-autopilot01.2`)

**Given:**
- An autopilot run is in progress
- The discovery gate is being completed

**When:** adv_gate_complete is called

**Then:**
- completedBy is set to 'adv-autopilot'
- notes contain 'approved via /adv-autopilot at <ISO>'

**Tier B and dynamic interrupts preserved under autopilot** (`rq-autopilot01.3`)

**Given:**
- An autopilot run reaches acceptance gate completion
- Or a populated judgment_calls[] surfaces during /adv-apply Phase 1.5
- Or design validator returns CONFLICT

**When:** The orchestrator evaluates whether to proceed

**Then:**
- Archive sign-off uses the standard Tier B inline-approval prompt
- Phase 1.5 surfaces unresolved judgment calls via question tool
- Design CONFLICT pauses for user resolution
- Cancellation always requires adv_task_cancel approvedByUser: true

**Autopilot delegates design-approval for user-value tradeoffs** (`rq-autopilot01.4`)

**Given:**
- approval_mode: 'autopilot' is set on the change
- The design phase identifies real user-value tradeoffs that do NOT trigger CONFLICT or contract-compromise risk

**When:** The orchestrator evaluates whether to pause for design approval per rq-autonomy01.3

**Then:**
- Design approval is satisfied by autopilot delegation; no inline approval prompt is emitted
- rq-designval03 (CONFLICT) and rq-autonomy01.6 (contract-compromise) remain blocking interrupts regardless of approval_mode
- The audit trail records completedBy: 'adv-autopilot' on the design gate so the delegation is forensically distinguishable from manual design approval

---

### Search-Attribute Registration Must Use Correct OperatorService Method

**ID:** `rq-searchAttrHealth01` | **Priority:** **[MUST]**

The Temporal OperatorService search-attribute health check MUST use `listSearchAttributes` (not `getSearchAttributes`). `getSearchAttributes` exists on WorkflowService, not OperatorService. Using the wrong method causes the check to silently fail, returning ok: false even when attributes are registered. All code paths that query search-attribute health — observability checks, diagnose tool, and register tool — must go through `checkAdvSearchAttributes` which uses the correct OperatorService method.

#### Scenarios

**OperatorService method name is listSearchAttributes** (`rq-searchAttrHealth01.1`)

**Given:**
- A Temporal connection with operatorService available
- Search attributes AdvChangeId, AdvChangeStatus, AdvActiveGate, AdvProjectId, AdvDoomLoopActive are registered

**When:** checkAdvSearchAttributes is called

**Then:**
- It calls operatorService.listSearchAttributes (not getSearchAttributes)
- It returns { ok: true, present: [...], missing: [], wrongType: [] }

**Workflow handlers conditionally skip upsertSearchAttributes** (`rq-searchAttrHealth01.2`)

**Given:**
- A ChangeWorkflowInput with searchAttributesEnabled: false

**When:** completeGateUpdate, archiveChangeUpdate, or closeChangeUpdate handlers execute

**Then:**
- wf.upsertSearchAttributes is NOT called
- The handler completes normally without error

**initStsl verifies search attributes after registration** (`rq-searchAttrHealth01.3`)

**Given:**
- initStsl is called on a Temporal namespace
- OperatorService.listSearchAttributes and addSearchAttributes are available

**When:** initStsl completes

**Then:**
- After registerAdvSearchAttributes, verifyAdvSearchAttributes is called
- getStslStats().saVerification reflects the verification result
- The verification polls checkAdvSearchAttributes until ok:true or maxAttempts exhausted

**adv_temporal_register_search_attributes returns verification result** (`rq-searchAttrHealth01.4`)

**Given:**
- A Temporal namespace where ADV search attributes need registration
- User has approved registration with approvedByUser: true

**When:** adv_temporal_register_search_attributes is called

**Then:**
- After registerMissingAdvSearchAttributes, checkAdvSearchAttributes is called for verification
- The tool output includes a verification field with ok, present, missing, wrongType
- The tool success field requires both registration ok AND verification ok

---

### Archive State Transition Must Be Resilient to Failed Disk Bundle Write

**ID:** `rq-archiveOrdering01` | **Priority:** **[MUST]**

adv_change_archive MUST be idempotent when retrying after a previous failure where the disk bundle was written but the Temporal status transition failed. On retry, if the archive bundle already exists on disk and the change status is not 'archived', the disk write MUST be skipped and the flow proceeds directly to the status transition. This prevents double-writing the bundle and allows recovery from transient Temporal failures.

#### Scenarios

**Idempotent retry skips disk write** (`rq-archiveOrdering01.1`)

**Given:**
- An archive bundle exists at {archiveDir}/{changeId}/change.json
- The change status is not 'archived' (previous status transition failed)
- dryRun is false

**When:** adv_change_archive is called

**Then:**
- archiveChange() is NOT called (disk write skipped)
- The status transition to 'archived' proceeds
- The result includes the existing archivePath

**Error output includes cause chain** (`rq-archiveOrdering01.2`)

**Given:**
- The archive disk write succeeded
- store.changes.save(change) throws a Temporal WorkflowUpdateFailedError with a nested cause

**When:** The error is caught

**Then:**
- The tool output includes the full cause chain (not just the outer error class name)
- The output shows success: false with a descriptive error message

---
