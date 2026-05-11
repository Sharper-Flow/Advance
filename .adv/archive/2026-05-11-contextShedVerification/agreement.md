# Agreement

## Objectives

1. Smart truncation in `adv_run_test`: replace naive head-only truncation with intelligent output selection that prioritizes failure detail, summary stats, and tail over passing-test spam.
2. Signal-per-char optimization: within existing ~2000-char budget, maximize actionable content.
3. All-flow coverage: applies automatically to every `adv_run_test` invocation.

## Acceptance Criteria

1. `adv_run_test` output for failing commands includes extracted failure lines (file:line + message) in returned output — not just first 2000 chars of raw stdout.
2. `adv_run_test` output for passing commands includes final summary/stats lines when present.
3. Total returned output remains bounded at ~2000 chars.
4. Existing `adv_run_test` API surface unchanged — same args, same return shape.
5. TDD red/green evidence semantics unchanged — exit-code validation, `output_snippet` behavior, and `taskCompletedSignal.verification` recording work identically.
6. No new ADV tools introduced — change is internal to `adv_run_test` implementation only.

## Constraints

- C1: No OpenCode core changes
- C2: No new ADV tool surface
- C3: No artifact storage or persistence
- C4: Existing `adv_run_test` API contract preserved
- C5: TDD red/green evidence path unchanged (`rq-TDD008path`)

## Avoidances

- DONT1: Full context-shed with new tool pair + artifact storage
- DONT2: Increasing truncation limit without improving content selection
- DONT3: Structured failure parsing with per-tool adapters
- DONT4: Sub-agent execution or new execution mechanism

## Decisions

### User Decisions

- Evidence fidelity priority: Low
- Token budget pressure: Low
- Implementation appetite: Minimal
- Tool surface expansion concern: Medium
- Coverage requirement: must solve for at least two flows
- Core change constraint: no OpenCode core changes

### Agent Decisions (LBP)

- Smart truncation over full context-shed
- Modify `adv_run_test` internals vs new tool
- Export pure helper for direct tests
- No artifact storage
- Context-shed demoted to future follow-up

## Deferred Questions

(none)

## Sign-Off

Acceptance criteria approved by user. Discovery agreement approved.