# ADV Proposal Command

> **Version:** 1.2.0
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

/adv-proposal must use a two-phase workflow: Phase 1 establishes shared understanding of the problem via inline approval voice, Phase 2 builds the full proposal with INVEST-quality success criteria. The command must not proceed to Phase 2 without user confirmation of the problem statement.

**Tags:** `proposal`, `boundary`, `context-agreement`

#### Scenarios

**Problem statement confirmed before change creation** (`rq-prop-scope1.1`)

**Given:**

- A user invokes /adv-proposal

**When:** Phase 1 synthesizes a problem statement

**Then:**

- The problem statement is shown to the user
- The user is asked to confirm via inline approval voice per docs/command-voice-standard.md § Inline Approval Voice (Tier A)
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

### Mandatory Scope Section

**ID:** `rq-prop-tax1` | **Priority:** **[MUST]**

/adv-proposal MUST require a ## Scope section in proposal.md with ### In Scope and ### Out of Scope subsections. Gate completion MUST block if either subsection is missing or empty.

**Tags:** `proposal`, `scope`, `ambiguity-taxonomy`

#### Scenarios

**New proposal contains Scope section with In/Out subsections** (`rq-prop-tax1.1`)

**Given:**

- A user invokes /adv-proposal for a new change

**When:** Phase 2 builds the full proposal

**Then:**

- proposal.md contains ## Scope section
- ## Scope has ### In Scope subsection with content
- ## Scope has ### Out of Scope subsection with content
- Proposal gate refuses to complete if either subsection is missing or empty

---

### B/F/S Ambiguity Scan

**ID:** `rq-prop-tax2` | **Priority:** **[MUST]**

/adv-proposal MUST run a 3-category ambiguity scan (B=Boundaries, F=Functional Scope, S=Completion Signals) against the proposal during Phase 2.6. CRITICAL findings MUST block proposal gate completion under clarify_enforcement: strict.

**Tags:** `proposal`, `ambiguity-scan`, `boundaries`, `functional`, `completion-signals`

#### Scenarios

**Vague success criteria produce S1 HIGH finding** (`rq-prop-tax2.1`)

**Given:**

- A proposal with success criteria containing 'fast response'

**When:** The B/F/S scan runs during Phase 2.6

**Then:**

- An S1 HIGH finding is emitted
- Evidence field cites exact phrase 'fast response' verbatim
- Reason field states why the criterion is vague

**Missing Out of Scope blocks proposal gate** (`rq-prop-tax2.2`)

**Given:**

- A proposal missing ### Out of Scope subsection
- clarify_enforcement is 'strict'

**When:** The B/F/S scan runs during Phase 2.6

**Then:**

- A B1 CRITICAL finding is emitted
- Evidence field contains '(no Out of Scope subsection)'
- Proposal gate completion is refused

---

### Anti-Hallucination Evidence Rule

**ID:** `rq-prop-tax3` | **Priority:** **[MUST]**

Every ambiguity finding emitted by /adv-proposal MUST include either a verbatim source quote or an explicit '(no {section} section)' marker, plus a 'reason: unclear because {X}' field. Findings without evidence are malformed.

**Tags:** `proposal`, `anti-hallucination`, `evidence`

#### Scenarios

**Finding includes evidence and reason fields** (`rq-prop-tax3.1`)

**Given:**

- The B/F/S scan produces a finding

**When:** The finding is emitted

**Then:**

- Finding contains evidence: field with verbatim quote or (no X) marker
- Finding contains reason: field with explanation
- Finding is well-formed per ADV_INSTRUCTIONS.md Ambiguity Taxonomy

**Finding without evidence is malformed** (`rq-prop-tax3.2`)

**Given:**

- An attempted finding without evidence quote

**When:** The finding is reviewed before emission

**Then:**

- The finding is classified as malformed
- The finding is not surfaced to the user
- Agent self-corrects or omits the finding

