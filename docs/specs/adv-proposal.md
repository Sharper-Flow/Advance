# ADV Proposal Command

> **Version:** 1.0.0
> **Updated:** 2026-03-14

## Purpose

Defines the responsibilities and boundaries of /adv-proposal. The proposal command establishes WHAT and WHY — problem statement, objectives, success criteria, and constraints. It produces alignment artifacts, not implementation artifacts.

## Requirements

### Proposal Produces Alignment Artifacts Only

**ID:** `rq-prop-out1` | **Priority:** **[MUST]**

/adv-proposal must produce a confirmed problem statement, success criteria, constraints, and affected specs. It must NOT create tasks, complete gates, or make implementation decisions.

**Tags:** `proposal`, `boundary`, `alignment`

#### Scenarios

**Proposal creates change with proposal.md but zero tasks** (`rq-prop-out1.1`)

**Given:**
- A user invokes /adv-proposal with a summary

**When:** The command completes successfully

**Then:**
- A change is created via adv_change_create
- proposal.md contains problem statement, success criteria, and constraints
- Zero calls to adv_task_add are made
- The change has an empty task list

**Proposal does not complete any gates** (`rq-prop-out1.2`)

**Given:**
- A user invokes /adv-proposal

**When:** The command completes successfully

**Then:**
- No calls to adv_gate_complete are made
- All gates remain in pending status

---

### Proposal Focuses on Problem Agreement

**ID:** `rq-prop-scope1` | **Priority:** **[MUST]**

/adv-proposal must use a two-phase workflow: Phase 1 establishes shared understanding of the problem via the question tool, Phase 2 builds the full proposal with INVEST-quality success criteria. The command must not proceed to Phase 2 without user confirmation of the problem statement.

**Tags:** `proposal`, `boundary`, `context-agreement`

#### Scenarios

**Problem statement confirmed before change creation** (`rq-prop-scope1.1`)

**Given:**
- A user invokes /adv-proposal

**When:** Phase 1 synthesizes a problem statement

**Then:**
- The problem statement is shown to the user
- The user is asked to confirm via the question tool
- No change artifacts are created until confirmation

**Success criteria pass INVEST quality check** (`rq-prop-scope1.2`)

**Given:**
- Phase 2 is reached after problem statement confirmation

**When:** Success criteria are defined

**Then:**
- Each criterion is testable and measurable
- No subjective or ambiguous language remains
- Requirements smell detection is applied

---

### Proposal Prohibited Actions

**ID:** `rq-prop-neg1` | **Priority:** **[MUST]**

/adv-proposal MUST NOT create tasks (adv_task_add), complete gates (adv_gate_complete), research architectural decisions, or make implementation choices. These are the responsibilities of downstream commands (research, prep).

**Tags:** `proposal`, `boundary`, `negative`

#### Scenarios

**No task creation during proposal** (`rq-prop-neg1.1`)

**Given:**
- A user invokes /adv-proposal for any change type (feature, bug fix, refactor)

**When:** The command executes all phases

**Then:**
- adv_task_add is never called
- The output does not list initial tasks
- Next steps point to /adv-research then /adv-prep

**No implementation decisions during proposal** (`rq-prop-neg1.2`)

**Given:**
- A user invokes /adv-proposal

**When:** The proposal is being built

**Then:**
- The proposal does not prescribe specific libraries or patterns
- Implementation approach is deferred to /adv-research
- Task decomposition is deferred to /adv-prep

---
