# Discovery Agreement

## Facts

- Issue #62 is open and labeled bug/priority:medium.
- The reported failure is validator false-positive noise from `MISSING_TDD_EVIDENCE` on data/constant tasks.
- Project wisdom notes `MISSING_TDD_EVIDENCE` can fire for non-TDD-applicable work and that reclassification is a current workaround, but this issue asks for structural validator behavior.

## Decisions

- Treat this as validation classification bug, not a request to weaken TDD for behavior changes.
- Preserve strict TDD evidence enforcement for real code behavior tasks.
- Add regression coverage for exempt data/constant tasks and non-exempt behavior/code tasks.

## Risks / Unknowns

- Need code inspection to identify current task type/tdd_intent classification boundaries.
- Must avoid broad heuristics that hide real missing tests.

## Out of Scope

- Removing TDD evidence checks globally.
- Rewriting task classification architecture beyond this false-positive class.