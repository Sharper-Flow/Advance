# Discovery Agreement

## Facts

- Issue #73 is open and labeled bug/priority:low.
- Existing issue #63 work already observed proposal drift warnings on narrative `Intent`/`Scope` sections, confirming current validator noise.
- The bug is in drift detection semantics: narrative proposal sections should not be interpreted as task-bearing sections.

## Decisions

- Treat this as validator false-positive reduction, not disabling drift detection.
- Prefer structural detection of task-bearing sections over broad prose heuristics.
- Preserve real drift detection for explicit task/scope changes.

## Risks / Unknowns

- Existing tests may rely on current heuristic output.
- Must avoid hiding actual proposal/task mismatch in sections that intentionally define work.

## Out of Scope

- Broad proposal schema redesign.
- Removing `PROPOSAL_TASK_DRIFT` entirely.