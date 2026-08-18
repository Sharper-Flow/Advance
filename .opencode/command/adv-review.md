---
name: adv-review
description: "Review code for correctness, security, and architecture; emit REVIEW_FINDINGS"
phaseGoal: "Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift."
---
# ADV Review — Acceptance-Stage Deliverable Review
Orchestrate multi-dimensional review of the delivered work. Command is part of the acceptance stage, emits `REVIEW_FINDINGS`, and now carries the post-execution acceptance/sign-off flow directly.
## Exits
| Exit | Condition |
|------|-----------|
| ✅ APPROVED | No blockers/issues; findings emitted and ready for acceptance |
| 🔁 CHANGES_REQUESTED | Issues found → agent fixes → re-verifies |
| 🎤 BLOCKED | Blockers found → user decides |

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select or `question` tool

## Directive Read Protocol
Resolve `{id}` from Target Resolution, then read the typed phase plan:

```text
adv_change_show changeId: {id} include: { phasePlan: true }
```

Branch only on the returned `_phasePlan` projection:

| Decision | Action |
|---|---|
| `_phasePlan.kind === 'actionable'` and `_phasePlan.directive` is present | Execute `_phasePlan.directive.content` as the phase procedure. This read projection never completes gates or grants authority (DONT3). |
| `_phasePlan.kind !== 'actionable'` | Surface the blocking reason. No directive is available; make no gate progress (AC2). |
| Tool error or timeout | Retry up to 2 retries (3 attempts total). After exhaustion, HALT and surface the failure; make no gate progress. Never fall through to reduced-fidelity instructions on a mutating phase (AC3). |
| Retry succeeds with actionable plan and directive | Proceed with the returned directive without user intervention (AC4). |
| Actionable plan with `directive` ABSENT | Treat as version skew: surface a degradation note and use the Inline Fallback below (C4). |

## Inline Fallback
Use only when an actionable plan lacks `directive`. The fallback is deliberately abbreviated and remains a strict verbatim subset of the registered directive.

<!-- FALLBACK BEGIN -->
## Phase 0: Embedded Methodology

**Runtime source:** this embedded section provides the review methodology needed during command execution.

## Phase 1: Pre-flight
### Load Context
`adv_change_show changeId: <target> include: { snapshot: true }` — returns change + rendered gate snapshot in one call. Verify tasks are done — if no implementation, stop: "Run `/adv-apply` first."
### Gate Check
Read gate state from the included snapshot or inspect `gates` field on the response. If execution gate NOT complete → emit REVIEW BLOCKED banner → stop. Fall back to `adv_gate_status` only if a structured per-gate breakdown is needed.

## Phase 2: Spawn Analysis Sub-Agents
TASK EVIDENCE SUMMARY:
  - {task-id}: {title} | {status} | type: {type} | evidence_policy: {evidence_policy} | tdd: {phase}

  Primary: load `skill("adv-frontend-review")` for the canonical 6-dimension methodology.
  Fallback (inline checklist for offline reviewers or older deployments without the skill):
    - semantic HTML & accessibility — semantic elements, landmark structure, ARIA only when native semantics are insufficient, focus management
    - responsive behavior — layout works across supported viewports, touch targets, overflow
    - visual polish — spacing, alignment, typography, color, motion match design tokens already in use
    - matching site design — new UI looks like it belongs with the rest of the page/site, not styled in isolation
    - finer details — hover/focus/active/disabled states, empty/loading/error states, keyboard navigation, copy correctness
    - component correctness — props, state, events, behavior match the intended contract; no regressions in adjacent component behavior
Review/harden ownership remains with `adv-reviewer`; `adv-designer` is apply-phase only and MUST NOT be spawned here.

## Phase 3: Synthesis
> Anti-Loop: after sub-agents → `>>> SYNTHESIS COMPLETE <<<` → aggregate immediately.
### Verdict
| Verdict | Criteria |
|---------|----------|
| BLOCKED | Any `blocker:` |
| CHANGES_REQUESTED | Any `issue:` (no blockers) |
| APPROVED | Only suggestion/nit/none |

### Emit REVIEW_FINDINGS Block
Always emit regardless of verdict:
```
REVIEW_FINDINGS:
change: {change-id}
verdict: {verdict}
reviewed_at: {ISO timestamp}
findings:
  - id: {dimension}-{n}
    label: {label}
    file: {file}
    line: {N}
    what: {what}
    status: {unresolved|fixed|rejected_with_evidence}
    fix_notes: {details}
END_REVIEW_FINDINGS
```

### Finding Routing

<!-- rq-findingRouting01 -->
Out-of-scope findings surfaced mid-lifecycle MUST be routed to a durable backlog-status change with `adv_change_create status: "backlog"` — not reflexive active-change creation, not prose-only notes. Findings in scope for the current change stay in the REVIEW_FINDINGS block; findings outside the change's contract get a durable backlog record.

## Phase 7: Acceptance Sign-Off
### Persist Executive Summary
Before acceptance prompt, persist durable executive summary for non-technical release-approval readers. Translate task/gate evidence into plain English first; keep technical terms only as parenthetical supporting detail. Use evidence-only impact wording: user/business benefit appears only when proposal, agreement, task, review, harden, archive, or follow-up evidence supports it.
3. `adv_change_update changeId: {id} executiveSummary: "{composed markdown}"`
4. Verify: `adv_change_show changeId: {id} include: { executiveSummary: true }` → `_executiveSummary` present and workflow-visible executive-summary artifact metadata exists with content-hash evidence.

### Ask for Acceptance (Inline)
Reply `continue` to proceed, or reply with what to adjust.

**Anchor phrase:** "Reply `continue` to proceed, or reply with what to adjust."

### Complete Gate
On acceptance:
`adv_gate_complete changeId: {change-id} gateId: acceptance`
For completed/poisoned workflow acceptance recovery, `adv_gate_complete` auto-classifies the workflow state internally. The only required human checkpoint fields are `compatibilityReason` and `priorApprovalEvidence`; without both, no disk-projection repair may occur.
`workflowGateStatus: "stuck"` → inspect `readinessBlockers` + `stuckReason`, fix missing/failing contract rows or artifact-generation failures, retry. Do not present acceptance complete until tool succeeds.
<!-- FALLBACK END -->

## Output
Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
What was reviewed and user-accepted.

## Delivered
- Verdict: {APPROVED|CHANGES_REQUESTED|BLOCKED}
- {fix_count} fixes applied
- User acceptance recorded
- {Remaining caveats, if any}

---

> **{change-id}**
> acceptance ✓ → release
>
> → `/adv-harden {change-id}`
```

**Auto-continue:** After user acceptance, immediately begin `/adv-harden` inline. Do not stop or ask "shall I proceed?" — user's acceptance is the go-ahead.
