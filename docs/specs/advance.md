# Advance

> **Version:** 1.0.0
> **Updated:** 2026-02-13

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
