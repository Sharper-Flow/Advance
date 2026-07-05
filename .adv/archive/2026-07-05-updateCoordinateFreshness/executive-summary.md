# Executive Summary: Update Coordinate Freshness

## What Changed

`/adv-coordinate` now treats current repository state as first-class evidence before making Epic/change alignment recommendations.

Implemented surfaces:

- `.opencode/command/adv-coordinate.md`
  - Adds Repository Freshness Audit before alignment/sequencing decisions.
  - Adds Current Repository Overlap Audit.
  - Requires evidence labels: `repo_backed_fact`, `adv_backed_fact`, `judgment_call`, `freshness_limited`.
  - Requires freshness-limited reporting when repo evidence is unavailable.
  - Forbids merge/rebase/checkout/reset/clean/stash/product-code mutation during freshness discovery.
- `.adv/specs/advance-epics/spec.json`
  - Adds `rq-epicCoordinateRepoFreshness01` as spec law.
- `docs/specs/advance-epics.md`
  - Mirrors new spec requirement.
- `plugin/src/advance-epics-assets.test.ts`
  - Adds regression coverage for repository freshness, overlap, failure behavior, labels, and no-mutation boundaries.

## Verification

- `bin/oc-test targeted -- src/advance-epics-assets.test.ts` passed after implementation.
- Same targeted test passed after reviewer strengthened assertions.
- Independent reviewer verdict: READY; no blocking findings.
- Contract review matrix: 17/17 pass/respected.

## Remaining Concerns

None for accepted scope. Broader full-suite/pre-release checks may still be run before archive if desired.