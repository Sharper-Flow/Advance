---
name: adv-frontend-review
description: "Frontend/design review methodology — 6-dimension checklist for component correctness, semantic HTML/accessibility, responsive behavior, visual polish, site-design consistency, and finer details"
keywords:
  [
    "adv",
    "frontend",
    "design",
    "review",
    "accessibility",
    "responsive",
    "component",
    "ui",
    "polish",
    "semantic-html",
    "a11y",
  ]
metadata:
  priority: medium
  source: adv-designer-followup
---

# ADV Frontend Review Skill

## Purpose

Canonical methodology for reviewing UI/component work delivered by `adv-designer` (or any frontend implementation, including engineer-implemented UI). Replaces the inline 6-dimension checklist that previously lived in `.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md` Reviewer Remediation Packets.

This skill exists because `addAdvDesigner` deferred the canonical home for the 6-dimension checklist; iteration 1 shipped the inline checklist as a fallback, and this skill is the iteration-2 promotion of that checklist to a discoverable, loadable methodology.

The 6 dimensions are set law — they originate in the `addAdvDesigner` agreement (AC3, DESIGN QUALITY BAR) and are mirrored verbatim by `adv-designer`'s prompt. Don't add, drop, or rename them inside this skill without a coordinated change across `adv-designer.md`, `adv-review.md`, `adv-harden.md`, and `plugin/src/adv-designer-assets.test.ts`.

## When to Load

Load explicitly via `skill("adv-frontend-review")` only when:

1. You are `adv-reviewer` and the Reviewer Remediation Packet `FRONTEND DESIGN REVIEW SKILL` anchor instructs you to.
2. The change has at least one task with `metadata.frontend == "true"` OR an agreement-declared frontend/design scope.

× Do not auto-load this skill when no frontend scope is present — that wastes context budget and dilutes review focus.

× Do not load this skill as `adv-designer` (apply-phase only) or as any other role. Review/harden ownership stays with `adv-reviewer`.

## The 6 Dimensions

Each dimension MUST be assessed when reviewing a change that touches frontend/component code. Use the conventional comment labels from `/adv-review` Phase 0 (`blocker:`, `issue:`, `suggestion:`, `nit:`, `question:`, `praise:`) when emitting findings.

| # | Dimension | What to check |
|---|---|---|
| 1 | Component correctness | Props, state, events, and behavior match the intended contract. No regressions in adjacent component behavior. Side effects scoped. Refs/keys correct. |
| 2 | Semantic HTML & accessibility | Semantic elements over generic `<div>`. Valid landmark structure. Label associations (`<label for>` / `aria-labelledby`). Focus management on dynamic content. ARIA only where native semantics are insufficient. Keyboard reachability. |
| 3 | Responsive behavior | Layout works across the project's supported viewport range. Touch targets meet minimum size. No horizontal overflow on narrow screens. Breakpoints consistent with existing patterns. |
| 4 | Visual polish | Spacing, alignment, typography, color, and motion match design tokens already in use. No magic numbers when tokens exist. Consistent hover/focus/active/disabled states. Loading and empty states styled. |
| 5 | Matching site design | New UI looks like it belongs with the rest of the page/site, not styled in isolation. Reuses existing component primitives. Doesn't introduce a parallel design system without explicit approval. |
| 6 | Finer details | Hover/focus/active/disabled states defined and visible. Empty/loading/error states implemented. Keyboard navigation works. Copy is correct (spelling, tense, sentence case vs title case per project convention). No console warnings introduced. |

### Per-Dimension Verdict

Record each dimension as `pass | concern | n/a` in your `REVIEWER_REPORT.changes_made` / `blocking_findings` / `nonblocking_findings` narrative. When a dimension is `n/a` (e.g., backend-only PR misclassified as frontend), say why in the report so the misclassification is visible.

## Ownership Boundary

- `adv-reviewer` owns review and harden gates. This skill provides methodology only — it does NOT reassign ownership.
- `adv-designer` is apply-phase only (per `addAdvDesigner` agreement). It MUST NOT be spawned for review or harden remediation. If you find yourself wanting to delegate a fix to `adv-designer` during review, you are operating outside the contract — either fix inline (as `adv-reviewer` with scoped repo-write capability) or surface the fix as a follow-up task that re-enters the apply gate.
- For backend findings in a mixed change, route remediation through `adv-engineer`, not `adv-designer` — backend ownership belongs to engineer regardless of the change's frontend scope.

## Anti-Patterns

- **Auto-loading without packet instruction.** This skill should only load when the reviewer packet explicitly references `skill("adv-frontend-review")`. Loading speculatively wastes context.
- **Broadening scope to redesign.** Findings should evaluate the delivered work against the 6 dimensions. They should not propose new features or redesigns that weren't in the agreement's frontend scope.
- **Overriding apply-phase designer decisions.** If `adv-designer` made a documented decision in `DESIGNER_REPORT.decisions[]`, treat it as the implementer's intent. Findings should challenge correctness/quality, not preference. Use `question:` label when the decision needs explanation rather than `issue:` when the decision is defensible.
- **Treating the 6 dimensions as exhaustive.** If a finding falls outside the 6 dimensions but is still a real review concern (e.g., security, performance, error handling), use the standard `/adv-review` 12-dimension framework and emit normally. This skill enriches frontend coverage; it does not replace the broader review.
- **Pinning iteration-1 inline checklist as canonical.** The inline checklist in the Reviewer Remediation Packet is a fallback for older deployments that haven't pulled this skill. New deployments should treat this skill as authoritative and the inline fallback as a duplicate maintained for compatibility.

## Coordination Notes

If a future change wants to add or change a dimension, update all of:

1. `skills/adv-frontend-review/SKILL.md` (this file)
2. `.opencode/command/adv-review.md` Reviewer Remediation Packet inline fallback
3. `.opencode/command/adv-harden.md` Reviewer Remediation Packet inline fallback
4. `.opencode/agents/adv-designer.md` DESIGN QUALITY BAR section
5. `plugin/src/adv-designer-assets.test.ts` dimension-enumeration test
6. `plugin/src/adv-reviewer-asset.test.ts` packet anchor assertion

Skip any of these and drift will surface as a failing asset test.
