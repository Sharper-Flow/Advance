## Objectives

1. Preserve cross-project owner protection.
2. Reduce repeated disk reads by caching successful owner validation per store input + change ID.
3. Avoid caching ownerless and mismatch cases in ways that could mask newly-populated ownership or unsafe project use.

## Acceptance Criteria

| AC | Statement | Verification |
|----|-----------|--------------|
| AC1 | Same input/change with matching owner reads legacy once across two guarded calls | Unit test |
| AC2 | Same input/change returns Temporal handle on every call (handle lookup remains fresh) | Unit test |
| AC3 | Mismatched owner still throws `AdvProjectContextMismatchError` | Unit test |
| AC4 | Ownerless change remains compatible and passes through | Unit test |
| AC5 | Ownerless case is not permanently cached as safe | Unit test or implementation review |
| AC6 | `pnpm run check` passes | Verification task |
| AC7 | targeted shared tests pass | Verification task |

## Dependencies

None.