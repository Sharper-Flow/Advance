# Discovery Agreement

## Facts

- Issue #97 reports reflection `improvement_suggestions` are generic and not category-actionable.
- Reflection output has known categories; unknown categories still need safe fallback.
- Better suggestions should guide future agents toward concrete process/system improvements.

## Decisions

- Add category-specific suggestion templates for known reflection/friction categories.
- Keep generic fallback only for unknown/unclassified categories.
- Test representative categories.

## Risks / Unknowns

- Existing snapshots/tests may expect generic text.
- Categories may expand later; fallback remains necessary.

## Out of Scope

- Redesigning reflection schema.
- Adding a new query tool.