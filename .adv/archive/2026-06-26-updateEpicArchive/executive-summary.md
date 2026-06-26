# Executive Summary: Update epic archive

This change makes ADV Epic archive handling structural instead of advisory-only.

## Delivered

- Future Epic child archives now project terminal child state to the parent Epic entry after durable release proof, using the existing Epic terminal-summary signal path.
- Retroactive Epic repair now handles already `archived` or `closed` children in `adv_epic_repair_membership mode=sync_child_projection` by backfilling `terminal_summary` instead of only refreshing membership projection.
- Epic progress can now recompute from terminal summaries so completed child entries can leave active next-work and advance completed/next-entry progress.
- `/adv-archive`, ADV agent guidance, ADV_INSTRUCTIONS, and `advance-epics` spec/docs now require Epic-aware archive verification, typed repair/backfill, and archive report evidence.

## Verification

- `bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/epic.test.ts src/advance-epics-assets.test.ts` passed: 99 tests across 3 files.
- `adv_change_validate strict:true` passed with one non-blocking `NO_DELTAS` warning.
- Independent reviewer verdict: READY; no blockers.
- Contract review matrix: 31/31 rows passing/respected.

## Notes

Public schema artifacts were not touched; schema generation/check was not applicable.