# Delegation Defaults

> **Version:** 1.3.2
> **Updated:** 2026-07-23

## Purpose

Canonical definition of default delegation modes for each ADV workflow step. Establishes which steps allow sub-agent delegation, which require inline execution, and what safety boundaries constrain delegation. The matrix is the single source of truth for delegation routing decisions; command files and orchestrator guidance reference this spec rather than duplicating delegation prose.

## Requirements

### Matrix Coverage for All Workflow Steps

**ID:** `rq-delDefaults01` | **Priority:** **[MUST]**

The delegation matrix MUST define a delegation default for each of the 9 workflow steps: proposal, discovery, design, prep, apply, review, harden, archive, reflect. Each step maps to exactly one gate-affinity phase in the 7-gate lifecycle (harden and reflect are post-gate phases). Utility commands (research, tron, slop-scan, audit, improve, etc.) have their own delegation rules specified in their command files and are out of scope for this matrix.

**Tags:** `delegation`, `matrix`, `coverage`

#### Scenarios

**All 9 workflow steps have delegation entries** (`rq-delDefaults01.1`)

**Given:**
- The delegation-defaults spec is loaded

**When:** Matrix coverage is checked

**Then:**
- Entries exist for: proposal, discovery, design, prep, apply, review, harden, archive, reflect
- No duplicate entries exist
- No extra entries outside the 9 canonical steps exist

**Utility commands excluded from matrix** (`rq-delDefaults01.2`)

**Given:**
- The delegation matrix defines its 9 steps

**When:** Matrix scope is evaluated

**Then:**
- research, tron, slop-scan, audit, improve, cleanup, clarify, status, validate, roadmap, task, idea, and problem are NOT in the matrix
- These supported utility commands define delegation rules in their own command files

---

### Valid Mode Classification Per Step

**ID:** `rq-delDefaults02` | **Priority:** **[MUST]**

Each workflow step MUST declare exactly one default delegation mode from the set: inline_required, subagent_primary, hybrid. inline_required means all work happens in the orchestrator context with no sub-agent delegation. subagent_primary means the primary work is delegated to sub-agents with only verdict synthesis remaining inline. hybrid means the step mixes delegable sub-steps with inline-required sub-steps; the spec enumerates delegated sub-steps and inline boundaries structurally.

**Tags:** `delegation`, `mode`, `classification`

#### Scenarios

**Each step has a valid mode** (`rq-delDefaults02.1`)

**Given:**
- The delegation matrix is loaded

**When:** Mode validation is checked

**Then:**
- proposal.mode == inline_required
- discovery.mode == hybrid
- design.mode == hybrid
- prep.mode == inline_required
- apply.mode == hybrid
- review.mode == hybrid
- harden.mode == subagent_primary
- archive.mode == inline_required
- reflect.mode == inline_required

**Mode values are from valid enum** (`rq-delDefaults02.2`)

**Given:**
- A delegation matrix entry

**When:** The mode value is validated

**Then:**
- mode is one of: inline_required, subagent_primary, hybrid
- Any other value is a validation error

---

### Agent and Boundary Specification Per Step

**ID:** `rq-delDefaults03` | **Priority:** **[MUST]**

