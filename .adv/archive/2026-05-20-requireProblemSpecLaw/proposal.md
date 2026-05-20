# Require problem spec law

## Why

When a user uses `/adv-problem` to clarify required product/system behavior, ADV should preserve that behavioral conclusion as spec-law intent. If the finding is significant to behavior, the resolution path should require either a concrete spec delta candidate carried into proposal/discovery or an explicit rationale for why no spec law update is needed.

## What Changes

- Add spec-law impact assessment to `/adv-problem` triage output.
- Require direct-fix no-spec-law rationale.
- Default uncertain durable-behavior impact to proposal path.
- Preserve `/adv-problem` read-only boundary.

## Success Criteria

- `/adv-problem` triage summary includes a spec-law impact assessment when expected behavior is clarified.
- Behavior-significant problem findings are handed off as draft spec-delta candidates or explicit no-delta rationale.
- Direct-fix classification remains blocked when spec-law changes are needed.
- Existing `/adv-discover` draft spec delta requirements remain the enforcement point for concrete `rq-*` deltas.

## Affected Code

- `.opencode/command/adv-problem.md`
- `.adv/specs/advance-workflow/spec.json`
- `plugin/src/adv-problem-assets.test.ts` or nearby asset test

## Constraints

- `/adv-problem` remains read-only.
- No ADV state/spec mutation during triage.
- No archive or discovery workflow rewrite.

## Discovery Findings

- Current `/adv-problem` direct-fix guardrails already say `no spec changes`.
- Current output lacks required spec-law impact assessment.
- `/adv-discover` already owns concrete draft spec deltas or no-delta rationale.
- Target delta: `rq-problemSpecLaw01` in `advance-workflow`.

## Scope

### In Scope

- Clarify `/adv-problem` triage contract for behavior-significant expected behavior.
- Add spec law describing the handoff requirement.
- Add regression tests.

### Out of Scope

- Full `adv_delta_add` MCP tool.
- `/adv-problem` state mutation.
- Archive mechanics changes.
- Discovery workflow rewrite.

### Must Not

- Must not allow direct-fix path when spec-law change is required.
- Must not make `/adv-problem` mutate specs or changes during triage.

## AMBIGUITY ANALYSIS

No blocking ambiguity findings. Coverage: B:C F:C S:C M:C

REVIEW_FINDINGS:
change: requireProblemSpecLaw
verdict: APPROVED
reviewed_at: 2026-05-20T05:07:30.000Z
findings:
  - id: logic-1
    label: issue
    file: .opencode/command/adv-problem.md
    line: 52
    what: Behavior-significant direct-fix routing was ambiguous for no-delta defects.
    status: fixed
    fix_notes: Split spec-law change required, no-delta direct-fix, and uncertain branches.
  - id: tests-1
    label: issue
    file: plugin/src/adv-problem-assets.test.ts
    line: 19
    what: Asset test did not lock the routing distinction strongly enough.
    status: fixed
    fix_notes: Added assertions for spec-law-change required, guarded no-delta direct fix, and uncertain not-direct-fix routing.
  - id: quality-1
    label: issue
    file: .opencode/command/adv-problem.md
    line: 54
    what: Uncertain spec-law impact used weak 'prefer' wording.
    status: fixed
    fix_notes: Changed command to MUST NOT classify uncertain impact as direct-fix.
  - id: quality-2
    label: issue
    file: .opencode/command/adv-problem.md
    line: 68
    what: Question-tool-only wording conflicted with read-only code/spec investigation.
    status: fixed
    fix_notes: Clarified question tool applies only to user prompts; read-only search/read tools remain allowed for targeted investigation.
END_REVIEW_FINDINGS
