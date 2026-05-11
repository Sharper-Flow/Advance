# Extend /adv-audit with project-wide spec ambiguity scanning

## Why

ADV has no project-wide capability for detecting and clarifying ambiguous wording in committed spec laws (`.adv/specs/*.md`).

The ambiguity taxonomy (B/F/S/M/D/X/Q/I/E/C/T) exists in canonical doc form (`ADV_INSTRUCTIONS.md § Ambiguity Taxonomy`) and runs against **in-flight change artifacts** in `/adv-proposal` Phase 2.6 (B/F/S scan over proposal.md) and `/adv-discover` Phase 2.5 (B/F/S/M scan over discovery artifacts). It never runs against the **laws themselves** once archived into `.adv/specs/`.

Spec-as-law is structural correctness (P33). Ambiguous laws break that contract project-wide regardless of impl drift — the impl can faithfully implement a vague requirement and still leave behavior unclear, untestable, or contradictory across capabilities.

`/adv-audit` already owns project-wide spec health: drift, conflicts, orphans, malformed-requirement smells, terminology mismatch. Ambiguity is the missing axis.

## What Changes

1. **New audit dimension: Ambiguity Scanner** — added to `/adv-audit` Phase 1 analysis sub-agents alongside Spec Parser, Code Mapper, Conflict Detector, Drift Scanner. Runs the canonical ambiguity taxonomy against each spec file's requirement text.
2. **Spec-law-adapted taxonomy subset** — required categories for spec laws: B (Boundaries), F (Functional Scope), S (Completion Signals), Q (Quality Attributes), E (Error Handling). Adapted from the change-doc default set (B/F/S/M) because spec laws have different normative pressure than in-flight artifacts.
3. **New quality gate row** — `CRITICAL ambiguity = 0`, `HIGH ambiguity ≤ 3` (standard); both `= 0` (strict). Composes with existing drift/conflict/orphan/coverage gates.
4. **New report section** — `ambiguity[]` in JSON output and a dedicated section in text report. Health status promoted to `MAJOR_DRIFT` if `CRITICAL ambiguity ≥ 1` (specs-as-laws → ambiguous law = broken law).
5. **`/adv-clarify` spec-file entry point** — extend `/adv-clarify` to accept a spec capability + findings list as input, run findings-driven Socratic loop, output a rewrite-ready change proposal. Does not mutate ADV state directly.
6. **Validator infrastructure reuse** — extend or sibling `plugin/src/validator/clarify-readiness.ts` so its pure-function ambiguity-detection logic can operate on raw spec markdown, not only `Change` objects.
7. **Metadata extension** — `adv_project_metadata` `adv-audit` summary includes ambiguity count: `"{drift} drift, {ambig} ambiguity finding(s)"`.
8. **Feature-flag honor** — audit's ambiguity dimension respects existing `clarify_enforcement` project feature flag (off/advisory/strict). Discovery to confirm whether a separate `audit_ambiguity_enforcement` flag is needed.

## Success Criteria

1. `/adv-audit` (no args, `--all` default) runs Ambiguity Scanner across every spec in `.adv/specs/` and reports per-capability findings with verbatim evidence quotes per the canonical anti-hallucination rule.
2. `/adv-audit <capability>` runs Ambiguity Scanner against that single spec only.
3. Ambiguity findings appear as a distinct severity-bucketed section in both text and JSON audit reports, with `category` (B/F/S/Q/E), `severity` (CRITICAL/HIGH/MEDIUM/LOW), `spec` ref, `specText` verbatim quote, `issue` reason, and `fix` suggestion.
4. Quality gate fails (`MAJOR_DRIFT`) when `CRITICAL ambiguity ≥ 1`; degrades (`DRIFT_DETECTED`) when `HIGH ambiguity > 3` in standard mode or any HIGH in `--strict` mode.
5. Remediation handoff path: user opting into remediation invokes `/adv-clarify <capability>` with findings, which produces a rewrite-ready proposal artifact; no ADV state mutation occurs in audit or clarify itself.
6. Existing `/adv-audit` drift/conflict/orphan behavior is unchanged when no ambiguity findings exist.
7. `clarify_enforcement: 'off'` disables the Ambiguity Scanner (no findings emitted, no gate impact).

## Affected Code

| Area | File(s) | Change |
|---|---|---|
| Audit command | `.opencode/command/adv-audit.md` | Add Ambiguity Scanner to Phase 1 stage list; update Phase 3 synthesis; update report schema; update metadata write |
| Audit skill | `~/.config/opencode/skills/adv-audit/SKILL.md` (synced from `skills/adv-audit/SKILL.md`) | Add Ambiguity Scanner dimension; quality gate rows; severity rubric; finding shape |
| Clarify command | `.opencode/command/adv-clarify.md` | Add spec-file entry-point contract |
| Clarify skill | `skills/adv-clarify/SKILL.md` | Document spec-input mode |
| Validator | `plugin/src/validator/clarify-readiness.ts` (or sibling `spec-ambiguity.ts`) | Adapt pure-function ambiguity detection to operate on raw spec markdown |
| Validator tests | `plugin/src/validator/*ambiguity*.test.ts` | New test coverage for spec-file ambiguity detection |
| Specs | `.adv/specs/advance-workflow.md` | New requirements for project-wide ambiguity scanning |
| Specs | `.adv/specs/advance-meta.md` | Taxonomy-for-laws subset, `clarify_enforcement` audit-context behavior |
| Docs | `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy` | Note: same taxonomy, two surfaces (change artifacts + spec laws); document required-set difference |
| Asset tests | `plugin/src/adv-audit-assets.test.ts` (or sibling) | Assert command/skill contract for new dimension |

## Related Repositories

