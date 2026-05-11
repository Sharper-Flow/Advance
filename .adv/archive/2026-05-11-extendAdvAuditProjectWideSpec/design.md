# Design — Extend /adv-audit with Project-Wide Spec Ambiguity Scanning

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  /adv-audit command                  │
│  Phase 1: Analysis Sub-Agents                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   │
│  │ Spec     │──▶│ Code     │   │ Conflict     │   │
│  │ Parser   │   │ Mapper   │   │ Detector     │   │
│  └──────────┘   └──────────┘   └──────────────┘   │
│       │                                              │
│       ▼                                              │
│  ┌──────────────┐                                    │
│  │ Drift        │                                    │
│  │ Scanner      │                                    │
│  └──────────────┘                                    │
│                                                      │
│  Phase 2: Orphan Detection                          │
│  Phase 3: Synthesis                                 │
│    ┌──────────────────────────────────────────────┐ │
│    │ Inline: spec-ambiguity.ts pure-function scan │ │
│    │ B/F/S/Q/E taxonomy on raw spec markdown      │ │
│    │ → ambiguity[] findings → quality gate         │ │
│    └──────────────────────────────────────────────┘ │
│  Phase 4: Remediation (clarify handoff)             │
│  Phase 5: Write Metadata                            │
└─────────────────────────────────────────────────────┘
          │
          │ remediation handoff (informational)
          ▼
