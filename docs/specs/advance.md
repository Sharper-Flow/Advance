# Advance

> **Version:** 1.12.0
> **Updated:** 2026-04-23

## Purpose

Capability: Advance

## Requirements

### Project-Level Wisdom System

**ID:** `rq-W1sD0mR1` | **Priority:** **[MUST]**

Durable cross-change learnings must be persisted in a project-level JSONL store to improve agent performance across sessions.

#### Scenarios

**Durable learning promotion** (`rq-W1sD0mR1.1`)

**Given:**

- A convention-level learning discovered in a change

**When:** adv_wisdom_add is executed with promote: true

**Then:**

- The entry is appended to project-level wisdom.jsonl

---

### Synthetic Validation Draft Isolation

**ID:** `rq-synthstate01` | **Priority:** **[MUST]**

Supported internal validation or parity flows must not leave synthetic draft changes in live ADV project state. Protection must preserve legitimate user-created drafts and keep draft/status surfaces focused on real changes.

#### Scenarios

**Synthetic validation families blocked on supported create path** (`rq-synthstate01.1`)

**Given:**

- A supported internal validation or parity flow attempts to create a synthetic draft change matching a reserved parity-validation family on live ADV state

**When:** The create path executes

**Then:**

- The synthetic draft is not persisted to the live project state
- The caller receives a clear error or bounded degraded outcome directing synthetic activity to isolated temp/test storage

**Legitimate parity wording remains allowed** (`rq-synthstate01.2`)

**Given:**

- A normal user-driven change proposal uses benign wording that mentions parity but does not match a reserved synthetic family

**When:** The change is created

**Then:**

- The draft change is persisted normally
- The protection does not block or rename the legitimate draft

**Draft and status surfaces stay clear after validation activity** (`rq-synthstate01.3`)

**Given:**

- Supported internal validation activity has run

**When:** adv_change_list with status draft or adv_status is executed on the live project

**Then:**

- Stale synthetic parity-validation drafts are absent from live draft results
- Real user-authored drafts remain visible

---

### Manifest-Driven Workflow recommendations

**ID:** `rq-M4n1f3s1` | **Priority:** **[MUST]**

Command recommendations in adv-status must be derived from a type-safe workflow manifest to ensure consistent pathing.

#### Scenarios

**Context-aware recommendations** (`rq-M4n1f3s1.1`)

**Given:**

- A change at execution gate

**When:** adv-status is run

**Then:**

- It recommends adv-review or adv-harden based on manifest successors

---

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

### Status Config Diagnostics and Feature Flags

**ID:** `rq-advcfg01` | **Priority:** **[MUST]**

adv_status must surface project.json diagnostics and include parsed feature flag values so agents can see config health and runtime policy settings without opening files.

#### Scenarios

**Invalid project config is surfaced** (`rq-advcfg01.1`)

**Given:**

- project.json is malformed or schema-invalid

**When:** adv_status is executed

**Then:**

- Output includes a config error or warning recommendation
- The command does not fail hard due to config parse issues

**Feature flags are visible in status output** (`rq-advcfg01.2`)

**Given:**

- project.json parses successfully

**When:** adv_status is executed

**Then:**

- Output includes feature_flags values
- Defaults are applied when flags are omitted

---

### Task Metadata Filter Semantics

**ID:** `rq-advmeta01` | **Priority:** **[MUST]**

Tasks may include optional metadata key/value pairs. adv_task_list must support has_metadata_key:<key> and metadata:<key>=<value> filters with behavior aligned between workflow-owned source-of-truth state and any derived query or index surface.

#### Scenarios

**Filter by metadata key** (`rq-advmeta01.1`)

**Given:**

- A change with tasks containing metadata keys

**When:** adv_task_list is called with filter has_metadata_key:<key>

**Then:**

- Only tasks containing that metadata key are returned

**Filter by metadata key/value** (`rq-advmeta01.2`)

**Given:**

- A change with tasks containing metadata key/value pairs

**When:** adv_task_list is called with filter metadata:<key>=<value>

**Then:**

- Only tasks matching both key and value are returned

---

### Bounded Signal Flush on Shutdown

