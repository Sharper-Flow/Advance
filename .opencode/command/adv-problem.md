---
name: adv-problem
description: "Triage defects and unintended behavior before fixing or drafting a proposal"
---

# ADV Problem — Collaborative Issue Triage Before Fix

Investigate a bug, failure, or confusing behavior before deciding whether it is a trivial direct fix or proposal-sized change. Fully collaborative. Read-only with respect to ADV state.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** one triage classification — symptom restatement, evidence gathered by tier, leading hypothesis, spec-law impact, guardrail assessment, and a recommended exit path.

**Reads:** specs, codebase, sub-agent output, user uploads.

**Creates nothing.** Does not mutate ADV state.

**Persistence:** Conversational triage; RCA carries forward via `## Root Cause Analysis` in the proposal projection (`change.documents.proposal`) through `adv_change_update proposal` when defect path taken, otherwise ephemeral.

**× MUST NOT:** create change, create tasks, complete gates, or silently turn triage into fix implementation. This command does not call `adv_change_create`, `adv_gate_complete`, or `adv_task_add` directly.

**Gate:** None.

## Exit Paths

| Exit | Condition |
|---|---|
| trivial-direct-fix | Evidence suggests a trivial fix and user explicitly approves fixing now |
| /adv-proposal | Scope looks larger, riskier, more systemic, or any direct-fix guardrail fails |
| iterate | Tiers 1–3 narrowed the issue, but evidence is still incomplete |
| stop | User chooses to stop after triage |

## Phase 0: Embedded Methodology

Sub-agent resilience follows the canonical retry + fallback chain in `adv-research.md:111-135`. If a dispatched sub-agent returns empty, failed, or inconclusive: retry once with the same prompt; if the retry also fails, fall back to inline research using Context7 for official docs, Exa web search for community guidance and current best practices, and searchcode code search for real-world implementation patterns. Emit findings with the same `VALIDATION:` / `RECOMMENDATION:` structure and never skip a research question.

---

## Phase 1: Frame

1. Restate the reported issue in one sentence.
2. Capture symptoms, observed behavior, expected behavior, frequency, environment, and recent changes.
3. Ask for the strongest available evidence first: error text, reproduction steps, affected paths, or scope clues.

## Phase 2: Tier 1 — Local evidence

Dispatch a Task-tool subagent for code/log investigation in the repo:

- Use `subagent_type: explore` for code structure, hotspots, and existing patterns.
- Use `subagent_type: general` for mixed topics or when the right tool is unclear.

The subagent should return relevant context, not a final decision. Apply the resilience protocol from Phase 0 if the result is empty or failed.

## Phase 3: Tier 2 — External evidence

Dispatch `adv-researcher` when the symptom touches a runtime, library, framework, API, or ecosystem surface. Carry `validation.status` through to the summary:

- `pass` — findings support a clear local root cause
- `caution` — findings are viable but carry noted risks or tradeoffs
- `fail` — findings contradict the leading hypothesis or surface a blocker
- `unknown` — not enough evidence; mark as a research gap

## Phase 4: Tier 3 — User uploads

Only when Tiers 1 and 2 are inconclusive, ask the user for logs, screenshots, traces, or reproduction artifacts.

- Run secret detection regex before persistence: scan for API keys, tokens, connection strings, and other credential-like patterns.
- User-uploaded logs persist only ephemerally in the session transcript; do not write them to disk or ADV state.

## Phase 5: Spec-law assessment

When triage clarifies expected durable product/system behavior, include **Spec-law impact**:

- **Spec-law change required** — route to `/adv-proposal` with a draft spec-delta obligation.
- **No spec law update required** — direct fix remains allowed only when all direct-fix guardrails pass; state the rationale explicitly.
- **Uncertain** — uncertain spec-law impact MUST NOT be direct-fix; route to `/adv-proposal` or keep investigating until impact is clear.

`/adv-problem` remains read-only: it MUST NOT create changes, tasks, gates, or spec deltas directly.

## Phase 6: Triage classify

Apply the direct-fix guardrails. Surface each guardrail and its result; do not make opaque scope decisions.

Only treat the outcome as a trivial-direct-fix candidate when all are true:

- no more than 2 files likely touched
- no spec changes
- no cross-repo work
- no breaking API / contract change
- no new dependency
- user explicitly approves moving from triage to fix work

If any guardrail fails, the next step is `/adv-proposal`, not direct fix.

## Phase 7: Exit

Propose exactly one exit path:

- **trivial-direct-fix** — hand off to normal fix work outside this command (user approved)
- **/adv-proposal** — scope is larger, riskier, systemic, any guardrail fails, or spec-law impact is uncertain/change-required
- **iterate** — list the next 1–3 concrete evidence gaps or experiments
- **stop** — user chooses to stop after triage

The exit is a handoff recommendation only.

## Output

Emit a compact triage summary:

- Restated symptom
- Evidence gathered by tier (Tier 1 / Tier 2 / Tier 3)
- Leading hypothesis / ruled-out paths
- Spec-law impact
- Guardrail assessment
- Recommended exit path and next command
- Root cause (if defect origin) — when the issue is a defect/bug/regression, attach a Root Cause Analysis (RCA) section that downstream `/adv-proposal` or `/adv-task` invocations MUST carry forward (per rq-defectOriginRca01). RCA shape reuses the bullets above; if `/adv-problem` already ran, its output IS the RCA.

## Anti-Patterns

- × no sub-agent dispatch — skipping Tier 1 or Tier 2 and synthesizing without codebase or ecosystem context
- × silent state mutation — Phase 7 exits that invoke `adv_change_create`, `adv_gate_complete`, or `adv_task_add` directly
- × opaque scope decisions — Phase 6 triage classify without surfacing the guardrails
- × unjustified direct-fix recommendation — recommending direct-fix when any guardrail fails; route to `/adv-proposal` instead
