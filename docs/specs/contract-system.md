# Contract System

> **Version:** 1.0.0
> **Updated:** 2026-02-12

## Purpose

Capability: Contract System

## Requirements

### Typed Delta Modifications

**ID:** `rq-typedmod` | **Priority:** **[MUST]**

The delta system MUST enforce type safety for modifications to requirements. Any keys not present in the RequirementSchema MUST be rejected at parse time.

#### Scenarios

**Reject unknown keys** (`rq-typedmod.1`)

**Given:**
- A DeltaModifySchema object with unknown keys

**When:** The schema is parsed by Zod

**Then:**
- The parse operation MUST fail with a validation error

---

### Rename Operation

**ID:** `rq-renameop` | **Priority:** **[MUST]**

The delta system MUST support a rename operation that updates a requirement's title and optionally its ID while preserving all other fields.

#### Scenarios

**Successful rename** (`rq-renameop.1`)

**Given:**
- An existing requirement
- A rename delta targeting its ID

**When:** The delta is applied

**Then:**
- The requirement's title is updated
- All other fields are preserved

---