Single-repo change. ADV plugin repo only (`oc-plugins/advance`). No cross-repo scope.

## Constraints

- Specs-as-laws are immutable from audit's perspective — audit reports, never auto-rewrites.
- `/adv-clarify` remains the only path to rewrite a spec, and rewrites must flow through `/adv-proposal` to gain change ceremony (proposal → discovery → design → planning → execution → acceptance → release).
- Reuse `clarify-readiness.ts` pure-function infrastructure where possible; do not duplicate ambiguity detection logic.
- Honor `clarify_enforcement` feature flag; do not introduce a parallel flag without evidence that audit semantics require divergence (defer to discovery).
- Canonical taxonomy in `ADV_INSTRUCTIONS.md` is the single source of truth — do not fork category definitions into audit-specific copies.
- Anti-hallucination rule applies: every finding cites verbatim text from the spec file or `(no {section})` marker.

## Impact

- **Spec authors:** gain a project-wide health check for committed laws; previously had no automated way to surface "this law is vague" without manual reading.
- **ADV agents:** `/adv-audit` becomes a more complete project-wide health signal; ambiguity findings give agents structured reasons to recommend `/adv-clarify`.
- **CI/automation:** `--strict` mode now blocks on any HIGH ambiguity; teams gating release on audit gain stronger spec-quality contracts.
- **Existing workflows:** unchanged when no ambiguity findings exist or `clarify_enforcement: 'off'`. Additive feature.

## Context

- `clarify-readiness.ts` is a pure-function validator (no I/O, no filesystem) — operates on `Change` object + proposal text. Its check codes (`CLARIFY_SUBJECTIVE_LANGUAGE`, `CLARIFY_MISSING_SUCCESS_CRITERIA`, etc.) map well to taxonomy categories but were not designed for spec-file input.
- 12 capability specs currently in `.adv/specs/` totaling 134 requirements. Audit-scale is bounded.
- `/adv-clarify` already has findings-driven mode triggered by `/adv-discover` Phase 2.5 — same input shape can be reused for audit-driven findings.
- `clarify_enforcement` defaults to `"advisory"` in `project.json`. Audit currently does not consult this flag.

## Discovery Agenda

Unresolved from Phase 1b — explicit inputs for `/adv-discover`:

1. **Validator reuse vs sibling** — extend `clarify-readiness.ts` to accept raw markdown + capability-name, OR create sibling `spec-ambiguity.ts`? Decide based on shared-vs-divergent severity rubric for spec laws vs change artifacts.
2. **`/adv-clarify` spec-input contract** — how exactly does clarify accept a spec capability as input? File path, capability name, or findings JSON? What does its output proposal artifact look like (path, schema)?
3. **Required taxonomy subset for laws** — confirm B/F/S/Q/E is the right required set, or should it differ. Evidence: scan a sample of existing specs and check which categories produce real findings.
4. **Feature flag scope** — does audit honor `clarify_enforcement` directly, or introduce `audit_ambiguity_enforcement` for separate tuning? Default position: reuse existing flag, defer parallel flag until evidence demands it.
5. **CI gate composition** — when audit's quality gate fails on ambiguity in `--strict`, do release/archive gates inherit that block? Or is audit advisory-only project-wide? Default position: audit is informational unless explicitly gated by user CI.
6. **Sub-agent vs inline** — Ambiguity Scanner as a separate sub-agent stage (like Spec Parser), or inline within Spec Parser? Tradeoff: separation of concerns vs duplicate spec parsing.
7. **Anti-recursion** — confirm Ambiguity Scanner sub-agent honors single-level rule (no nested delegation) — same constraint as slop-scan scanners.

## Scope

### In Scope

- New Ambiguity Scanner audit dimension in `/adv-audit`
- Quality gate row for ambiguity severity thresholds
- `ambiguity[]` section in JSON and text audit reports
- Health-status promotion rules for CRITICAL ambiguity
- `/adv-clarify` spec-file entry-point contract
- Pure-function validator extension or sibling for spec-markdown input
- Metadata write extension to include ambiguity count
- Asset tests for new contract
- Spec deltas in `advance-workflow` and `advance-meta`
- Honoring existing `clarify_enforcement` feature flag

### Out of Scope

- Rewriting any existing specs (that's the clarify → proposal flow's job)
- Changing the canonical ambiguity taxonomy itself
- Adding optional categories (D/X/Q/I/E/C/T beyond Q+E) to the required-set — those remain v2 promotion candidates per `ADV_INSTRUCTIONS.md`
- Auto-fix mode (specs-as-laws → human-gated rewrite only)
- Cross-repo ambiguity scanning
- Real-time ambiguity detection during spec authoring (audit runs on-demand)
- New `audit_ambiguity_enforcement` feature flag (deferred to discovery; default is to reuse existing flag)
- UI/dashboard surfacing of findings (audit emits CLI/JSON only)

## Phase 2.6 B/F/S Ambiguity Scan

Self-scan over this proposal.md per `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy`:

**B (Boundaries)** — Clear. `### Out of Scope` populated with 8 explicit exclusions; `### In Scope` enumerates 10 deliverables.

**F (Functional Scope)** — Clear. Success Criteria #1-7 are testable. #1, #2 specify behavior. #3 specifies report-section schema. #4 specifies gate thresholds with measurable conditions. #5 specifies remediation contract. #6 specifies regression boundary. #7 specifies feature-flag behavior.

**S (Completion Signals)** — Clear. All success criteria measurable via direct invocation of `/adv-audit` and inspection of JSON/text output. No vague terms like "fast", "intuitive", "robust" used.

**Coverage: B:C F:C S:C**

No CRITICAL or HIGH findings. Proposal gate completion not blocked by ambiguity scan.