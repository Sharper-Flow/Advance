# ADV Prep Command

> **Version:** 1.0.0
> **Updated:** 2026-03-14

## Purpose

Defines the responsibilities and boundaries of /adv-prep. The prep command is the sole creator and sequencer of tasks. It synthesizes tasks from research findings, runs gap analysis, validates task ordering, and ensures implementation readiness.

## Requirements

### Prep Is the Sole Task Creator

**ID:** `rq-prep-out1` | **Priority:** **[MUST]**

/adv-prep is the only pre-implementation command that creates tasks via adv_task_add. Neither /adv-proposal nor /adv-research may create tasks. /adv-task is exempt as a fast-track workflow that intentionally bundles proposal+research+prep.

**Tags:** `prep`, `boundary`, `task-creation`

#### Scenarios

**Prep creates tasks from research findings** (`rq-prep-out1.1`)

**Given:**
- A change with research gate complete and zero tasks

**When:** /adv-prep is invoked

**Then:**
- Research findings from proposal.md are consumed
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

/adv-prep must run the 4-Step Gap Analysis framework: define desired state, benchmark current state, analyze gaps, and compile an action plan. It must check requirements quality (INVEST), task completeness, cross-cutting concerns, and cross-spec consistency.

**Tags:** `prep`, `boundary`, `gap-analysis`

#### Scenarios

**Gap analysis covers all dimensions** (`rq-prep-scope1.1`)

**Given:**
- A change ready for prep

**When:** /adv-prep runs gap analysis

**Then:**
- Requirements quality is checked against INVEST criteria
- Requirements smell detection is applied
- Task completeness is verified against requirements
- Cross-cutting concerns checklist is completed
- Cross-spec consistency is checked

**Prep completes the prep gate** (`rq-prep-scope1.2`)

**Given:**
- All gaps are fixed and validation passes

**When:** /adv-prep finishes

**Then:**
- adv_gate_complete is called with gateId 'prep'
- The prep gate is marked done

---

### Task Synthesis from Research Output

**ID:** `rq-prep-synth1` | **Priority:** **[MUST]**

When a change has zero tasks and research gate is complete, /adv-prep must synthesize the full task graph from research findings in proposal.md. Tasks must be created in priority order: architecture corrections first, then core implementation, then cross-cutting concerns, then verification.

**Tags:** `prep`, `boundary`, `task-synthesis`

#### Scenarios

**Empty task list triggers synthesis from research** (`rq-prep-synth1.1`)

**Given:**
- A change with research gate complete
- Zero existing tasks

**When:** /adv-prep is invoked

**Then:**
- Research Validation section in proposal.md is read
- Tasks are synthesized from action items and findings
- Architecture correction tasks are created first with highest priority
- Core implementation tasks follow with proper dependencies

**Task synthesis respects TDD ordering** (`rq-prep-synth1.2`)

**Given:**
- Tasks are being synthesized from research findings

**When:** Implementation tasks are created

**Then:**
- Each implementation task includes inline TDD instructions
- No separate test tasks are created for the same scope
- Cross-cutting verification tasks are marked with tdd_intent separate_verification

---

### Prep Prohibited Actions

**ID:** `rq-prep-neg1` | **Priority:** **[MUST]**

/adv-prep MUST NOT complete non-prep gates, make architectural decisions (that is research's job), or modify the problem statement or success criteria in proposal.md.

**Tags:** `prep`, `boundary`, `negative`

#### Scenarios

**Prep only completes the prep gate** (`rq-prep-neg1.1`)

**Given:**
- A user invokes /adv-prep

**When:** The command completes

**Then:**
- Only adv_gate_complete with gateId 'prep' is called
- No other gates are completed

---
