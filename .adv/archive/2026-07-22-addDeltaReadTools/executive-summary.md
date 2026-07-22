## Outcome

Two read-only tools complete the staged-delta vocabulary: `adv_delta_list` (bounded, paginated summary of staged deltas) and `adv_delta_show` (full single delta by id). They surface the delta ids that `adv_delta_amend`/`adv_delta_retract` require — previously unrecoverable.

## Why It Matters

`completeDeltaTooling` shipped the write side (amend/retract/remove/rename) but those need a `deltaId`, and there was no way to read staged deltas: `adv_change_show` truncates past its ~21k output budget for delta-heavy changes, and prior-session delta ids were lost. Another agent hit exactly this — 3 prior-session staged deltas were unreadable and unfixable. This closes that gap: list → get ids → show → amend/retract.

## Verification

- 52 spec-delta tests (6 new read tests: cross-capability list, capability filter, pagination + hasMore, empty change, show-by-id, unknown-id not-found) + 26 inventory tests pass
- `pnpm run check` green (typecheck/lint/format/schemas/manifests)
- Wired across all 8 parity surfaces; inventory baseline 88→90

## Structural properties

- Read-only — no signal, no reducer, no workflows.ts edit → no replay-determinism concern, minimal merge-conflict risk with the in-flight replaceRecoveryToolSprawl
- Disk-first read — works even when the change workflow is orphaned
- Bounded/paginated output by construction (fixes the truncation gap); no migration

## Risks / Follow-ups
None material. Optional future: target_path read routing (local-only in v1, sufficient for the need).