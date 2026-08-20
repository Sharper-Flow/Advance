# Archive Briefing Digest

**Change ID:** fixOrphanSummaryShardRows
**Title:** Fix orphan summary shard rows
**Status:** archived
**Generated:** 2026-08-20T01:01:36.862Z

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
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 48 of 48 durable facts.

- **[report_follow_up]** follow_ups: Write-time shard retraction on archive/quarantine (named follow-up, load-bearing for disk hygiene)
- **[report_follow_up]** follow_ups: Reconcile summariesDir orphan enumerator ResidueClass (residue scan currently cannot see orphan shards)
- **[report_follow_up]** follow_ups: countTerminalChanges reads only resolveExternalRoot(projectId)/archive — in-repo .adv/archive layout stores are unreconciled; classifier removes the dependency but the archive-dir divergence deserves its own fix
- **[report_follow_up]** follow_ups: addProviderToolSearch canonical is schema-invalid today (oversized researcher field vs RESEARCHER_FIELD_MAX=12_000) — the change fixes its ghost row but the record itself still needs quarantine/repair
- **[research_citation]** sources: live-status.ts shard filter + loadSummariesFromDisk: Shard-status filter drops archived/closed before emit; CLI then applies a second filter (bin/adv:189) against terminalChangeIds from archive/ scan. (bin/lib/live-status.ts:157-207 (filter at :170))
- **[research_citation]** sources: loadChange outcome enumeration: All outcomes: not_found->{success:true,data:null}; oversized/corrupt/unreadable/read_error->{success:false,type}; Zod fail->schema_error; JSON.parse fail->corrupt. data:null is exclusively the not_found path. (plugin/src/storage/change-projection-reader.ts:366-428; byte limit :35 (8 MiB); bounded reader :107-178)
- **[research_citation]** sources: listSummaryChanges + shard schema + publish: Returns ALL shards, no status filter; only non-test consumer is buildLauncherProjection (launcher-projection.ts:92). Shard status copies canonical status at publish. GC never removes whole summaries/<id> dirs. (plugin/src/storage/change-summary-shard.ts:658-746; status enum :83; deriveSummaryShard :188-216; publish :233-259; GC :754-779)
- **[research_citation]** sources.omitted: 9 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Defect confirmed real: archive never touches summaries/ (no retraction anywhere in plugin/src/archive/), so orphan shards persist forever and loadSummariesFromDisk (live-status.ts:157-207) trusts shard self-reported status with zero canonical cross-check. Read-time validation after the line-170 filter is the right shape and D2's outcome mapping is complete. However D4's placement is structurally impossible as stated, and changing listSummaryChanges in place contradicts its own documented contract and unit test. Both are repairable without abandoning the approach.
- **[archive_only_evidence]** decisions: Placed the classifier beside loadChange and delegated canonical parsing entirely to loadChange. — This keeps one canonical-validation implementation and preserves the existing bounded read, normalization, and schema-error contract.
- **[archive_only_evidence]** decisions: Classified archived and closed canonical records as canonical_terminal before adding other successful records to valid. — A stale non-terminal summary shard must not override a terminal canonical record.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/classify-summary-candidates.test.ts (1) — RED: the new test ran and failed because classifySummaryCandidates was not yet exported.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/classify-summary-candidates.test.ts (0) — GREEN: 1 test file and 1 test passed across valid, missing, schema-invalid, and archived canonical fixtures.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/classify-summary-candidates.test.ts (0) — Final targeted verification passed: 1 test file and 1 test passed.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — TypeScript check passed with tsc --noEmit.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec prettier --check src/storage/change-projection-reader.ts src/storage/classify-summary-candidates.test.ts (0) — Prettier check passed for both touched files.
- **[archive_only_evidence]** decisions: Added summary-candidates-cli.ts as a thin re-export of classifySummaryCandidates and its result types. — Keeps one classification implementation in change-projection-reader.ts and avoids any bin/lib transitive import of plugin/src/storage.
- **[archive_only_evidence]** decisions: Added summary-candidates-cli to plugin/tsup.config.ts rather than changing build:mcp-server or plugin/scripts/build-plugin.ts. — The canonical full build invokes plugin/scripts/build-plugin.ts, which consumes tsup.config.ts; this is the same mechanism that already produces doctor-cli.js.
- **[archive_only_evidence]** decisions: Reserved ADV_SUMMARY_CANDIDATES_CLI_BUNDLE as the environment override name. — It follows the existing ADV_RECONCILE_CLI_BUNDLE and ADV_DOCTOR_CLI_BUNDLE convention. The next task owns the call site.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/classify-summary-candidates-bundle.test.ts (0) — PASS: builds plugin/dist/summary-candidates-cli.js, dynamically imports it, and classifies valid, terminal, and missing canonical projections.
- **[archive_only_evidence]** verification: bun test bin/lib/cli-source-boundary.test.ts (0) — PASS: all 3 unchanged CLI boundary tests pass, including the transitive projection-boundary storage walk.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — PASS: TypeScript typecheck completes with no errors.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/classify-summary-candidates-bundle.test.ts --testTimeout=30000 (0) — PASS: initial implementation verification before final test-timeout cleanup.
- **[archive_only_evidence]** decisions: Kept loadLiveSummaries returning ChangeSummary[] and added loadLiveSummariesWithResidue for the status command. — Preserves existing dashboard consumers while allowing bin/adv to carry residue into the JSON payload.
- **[archive_only_evidence]** decisions: Used summary_residue with excluded entries and an optional validation_unavailable marker. — Keeps corruption separate from the active work list and makes degraded validation explicit.
- **[archive_only_evidence]** decisions: Loaded only the built summary-candidates bundle with env override first and no fallback validator. — Preserves one canonical ChangeSchema implementation and the CLI source boundary.
- **[archive_only_evidence]** verification: bun test bin/lib/live-status-classification.test.ts --timeout 120000 (0) — PASS: 2 tests; excluded rows were suppressed, residue reasons/details matched, and missing-bundle degradation preserved rows with validation_unavailable.
- **[archive_only_evidence]** verification: bun test bin/lib/live-status.test.ts --timeout 120000 (0) — PASS: 3 tests and 11 assertions.
- **[archive_only_evidence]** verification: bun test bin/lib/cli-source-boundary.test.ts (0) — PASS: 3 tests and 38 assertions; CLI source boundary remained clean.
- **[archive_only_evidence]** verification: bun test bin/lib/dead-worker-query-paths.test.ts (0) — PASS: 4 tests and 7 assertions; pinned loader names remain present.
- **[archive_only_evidence]** verification: bunx vitest run src/cli-bridge-contract.test.ts (0) — PASS: 11 tests.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — PASS: TypeScript typecheck completed with no errors.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mt0qm vhr_104760ee
- **[archive_only_evidence]** decisions: Classify IDs after the real listSummaryChanges call and before archive reconciliation. — This preserves listSummaryChanges as a no-hydration shard lister while preventing missing, invalid, and terminal canonical records from entering the launcher projection.
- **[archive_only_evidence]** decisions: Keep the injected readSummaries test seam unclassified. — The seam supplies deterministic projection inputs for transformation tests; production launcher reads use listSummaryChanges and receive canonical classification.
- **[archive_only_evidence]** verification: bunx vitest run src/storage/launcher-projection.test.ts --maxWorkers=4 (1) — RED: genuine assertion failure; orphan missing-change was emitted alongside valid-change before the fix.
- **[archive_only_evidence]** verification: bunx vitest run src/storage/launcher-projection.test.ts --maxWorkers=4 (0) — GREEN: 9 launcher-projection tests passed, including missing canonical exclusion and valid canonical inclusion.
- **[archive_only_evidence]** verification: bunx vitest run src/storage/change-summary-shard.test.ts --maxWorkers=4 (0) — 13 change-summary-shard tests passed unchanged, including the no-canonical list/status coverage at lines 641-709.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — TypeScript typecheck passed with tsc --noEmit.
- **[archive_only_evidence]** decisions: Added an opt-out parameter to writeSummaryProjection and passed false at call site 222. — That test pre-seeds a canonical record with projection revision 21 and 12 tasks; the helper's standard SAMPLE_CHANGE fixture would overwrite the record and invalidate its canonical-count assertions.
- **[archive_only_evidence]** decisions: Added lastSignalAt to generated canonical fixtures. — The rebuild derives summary freshness from canonical lastSignalAt or created_at; a current signal keeps the existing degraded false assertion valid while using the established SAMPLE_CHANGE canonical shape.
- **[archive_only_evidence]** decisions: Registered src/summary-candidates-cli.ts in plugin/knip.json entry. — Knip entry roots explicitly list package scripts and every tsup production bundle entry; the new tsup entry must follow reconcile-cli.ts and doctor-cli.ts.
- **[archive_only_evidence]** verification: bunx vitest run src/tools/launcher-projection.test.ts src/knip-entry-roots.test.ts --maxWorkers=4 (1) — Baseline reproduced exactly two failures: orphan canonical fixture active_count 0 and missing summary-candidates Knip root.
- **[archive_only_evidence]** verification: bunx vitest run src/tools/launcher-projection.test.ts src/knip-entry-roots.test.ts --maxWorkers=4 (0) — Targeted suite passed: 2 files, 7 tests.
- **[archive_only_evidence]** verification: bunx vitest run --maxWorkers=4 (0) — Full plugin unit suite passed; no failures.
- **[archive_only_evidence]** verification: bunx vitest run --maxWorkers=4 --reporter=json --outputFile=/tmp/fix-orphan-summary-full.json (0) — Full-suite counts: 1415 suites passed; 5141 tests passed, 0 failed, 1 pending, 12 todo.
- **[archive_only_evidence]** verification: bun test bin/lib/cli-source-boundary.test.ts (0) — Guard file remained green: 3 pass, 0 fail.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — TypeScript typecheck passed.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_mt0qm vhr_104760ee
