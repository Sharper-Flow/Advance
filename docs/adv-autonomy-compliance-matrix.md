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
- `ADV_INSTRUCTIONS.md` → **Autonomy & Quality Ownership** + **Question Tool UX**
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
- pre-existing out-of-scope debt documentation only
- cancellation, archive sign-off, destructive approval
- doom-loop recovery

## Command Matrix

| Command | Agent decides | User confirms |
|---|---|---|
| `/adv-proposal` | summary derivation, overlap detection, change type, impacted specs, new-spec need, cross-repo scope, proposal quality refinement | problem statement matches intended outcome |
| `/adv-discover` | target auto-selection, discovery synthesis, open design questions from evidence | only when design tradeoffs depend on user values |
| `/adv-agree` | target auto-selection, extraction of objectives/constraints from discovery, triage of open questions (technical questions resolved via LBP research), reframing tech questions as outcome questions | agreement contents and edits, user-facing open questions (priorities, behavior, downsides, AC boundaries), explicit deferral of any question |
| `/adv-design` | target auto-selection, design synthesis from research and code; mandatory independent validation via `adv-researcher` (`rq-designval01`) | only when design validator returns CONFLICT (`rq-designval03`); otherwise auto-continue to planning |
| `/adv-present` | target auto-selection, concise design summary; validator verdict display (`rq-designval02`) | design direction approval |
| `/adv-prep` | target auto-selection, gap analysis, task graph synthesis | only when gaps are unresolvable without user intent |
| `/adv-apply` | target auto-selection, worktree reuse, execution start, task sequencing, TDD loop, cross-repo routing | doom-loop recovery, cancellations, scope changes not reflected in the stored contract |
| `/adv-review` | target auto-selection, review execution, remediation of blockers/issues | none by default; review remains agent-led |
| `/adv-accept` | target auto-selection, acceptance summary construction | whether delivered work satisfies the agreement |
| `/adv-harden` | target auto-selection, hardening analysis, default in-scope remediation | none by default; validated in-scope findings must be fixed |
| `/adv-archive` | target auto-selection, archive validation, spec application workflow | archive/sign-off approval |
| `/adv-audit` | spec drift detection and reporting | only if user wants remediation prioritization or debt acceptance |
| `/adv-task` | fast-track synthesis of contract + proposal/discovery/design/planning | quick-contract confirmation, conflicts with recommended direction |
| `/adv-refactor` | target auto-selection, drift analysis | whether implementation drift means “new requirement” vs “bug in code” |
| `/adv-tron` | target auto-resolution, fallback to nearest concrete/broad scope | only if multiple plausible investigations imply materially different intents |
| `/adv-clarify` | question sequencing and synthesis | answers to ambiguity the agent cannot derive |
| `/adv-validate` | target auto-selection, validation run | none |

## Sequential Flow: Pause vs Auto-Continue

ADV pauses for human input ONLY at these explicit checkpoints:

| Checkpoint | Gate | Why |
|---|---|---|
| Proposal confirmation | `proposal` | User confirms problem framing |
| Agreement sign-off | `discovery` | User approves objectives, AC, constraints |
| Design approval (conditional) | `design` | Only when tradeoffs depend on user values; skip for straightforward deterministic designs |
| Acceptance | `acceptance` | User confirms delivered work satisfies agreement |
| Archive sign-off | `release` | User approves final release |
| Cancellation approval | any | Explicit user approval for task/change cancellation |
| Re-entry approval | any | Explicit user approval for scope expansion (`rq-scopeReentry01`); cascade reset preserves existing tasks (`rq-scopeReentry02`) |
| Doom-loop recovery | `execution` | 3 failed attempts, user guidance needed |

**All other clean steps auto-continue:** discovery, deterministic design, prep, apply, review, and harden proceed without prompting the user when no unresolved user-value tradeoff or required approval exists.

## Audit Verdict

**Status as of 2026-04-13: compliant with the current intent.**

The current command contracts no longer instruct agents to ask the user for:
- impacted specs
- whether a new spec is needed
- change type
- cross-repo scope
- obvious single-target selection

Those decisions are now explicitly agent-owned. Remaining user-input touchpoints are concentrated around **vision alignment, acceptance, and approval**.

### Recent Spec Additions Relevant to Autonomy

- **`rq-designval01`** — Design gate requires independent validation pass before completion; validator failure yields INCONCLUSIVE warning, not a block.
- **`rq-designval02`** — Validator verdict (VALIDATED/CAUTION/CONFLICT/INCONCLUSIVE) must appear in `/adv-present` output.
- **`rq-designval03`** — CONFLICT verdict blocks silent auto-continue from design to planning.
- **`rq-scopeReentry01`** — Scope expansions after gate progress require explicit user approval via `adv_change_reenter`.
- **`rq-scopeReentry02`** — Re-entry cascade resets downstream gates while preserving existing tasks and appending audit history.
