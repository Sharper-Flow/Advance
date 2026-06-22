# ADV Prep Command

> **Version:** 1.4.0
> **Updated:** 2026-06-22

## Purpose

Defines the responsibilities and boundaries of /adv-prep. The prep command is the sole creator and sequencer of tasks. It synthesizes tasks from the approved agreement and validated design decisions, runs gap analysis, validates task ordering, and ensures implementation readiness. It does not firm or rewrite acceptance criteria or success criteria.

## Requirements

### Prep Is the Sole Task Creator

**ID:** `rq-prep-out1` | **Priority:** **[MUST]**

/adv-prep is the only pre-implementation command that creates tasks via adv_task_add. Neither /adv-proposal, /adv-discover, nor /adv-design may create tasks. /adv-task is exempt as a fast-track workflow that intentionally bundles proposal+discover+design+prep.

**Tags:** `prep`, `boundary`, `task-creation`

#### Scenarios

**Prep creates tasks from design decisions** (`rq-prep-out1.1`)

**Given:**

- A change with design gate complete and zero tasks

**When:** /adv-prep is invoked

**Then:**

- Design decisions from design.md are consumed
- Tasks are created via adv_task_add based on validated decisions
- Tasks are sequenced with proper blocked_by dependencies
- Architecture correction tasks block feature tasks

**Prep handles changes that already have tasks** (`rq-prep-out1.2`)

**Given:**

- A change with existing tasks (e.g., from /adv-task fast-track)

**When:** /adv-prep is invoked

**Then:**

- Existing tasks are analyzed for gaps
- Missing tasks are added
- Task sequencing is validated and corrected
- No existing tasks are deleted without user approval

---

### Prep Runs Gap Analysis and Task Synthesis

**ID:** `rq-prep-scope1` | **Priority:** **[MUST]**

/adv-prep must run the 4-Step Gap Analysis framework: define desired state, benchmark current state, analyze gaps, and compile an action plan. It must check approved agreement/design coverage, task completeness, cross-cutting concerns, and cross-spec consistency. It must not firm acceptance criteria or success criteria; criteria gaps require returning to discovery/design as appropriate.

**Tags:** `prep`, `boundary`, `gap-analysis`

#### Scenarios

**Gap analysis covers all dimensions** (`rq-prep-scope1.1`)

**Given:**

- A change ready for prep

**When:** /adv-prep runs gap analysis

**Then:**

- Approved agreement and design coverage is checked against the task graph
- Criteria-quality gaps are reported as discovery/design re-entry candidates instead of being rewritten by prep
- Task completeness is verified against requirements
- Cross-cutting concerns checklist is completed
- Cross-spec consistency is checked

**Prep completes the planning gate** (`rq-prep-scope1.2`)

**Given:**

- All gaps are fixed and validation passes

**When:** /adv-prep finishes

**Then:**

- adv_gate_complete is called with gateId 'planning'
- The planning gate is marked done

---

### Task Synthesis from Research Output

**ID:** `rq-prep-synth1` | **Priority:** **[MUST]**

When a change has zero tasks and design gate is complete, /adv-prep must synthesize the full task graph from design decisions in design.md. Tasks must be created in priority order: architecture corrections first, then core implementation, then cross-cutting concerns, then verification.

**Tags:** `prep`, `boundary`, `task-synthesis`

#### Scenarios

**Empty task list triggers synthesis from design decisions** (`rq-prep-synth1.1`)

**Given:**

- A change with design gate complete
- Zero existing tasks

**When:** /adv-prep is invoked

**Then:**

- Design decisions in design.md are read
- Tasks are synthesized from action items and findings
- Architecture correction tasks are created first with highest priority
- Core implementation tasks follow with proper dependencies

**Task synthesis respects TDD ordering** (`rq-prep-synth1.2`)

**Given:**

- Tasks are being synthesized from design findings

**When:** Implementation tasks are created

**Then:**

- Each implementation task includes inline TDD instructions
- No separate test tasks are created for the same scope
- Cross-cutting verification tasks are marked with tdd_intent separate_verification

---

### Prep Prohibited Actions

**ID:** `rq-prep-neg1` | **Priority:** **[MUST]**