**ID:** `rq-advshut1` | **Priority:** **[MUST]**

On SIGINT/SIGTERM, the plugin must run a bounded flush path before close, with idempotent/reentrant handling so duplicate signals cannot trigger multiple concurrent flush sequences.

#### Scenarios

**Signal performs bounded flush** (`rq-advshut1.1`)

**Given:**

- The process receives SIGINT or SIGTERM

**When:** Shutdown handling begins

**Then:**

- store.flush is attempted before store.close
- A hard timeout bounds flush duration

**Duplicate signals are idempotent** (`rq-advshut1.2`)

**Given:**

- A shutdown flush is already in progress

**When:** A second SIGINT/SIGTERM is received

**Then:**

- No second flush path starts
- Shutdown remains deterministic

---

### Durable Proposal Context for adv-task

**ID:** `rq-advprop01` | **Priority:** **[MUST]**

After Quick Contract confirmation, /adv-task must always persist contract context to proposal.md, and downstream workflows must tolerate missing/empty legacy proposal files via scaffold fallback warnings.

#### Scenarios

**adv-task writes proposal by default** (`rq-advprop01.1`)

**Given:**

- A Quick Contract is confirmed in /adv-task

**When:** The change is created

**Then:**

- proposal.md is written in the change directory
- The file includes intent, scope, and success criteria

**Legacy missing proposal is non-blocking** (`rq-advprop01.2`)

**Given:**

- A legacy change has missing or empty proposal.md

**When:** Proposal context is loaded

**Then:**

- A scaffold proposal is generated
- A non-blocking warning is emitted

---

### Problem Statement Agreement for adv-proposal

**ID:** `rq-advprop02` | **Priority:** **[MUST]**

/adv-proposal must extract prior discussion context (decisions, rejected approaches, constraints, open questions) from the conversation before synthesizing a problem statement, confirm it via the question tool before creating any change artifacts, and persist the confirmed text (including prior decisions and rejected approaches) as the opening section of proposal.md via the proposal parameter in adv_change_create. The problem statement must not contradict, omit, or reinterpret any prior decision or constraint from the conversation.

**Tags:** `proposal`, `context-agreement`, `transcript-grounding`

#### Scenarios

**Prior discussion context extracted before synthesis** (`rq-advprop02.1`)

**Given:**

- A user invokes /adv-proposal after a conversation containing decisions, constraints, or rejected approaches

**When:** Phase 1 begins

**Then:**

- The agent extracts agreed facts, decisions made, rejected approaches, open questions, and constraints stated from the conversation
- Empty categories are listed as 'None identified' rather than omitted
- No decisions or constraints are fabricated that were not explicitly discussed

**Problem statement grounded in prior discussion** (`rq-advprop02.2`)

**Given:**

- Prior discussion context has been extracted

**When:** The problem statement is synthesized

**Then:**

- The problem statement includes Prior Decisions, Rejected Approaches, and Open Questions sections
- The problem statement does not contradict any extracted agreed fact
- The problem statement does not reintroduce any rejected approach as a proposed solution
- The problem statement does not ignore any stated constraint

**Drift detection in confirmation** (`rq-advprop02.3`)

**Given:**

- A problem statement block is shown to the user

**When:** The user reviews it via the question tool

**Then:**

- The confirmation question explicitly asks the user to check Prior Decisions and Rejected Approaches for accuracy
- A 'Drift detected' option is available for the user to flag discrepancies
- If drift is detected, the agent re-extracts and re-synthesizes before proceeding

**Confirmed problem statement persisted in proposal.md** (`rq-advprop02.4`)

**Given:**

- The user confirms the problem statement in Phase 1

**When:** The change is created in Phase 2

**Then:**

- adv_change_create is called with the proposal parameter containing the confirmed text
- proposal.md includes the confirmed problem statement as the Why section
- proposal.md includes a Constraints from Discussion section with prior decisions and rejected approaches

**Abort path creates no artifacts** (`rq-advprop02.5`)

**Given:**

- The user selects Abort during Phase 1 confirmation

**When:** The command exits

**Then:**

