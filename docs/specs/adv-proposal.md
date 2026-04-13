# ADV Proposal Command

> **Version:** 1.1.0
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

### Proposal Requires Knowledge Gap Analysis

**ID:** `rq-prop-gaps1` | **Priority:** **[MUST]**

After the problem statement is confirmed and before building the full proposal, /adv-proposal must explicitly identify unknowns across codebase, ecosystem, domain, and integration dimensions. Quick-check items must be resolved inline; unresolved unknowns must be carried forward as Discovery Agenda items in the proposal. No recommendations may be based on unverified assumptions.

**Tags:** `proposal`, `due-diligence`, `knowledge-gaps`

#### Scenarios

**Knowledge gaps surfaced after problem confirmation** (`rq-prop-gaps1.1`)

**Given:**
- A user confirms the problem statement in Phase 1

**When:** Phase 1b executes

**Then:**
- Unknowns are identified across at least: codebase, ecosystem, domain, integration
- Each unknown is classified as quick-check (resolvable now) or deferred (discovery agenda)
- Quick-check items are resolved inline before Phase 2

**Unresolved unknowns appear in proposal** (`rq-prop-gaps1.2`)

**Given:**
- Phase 1b identifies unknowns that cannot be resolved inline

**When:** Phase 2 builds the full proposal

**Then:**
- A Discovery Agenda section is present in proposal.md
- Each deferred unknown is listed with its category and why it was deferred
- /adv-discover is pointed at these items as explicit inputs

---

### Proposal Prohibited Actions

**ID:** `rq-prop-neg1` | **Priority:** **[MUST]**

/adv-proposal MUST NOT create tasks (adv_task_add), complete gates (adv_gate_complete), research architectural decisions, or make implementation choices. These are the responsibilities of downstream commands (discover, design, prep).

**Tags:** `proposal`, `boundary`, `negative`

#### Scenarios

**No task creation during proposal** (`rq-prop-neg1.1`)

**Given:**
- A user invokes /adv-proposal for any change type (feature, bug fix, refactor)

**When:** The command executes all phases

**Then:**
- adv_task_add is never called
- The output does not list initial tasks
- Next steps point to /adv-discover then /adv-prep

**No implementation decisions during proposal** (`rq-prop-neg1.2`)

**Given:**
- A user invokes /adv-proposal

**When:** The proposal is being built

**Then:**
- The proposal does not prescribe specific libraries or patterns
- Implementation approach is deferred to /adv-discover and /adv-design
- Task decomposition is deferred to /adv-prep

---
