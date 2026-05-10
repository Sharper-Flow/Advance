# Design

## Plan

1. Add failing tests for representative known categories producing category-specific suggestions.
2. Implement category-to-suggestion mapping with generic fallback only for unknown categories.
3. Ensure output remains concise and actionable.
4. Run focused reflection tests and repo check.

## Contracts

- Known categories get specific guidance.
- Unknown categories still get safe fallback.
- Suggestions should be deterministic and test-covered.

## Test Strategy

- RED category-specific suggestion tests.
- GREEN reflection tests.
- Focused tests plus `pnpm run check`.