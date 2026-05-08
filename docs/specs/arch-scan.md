# Architecture Scan

> **Version:** 1.0.0
> **Updated:** 2026-05-08

## Purpose

Capability: /adv-arch-scan command — detect architecture inconsistencies with deterministic tools first, research fallback second, and low-confidence AI heuristic fallback last.

## Requirements

### Structural Correctness Boundary Detection

**ID:** `rq-archp33` | **Priority:** **[MUST]**

/adv-arch-scan must detect architecture-level violations of structural correctness: correctness, security, persistence, workflow state, gate completion, or spec compliance boundaries must be owned by machine-checkable mechanisms such as types, schemas, parsers, state machines, validators, exact refs, conformance verdicts, or explicit user approvals rather than heuristic inference, prose convention, regex-only matching, or LLM/agent judgment.

**Tags:** `structural-correctness`, `architecture`, `heuristics`, `p33`

#### Scenarios

**Heuristic-owned workflow boundary is architectural** (`rq-archp33.1`)

**Given:**

- Code lets a fuzzy match, title heuristic, prose parser, or LLM/agent judgment decide workflow state, persistence, gate completion, or spec compliance
- No schema, state machine, validator, exact ref, conformance verdict, or explicit user approval owns the transition

**When:** /adv-arch-scan runs

**Then:**

- A structural-correctness architecture finding is emitted
- The finding cites the source boundary and missing structural owner
- AI-only evidence is marked low-confidence unless corroborated by source/tool evidence

**Structural owner suppresses heuristic concern** (`rq-archp33.2`)

**Given:**

- Heuristics are used only for discovery, ranking, advisory warnings, or legacy fallback
- A typed field, schema, validator, state machine, exact ref, conformance verdict, or explicit user approval owns the correctness decision

**When:** /adv-arch-scan runs

**Then:**

- No blocking structural-correctness finding is emitted
- Any concern is reported as low-confidence advisory only

**Untrusted input must be recognized before processing** (`rq-archp33.3`)

**Given:**

- A module processes untrusted input in business logic before parser/schema/allowlist recognition and normalization

**When:** /adv-arch-scan runs

**Then:**

- A structural-correctness or security architecture finding is emitted
- The recommendation moves recognition/normalization to the system boundary
