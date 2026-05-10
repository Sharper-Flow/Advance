# Discovery Agreement

## Facts

- Issue #63 is open and requests `adv_change_validate strict:true` to pass when findings are warnings-only.
- Current issue acceptance explicitly asks for an optional `strictWarnings: true` mode for callers that need warnings-as-errors behavior.
- Existing `prep-readiness/rq-PR005gat` already distinguishes must failures from advisory warnings: warnings do not block planning-gate completion.
- `prep-readiness/rq-PR001sml` defines smell checks as advisory warnings because heuristics can false-positive.
- `adv_change_validate` is a workflow validator used before gate/archive decisions, so pass/fail semantics must remain structural: errors block, warnings are surfaced but non-blocking unless an explicit opt-in flag changes policy.

## Decisions

- Treat warnings-only strict-mode failure as a bug in result aggregation, not a desired strict contract.
- Add an explicit optional `strictWarnings` argument to preserve warnings-as-errors behavior for any caller that truly needs it.
- Keep default `strict:true` meaning "run strict checks" while pass/fail is based on blocking severity.
- Add regression coverage for warnings-only, errors-present, and strictWarnings opt-in combinations.

## Risks / Unknowns

- Need code inspection to find all `passed` calculations and any callers that assume strict means warnings fail.
- Tool argument schema and TypeScript types may need update in one or more files.
- Existing tests may encode current buggy behavior and need updated expected output.

## Out of Scope

- Reclassifying existing warning codes as errors except where separately justified.
- Changing planning-gate readiness enforcement beyond aligning with existing warning/non-blocking contract.
- Broad validator redesign.