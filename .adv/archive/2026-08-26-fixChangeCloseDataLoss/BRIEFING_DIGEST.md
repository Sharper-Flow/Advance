# Archive Briefing Digest

**Change ID:** fixChangeCloseDataLoss
**Title:** Fix change close data loss
**Status:** archived
**Generated:** 2026-08-26T20:32:41.053Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | done |

## Epic Context

No Epic membership

## Durable Facts

Showing 16 of 16 durable facts.

- **[report_follow_up]** follow_ups: Close the bulk-close durability hole — store.closeBatch (store-disk.ts:621-680) + sweepClosedChangesFromDisk (disk-sweep.ts:52-81) delete closed records with no durable destination and rq-bulkCloseDiskSweep01 mandates the sweep; currently unreachable (no tool registration, no production sweep caller). Route it through the closed bundle or record explicit retention rationale; update the law when closed bundles land.
- **[report_follow_up]** follow_ups: terminal-history closedPath source + closed case in cross-surface-terminality.invariant.test.ts — terminal-history.ts:378-414 reads closed rows from changes/ only; extend with a paths.closed source when closed records move.
- **[report_follow_up]** follow_ups: Spec delta: close retirement law (rq-closeRetirement equivalent) — no spec requirement governs close durability today; encode bundle→transition→removal MUST ordering for close, mirroring rq-archiveRetirement01.
- **[research_citation]** sources: Close handler (mutation + non-fatal cleanup): coordinateChangeMutation sets status/lifecycleState closed + closure block (:824-849); :859-861 comment asserts durability falsely today; :865 removeChangeDir; cleanup failure is warning-only. (plugin/src/tools/change/handlers-lifecycle.ts:817-885)
- **[research_citation]** sources: changes.get — archive-only fallback (AC2 gap): get resolves via paths.changes then hasArchiveBundle dominance (:497-507) and archive self-heal (:510-526). No closed-bundle probe exists; not-found at :534-538. (plugin/src/storage/store-disk.ts:484-539)
- **[research_citation]** sources: changes.list filter + archived merge site (KD5 lever): effectiveIncludeClosed at :413-414 only widens active-dir enumeration; archived merge at :431-438 is the pattern KD5 mirrors; closed exclusion at :446-448. (plugin/src/storage/store-disk.ts:401-448)
- **[research_citation]** sources.omitted: 17 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Core architecture validated against source at file:line level. The defect is real and shaped as the design states: close writes terminal state to the ACTIVE record (handlers-lifecycle.ts:824-849) then deletes it (:865), with a comment (:859-861) asserting a durability that does not exist. The fix mirrors the two proven retirement patterns (archive bundle at handlers-archive.ts:706-715→973-1025→1124-1130; retired Epics at epic-projection.ts:192). KD levers verified: KD1 (paths json.ts:70-74, mkdir store-disk.ts:175-180), KD2 (json.ts:515-542 scan-fallback cost avoided), KD3 (ordering + readback precedent recovery.ts:26-87), KD5 (merge site store-disk.ts:431-438; effectiveIncludeClosed :413-414 already correct), KD6 (preview :806-816 vs commit :870-877 differ only by dryRun flag + prose — confirmed), KD7 (both noOp branches mutate nothing; completeArchivedBundleRelease guarded by currentProjection.data===null at archive-gate.ts:772-784 — claim accurate), KD8 (doctor-cli.ts:162-173 precedent), KD9 (SKILL.md:37 verified). The sharpest question — KD4 vs C4 — resolves in the design's favor: C4's prohibition is conditional ('while cleanup can destroy the only copy'). After KD3's verified bundle write + DDC1 readback, cleanup cannot destroy the only copy, so non-fatal cleanup failure is lawful and matches archive's existing tolerated zombie-shadow residue (json.ts:506-513; handlers-archive.ts:1124-1130). C4 is satisfied by deactivating its precondition, not by violating it. Spec law: no contradiction found. rq-archiveRetirement01 (+.1/.2/.3, advance-workflow spec.json:1518-1568) — the design mirrors for close the same MUST ordering the spec mandates for archive; KD7's retirement must respect .3 (verify archived before removal) and .2 (repair the existing zombie, never recreate — use the audited writer per prior art). rq-terminalAggregateRead01 (:1571-1574) — KD2's direct probe and KD5's bounded per-directory load are compliant. rq-bulkCloseDiskSweep01 (advance-meta spec.json:1378-1408) still mandates a destructive sweep with no durable closed destination on the currently unreachable bulk path — latent conflict with AC1's intent if re-exposed; update that law when closed bundles land. Gap: no requirement governs close durability today; carry a spec delta in this change. One approved criterion is unsatisfied by the design as written (AC2, by-id lookup — see validation.notes), plus latent surfaces the design does not name: store.closeBatch + sweepClosedChangesFromDisk (a second destructive close path, currently unreachable — no tool registration at tool-registry.ts:777, no production sweep caller), and terminal-history.ts includeClosed enumeration which reads changes/ only (test-only consumer today: cross-surface-terminality.invariant.test.ts).
- **[archive_only_evidence]** decisions: Added loadClosedChanges as an exported store-disk helper. — The task requires the loader, while changes.list and changes.get belong to the next task. Exporting avoids an unused local and gives the next task a direct read primitive.
- **[archive_only_evidence]** decisions: Added paths.closed to the residue scanner allow list. — Store initialization creates this new side-tree, so the existing reconciliation scan must recognize it as configured state rather than report false store noise.
- **[archive_only_evidence]** decisions: Implemented loadClosedChange as a direct loadChange call. — loadChange constructs exactly closed/<changeId>/change.json and performs no sibling enumeration.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: The residue scanner allow-list update was required to prevent the new initialized closed directory from failing an existing storage reconciliation test. No out-of-scope read or close flow was changed.
- **[archive_only_evidence]** verification: bin/oc-test targeted src/storage/json.test.ts (1) — RED: 4 focused tests failed before implementation, including missing closed paths and helper.
- **[archive_only_evidence]** verification: bin/oc-test targeted src/storage/json.test.ts (0) — GREEN: 70 JSON storage tests passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted src/storage/store-disk.test.ts (0) — 22 store-disk tests passed, including fresh closed-directory loading.
- **[archive_only_evidence]** verification: bin/oc-test targeted src/storage/ (0) — Full storage lane passed: 47 files and 474 tests.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- finish_owned_scope_then_report: The residue scanner allow-list update was required to prevent the new initialized closed directory from failing an existing storage reconciliation test. No out-of-scope read or close flow was changed.