/adv-prep MUST NOT complete non-planning gates, make architectural decisions (that is discover/design's job), or modify the problem statement, acceptance criteria, or success criteria. /adv-prep maps approved criteria and design into tasks; it does not firm criteria.

**Tags:** `prep`, `boundary`, `negative`

#### Scenarios

**Prep only completes the planning gate** (`rq-prep-neg1.1`)

**Given:**

- A user invokes /adv-prep

**When:** The command completes

**Then:**

- Only adv_gate_complete with gateId 'planning' is called
- No other gates are completed

---

### Prep Maps Criteria to Tasks Without Firming Criteria

**ID:** `rq-stagePrepNoCriteriaFirming01` | **Priority:** **[MUST]**

/adv-prep MUST consume approved agreement criteria and validated design decisions to build a task graph. It MUST NOT invent, rewrite, or user-confirm new acceptance criteria or success criteria. If prep discovers that criteria are missing, contradictory, implementation-derived, or invalidated by design, it MUST surface a readiness gap and route to the earliest affected gate rather than silently repairing the criteria inside prep.

**Tags:** `prep`, `criteria`, `task-graph`, `stage-boundary`

#### Scenarios

**Prep maps approved criteria to tasks** (`rq-stagePrepNoCriteriaFirming01.1`)

**Given:**

- agreement.md contains approved `AC*` and `SC*` items and design.md is complete

**When:** /adv-prep synthesizes the task graph

**Then:**

- Each implementation task is traced to approved agreement criteria, design decisions, or explicit technical readiness work
- No new user-facing acceptance criterion is introduced by /adv-prep
- The planning checkpoint asks the user to approve tasks, not to approve newly firmed criteria

**Criteria gap routes to re-entry** (`rq-stagePrepNoCriteriaFirming01.2`)

**Given:**

- /adv-prep detects that an approved criterion is missing, contradictory, or invalidated by design

**When:** The planning readiness result is prepared

**Then:**

- The gap is reported as requiring discovery or design re-entry
- /adv-prep does not rewrite agreement.md to fix the criterion
- The planning gate remains pending until the upstream criteria gap is resolved

---

### Prep Approval Surfaces Source Artifact Excerpts

**ID:** `rq-prepArtifactExcerpt01` | **Priority:** **[MUST]**

/adv-prep MUST surface concise proposal, agreement, and design excerpts relevant to the synthesized task graph before planning approval. The excerpts must show what the user is approving for autonomous execution and must not replace the underlying artifacts as the source of truth.

**Tags:** `prep`, `approval`, `artifacts`, `planning`

#### Scenarios

**Planning approval includes relevant artifact excerpts** (`rq-prepArtifactExcerpt01.1`)

**Given:**

- A change has proposal, agreement, and design artifacts

**When:** /adv-prep presents the planning approval checkpoint

**Then:**

- The approval view includes concise excerpts from proposal, agreement, and design relevant to task synthesis
- The approval view identifies the generated task graph derived from those artifacts
- The underlying artifacts remain the source of truth

**Missing excerpt source is reported** (`rq-prepArtifactExcerpt01.2`)

**Given:**

- A source artifact expected by prep is missing or unavailable

**When:** /adv-prep prepares the approval checkpoint

**Then:**

- The missing artifact is reported as a readiness gap
- Prep does not silently approve a task graph without showing the relevant source basis

---

### Prep Synthesizes Non-Code Deliverable Tasks with Evidence Policies

**ID:** `rq-prepNonCodeEvidence01` | **Priority:** **[MUST]**

/adv-prep MUST map approved agreement and validated design decisions into structurally typed non-code tasks when the deliverable is docs, research, approval, verification, ops, writing, analysis, design improvement, or competitive research. Non-code tasks MUST carry a task type, contract_refs or bounded not_applicable_reason, metadata.tdd_intent appropriate to the task type, and a machine-readable evidence policy. Prep MUST NOT force fake red/green TDD for non-code deliverables; it must instead assign evidence policies such as source_citation, source_audit, rubric_review, stakeholder_acceptance, artifact_reference, static_check, review, or not_applicable with rationale.

**Tags:** `prep`, `non-code`, `tasks`, `evidence`, `tdd`

#### Scenarios

**Research task receives source evidence policy** (`rq-prepNonCodeEvidence01.1`)

**Given:**

- An approved agreement requires a competitive research or market analysis deliverable

**When:** /adv-prep creates the task graph

**Then:**

- The research task is structurally identified as a non-code deliverable task
- The task carries contract_refs to the relevant approved criteria
- The task carries a source_citation or source_audit evidence policy
- The task does not require inline red/green TDD

**Documentation task uses artifact evidence** (`rq-prepNonCodeEvidence01.2`)

**Given:**

- An approved agreement requires a documentation or writing deliverable

**When:** /adv-prep creates the task graph

**Then:**

- The task is structurally identified as a docs or non-code deliverable task
- The task carries artifact_reference or rubric_review evidence policy as appropriate
- metadata.tdd_intent is not_applicable with evidence-policy rationale

**Code tasks retain inline TDD** (`rq-prepNonCodeEvidence01.3`)

**Given:**

- A task implements logic-bearing code

**When:** /adv-prep creates or validates the task graph

**Then:**

- The task remains a code task by default
- metadata.tdd_intent is inline unless explicitly and validly reclassified
- The non-code evidence-policy model does not weaken red/green TDD requirements for code tasks
