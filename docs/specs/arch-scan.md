# Architecture Scan

> **Version:** 1.1.0
> **Updated:** 2026-05-22

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

---

### Stack Packs Before Generic Fallback

**ID:** `rq-archstack01` | **Priority:** **[MUST]**

/adv-arch-scan must detect relevant stack files, apply matching stack packs before research fallback or generic AI heuristic fallback, and report when a relevant stack has no applicable pack.

**Tags:** `stack-pack`, `detection`, `fallback`, `coverage`

#### Scenarios

**Known stack pack runs before fallback** (`rq-archstack01.1`)

**Given:**

- Project files identify a stack with a known stack pack

**When:** /adv-arch-scan runs

**Then:**

- The matching stack pack is applied in Phase 1
- Research fallback and AI heuristic fallback run only after known pack coverage is attempted or explicitly skipped
- Skipped or degraded pack checks are reported as coverage gaps

**Unknown relevant stack reports missing pack** (`rq-archstack01.2`)

**Given:**

- Project files identify a relevant stack with no known stack pack

**When:** /adv-arch-scan runs

**Then:**

- The stack is listed in coverage.missingPacks
- Fallback analysis is marked as research or heuristic rather than stack-pack proof
- The report does not hide the missing pack

---

### Initial ADV Stack Pack

**ID:** `rq-archstack02` | **Priority:** **[MUST]**

/adv-arch-scan must include an initial ADV stack pack for the TypeScript/Bun/OpenCode plugin/Temporal/spec-command-skill asset stack. The pack must cite existing structural enforcers as authoritative checks rather than making prose or a single external tool the sole authority.

**Tags:** `stack-pack`, `advance`, `typescript`, `temporal`, `p33`

#### Scenarios

**ADV stack pack covers project structural boundaries** (`rq-archstack02.1`)

**Given:**

- The scanned repository contains TypeScript/Bun/OpenCode plugin/Temporal/spec-command-skill assets

**When:** The ADV stack pack runs

**Then:**

- The pack covers dependency graph checks
- The pack cites workflow bundle boundary checks as the structural owner for workflow safety
- The pack cites command/manifest symmetry and spec/asset anchors as structural owners for command and spec coverage

**ADV stack pack does not replace structural tests** (`rq-archstack02.2`)

**Given:**

- An ADV-specific architecture concern is already enforced by a test, validator, or spec asset check

**When:** /adv-arch-scan reports pack coverage

**Then:**

- The scanner cites the structural enforcer
- The scanner does not treat prose-only pack wording as authoritative proof
- Single-tool output remains evidence, not sole correctness authority

---

### Architecture Scanner Coverage Report

**ID:** `rq-archcov01` | **Priority:** **[MUST]**

/adv-arch-scan must summarize detected stacks, applied packs, missing packs, skipped detectors, and degraded detectors in normal text output, and expose detailed architecture coverage in JSON metadata.

**Tags:** `coverage`, `stack-pack`, `output`, `json`

#### Scenarios

**Text output summarizes architecture coverage** (`rq-archcov01.1`)

**Given:**

- Stacks are detected, packs are applied or missing, or detectors are skipped/degraded

**When:** Text output is generated

**Then:**

- The report includes an architecture scanner coverage summary
- Detected, applied, and missing stack packs are visible without verbose mode
- Skipped and degraded detectors are visible without verbose mode

**JSON output includes architecture coverage details** (`rq-archcov01.2`)

**Given:**

- --json output is requested

**When:** Report output is generated

**Then:**

- The JSON object includes coverage.detectedStacks
- The JSON object includes coverage.appliedPacks
- The JSON object includes coverage.missingPacks
- The JSON object includes coverage.skippedDetectors
- The JSON object includes coverage.degradedDetectors
