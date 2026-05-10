# Fix git mutation guard blocking canonical archive push

## Intent

Resolve bug #102: git mutation guard should not block canonical ADV archive push/update from the default branch when that operation is the intended archive path.

## Scope

- Inspect git mutation guard rules around default-branch writes and archive operations.
- Add regression coverage for allowed canonical archive mutation and blocked unrelated default-branch mutation.
- Fix guard policy to allow the narrow archive path while preserving trunk-is-prod safety.
- Verify archive workflow remains auditable.

## Success Criteria

- Canonical archive push/update from default branch is allowed only for intended archive operation.
- Unrelated/default-branch git mutations remain blocked.
- Regression tests cover allowed and denied cases.
- Relevant checks pass.