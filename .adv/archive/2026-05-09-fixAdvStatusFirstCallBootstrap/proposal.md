# Fix adv_status first-call bootstrap nondeterminism

## Intent

Resolve bug #56: `adv_status` first-call bootstrap should be deterministic and not race against scoped ADV instruction loading (`TMPRL1100`).

## Scope

- Inspect status bootstrap and instruction-load ordering/race boundaries.
- Add regression coverage or deterministic harness for first-call status behavior.
- Fix initialization ordering, retry, or readiness checks to avoid nondeterministic first-call failure/noise.
- Preserve scoped instruction loading behavior.

## Success Criteria

- First `adv_status` call is deterministic under normal startup conditions.
- Scoped ADV instruction loading remains intact.
- Regression tests or verification cover the race path.
- Relevant checks pass.