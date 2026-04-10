# ADV Autonomy Compliance Matrix

This document records the current ADV policy for **agent autonomy vs. user confirmation**.

## Goal

ADV should ask the user only for:
- outcome/vision alignment
- subjective tradeoffs
- explicit approval or sign-off

ADV should **not** ask the user for deterministic classifications the agent can derive from the conversation, specs, codebase, or prior ADV state.

## Shared Policy

Canonical sources:
- `ADV_INSTRUCTIONS.md` → **Autonomy vs User Intuition Protocol**
- `docs/adv-question-tool.md` → question-tool usage constraints

### Agent decides by default

- change type
- affected specs / capabilities
- whether a new capability/spec is required
- likely spec deltas
- cross-repo impact
- obvious target change resolution
- healthy worktree reuse
- whether execution should begin once pre-implementation gates are complete

### User confirms when intuition or approval is required

- problem framing and intended outcome
- objectives, constraints, avoidances, acceptance criteria
- design direction when multiple valid approaches reflect product vision or taste
- acceptance of delivered work
- debt acceptance or partial-remediation choices
- cancellation, archive sign-off, destructive approval
- doom-loop recovery

## Command Matrix

| Command | Agent decides | User confirms |
|---|---|---|
| `/adv-proposal` | summary derivation, overlap detection, change type, impacted specs, new-spec need, cross-repo scope, proposal quality refinement | problem statement matches intended outcome |
| `/adv-discover` | target auto-selection, discovery synthesis, open design questions from evidence | only when design tradeoffs depend on user values |
| `/adv-agree` | target auto-selection, extraction of objectives/constraints/open questions from discovery | agreement contents and edits |
| `/adv-design` | target auto-selection, design synthesis from research and code | only when design choice depends on product vision or taste |
| `/adv-present` | target auto-selection, concise design summary | design direction approval |
| `/adv-prep` | target auto-selection, gap analysis, task graph synthesis | only when gaps are unresolvable without user intent |
| `/adv-apply` | target auto-selection, worktree reuse, execution start, task sequencing, TDD loop, cross-repo routing | doom-loop recovery, cancellations, scope changes not reflected in the stored contract |
| `/adv-review` | target auto-selection, review execution, remediation of blockers/issues | none by default; review remains agent-led |
| `/adv-accept` | target auto-selection, acceptance summary construction | whether delivered work satisfies the agreement |
| `/adv-harden` | target auto-selection, hardening analysis, default in-scope remediation | debt acceptance, partial remediation, report-only choice |
| `/adv-archive` | target auto-selection, archive validation, spec application workflow | archive/sign-off approval |
| `/adv-audit` | spec drift detection and reporting | only if user wants remediation prioritization or debt acceptance |
| `/adv-task` | fast-track synthesis of contract + proposal/discovery/design/planning | quick-contract confirmation, conflicts with recommended direction |
| `/adv-refactor` | target auto-selection, drift analysis | whether implementation drift means “new requirement” vs “bug in code” |
| `/adv-tron` | target auto-resolution, fallback to nearest concrete/broad scope | only if multiple plausible investigations imply materially different intents |
| `/adv-clarify` | question sequencing and synthesis | answers to ambiguity the agent cannot derive |
| `/adv-validate` | target auto-selection, validation run | none |

## Audit Verdict

**Status: compliant with the current intent.**

The current command contracts no longer instruct agents to ask the user for:
- impacted specs
- whether a new spec is needed
- change type
- cross-repo scope
- obvious single-target selection

Those decisions are now explicitly agent-owned. Remaining user-input touchpoints are concentrated around **vision alignment, acceptance, and approval**.