┌─────────────────────────────────────────────────────┐
│            /adv-clarify (existing)                   │
│  Findings-driven mode extended:                      │
│  - Input: specCapability + findings JSON             │
│  - Output: REQUIREMENTS DISCOVERY SUMMARY            │
│  - No ADV state mutation                             │
└─────────────────────────────────────────────────────┘
```

Two layers:
1. **Validator layer** — new `spec-ambiguity.ts` pure-function module in `plugin/src/validator/`. Operates on raw spec markdown strings. Runs **inline in Phase 3 synthesis**, not as a separate sub-agent. Reuses `ValidationIssue` type with extended `details` for 4-level severity.
2. **Command layer** — updates to `.opencode/command/adv-audit.md` and `skills/adv-audit/SKILL.md` to add ambiguity detection to synthesis, quality gate, report section, and clarify handoff. Plus clarify command extension for spec-input.

## Key Decisions

### KD1: Sibling validator, not extending clarify-readiness

**Decision:** Create `plugin/src/validator/spec-ambiguity.ts` as a sibling to `clarify-readiness.ts`.

**Rationale:** `clarify-readiness.ts` is deeply coupled to `Change` objects — every check function receives `(change: Change, ...)` and inspects `change.title`, `change.deltas`. Its severity model is fixed at `"warning"`. Changing its input shape would break the existing clarify pipeline (6 check functions, comprehensive test coverage). The sibling shares:
- `ValidationIssue` type from `./types` (with 4-level severity in `details.ambiguity_severity`)
- Pure-function pattern (no I/O, no filesystem)
- Check-code constant pattern
- Regex-based detection approach

Diverges in:
- Input: `(specMarkdown: string, capabilityName: string)` instead of `(change: Change, proposalText: string)`
- Severity: 4-level (CRITICAL/HIGH/MEDIUM/LOW) mapped to `details.ambiguity_severity` — the `ValidationIssue.severity` field stays `"warning"` (the existing enum only allows `"error" | "warning"`), with the richer severity in details
- Check codes: B/F/S/Q/E taxonomy categories instead of CLARIFY_* codes
- Output: `SpecAmbiguityResult` with `coverage` map and `taxonomy` breakdown

### KD2: ValidationIssue severity extension via details, not enum change

**Decision:** Keep `ValidationIssue.severity` as `"warning"` for ambiguity findings. Add `details.ambiguity_severity` with 4-level taxonomy. Quality gate reads `details.ambiguity_severity`. Export a type guard `isAmbiguityFinding(issue: ValidationIssue): boolean` that checks for `details.ambiguity_severity` presence.

**Rationale:** Changing `ValidationSeveritySchema` from `z.enum(["error", "warning"])` to include 4 more levels is a schema-wide change that affects all validators, all tests, and the tool layer. The 4-level ambiguity severity is an audit-specific concern — it belongs in `details`, not in the shared severity enum. The type guard makes the dual-severity contract discoverable for future consumers.

### KD3: Inline pure-function scan, not sub-agent (v1)

**Decision:** Ambiguity detection runs as an inline pure-function call in audit Phase 3 synthesis. No separate sub-agent stage in v1.

**Rationale:** The validator identified that `spec-ambiguity.ts` checks are fundamentally regex/pattern-based (same as `clarify-readiness.ts` which runs inline in tool code, not as a sub-agent). An LLM sub-agent round-trip adds non-determinism for marginal depth gain beyond what regex can detect. The B/F/S/Q/E surface patterns cover the stated objectives:
- Subjective terms in requirement bodies
- Missing measurable thresholds
- Vague scope language
- Missing error-handling scenarios

v1 runs pure-function checks deterministically in synthesis. v2 may add sub-agent enrichment for deeper judgment-based analysis of categories where regex is insufficient.

This simplifies implementation by removing: sub-agent dispatch, sub-agent prompt, anti-recursion guard, `WORKING DIRECTORY` in sub-agent packet, and the 3-concurrent-sub-agent cap concern.

### KD4: Feature flag reuse — `clarify_enforcement` for audit

**Decision:** Audit reads the existing `clarify_enforcement` project feature flag:
- `off` → Ambiguity detection skipped entirely in synthesis
- `advisory` (default) → Detection runs, findings in report, quality gate shows status but doesn't fail `ALIGNED`
- `strict` → Detection runs, findings contribute to quality gate; CRITICAL/HIGH threshold enforced

**Rationale:** The flag semantics map directly. The `strict` docstring says "block the prep gate" but audit's equivalent is promoting health status — semantically consistent (strict = findings have teeth) in a different context.

### KD5: Remediation handoff is informational, not programmatic

**Decision:** When ambiguity findings present and user wants remediation, audit outputs informational text: "Run `/adv-clarify <capability>` with these findings to begin rewrite." No automatic invocation.

**Rationale:** `/adv-clarify` is a collaborative Socratic loop requiring real-time agent-user interaction. Audit is a report generator. Auto-invoking clarify would bypass the collaboration model.

### KD6: Health status interaction with ambiguity

**Decision:**
- `CRITICAL ambiguity ≥ 1` → health promoted to `MAJOR_DRIFT` (ambiguous law = broken law)
- `HIGH ambiguity > 3` (standard) or `HIGH ambiguity ≥ 1` (strict) → health `DRIFT_DETECTED`
- No ambiguity findings → health unchanged (composed with drift/conflict/orphan results)

**Rationale:** Ambiguous specs are functionally equivalent to drift — the implementation cannot faithfully serve an unclear requirement. MAJOR_DRIFT for CRITICAL ambiguity reflects that an ambiguous MUST/SHALL is as broken as a violated one.

## Implementation Strategy

### Sequencing

1. **`spec-ambiguity.ts`** — Pure-function validator module with 5 check functions (B/F/S/Q/E) + `runSpecAmbiguityChecks` orchestrator + `isAmbiguityFinding` type guard. Test-first via TDD.
2. **Asset tests** — `plugin/src/adv-audit-assets.test.ts` asserting command/skill contract for the new dimension.
3. **Audit command** — Update `.opencode/command/adv-audit.md`: Phase 3 synthesis extended with inline ambiguity detection; quality gate table extended; report schema extended; Phase 4 remediation extended; Phase 5 metadata extended.
4. **Audit skill** — Update `skills/adv-audit/SKILL.md`: Ambiguity detection in synthesis section; quality gate row; finding shape; severity rubric.
5. **Clarify command** — Update `.opencode/command/adv-clarify.md`: Document spec-input entry point in findings-driven mode.
6. **Clarify skill** — Update `skills/adv-clarify/SKILL.md`: Document spec-input mode.
7. **Spec deltas** — Add requirements to `.adv/specs/advance-workflow.md`. Update `.adv/specs/advance-meta.md` for `clarify_enforcement` audit-context.
8. **ADV_INSTRUCTIONS.md** — Add note to Ambiguity Taxonomy section: two surfaces (change artifacts + spec laws), required-set difference.

### Spec-law taxonomy check functions

| Category | Check Function | What it detects |
|---|---|---|
| B (Boundaries) | `checkBoundaryAmbiguity` | Requirements without explicit in/out scope; "handle X" without specifying what "handle" excludes |
| F (Functional Scope) | `checkFunctionalAmbiguity` | Vague behavioral terms ("appropriate", "correct", "properly"); missing Given/When/Then in scenarios |
| S (Completion Signals) | `checkCompletionSignals` | Subjective terms from existing SUBJECTIVE_PATTERN; unmeasurable success criteria in requirement bodies |
| Q (Quality Attributes) | `checkQualityAttributes` | "fast", "scalable", "reliable" without quantitative thresholds; "bounded" without specifying bounds |
| E (Error Handling) | `checkErrorHandling` | Requirements describing behavior with failure potential but no failure scenarios; "safely" without specifying what "safe" means |

Each function receives `(specMarkdown: string, capabilityName: string)` and returns `ValidationIssue[]` with `details.ambiguity_severity` and `details.taxonomy_category`.

## LBP Analysis

- **Reuse over reinvent:** Reusing `ValidationIssue` type, regex-check pattern, and check-code constants from existing validator infrastructure.
- **Inline over sub-agent:** Pure-function inline call follows the `clarify-readiness.ts` pattern — deterministic, testable, no context-budget impact.
- **Feature flags over branching:** Reusing existing `clarify_enforcement` flag instead of creating parallel configuration.
- **Informational over programmatic:** Remediation handoff is text, not code.
- **Canonical taxonomy:** Single source of truth in `ADV_INSTRUCTIONS.md`; no forked definitions.

## Affected Components

| Component | File | Change Type |
|---|---|---|
| Validator | `plugin/src/validator/spec-ambiguity.ts` | **New** |
| Validator tests | `plugin/src/validator/spec-ambiguity.test.ts` | **New** |
| Validator index | `plugin/src/validator/index.ts` | Add export |
| Asset tests | `plugin/src/adv-audit-assets.test.ts` | **New** or extend existing |
| Audit command | `.opencode/command/adv-audit.md` | Modify (Phase 3, 4, 5) |
| Audit skill | `skills/adv-audit/SKILL.md` | Modify (synthesis, gates, report) |
| Clarify command | `.opencode/command/adv-clarify.md` | Modify (spec-input docs) |
| Clarify skill | `skills/adv-clarify/SKILL.md` | Modify (spec-input docs) |
| Spec: workflow | `.adv/specs/advance-workflow.md` | Delta: add ambiguity scan requirements |
| Spec: meta | `.adv/specs/advance-meta.md` | Delta: clarify_enforcement audit-context |
| Instructions | `ADV_INSTRUCTIONS.md` | Modify: taxonomy section note |

## Risks / Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| False positives from regex checks | LOW — advisory default | `advisory` mode (default) makes findings informational. Regex patterns inherit from `clarify-readiness.ts` with existing false-positive tuning. |
| `ValidationIssue.severity` dual-model | LOW — documented in KD2 + type guard | `isAmbiguityFinding()` type guard makes contract discoverable. Quality gate is sole consumer. |
| Spec-law taxonomy differs from change-artifact taxonomy | MEDIUM | Document required-set difference in `ADV_INSTRUCTIONS.md`. Finding shape includes `category` label. |
| Audit report schema change breaks JSON consumers | LOW — `ambiguity[]` is additive | JSON consumers ignoring unknown fields are unaffected. |
| Regex can't catch deep structural ambiguity (e.g., logically incomplete boundaries) | MEDIUM — v1 limitation | v2 may add sub-agent enrichment for judgment-based analysis. v1 catches surface patterns that are still valuable (subjective terms, missing thresholds, vague scope). |

## Validator Result: CAUTION

Two cautions from independent design validator (adv-researcher):

1. **Simplicity (resolved):** Scanner could be inline pure-function instead of sub-agent. **Accepted.** v1 is inline only. Sub-agent enrichment deferred to v2. Removes sub-agent dispatch, anti-recursion guard, and prompt from scope.

2. **Dual-severity explicitness (resolved):** KD2's `details.ambiguity_severity` needs discoverable contract. **Accepted.** Adding `isAmbiguityFinding()` type guard with JSDoc documentation.

No conflicts. No contract-compromise risks. Design proceeds to planning.