---

### Durable Proposal Context for adv-task

**ID:** `rq-prop-context1` | **Priority:** **[MUST]**

After Quick Contract confirmation, /adv-task must always persist contract context to proposal.md, and downstream workflows must tolerate missing or empty legacy proposal files via scaffold fallback warnings.

**Tags:** `proposal`, `adv-task`, `context`

**Legacy IDs:** `rq-advprop01` from `advance-meta`

#### Scenarios

**adv-task writes proposal by default** (`rq-prop-context1.1`)

**Given:**

- A Quick Contract is confirmed in /adv-task

**When:** The change is created

**Then:**

- proposal.md is written in the change directory
- The file includes intent, scope, and success criteria

**Legacy missing proposal is non-blocking** (`rq-prop-context1.2`)

**Given:**

- A legacy change has missing or empty proposal.md

**When:** Proposal context is loaded

**Then:**

- A scaffold proposal is generated
- A non-blocking warning is emitted

---

### Problem Statement Agreement for adv-proposal

**ID:** `rq-prop-context2` | **Priority:** **[MUST]**

/adv-proposal must extract prior discussion context (decisions, rejected approaches, constraints, open questions) from the conversation before synthesizing a problem statement, confirm it via inline approval voice before creating any change artifacts, and persist the confirmed text (including prior decisions and rejected approaches) as the opening section of proposal.md via the proposal parameter and as a standalone problem-statement.md artifact via the problemStatement parameter in adv_change_create. The problem statement must not contradict, omit, or reinterpret any prior decision or constraint from the conversation.

**Tags:** `proposal`, `context-agreement`, `transcript-grounding`

**Legacy IDs:** `rq-advprop02` from `advance-meta`

#### Scenarios

**Prior discussion context extracted before synthesis** (`rq-prop-context2.1`)

**Given:**

- A user invokes /adv-proposal after a conversation containing decisions, constraints, or rejected approaches

**When:** Phase 1 begins

**Then:**

- The agent extracts agreed facts, decisions made, rejected approaches, open questions, and constraints stated from the conversation
- Empty categories are listed as 'None identified' rather than omitted
- No decisions or constraints are fabricated that were not explicitly discussed

**Problem statement grounded in prior discussion** (`rq-prop-context2.2`)

**Given:**

- Prior discussion context has been extracted

**When:** The problem statement is synthesized

**Then:**

- The problem statement includes Prior Decisions, Rejected Approaches, and Open Questions sections
- The problem statement does not contradict any extracted agreed fact
- The problem statement does not reintroduce any rejected approach as a proposed solution
- The problem statement does not ignore any stated constraint

**Drift detection in confirmation** (`rq-prop-context2.3`)

**Given:**

- A problem statement block is shown to the user

**When:** The user reviews it via inline handoff text per docs/command-voice-standard.md § Inline Approval Voice (Tier A)

**Then:**

- The presentation explicitly asks the user to check Prior Decisions and Rejected Approaches for accuracy
- A 'Drift detected' reply path is documented for the user to flag discrepancies (free-form revise reply or explicit drift wording)
- If drift is detected, the agent re-extracts and re-synthesizes before proceeding

**Confirmed problem statement persisted in proposal.md** (`rq-prop-context2.4`)

**Given:**

- The user confirms the problem statement in Phase 1

**When:** The change is created in Phase 2

**Then:**

- adv_change_create is called with the proposal parameter containing the confirmed text
- proposal.md includes the confirmed problem statement as the Why section
- proposal.md includes a Constraints from Discussion section with prior decisions and rejected approaches

**Abort path creates no artifacts** (`rq-prop-context2.5`)

**Given:**

- The user selects Abort during Phase 1 confirmation

**When:** The command exits

**Then:**

- No change.json is created
- No proposal.md is created
- No tasks are added

**Confirmed problem statement persisted as standalone artifact** (`rq-prop-context2.6`)

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
