# Fix generic reflection improvement suggestions

## Intent

Resolve bug #97: reflection `improvement_suggestions` should provide category-specific, actionable guidance instead of generic boilerplate.

## Scope

- Inspect reflection generation and suggestion templates/categories.
- Add regression coverage for category-specific reflection suggestions.
- Replace generic fallback guidance with specific prompts per reflection category where possible.
- Preserve safe fallback for unknown categories.

## Success Criteria

- Reflection suggestions are category-specific and actionable for known categories.
- Generic fallback remains only for unknown/unclassified cases.
- Regression tests cover representative categories.
- Relevant checks pass.