- No change.json is created
- No proposal.md is created
- No tasks are added

**Confirmed problem statement persisted as standalone artifact** (`rq-advprop02.6`)

**Given:**

- The user confirms the problem statement in Phase 1

**When:** The change is created in Phase 2

**Then:**

- adv_change_create is called with the problemStatement parameter containing the confirmed problem statement text
- A problem-statement.md file is written to the change directory as a sibling of proposal.md
- The problem-statement.md content exactly matches the confirmed text (no template wrapping)
- The tool output includes problemStatementPath pointing to the artifact
- When the change is archived, problem-statement.md is preserved in the archive directory

---

### Defensive and Nesting Slop Detection

**ID:** `rq-slopscan01` | **Priority:** **[MUST]**

/adv-slop-scan must detect overly defensive code (redundant guard chains, paranoid null checks, unreachable fallback branches) and deeply nested code (nesting depth >= configured threshold) using AST-first analysis with deterministic degraded fallback when AST tools are unavailable. Findings must include structured diagnostic fields in all output formats.

**Tags:** `slop-scan`, `quality`, `ast`

#### Scenarios

**Deep nesting detected via AST** (`rq-slopscan01.1`)

**Given:**

- A source file containing a function with nesting depth >= nesting_depth_threshold (default 4)
- An AST analysis tool (ESLint, radon, or gocyclo) is available

**When:** /adv-slop-scan is run on the file

**Then:**

- A finding is emitted with smell ID MAINT-004
- The finding includes nestingDepth, complexity, confidence, and detectionMethod fields
- detectionMethod is 'ast'

**Defensive overkill detected** (`rq-slopscan01.2`)

**Given:**

- A source file containing a function with >= defensive_guard_threshold (default 3) redundant guard patterns on the same value

**When:** /adv-slop-scan is run on the file

**Then:**

- A finding is emitted with smell ID QUAL-011
- The finding includes confidence and detectionMethod fields
- Severity is at least medium

**Degraded fallback annotated when AST unavailable** (`rq-slopscan01.3`)

**Given:**

- No AST analysis tool is installed for the detected language

**When:** /adv-slop-scan is run

**Then:**

- Nesting detection falls back to brace/indent counter
- Findings from fallback include detectionMethod: 'degraded'
- Report annotates affected findings with [DEGRADED: AST tool unavailable]

**Project threshold overrides respected** (`rq-slopscan01.4`)

**Given:**

- project.json contains features.slop_scan.nesting_depth_threshold: 6

**When:** /adv-slop-scan is run

**Then:**

- Functions with nesting depth 4 or 5 are NOT flagged
- Functions with nesting depth >= 6 ARE flagged

**Clean code produces no false positives** (`rq-slopscan01.5`)

**Given:**

- A source file with a single null check and a single try/catch block

**When:** /adv-slop-scan is run

**Then:**

- No QUAL-011 or MAINT-004 findings are emitted for that file

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

---

### Human Checkpoint Contract

**ID:** `rq-autonomy01` | **Priority:** **[MUST]**

ADV must pause for human input only at explicit approval/judgment checkpoints and auto-continue through clean agent-owned workflow steps. Human checkpoints are: proposal confirmation, agreement sign-off, design approval when real tradeoffs depend on user values, when the design validator returns CONFLICT, or when contract-compromise risk is present, acceptance, archive sign-off, cancellation approval, and doom-loop recovery. All other clean workflow steps (discovery, deterministic design, prep, apply, review, harden, and scope-driven re-entry) proceed sequentially without prompting the user when no unresolved user-value tradeoff, contract-compromise risk, or required approval exists.

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

- A change has completed the acceptance gate
- Archive sign-off is the next step

**When:** The ADV orchestrator evaluates the next gate

**Then:**

- The orchestrator stops and presents a change report
- The user is asked for explicit sign-off via the question tool

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

---

### Presentation Surface Discipline

**ID:** `rq-presentationSurface01` | **Priority:** **[SHOULD]**

ADV presentation-layer surfaces (instructions, commands, tools, and skills) SHOULD stay within documented limits. When a change adds a new command, tool, or skill, it must justify why the addition does not replicate an existing pair/merge opportunity, or it must update the documented limits and related verification assets in the same change.

