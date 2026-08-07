# Architecture Scan

> **Version:** 1.2.0
> **Updated:** 2026-07-20

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

/adv-arch-scan must include an initial ADV stack pack for the TypeScript/Bun/OpenCode plugin/disk/spec-command-skill asset stack. The pack must cite existing structural enforcers as authoritative checks rather than making prose or a single external tool the sole authority.

**Tags:** `stack-pack`, `advance`, `typescript`, `disk`, `p33`

#### Scenarios

**ADV stack pack covers project structural boundaries** (`rq-archstack02.1`)

**Given:**
- The scanned repository contains TypeScript/Bun/OpenCode plugin/disk/spec-command-skill assets

**When:** The ADV stack pack runs

**Then:**
- The pack covers dependency graph checks
- The pack cites disk projection and mutation-boundary checks as the structural owner for persistence safety
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

---

### Capability Consistency Detection

**ID:** `rq-archcap01` | **Priority:** **[MUST]**

/adv-arch-scan must detect cross-artifact capability inconsistencies (config↔code↔deps disagreements) via the typed arch-scan pipeline (bin/arch-scan.ts). The typed pipeline is the primary detector; the markdown layer is advisory only. Each shipped rule in bin/lib/arch-scan/registry.ts must produce evidence-backed findings with file:line cross-references per P34, must respect the intent_required gate for Phase 3 rules (false-positive protection), and must honor exception_semantics (suppress | escalate) per entry.

**Tags:** `capability-consistency`, `phase-1`, `phase-3`, `evidence`, `intent-gate`

#### Scenarios

**Phase 1 deterministic rules produce evidence-backed findings** (`rq-archcap01.1`)

**Given:**
- a project with an env-var-injection-vs-sdk-import disagreement (APPLICATIONINSIGHTS_CONNECTION_STRING in bicep without @azure/monitor-* SDK and without autoinstrumentation)
- the capability-consistency pack applies (project has package.json AND IaC files AND/OR manifest references)

**When:** the capability-consistency pack runs via `bun run bin/arch-scan.ts`

**Then:**
- a CapabilityFinding is produced with structured evidence (file:line for trigger)
- absence_proof is populated with searchedRoots, includedGlobs, parseFailures
- detection_method is 'regex' or 'ast'
- confidence is 'high' or 'medium'

**Phase 1 config-vs-dependency-presence rule respects workspace-hoist exception** (`rq-archcap01.2`)

**Given:**
- a project with a config-vs-dependency-presence disagreement (package.json declares knip/eslintConfig/prettier/stylelint/commitlint config block without the owning runtime/dev dependency)
- no workspace hoist configuration suppresses the finding

**When:** the capability-consistency pack runs Phase 1

**Then:**
- a CapabilityFinding is produced for the missing dependency owner
- when a workspace hoist exception_signal matches (pnpm-workspace.yaml or lerna.json), the finding IS suppressed (exception_semantics: suppress default)
- evidence cites the config block file:line

**Exception escalation semantics for deferred-state rules** (`rq-archcap01.3`)

**Given:**
- a Content-Security-Policy-Report-Only header set without enforced equivalent or reporting endpoint
- a nearby TODO/FIXME/HACK/XXX comment referencing enforcement within the scanDebtMarkers window
- the report-only-header-with-deferred-todo rule has exception_semantics: 'escalate'

**When:** the report-only-header-with-deferred-todo rule runs

**Then:**
- a finding is produced (NOT suppressed — escalate semantics invert the default suppress behavior)
- severity is escalated by 1 level (major→blocker, capped at blocker)
- evidence includes the exception signal location (TODO file:line)

**Phase 3 manifest-reference-vs-runtime-registration rule respects intent_required gate** (`rq-archcap01.4`)

**Given:**
- a project with a manifest-reference-vs-runtime-registration trigger (HTML/TSX/Svelte references web app manifest) but no intent evidence (no Workbox dep, no declared PWA policy, no Chrome installability criteria)
- the rule declares intent_required covering Workbox dependency, PWA policy, and installability criteria

**When:** the capability-consistency pack runs Phase 3

**Then:**
- no finding is produced (intent gate closed — no declaration matches)
- coverage_entry.state is 'skipped' with reason mentioning 'intent'
- false-positive protection per AC MUST #8

**Phase 3 scaffold-vs-test-green-path rule respects intent_required gate** (`rq-archcap01.5`)

**Given:**
- a project with a scaffold-vs-test-green-path trigger (android/ios/detox/cypress scaffold directory present) without a matching test runner configuration
- no intent declaration matches (no script entry referencing the scaffold, no CI job, no declared field)

**When:** the capability-consistency pack runs Phase 3

**Then:**
- no finding is produced (intent gate closed)
- coverage_entry.state is 'skipped' with reason mentioning 'intent'
- when a script entry, CI job, or declared field matches, the rule produces a low-severity finding (intent declared but scaffold unused)

---
