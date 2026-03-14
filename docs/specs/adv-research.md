# ADV Research Command

> **Version:** 1.0.0
> **Updated:** 2026-03-14

## Purpose

Defines the responsibilities and boundaries of /adv-research. The research command validates HOW — architectural decisions, best practices, simplification opportunities. It produces validated decisions and findings, not tasks.

## Requirements

### Research Produces Validated Decisions Only

**ID:** `rq-res-out1` | **Priority:** **[MUST]**

/adv-research must produce a research report with validated decisions, architecture assessment, simplification opportunities, and concerns. Findings must be persisted in proposal.md under a Research Validation section. It must NOT create tasks.

**Tags:** `research`, `boundary`, `validation`

#### Scenarios

**Research updates proposal.md with findings but creates zero tasks** (`rq-res-out1.1`)

**Given:**
- A user invokes /adv-research on an active change

**When:** The command completes successfully

**Then:**
- proposal.md is updated with a Research Validation section
- The section contains validated decisions, concerns, and action items
- Zero calls to adv_task_add are made
- Findings are structured for consumption by /adv-prep

**Research on deployed spec creates change but defers tasks to prep** (`rq-res-out1.2`)

**Given:**
- A user invokes /adv-research on a deployed spec (not an active change)

**When:** Research finds issues requiring action

**Then:**
- A new change is created via adv_change_create
- proposal.md contains research findings
- Zero calls to adv_task_add are made
- Next steps point to /adv-prep for task synthesis

---

### Research Validates Architecture and Best Practices

**ID:** `rq-res-scope1` | **Priority:** **[MUST]**

/adv-research must audit the existing codebase architecture, validate proposed decisions against canonical patterns, identify simplification opportunities, and classify the architecture health (SOUND, DRIFTED, ANTI-PATTERN).

**Tags:** `research`, `boundary`, `architecture`

#### Scenarios

**Architecture health assessment included in report** (`rq-res-scope1.1`)

**Given:**
- A user invokes /adv-research on a change

**When:** The research report is generated

**Then:**
- The report includes an Architecture Health Assessment section
- The existing architecture is classified as SOUND, DRIFTED, or ANTI-PATTERN
- Each finding includes a source citation

**Research completes the research gate** (`rq-res-scope1.2`)

**Given:**
- A user invokes /adv-research on an active change

**When:** The command completes successfully

**Then:**
- adv_gate_complete is called with gateId 'research'
- The research gate is marked done

---

### Research Prohibited Actions

**ID:** `rq-res-neg1` | **Priority:** **[MUST]**

/adv-research MUST NOT create tasks (adv_task_add), complete non-research gates, or modify the task graph. Task synthesis is the exclusive responsibility of /adv-prep.

**Tags:** `research`, `boundary`, `negative`

#### Scenarios

**No task creation during research** (`rq-res-neg1.1`)

**Given:**
- A user invokes /adv-research on any target (change or spec)

**When:** The command executes all phases including Apply Findings

**Then:**
- adv_task_add is never called
- Findings are recorded in proposal.md, not as tasks
- Next steps point to /adv-prep for task synthesis

**Research only completes the research gate** (`rq-res-neg1.2`)

**Given:**
- A user invokes /adv-research

**When:** The command completes

**Then:**
- Only adv_gate_complete with gateId 'research' is called
- No other gates are completed

---

### Research Output Contract for Prep Consumption

**ID:** `rq-res-contract1` | **Priority:** **[SHOULD]**

/adv-research must produce a structured Research Validation section in proposal.md that /adv-prep can consume for task synthesis. The section must include: validated decisions, architecture corrections required, simplification opportunities, and action items.

**Tags:** `research`, `boundary`, `output-contract`

#### Scenarios

**Research output contains structured sections for prep** (`rq-res-contract1.1`)

**Given:**
- Research completes with findings

**When:** proposal.md is updated

**Then:**
- A Research Validation section exists with subsections: Validated Decisions, Architecture Corrections Required, Simplification Opportunities, Action Items
- Each action item is specific enough for /adv-prep to create a task from it

---
