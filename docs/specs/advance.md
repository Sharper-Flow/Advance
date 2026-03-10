# Advance

> **Version:** 1.3.0
> **Updated:** 2026-03-10

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

**When:** adv_wisdom_promote is executed

**Then:**
- The entry is appended to project-level wisdom.jsonl

---

### Manifest-Driven Workflow recommendations

**ID:** `rq-M4n1f3s1` | **Priority:** **[MUST]**

Command recommendations in adv-status must be derived from a type-safe workflow manifest to ensure consistent pathing.

#### Scenarios

**Context-aware recommendations** (`rq-M4n1f3s1.1`)

**Given:**
- A change at implementation gate

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

Tasks may include optional metadata key/value pairs. adv_task_list must support has_metadata_key:\<key\> and metadata:\<key\>=\<value\> filters with behavior aligned between JSON source-of-truth and SQLite cache indexes.

#### Scenarios

**Filter by metadata key** (`rq-advmeta01.1`)

**Given:**
- A change with tasks containing metadata keys

**When:** adv_task_list is called with filter has_metadata_key:\<key\>

**Then:**
- Only tasks containing that metadata key are returned

**Filter by metadata key/value** (`rq-advmeta01.2`)

**Given:**
- A change with tasks containing metadata key/value pairs

**When:** adv_task_list is called with filter metadata:\<key\>=\<value\>

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

**ID:** `rq-advprop02` | **Priority:** **[MUST]** | **Tags:** `proposal`, `context-agreement`

/adv-proposal must synthesize a brief problem statement from user context, confirm it via the question tool before creating any change artifacts, and persist the confirmed text as the opening section of proposal.md via the proposal parameter in adv_change_create.

#### Scenarios

**Problem statement confirmed before change creation** (`rq-advprop02.1`)

**Given:**
- A user invokes /adv-proposal

**When:** Phase 1 completes

**Then:**
- A problem statement block is synthesized and shown to the user
- The user confirms, adjusts, or aborts via the question tool
- No change artifacts are created until the user confirms

**Confirmed problem statement persisted in proposal.md** (`rq-advprop02.2`)

**Given:**
- The user confirms the problem statement in Phase 1

**When:** The change is created in Phase 2

**Then:**
- adv_change_create is called with the proposal parameter containing the confirmed text
- proposal.md includes the confirmed problem statement as the Why section

**Abort path creates no artifacts** (`rq-advprop02.3`)

**Given:**
- The user selects Abort during Phase 1 confirmation

**When:** The command exits

**Then:**
- No change.json is created
- No proposal.md is created
- No tasks are added

---

### Defensive and Nesting Slop Detection

**ID:** `rq-slopscan01` | **Priority:** **[MUST]** | **Tags:** `slop-scan`, `quality`, `ast`

/adv-slop-scan must detect overly defensive code (redundant guard chains, paranoid null checks, unreachable fallback branches) and deeply nested code (nesting depth >= configured threshold) using AST-first analysis with deterministic degraded fallback when AST tools are unavailable. Findings must include structured diagnostic fields in all output formats.

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
