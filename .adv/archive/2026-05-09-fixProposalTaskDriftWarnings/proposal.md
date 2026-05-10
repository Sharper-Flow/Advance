# Fix proposal-task drift warnings for narrative proposal sections

## Intent

Resolve bug #73: validator should not emit `PROPOSAL_TASK_DRIFT` for narrative proposal sections that are not intended to define task lists.

## Scope

- Inspect proposal parsing and task drift validation heuristics.
- Add regression cases for narrative sections versus explicit task/scope sections.
- Tighten structural detection of task-bearing sections to avoid false positives.
- Preserve real drift detection for task/scope changes.

## Success Criteria

- Narrative proposal sections do not trigger false `PROPOSAL_TASK_DRIFT` warnings.
- Actual task/scope drift remains detectable.
- Regression tests cover narrative and task-bearing sections.
- Relevant checks pass.