# Advance Meta

> **Version:** 1.0.0
> **Updated:** 2026-04-28

## Purpose

Capability: Cross-cutting ADV concerns — config diagnostics, metadata filters, shutdown lifecycle, proposal lineage, due-diligence routing, synthetic-state guards, and slop scanning. Split from `advance` capability.

## Requirements

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

**When:** The user reviews it via inline handoff text per docs/command-voice-standard.md § Inline Approval Voice (Tier A)

**Then:**
- The presentation explicitly asks the user to check Prior Decisions and Rejected Approaches for accuracy
- A 'Drift detected' reply path is documented for the user to flag discrepancies (free-form revise reply or explicit drift wording)
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

### Source-Appropriate Due Diligence for Unknown Capability Questions

**ID:** `rq-dueDiligence01` | **Priority:** **[MUST]**

ADV-managed guidance (orchestrator agent text, synced overlays, and accompanying drift tests) must require source-appropriate due diligence before answering, recommending, or deciding on unknown platform, architecture, or capability questions. Diligence may use any appropriate mix of evidence sources (local code via lgrep/read, repo history or repo examples, GitHub examples, official docs, web research, or similar); the evidence bar is not a fixed source stack. Requests like "quick answer", "from your knowledge", or "don't research" may change response brevity only and must not lower the evidence bar. If required diligence cannot be completed, the response must stop and surface the blockage instead of presenting an unverified recommendation as settled.

**Tags:** `research`, `due-diligence`, `routing`, `guidance`

#### Scenarios

**Unknown capability question triggers source-appropriate diligence** (`rq-dueDiligence01.1`)

**Given:**
- An unknown platform, architecture, or capability question is posed to an ADV-managed agent

**When:** The agent prepares an answer, recommendation, or decision

**Then:**
- The agent gathers source-appropriate evidence before answering
- Evidence may come from local code inspection, repo history or repo examples, GitHub examples, official docs, web research, or other relevant sources chosen to fit the question
- No carve-out permits skipping diligence on the basis that the question is local, short, or familiar

**Quick-answer requests change brevity only** (`rq-dueDiligence01.2`)

**Given:**
- The user requests a "quick answer", asks "from your knowledge", or says "don't research"
- The question still requires due diligence under rq-dueDiligence01.1

**When:** The agent responds

**Then:**
- The response may be shortened or compressed
- The evidence bar is not lowered; diligence is still performed before recommending or deciding

**Blocked diligence stops and surfaces the blockage** (`rq-dueDiligence01.3`)

**Given:**
- Required diligence cannot be completed (for example: docs, research tools, or evidence sources are unavailable)

**When:** The agent would otherwise present a directional answer or recommendation

**Then:**
- The agent stops instead of presenting an unverified direction as settled
- The response surfaces the specific blockage or missing evidence
- No carve-out permits proceeding with an unverified recommendation

**Guidance surfaces and drift tests encode the rule** (`rq-dueDiligence01.4`)

**Given:**
- The repo contains ADV orchestrator agent text, synced overlays, and routing asset tests

**When:** Those surfaces are inspected

**Then:**
- The ADV agent and plan agent sources describe due-diligence-first routing for unknown capability questions
- The synced overlays (adv.overlay.md, plan.overlay.md) carry the same rule
- Regression tests fail if the legacy carve-out-first wording returns

---