Each workflow step MUST name its allowed sub-agents and its inline-only safety boundaries. For inline_required steps, allowed sub-agents is empty and the boundary is 'full' (all work inline). For hybrid steps, the spec enumerates delegated sub-steps and the sub-agents allowed for each. Repo-local or bundled ADV agents MUST exist as .opencode/agents/*.md files and have mode: subagent; known OpenCode global workers (explore, general) are allowed even though they are not repo-local agent files. Primary agents (adv, plan, build) and phantom agents (librarian, mechanic, prioritizer) MUST NOT appear in any allowed sub-agents list.

**Tags:** `delegation`, `agents`, `boundaries`

#### Scenarios

**Inline steps have no sub-agents** (`rq-delDefaults03.1`)

**Given:**
- A step with mode inline_required

**When:** Agent specification is checked

**Then:**
- allowed_subagents is empty
- inline_boundaries includes 'full'

**Hybrid steps name specific sub-agents per delegated sub-step** (`rq-delDefaults03.2`)

**Given:**
- A step with mode hybrid

**When:** Agent specification is checked

**Then:**
- allowed_subagents is non-empty
- delegated_substeps is non-empty for hybrid and subagent_primary steps
- Each named ADV sub-agent exists as .opencode/agents/{name}.md
- Each named ADV sub-agent has mode: subagent in its frontmatter
- Known global workers (explore, general) are accepted as spawnable sub-agents
- inline_boundaries is non-empty (identifies synthesis/checkpoint work)

**No phantom or primary agents in sub-agents lists** (`rq-delDefaults03.3`)

**Given:**
- Any step in the delegation matrix

**When:** Sub-agent names are validated

**Then:**
- Phantom agents (librarian, mechanic, prioritizer) do not appear in allowed_subagents
- Primary agents (adv, plan, build) do not appear in allowed_subagents
- Only spawnable sub-agents (explore, general, adv-researcher, adv-engineer, adv-reviewer, adv-designer, adv-tron, adv-verifier) may appear

**Specific agent assignments match design** (`rq-delDefaults03.4`)

**Given:**
- The delegation matrix with all 9 steps

**When:** Agent assignments are checked

**Then:**
- discovery allows: adv-researcher, explore
- design allows: adv-researcher (mandatory for validation)
- apply allows: adv-engineer, adv-designer, adv-verifier, general
- review allows: adv-reviewer, adv-engineer, adv-researcher, explore
- harden allows: adv-reviewer, adv-engineer, explore
- proposal, prep, archive, reflect allow: none

---

### Wide Scan Delegation Justification

**ID:** `rq-delDefaults04` | **Priority:** **[MUST]**

Discovery wide scans (Prior Research Extension, P25 Related-Pattern Scan) MUST be delegated to sub-agents (adv-researcher, explore) within the hybrid step. Prep is classified as inline_required — no wide scan delegation is applicable. This requirement ensures that evidence-gathering scans that would consume significant orchestrator context are delegated, while synthesis and decision-making remain inline.

**Tags:** `delegation`, `scans`, `discovery`

#### Scenarios

**Discovery wide scans delegate to sub-agents** (`rq-delDefaults04.1`)

**Given:**
- The discovery step with mode hybrid

**When:** Wide scan sub-steps are evaluated

**Then:**
- Prior Research Extension is delegated to adv-researcher
- P25 Related-Pattern Scan is delegated to explore or adv-researcher
- These sub-steps are marked as subagent_primary within the hybrid step

**Prep wide scans remain inline** (`rq-delDefaults04.2`)

**Given:**
- The prep step with mode inline_required

**When:** Wide scan sub-steps are evaluated

**Then:**
- No sub-step delegation is allowed
- No advisory sub-agent pre-flight is allowed in prep
- All synthesis, gap analysis, and task creation remain inline

---

### Typed and Persisted Worker Reports

**ID:** `rq-delDefaults05` | **Priority:** **[MUST]**

Delegated worker lanes that produce ADV evidence MUST provide typed, ingest-validated, durable reports through sidecar report persistence. adv-engineer, adv-reviewer, and adv-designer task-scoped reports MUST be submitted through adv_subagent_report_submit and remain backward-compatible with task.subagent_reports[] readers; their payloads MUST include evidence references (sources, file:line, test output), scope/design/task impact assessment, blockers (with file/line and diagnosis), and recommended next action for the orchestrator. adv-researcher and adv-tron change-scoped optimized handoff reports MUST use the same strict tool-call transport with source metadata. Scanner lanes (for example explore review/harden scanners) are non-persisted scanner transport, without ADV tool access, and MUST NOT claim adv_subagent_report_submit or task.subagent_reports[] persistence. Only an orchestrator-submitted scanner bundle MAY persist scanner findings. Verify-Only Burst uses adv-verifier as the authority-free primary executor and general only as an unavailable-runtime fallback, with an orchestrator_submitted_verification_bundle transport; the worker returns structured JSON and the orchestrator submits adv-verification-triage-bundle evidence. Worker packet contracts MUST pin schema-derived strict identity anchors: WORKING DIRECTORY, CHANGE, scope identity, and ATTEMPT, plus PHASE where required. Worker packet contracts MUST also define warn-first scope/done/stop/verification anchors: TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION. Future persisted worker additions MUST include these field categories and must not rely on LLM-parsed prose as the only ADV report transport.

**Tags:** `delegation`, `reports`, `structured-output`

#### Scenarios

**Existing sub-agents satisfy report requirements** (`rq-delDefaults05.1`)

**Given:**
- The 5 sub-agents with structured reports

**When:** Report field coverage is validated

**Then:**
- adv-engineer (ENGINEER_REPORT via adv_subagent_report_submit) includes verification (evidence), scope, blockers, context_update_for_adv.suggested_next_action (next action), and persists through sidecar report storage with task.subagent_reports[] compatibility
- adv-reviewer (REVIEWER_REPORT via adv_subagent_report_submit) includes verification (evidence), scope, blocking_findings (blockers), required_main_agent_actions (next action), and persists through sidecar report storage with task.subagent_reports[] compatibility
- adv-designer (DESIGNER_REPORT via adv_subagent_report_submit) includes verification (evidence), scope, blockers, design_dimensions, neighboring_recommendations, required_main_agent_actions (next action), and persists through sidecar report storage with task.subagent_reports[] compatibility
- adv-researcher optimized handoff includes SOURCES (evidence), ARCHITECTURE ASSESSMENT (impact), VALIDATION (blockers/assessment), RECOMMENDATION (next action), and source metadata
- adv-tron optimized handoff includes Evidence: file:line (evidence), FINDINGS/HOTSPOTS/RISKS (impact), OPEN QUESTIONS (blockers), SUGGESTED NEXT COMMANDS (next action), and source metadata

**Matrix pins scanner and worker packet contracts** (`rq-delDefaults05.2`)

**Given:**
- A delegated sub-step uses a typed persisted worker or a scanner worker

**When:** The delegation matrix row is evaluated

**Then:**
- task-scoped typed_persisted_worker packet contracts include strict identity anchors WORKING DIRECTORY, CHANGE, TASK, and ATTEMPT
- adv-reviewer task-scoped typed_persisted_worker packet contracts also include strict PHASE
- typed_persisted_worker packet contracts include warn-first anchors TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION
- change-scoped optimized handoff packet contracts include WORKING DIRECTORY, CHANGE, SCOPE KEY, and ATTEMPT
- non_persisted_scanner packet contracts include WORKING DIRECTORY, CHANGE, and ATTEMPT without adv_subagent_report_submit persistence or ADV tool access
- orchestrator-submitted scanner bundle packet contracts include WORKING DIRECTORY, CHANGE, SCOPE KEY, PHASE, and ATTEMPT
- orchestrator-submitted verification bundle packet contracts include WORKING DIRECTORY, CHANGE, SCOPE KEY, PHASE, and ATTEMPT

**Future agents must include structured reports** (`rq-delDefaults05.3`)

**Given:**
- A new sub-agent is added to the ADV system

**When:** The agent's report schema is evaluated

**Then:**
- The report includes an evidence references field
- The report includes a scope/impact assessment field
- The report includes a blockers field
- The report includes a recommended next action field
- The report is typed, ingest-validated, and persisted before orchestrator consumption

---

### Test Coverage for Matrix and Agent Routing

**ID:** `rq-delDefaults06` | **Priority:** **[MUST]**

Tests MUST validate: (1) all 9 matrix steps are present with valid modes and gate affinities, (2) sub-agent references exist as agent files or known global workers, (3) no phantom or primary agents appear in sub-agent routing, (4) matrix classifications are consistent with command contracts, (5) wide-scan delegated sub-steps are structurally represented, (6) structured report field coverage is represented, and (7) provider-specific runtime hints (for example the GPT provider hint) preserve the matrix roster and delegation cues for research/discovery, scans, implementation, and verify bursts. Provider-hint content and provider-eval prompt anchors MUST NOT introduce disallowed agents, duplicate the allowed sub-agent roster, or weaken the no-primary/no-phantom invariant. The phantom-subagent-roster test MUST also detect forbidden routing to primary agents (adv, plan, build) in addition to phantom agents (librarian, mechanic, prioritizer).

**Tags:** `delegation`, `tests`, `coverage`

#### Scenarios

**Matrix coverage test validates all rows** (`rq-delDefaults06.1`)

**Given:**
- The delegation-matrix.test.ts test suite

**When:** Tests run

**Then:**
- All 9 workflow steps have entries
- Each entry has a valid mode
- Non-inline steps have non-empty allowed sub-agents
- Inline steps have empty allowed sub-agents

**No phantom or primary agents in routing** (`rq-delDefaults06.2`)

**Given:**
- The phantom-subagent-roster.test.ts with primary agent coverage

**When:** Tests run

**Then:**
- No active guidance surface routes to librarian, mechanic, or prioritizer
- No active guidance surface routes to adv, plan, or build as sub-agents
- The PRIMARIES list is pinned to prevent silent weakening

**Cross-reference consistency check** (`rq-delDefaults06.3`)

**Given:**
- The delegation matrix spec and command files

**When:** Consistency is validated

**Then:**
- If a step is inline_required in the spec, its command file does not mandate sub-agent usage
- If a step is hybrid in the spec, its command file does not say 'no sub-agents'
- Contradictions are caught by the test suite

**Provider-hint delegation cues preserve matrix roster** (`rq-delDefaults06.4`)

**Given:**
- A provider-specific runtime hint (for example the GPT provider hint)

**When:** The hint text and provider-eval prompt anchors are evaluated against the delegation-defaults matrix

**Then:**
- The hint names only sub-agents that appear in the matrix allowed_subagents lists
- The hint does not route primary agents (adv, plan, build) as sub-agents
- The hint does not route phantom agents (librarian, mechanic, prioritizer)
- Provider-eval prompt anchors include a delegation under-spawn regression test

---

### Browser Verification Access for Frontend-Capable Workers

**ID:** `rq-delDefaults07` | **Priority:** **[MUST]**

Frontend-capable ADV worker agents MUST have browser verification capability when their assigned scope needs UI evidence. adv-designer and adv-reviewer MUST expose Playwright MCP tools through `playwright_*: true`, MUST expose skill loading through `skill: true`, and MUST instruct workers to load `skill("playwright-mcp")` before browser-driven UI verification or visual review. Playwright MCP is for local app UI verification, accessibility snapshots, visual review, and interactive reproduction; it is not for web research, docs lookup, or page scraping.

**Tags:** `delegation`, `frontend`, `playwright`, `skills`, `visual-review`

#### Scenarios

**Frontend implementation worker can verify UI in browser** (`rq-delDefaults07.1`)

**Given:**
- ADV delegates frontend/component implementation to adv-designer

**When:** The task benefits from browser-driven evidence

**Then:**
- adv-designer frontmatter includes playwright_*: true
- adv-designer frontmatter includes skill: true
- adv-designer prompt instructs loading skill("playwright-mcp") before Playwright MCP use
- Playwright MCP is documented as not for web research

**Reviewer can perform visual UI review when needed** (`rq-delDefaults07.2`)

**Given:**
- ADV delegates review or harden analysis to adv-reviewer for frontend/design scope

**When:** Visual review, accessibility snapshots, or interactive reproduction materially improves review confidence

**Then:**
- adv-reviewer frontmatter includes playwright_*: true
- adv-reviewer frontmatter includes skill: true
- adv-reviewer prompt instructs loading skill("playwright-mcp") before Playwright MCP use
- Playwright MCP is documented as not for web research

---

### Designer Delegation Receives Visual Context

**ID:** `rq-delDefaults08` | **Priority:** **[MUST]**

When ADV delegates frontend/component implementation to adv-designer, the Designer Apply Context Packet MUST include a VISUAL_CONTEXT block with surface_type, existing_patterns, tokens_and_style_rules, viewport_targets, forbidden_patterns, and evidence_expectation entries. Each entry MUST either carry sourced context from agreement, design, task scope, project files, or preview discovery, or an explicit unavailable marker with a reason. The packet MUST preserve the backend boundary and apply-only role boundary, and MUST NOT fabricate style context or require Storybook as an Advance dependency.

**Tags:** `delegation`, `frontend`, `designer`, `visual-context`, `packets`

#### Scenarios

**Designer packet includes visual context anchors** (`rq-delDefaults08.1`)

**Given:**
- ADV delegates a task to adv-designer because metadata.frontend is true

**When:** The Designer Apply Context Packet is prepared

**Then:**
- The packet includes a VISUAL_CONTEXT block
- The block includes surface_type, existing_patterns, tokens_and_style_rules, viewport_targets, forbidden_patterns, and evidence_expectation
- Missing context is represented by explicit unavailable markers with reasons

**Visual context preserves boundaries** (`rq-delDefaults08.2`)

**Given:**
- A frontend task needs visual context but not backend behavior changes

**When:** ADV prepares the designer packet

**Then:**
- The packet keeps backend logic, storage, APIs, Temporal behavior, business rules, review, and harden out of scope
- The packet does not route review or harden work to adv-designer
- The packet does not require Storybook as an Advance plugin dependency

---

### Bounded Ready-Task Routing Metadata Projection

**ID:** `rq-delDefaults09` | **Priority:** **[MUST]**

When ADV presents formatted ready-task output (for example via adv_task_ready), the formatted projection MUST include bounded routing metadata keys needed for delegation decisions, specifically `delegation_hint` and `frontend` when those keys are present in task metadata. The projection MUST remain backward compatible when metadata is absent: missing keys are omitted rather than emitted as empty placeholders, and the raw ready[] payload is unchanged. Only bounded, delegation-relevant metadata keys are projected; arbitrary metadata MUST NOT be surfaced in the formatted chat output.

**Tags:** `delegation`, `routing`, `task-ready`, `metadata`, `bounded`

#### Scenarios

**Present routing metadata appears in formatted ready output** (`rq-delDefaults09.1`)

**Given:**
- A ready task carries metadata.delegation_hint and metadata.frontend

**When:** ADV formats the ready-task projection

**Then:**
- The formatted output includes delegation_hint when metadata.delegation_hint is present
- The formatted output includes frontend when metadata.frontend is present
- The keys appear as bounded, delegation-relevant annotations rather than raw metadata dumps

**Absent routing metadata is omitted without breaking compatibility** (`rq-delDefaults09.2`)

**Given:**
- A ready task has no delegation_hint or frontend metadata

**When:** ADV formats the ready-task projection

**Then:**
- The formatted output does not include placeholder delegation_hint or frontend keys
- The raw ready[] payload remains unchanged
- Existing consumers of the formatted output continue to parse it correctly

**Projection stays bounded to delegation-relevant keys** (`rq-delDefaults09.3`)

**Given:**
- A ready task carries arbitrary additional metadata fields

**When:** ADV formats the ready-task projection

**Then:**
- Only delegation_hint and frontend are projected into the formatted output
- Other arbitrary metadata fields are not surfaced in the chat-facing formatted projection
- The bounded projection respects the default top-N ready-task slice limits

---

### Engineer-First Frontend Dispatch with Designer Follow-up

**ID:** `rq-delDefaults10` | **Priority:** **[MUST]**

For delegated code tasks with metadata.frontend set to true, ADV MUST route initial implementation to adv-engineer. After successful same-task, same-cycle engineer evidence, ADV MUST dispatch adv-designer as a bounded UI/UX follow-up with engineer-report provenance. When risk signals force inline implementation, ADV MUST dispatch the same designer follow-up with bounded inline provenance. An explicit metadata.delegation_hint remains an override only among valid initial implementation routes and MUST NOT select adv-designer first for classified frontend work. The matching implementation cycle MUST be bound under report.apply_context.implementation_cycle_id with a valid implementation_provenance (kind: engineer, engineer_report, or inline); a top-level implementation_cycle_id is rejected by the strict report schema. adv-designer remains apply-phase only and MUST NOT own review or harden; adv-reviewer retains review and harden ownership.

**Tags:** `delegation`, `frontend`, `engineer-first`, `designer-follow-up`, `apply-context-binding`

#### Scenarios

**Classified frontend task starts with engineer** (`rq-delDefaults10.1`)

**Given:**
- A code task has metadata.frontend set to true
- No step-4 risk signal forces inline implementation

**When:** ADV selects an initial implementation lane

**Then:**
- ADV dispatches adv-engineer before adv-designer
- ADV does not dispatch adv-designer as the initial implementation lane

**Matching implementation receipt drives designer follow-up** (`rq-delDefaults10.2`)

**Given:**
- A code task has metadata.frontend set to true
- A same-task same-cycle adv-engineer report completed with passing verification and no blockers, or a classified inline implementation has bounded provenance

**When:** Initial implementation completes

**Then:**
- ADV dispatches a matching-cycle adv-designer follow-up
- Designer provenance references the engineer report or inline receipt
- The implementation cycle is carried under report.apply_context.implementation_cycle_id with a valid implementation_provenance (engineer, engineer_report, or inline); a top-level implementation_cycle_id is rejected
- Missing, stale, or mismatched provenance is rejected

**Reviewer retains review and harden ownership** (`rq-delDefaults10.3`)

**Given:**
- A change includes frontend scope

**When:** The change reaches review or harden

**Then:**
- adv-designer does not own review or harden
  - adv-reviewer retains review and harden ownership

---

### Diagnosis Routing Precedence

**ID:** `rq-delDefaults11` | **Priority:** **[MUST]**

When `/adv-apply` marks a task `inline_required` because the task involves failing-test diagnosis or behavioral-authority diagnosis, ADV MUST NOT use delegation as the primary diagnosis or repair path. The inline-required routing decision takes precedence over any `delegate_allowed` or `delegate_preferred` hint for that task. The command asset MUST list failing-test diagnosis and behavioral-authority diagnosis as risk signals that force `inline_required`, and the delegation matrix MUST keep the apply step's implementation substeps as `delegate_allowed` so that the inline-required override is structurally meaningful rather than a no-op.

**Tags:** `delegation`, `routing`, `diagnosis`, `execution`, `precedence`

#### Scenarios

**Failing-test diagnosis forces inline execution** (`rq-delDefaults11.1`)

**Given:**
- `/adv-apply` is evaluating a code task
- The task title, `error_recovery`, or `failure_attribution` indicates failing-test diagnosis

**When:** Delegation routing is evaluated

**Then:**
- The routing decision is `inline_required`
- No implementation sub-agent is dispatched as the primary diagnosis/repair path
- Verify-only bursts may still be delegated

**Behavioral-authority diagnosis forces inline execution** (`rq-delDefaults11.2`)

**Given:**
- `/adv-apply` is evaluating a code task
- The task requires deciding what the code should do (behavioral authority) rather than mechanical implementation

**When:** Delegation routing is evaluated

**Then:**
- The routing decision is `inline_required`
- No implementation sub-agent is dispatched as the primary authority for the behavioral decision
- Research or verification sub-agents may still supply evidence

---

### Bounded Empty-Worker Recovery

**ID:** `rq-delDefaults12` | **Priority:** **[MUST]**

Empty or malformed worker output receives at most one narrower retry. After that retry is exhausted, another same-scope delegation is refused until inline diagnosis evidence exists. Empty/malformed output MUST be tracked in `task.delegation_recovery`, NOT counted as a genuine SEMANTIC repair attempt in `task.error_recovery.attempts`, and MUST NOT increment `task.error_recovery.retry_count`. The `delegation_recovery` state is authoritative for this bounded recovery: while `narrower_retry_count` is 0 one retry is still allowed; once `narrower_retry_count` is 1, `inline_diagnosis_evidence` must be true before any further same-scope delegation is valid.

**Tags:** `delegation`, `recovery`, `worker`, `empty-output`, `bounded`

#### Scenarios

**Empty/malformed output allows one narrower retry** (`rq-delDefaults12.1`)

**Given:**
- A delegated worker returns empty or malformed output
- `task.delegation_recovery` is unset or has `narrower_retry_count == 0`

**When:** ADV decides how to recover

**Then:**
- ADV may dispatch exactly one narrower retry in the same scope
- ADV records the incident in `task.delegation_recovery`
- ADV does not record the empty output as a SEMANTIC attempt in `task.error_recovery.attempts`

**Same-scope delegation refused after exhausted retry without inline evidence** (`rq-delDefaults12.2`)

**Given:**
- `task.delegation_recovery.empty_or_malformed_count > 0`
- `task.delegation_recovery.narrower_retry_count == 1`
- `task.delegation_recovery.inline_diagnosis_evidence == false`

**When:** ADV evaluates another same-scope delegation

**Then:**
- The task state is structurally invalid for delegation
- ADV must produce inline diagnosis evidence before delegating again
- The empty output does not count as a genuine semantic repair attempt

**Inline diagnosis evidence unblocks same-scope delegation** (`rq-delDefaults12.3`)

**Given:**
- `task.delegation_recovery.narrower_retry_count == 1`
- Inline diagnosis has been performed and evidence recorded

**When:** ADV updates `delegation_recovery`

**Then:**
- `task.delegation_recovery.inline_diagnosis_evidence` becomes true
- Same-scope delegation becomes structurally valid again

---
