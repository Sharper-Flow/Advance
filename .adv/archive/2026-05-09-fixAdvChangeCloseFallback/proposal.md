# Fix adv_change_close fallback for terminated workflows

## Intent

Resolve bug #54: `adv_change_close` should handle terminated change workflows via a safe fallback instead of failing outright.

## Scope

- Inspect close/cancel flow for workflow-not-found or terminated workflow states.
- Add regression coverage for closing a change whose workflow is already terminated but projection/state is available.
- Implement a durable fallback path consistent with Temporal-as-authority and existing recovery policy.
- Preserve approval/audit requirements for close operations.

## Success Criteria

- Terminated workflow changes can be closed when policy permits and audit evidence is present.
- Invalid/missing changes still return actionable errors.
- Regression tests cover terminated workflow fallback.
- Relevant checks pass.