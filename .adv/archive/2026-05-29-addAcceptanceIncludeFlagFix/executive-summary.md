# Executive Summary

## What Was Built

Two fixes for the ADV artifact Temporal chain:

1. **`include.acceptance` flag for `adv_change_show`**: Agents can now retrieve acceptance projection content via `adv_change_show include.acceptance`. The `readArtifacts` function already supported all 6 `ArtifactKind` values including `acceptance`, but the tool schema and dispatch block didn't expose it. Added Zod schema field, TypeScript type, description string, dispatch push, and output assignment — exact mirror of the `executiveSummary` include flag pattern.

2. **Resilience fix for `ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING`**: The L1 readiness check in `acceptanceContractBlockers` previously blocked when `state.artifacts.executiveSummary` metadata (path + contentHash) was missing, even when `state.documents.executiveSummary` had content. This caused systematic `ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING` errors because the metadata signal (`updateArtifactMetadataSignal`) could lag behind the content signal (`executiveSummaryUpdatedSignal`) in Temporal processing. The fix checks `state.documents.executiveSummary` as a fallback — if content exists but metadata is missing, the gate no longer blocks. The L2 check (`stateBackedAcceptanceProof`) validates content size and derives evidence from available metadata (path/contentHash are optional in evidence).

## What Was Verified

- 3 new tests: acceptance content retrieval, missing-file graceful omission, resilience fallback
- All 3377 existing tests pass
- `pnpm run check` (typecheck + lint + format:check) passes