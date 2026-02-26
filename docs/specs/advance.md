# Advance

> **Version:** 1.1.0
> **Updated:** 2026-02-26

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

/adv-review and /adv-harden must enforce a minimum findings threshold to prevent shallow 'LGTM' behavior.

#### Scenarios

**Minimum findings validation** (`rq-R3v13wR1.1`)

**Given:**
- A review with fewer than 3 non-nit findings

**When:** Gate completion is attempted

**Then:**
- The gate remains open and requires explicit justification for the clean result

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

Tasks may include optional metadata key/value pairs. adv_task_list must support has_metadata_key:<key> and metadata:<key>=<value> filters with behavior aligned between JSON source-of-truth and SQLite cache indexes.

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
