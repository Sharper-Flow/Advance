# Executive Summary: Add Question Note Convention

## Outcome

Shipped an **optional "Note for agent" convention** that lets ADV agents append a synthetic trailing question to the OpenCode `question` tool, giving users a free-form context slot alongside structured answers — without modifying OpenCode core.

## What Changed

| File | Change |
|------|--------|
| `docs/adv-question-tool.md` | New "Note for Agent Convention" section: required shape (`"Note for agent"` header, `"No note"` option), positional parsing, normalization rules (empty/`"No note"`/missing → absent), 5-question cap discipline (4 real + 1 note), non-checkpoint scope |
| `ADV_INSTRUCTIONS.md` § Question Tool UX | One-paragraph reference to the convention with non-checkpoint clarification |
| `plugin/src/question-note-assets.test.ts` | 9 structural assertions enforcing convention presence, header shape, normalization docs, cap docs, non-checkpoint scope |
| `plugin/src/checkpoint-surface-drift.test.ts` | New test case asserting no checkpoint command doc contains the note convention header |

## Key Design Decisions

- **Positional parsing** (trailing question) over write-in piggyback — keeps per-question answers and batch-level notes cleanly separated
- **Optional** — agents add it only when free-form context would help; not every question round gets a note slot
- **Non-checkpoint only** — explicitly excluded from all seven human-checkpoint surfaces via test guard (`rq-inlineApproval01`)

## Verification

- 2345 tests pass (including 9 new asset test assertions + 1 new checkpoint guard)
- `pnpm run check` green (typecheck, lint, format)
- Independent design validator: CAUTION (no conflicts, two doc refinements addressed)

## Recovery Note

Original change `addQuestionComments` hit a Temporal non-deterministic replay error (worker code diverged from 7-hour-old history). Closed and re-tracked as `addQuestionNoteDocs` with full gate chain. Discovered that manually-started Temporal workflows require `projectionChangesDir` in the init input to pass artifact-backed gate readiness checks.
