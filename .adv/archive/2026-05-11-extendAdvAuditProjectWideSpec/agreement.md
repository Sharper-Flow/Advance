# Agreement — Extend /adv-audit with Project-Wide Spec Ambiguity Scanning

## Problem

ADV audits drift/conflicts/orphans across all specs but never scans committed spec laws for ambiguous wording. The canonical ambiguity taxonomy (B/F/S/M/D/X/Q/I/E/C/T) runs against in-flight change artifacts only — never against `.adv/specs/*.md` laws. Ambiguous laws break the spec-as-law contract (P33) regardless of implementation fidelity.

## Objectives

1. Add Ambiguity Scanner as a first-class audit dimension in `/adv-audit`, parallel in importance to drift/conflicts/orphans.
2. Reuse the canonical ambiguity taxonomy with a spec-law-adapted required-set: B/F/S/Q/E.
3. Extend the audit quality gate to include ambiguity thresholds (CRITICAL=0, HIGH≤3 standard; both 0 strict).
4. Provide a remediation handoff path to `/adv-clarify` for collaborative rewrite without mutating ADV state.
5. Reuse existing infrastructure (`clarify-readiness.ts` pattern, `clarify_enforcement` flag, audit sub-agent architecture).

## Success Criteria

- **SC1**: `/adv-audit` scans all specs for ambiguity and reports per-capability findings with verbatim evidence.
- **SC2**: `/adv-audit <capability>` scans a single spec only.
- **SC3**: Ambiguity findings appear in text and JSON reports with category, severity, spec ref, verbatim quote, reason, and fix suggestion.
- **SC4**: Quality gate fails MAJOR_DRIFT on CRITICAL ambiguity; degrades DRIFT_DETECTED on HIGH >3 standard / any HIGH strict.
- **SC5**: Remediation handoff to `/adv-clarify` produces rewrite-ready proposal; no ADV state mutation in audit or clarify.
- **SC6**: Existing drift/conflict/orphan behavior unchanged when no ambiguity findings exist.
- **SC7**: `clarify_enforcement: 'off'` disables Ambiguity Scanner entirely.

## Acceptance Criteria

- **AC1**: Given `/adv-audit` is run with no args, when the command completes, then every spec in `.adv/specs/` has been scanned for ambiguity and findings appear as a distinct section in both text and JSON output.
- **AC2**: Given `/adv-audit advance-workflow` is run, when the command completes, then only the `advance-workflow` spec has ambiguity findings, and no other specs were scanned.
- **AC3**: Given an ambiguity finding exists, when the report is inspected, then the finding contains `id`, `category` (B|F|S|Q|E), `severity` (CRITICAL|HIGH|MEDIUM|LOW), `spec` ref, `specText` (verbatim quote), `issue`, and `fix`.
- **AC4**: Given CRITICAL ambiguity ≥ 1 exists, when audit synthesis runs, then health status is `MAJOR_DRIFT`.
- **AC5**: Given HIGH ambiguity > 3 exists and CRITICAL = 0, when audit synthesis runs in standard mode, then health status is `DRIFT_DETECTED`.
- **AC6**: Given HIGH ambiguity ≥ 1 exists, when audit synthesis runs in `--strict` mode, then health status is `DRIFT_DETECTED` or `MAJOR_DRIFT`.
- **AC7**: Given the user selects remediation, when the handoff executes, then `/adv-clarify` is invoked with spec capability name and findings JSON, and no `adv_change_create` or `adv_gate_complete` calls occur during audit or clarify.
- **AC8**: Given no ambiguity findings exist, when `/adv-audit` runs, then the output is identical to pre-change behavior (no extra sections, no gate changes).
- **AC9**: Given `clarify_enforcement: 'off'` in project.json, when `/adv-audit` runs, then no ambiguity findings are emitted and the quality gate is unaffected.
- **AC10**: Given the ambiguity scanner sub-agent runs, when it completes, then it returns findings JSON only (no nested sub-agents, no `/adv-*` invocations).

## Constraints