#### Scenarios

**New surface addition requires justification or limit update** (`rq-presentationSurface01.1`)

**Given:**

- An ADV change proposes a new command, tool, or skill

**When:** The change updates the workflow surface

**Then:**

- The change explains why the new surface does not duplicate an existing merge opportunity, or updates the documented limits in the same change
- Related verification assets are updated so future drift is detectable

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

Every /adv-\* command that emits a user-facing gate-transition message MUST use the Gate Handoff Voice spine: Problem / Chosen direction / Delivered, followed by a footer line containing the change id, gate transition, and next command. Canonical source: docs/command-voice-standard.md § Gate Handoff Voice.

#### Scenarios

**Handoff follows spine** (`rq-handoffVoice01.1`)

**Given:**

- An /adv-\* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**

- All three narrative spine headings are present: Problem, Chosen direction, Delivered, plus a footer line below a --- separator
- The archive terminal variant uses **{change-id}** · release ✓ · Shipped. instead of the standard arrow+command footer

**No mechanics leakage** (`rq-handoffVoice01.2`)

**Given:**

- An /adv-\* command completes a gate and emits a user-facing gate-transition message

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

**Footer replaces Next sections** (`rq-handoffVoice01.4`)

**Given:**

- An /adv-\* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**

- ## Next stage and ## Next headings are absent from the handoff
- A footer line appears after ## Delivered with the change id, gate transition, and next command
- The archive terminal variant ends the footer with Shipped. and no arrow or command

---

### Filter-Aware Bulk Close

**ID:** `rq-bulkClose01` | **Priority:** **[MUST]**

`adv_change_bulk_close` must support closing multiple changes in a single approved tool call, using either an explicit ID list or filter-based selection, with fail-all semantics on invalid targets and a structured result envelope.

#### Scenarios

**Explicit ID list close** (`rq-bulkClose01.1`)

**Given:**

- A list of valid active change IDs

**When:** `adv_change_bulk_close` is called with `kind: "explicit"` and those IDs

**Then:**

- All specified changes are closed with the provided reason
- The result envelope lists each change with success or error status
- If `reason: "superseded"`, at most one survivor change ID may be provided

**Filter-based close requires explicit filter** (`rq-bulkClose01.2`)

**Given:**

- A repository with changes in various states

**When:** `adv_change_bulk_close` is called with `kind: "filter"`

**Then:**

- The call must supply either a `status` filter (`draft` or `pending`) OR a staleness filter (`createdBefore` or `lastActivityBefore`)
- No implicit default status is applied

**Fail-all on protected targets** (`rq-bulkClose01.3`)

**Given:**

- A bulk close request targeting a mix of valid and invalid changes

**When:** Any resolved target is `active`, `archived`, `closed`, nonexistent, ambiguous, or duplicated

**Then:**

- The entire request fails before any mutation
- The error identifies every invalid target and its specific failure reason

**Empty match is a structured error** (`rq-bulkClose01.4`)

**Given:**

- A filter-based bulk close that matches zero changes

**When:** The selection resolves

**Then:**

- A structured error is returned with `success: false`
- The message clearly states that no changes matched the filter
- No silent no-op occurs

**Result envelope mirrors task-cancel pattern** (`rq-bulkClose01.5`)

**Given:**

- A bulk close request that partially or fully succeeds

**When:** The result is returned

**Then:**

- The envelope contains `success`, `closed` (count), `results` (array of per-change entries), and `message`
- Each per-change entry includes `changeId`, `success`, and optional `error`

**No hard delete** (`rq-bulkClose01.6`)

**Given:**

- Any bulk close call

**When:** The operation completes

**Then:**

- Changes are closed (status moved to `closed`) but never purged or hard-deleted
- Audit metadata is preserved for every closed change

**Existing close signature unchanged** (`rq-bulkClose01.7`)

**Given:**

- The existing `adv_change_close` tool

**When:** Inspected after this change ships

**Then:**

- Its signature and behavior remain identical to before `adv_change_bulk_close` was added