- **C1**: Specs-as-laws are immutable from audit's perspective — audit reports, never auto-rewrites.
- **C2**: `/adv-clarify` is the only path to spec rewrite; rewrites must flow through `/adv-proposal` for full gate ceremony.
- **C3**: Sibling validator module (`spec-ambiguity.ts`) — do not modify `clarify-readiness.ts` input shape or break its existing contract.
- **C4**: Reuse `clarify_enforcement` flag; no parallel audit-specific flag.
- **C5**: Canonical taxonomy in `ADV_INSTRUCTIONS.md` is single source of truth; no forked category definitions.
- **C6**: Anti-hallucination rule: every finding cites verbatim spec text or `(no {section})` marker.
- **C7**: Anti-recursion: Ambiguity Scanner sub-agent is leaf-level only; no nested delegation.
- **C8**: Audit is informational — not a gate in the 7-gate lifecycle. CI exit-code behavior is CI's decision.

## Rejected Approaches

- **DONT1**: Extending `clarify-readiness.ts` directly to accept spec markdown — would couple the Change-object contract to spec-file contract; risk breaking existing clarify pipeline.
- **DONT2**: Creating a new `/adv-spec-clarify` command — would duplicate `/adv-clarify`'s findings-driven mode; better to extend clarify's input contract.
- **DONT3**: Adding an `audit_ambiguity_enforcement` feature flag — unnecessary given existing `clarify_enforcement` already has the right 3-mode semantics.
- **DONT4**: Including M (Missing Information) in required taxonomy set for laws — committed specs should have no missing info; M is a change-artifact concern.
- **DONT5**: Auto-fix mode for ambiguity findings — specs-as-laws require human-gated rewrite through full ceremony.

## Out of Scope

- **OOS1**: Rewriting any existing specs (clarify → proposal flow's job).
- **OOS2**: Changing the canonical ambiguity taxonomy itself.
- **OOS3**: Adding optional categories beyond B/F/S/Q/E to the required-set (D/X/I/C/T remain v2).
- **OOS4**: Cross-repo ambiguity scanning.
- **OOS5**: Real-time ambiguity detection during spec authoring.
- **OOS6**: UI/dashboard surfacing of findings (CLI/JSON only).
- **OOS7**: Audit becoming a gate in the 7-gate lifecycle.
- **OOS8**: CI-specific exit-code behavior beyond existing audit report contract.

## Discovery Resolutions

| # | Question | Resolution | Evidence |
|---|---|---|---|
| DA1 | Validator reuse vs sibling? | **Sibling `spec-ambiguity.ts`** — reuse `ValidationIssue` type and regex-check pattern; divergent input shape and severity rubric | `clarify-readiness.ts` is coupled to `Change` objects; fixed `severity: "warning"` |
| DA2 | `/adv-clarify` spec-input contract? | **Capability name + findings JSON** — extend findings-driven mode to accept `specCapability` + `specFilePath` | Existing finding shape `[{id,severity,category,finding,evidence,reason}]` works unchanged |
| DA3 | Required taxonomy subset? | **B/F/S/Q/E** confirmed | Spec-law analysis shows: boundaries (inter-req dependencies), functional scope (mixed what/why), completion signals (subjective terms like "safely"), quality attributes ("bounded", "idempotent"), error handling (missing degradation) |
| DA4 | Feature flag scope? | **Reuse `clarify_enforcement`** | Three modes (off/advisory/strict) map directly to audit needs; no divergence |
| DA5 | CI gate composition? | **Audit informational only** | Not a 7-gate gate; CI exit codes are CI's decision |
| DA6 | Sub-agent vs inline? | **Separate sub-agent stage** | Distinct concern from Spec Parser; runs parallel with Code Mapper + Conflict Detector after Parser completes |
| DA7 | Anti-recursion? | **Single-level rule** | Leaf worker: reads specs, runs checks, returns JSON. No delegation, no `/adv-*` |

## Open Design Questions

- **Q1**: Should Ambiguity Scanner consume Spec Parser output (parsed requirements) or read raw spec markdown directly? Affects whether Parser needs to emit a structured intermediate format. (Design phase)
- **Q2**: Finding ID format — `ambig-{capability}-{rqId}-{seq}` or flat `ambig-{seq}`? Impacts dedup and cross-reference. (Design phase)
- **Q3**: Should `/adv-clarify` spec-input mode write findings to a standalone artifact (e.g., `docs/{capability}-ambiguity.md`) or inject into a new change's proposal? (Design phase)