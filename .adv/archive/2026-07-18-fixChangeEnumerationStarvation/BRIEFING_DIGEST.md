# Archive Briefing Digest

**Change ID:** fixChangeEnumerationStarvation
**Title:** fix change enumeration starvation
**Status:** archived
**Generated:** 2026-07-18T21:03:06.810Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Showing 100 of 114 durable facts (14 omitted).

- **[archive_only_evidence]** decisions: Implemented active-only conflict authority in changes.ts rather than index.ts — The Store changes method surface is the natural contract owner; index.ts remains the composition root and the terminal-history path is left untouched for its own task.
- **[archive_only_evidence]** decisions: Reverted the direct archive-bundle load change in index.ts and removed the associated regression test from bounded-read-deadline.test.ts — That optimization belongs to the bounded terminal-history rendering task (tk-cf6eed0b52b9); it altered terminal-history behavior owned by a later task and broke two existing deadline tests.
- **[archive_only_evidence]** decisions: Used loadChange(legacy.paths.changes, id) directly instead of legacy.changes.get — legacy.changes.get performs archive-bundle dominance/self-heal reads, which violates the active-authority zero-archive-read contract.
- **[archive_only_evidence]** decisions: Used getChangeHandle instead of getGuardedChangeHandle for the optional workflow fallback — getGuardedChangeHandle triggers disk owner-guard reads that can touch archive; the authority needs a lightweight, capped workflow query.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, manifest, test isolation, lockfile policy, lint, and format all pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/ src/tools/change/validation-projection.test.ts (0) — All 166 targeted tests pass (154 store-temporal + 12 validation-projection)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/active-conflict-authority.test.ts src/tools/change/validation-projection.test.ts (0) — All 21 authority and validation-routing tests pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/ src/tools/change/validation-projection.test.ts
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/active-conflict-authority.test.ts src/tools/change/validation-projection.test.ts (0) — adv_run_test tr_mrqo85cv_36f02103 passed: 22 tests.
- **[report_follow_up]** follow_ups: Pre-existing uncommitted change plugin/src/storage/store-temporal/active-conflict-authority.test.ts is unrelated to this task; leave it for its owning task.
- **[archive_only_evidence]** decisions: Created a dedicated plugin/src/archive/terminal-summary.ts module for the Zod schema, builder, serializer, and validators. — Keeps the archive bundle format cohesive, testable, and discoverable next to the archive orchestrator.
- **[archive_only_evidence]** decisions: Refactored createArchive and createInRepoArchive to share a single writeArchiveBundleFiles helper. — Guarantees both destinations emit the same generated files and eliminates duplication that would drift.
- **[archive_only_evidence]** decisions: Validated the archived Change with ChangeSchema.parse before deriving the terminal summary. — Satisfies the 'same validated archived Change' requirement and catches malformed test/prod data early.
- **[archive_only_evidence]** decisions: Bound summary.v1.json to change.json via SHA-256 change_hash and added a self-check summary_hash. — Lets future readers verify summary integrity and binding without re-parsing the full change record.
- **[archive_only_evidence]** decisions: Skipped GENERATED_BUNDLE_FILES during sibling copy in both archive destinations. — Prevents source change files from clobbering generated bundle artifacts like the terminal summary or digest.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest check, test isolation, lockfile policy, ESLint, and Prettier all pass.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/archive/ (0) — All 49 archive tests pass.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/archive-release-finalization-assets.test.ts src/archive-branch-cleanup-assets.test.ts src/temporal/archive-activity.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts (0) — All 61 related archive/phase-9 tests pass.
- **[archive_only_evidence]** decisions: Changed `renderTerminalHistory` to accept a single options object `{ archivePath, changesPath, includeArchived, includeClosed, deadline }` — Matches the call site in `listSummary` and keeps archive/changes paths and filters explicit without positional argument juggling.
- **[archive_only_evidence]** decisions: Kept active rows resolved under the default 8s `listResolvedChanges` deadline while terminal rows use a separate 20s deadline — Preserves active conflict-authority budget and prevents large terminal history from starving active enumeration.
- **[archive_only_evidence]** decisions: Left content-filter-only requests on the existing full `listResolvedChanges` path — Avoids regressing search behavior that depends on full Change hydration; terminal render only replaces terminal-only list paths.
- **[archive_only_evidence]** decisions: Did not modify `store.changes.list` (authoritative validation path) — Keeps the fix scoped to the warm `listSummary` read model; authoritative validation remains unchanged.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript compiles with no errors.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest generation, test isolation, lockfile policy, lint, and format checks all pass.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/archive/terminal-history.test.ts --reporter=verbose (0) — 31 tests pass, including the updated terminal-history integration test in changes.test.ts.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts src/archive/terminal-summary.test.ts --reporter=verbose (0) — 196 related tests pass with no regressions.
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke suite passes (68 tests).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/archive/terminal-history.test.ts --reporter=verbose
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts src/archive/terminal-summary.test.ts --reporter=verbose
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/archive/terminal-history.test.ts src/archive/terminal-summary.test.ts (0) — adv_run_test tr_mrqo84np_e7f21714 passed: 44 tests.
- **[archive_only_evidence]** decisions: Added a benchmark-only `concurrency` option to `listConflictAuthority` so the fixture can vary fact-load concurrency across 1/2/4/8. — The design-specified benchmark matrix requires testing different concurrency levels; production behavior remains the default concurrency of 4.
- **[archive_only_evidence]** decisions: Used the capped workflow-fallback path with vitest fake timers to simulate 50 poisoned active records deterministically. — Fake-timer-based simulation avoids non-deterministic wall-clock timing in CI while still exercising the deadline/concurrency envelope. The fallback is capped at 1,000ms, matching the production fail-safe.
- **[archive_only_evidence]** decisions: Measured simulated completion time via the last query-completion timestamp under fake timers rather than `Date.now()` after a large advance. — A single large timer advance would advance `Date.now()` past the actual completion time, so recording the completion timestamp inside the mock query gives an accurate deterministic duration.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/active-conflict-authority.test.ts src/storage/store-temporal/active-conflict-authority-benchmark.test.ts (0) — 13 tests passed (9 functional + 4 benchmark concurrency levels)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifests:check, test isolation, lockfile policy, lint, and format:check all passed
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/active-conflict-authority.test.ts src/storage/store-temporal/active-conflict-authority-benchmark.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/active-conflict-authority.test.ts src/storage/store-temporal/active-conflict-authority-benchmark.test.ts (0) — adv_run_test tr_mrqo85l8_0ba90df8 passed: 14 tests.
- **[archive_only_evidence]** verification: bin/oc-test full (0) — adv_run_test tr_mrqmm4j8_43abb048 passed.
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; research proceeded from the explicit user objective as permitted, without inferring missing scope anchors.
- **[report_follow_up]** follow_ups: Episode recall returned no authoritative project evidence relevant to this decision; no recalled content was used.
- **[report_follow_up]** follow_ups: Local lgrep semantic search timed out twice (including hybrid:false fallback); exact local text search and direct reads of known source files supplied evidence.
- **[research_citation]** sources: Current validation inventory projection: Validation currently requests archived and closed rows, treats deadline/bound metadata as non-conclusive, treats degraded terminal sources as degraded, and fails clean conclusions when active peer capabilities are absent. (file:///home/jon/dev/advance/plugin/src/tools/change/validation-projection.ts#L101-L219)
- **[research_citation]** sources: Authoritative read and cache spec law: Current MUST requirements impose one 8-second aggregate deadline on adv_change_list/adv_status, require typed source attribution, preserve active fast paths, and forbid cache warmth from establishing completeness. (file:///home/jon/dev/advance/.adv/specs/advance-workflow/spec.json#L1348-L1514)
- **[research_citation]** sources: Terminal dominance and canonical deduplication spec law: Current MUST requirements make durable terminal projections dominate stale active shadows, require canonical change.json.id deduplication, and preserve a distinct active-list fast path with correctness invalidation exceptions. (file:///home/jon/dev/advance/.adv/specs/advance-workflow/spec.json#L1276-L1346)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Core split is directionally correct: terminal rows are contextual for conflict checks, while active authority must remain complete and fail closed. Versioned summaries with bundle fallback and concurrent independent source enumeration are simple extensions of existing patterns. Design is not implementation-ready, however. No spec deltas are persisted, while current MUST laws explicitly require includeArchived conflict inventory and one 8-second deadline for adv_change_list/adv_status. Active-only authority also lacks a precise source/completeness algorithm that preserves terminal-shadow invalidation. Proposed summary fields do not cover the existing list-row compatibility surface, and version validation alone does not establish summary/bundle coherence. Benchmarking has no measurable enablement threshold or fixed-budget selection rule.
- **[unresolved_action]** validation.blockers: Persist explicit spec deltas before approval: reconcile active-only validation with rq-disc04's includeArchived requirement, and reconcile the larger history-view budget with rq-boundedAuthoritativeRead01's single 8,000 ms requirement. The change currently has no deltas.
- **[unresolved_action]** validation.blockers: Define active-authority completeness structurally: enumerate authoritative active candidate sources, preserve stale terminal-shadow invalidation/dominance, require capabilities for every non-own active peer, and map each source/candidate omission to fail-closed typed evidence.
- **[unresolved_action]** validation.blockers: Define terminal-summary schema and coherence contract against the full ChangeListResponse/ChangeSummary compatibility surface, including required currentGate/created_at/lastActivityAt/task counts and decisions for lifecycle, lineage, ops follow-up, Epic membership, and capabilities. Specify write ordering and stale-but-valid summary handling, not only corrupt/missing fallback.
- **[unresolved_action]** validation.blockers: Define benchmark protocol and pass thresholds before enabling source concurrency or choosing the larger history budget: fixture shape, cold/warm runs, concurrency candidates, measured percentile/sample count, maximum regression, and deterministic correctness tests must be explicit.
- **[report_follow_up]** follow_ups: Prior-consideration/conflict-scan data was not supplied. Candidate prior_consideration='new' is scoped to supplied draft plus current-code inspection, not archive-history proof.
- **[report_follow_up]** follow_ups: No user-value tradeoff identified for any candidate; all recommendations remain within approved agreement.
- **[research_citation]** sources: Current validation projection: Current projection calls generic changes.list with terminal inclusion, then infers completeness by decoding generic warning and hydration metadata. (file:///home/jon/.local/share/opencode/worktree-adhoc/advance/fix-enum-starvation/plugin/src/tools/change/validation-projection.ts#L60-L218)
- **[research_citation]** sources: Current summary list implementation: Shows terminal requests falling back to full list hydration, repeated list-row mapping, deadline bookkeeping, and cache/memo/full-change normalization. (file:///home/jon/.local/share/opencode/worktree-adhoc/advance/fix-enum-starvation/plugin/src/storage/store-temporal/changes.ts#L789-L1157)
- **[research_citation]** sources: Current archive writers: External archive writer atomically writes change.json then copies sibling files while reserving only change.json. (file:///home/jon/.local/share/opencode/worktree-adhoc/advance/fix-enum-starvation/plugin/src/archive/archive.ts#L816-L895)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Draft architecture is directionally correct: it separates authoritative active inventory from non-authoritative terminal history, preserves bounded reads, and adds a validated lightweight terminal representation with legacy fallback. Four low-to-medium-risk leverage refinements reduce duplicated policy and make completeness, row normalization, bundle parity, and deadline degradation structural rather than inferred.
- **[report_follow_up]** follow_ups: Implementation verification should cite Temporal list pagination and assert the active query is exhausted before completeness becomes complete.
- **[report_follow_up]** follow_ups: Treat lifecycleState as required for newly written TerminalSummaryV1 if the final schema can do so without breaking the existing optional legacy row contract; otherwise document why terminal status alone is the coherence discriminator.
- **[research_citation]** sources: Persisted agreement and revised design: Agreement fixes active-only fail-closed authority, bounded history degradation, compatibility, and cache non-authority; persisted design maps each objective and acceptance criterion to explicit contracts and tests. (adv://change/fixChangeEnumerationStarvation/artifacts)
- **[research_citation]** sources: Persisted advance-workflow deltas: Exact deltas rq-archiveInventoryActive01, rq-terminalSummary01, and rq-terminalHistoryBudget01 define active-only 8-second authority, coherent versioned summaries with one legacy fallback, and explicit 20-second partial history. (adv://change/fixChangeEnumerationStarvation/deltas/advance-workflow)
- **[research_citation]** sources: Discovery conflict-scan law: Requires separate includeArchived related context plus validation, complete typed inventory, and no clean result from degraded authority. (adv://spec/adv-discover/rq-disc04)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The revised design cleanly separates authoritative active conflict membership/facts from non-authoritative terminal rendering. It closes the current coupling where validation requests archived/closed rows through the mixed resolver, preserves rq-disc04 by keeping archived discovery context separate, and makes incompleteness structural rather than inferred from warnings or cache warmth. Exact persisted deltas now cover authority, summary coherence/fallback, and the narrow history-budget exception. The active algorithm defines mandatory filtered Visibility membership, complete candidate fact resolution, typed mismatch/failure evidence, and aggregate/per-candidate deadlines. The archive design replaces duplicated writers with one schema/adaptor/writer boundary, reserves generated names, uses change.json as a commit sentinel, and retains legacy readability. History degradation, canonical merge, terminal dominance, and the benchmark envelope are measurable. No design blocker found.
- **[report_follow_up]** follow_ups: Packet supplied identity anchors but omitted explicit TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION sections; research continued using the stated objective, with no scope inferred beyond it.
- **[report_follow_up]** follow_ups: When revising the oracle clause, bind it to the actual public ChangeListResponse schema at implementation time so future additive fields are included automatically rather than maintaining a duplicated prose field list (file:///home/jon/dev/advance/plugin/src/types/responses.ts#L91-L129).
- **[research_citation]** sources: Revised ADV design artifact: Defines active-only validation authority, canonical-ID terminal reconciliation, summary.v1 hash/version/fallback, 8s and 30s budgets, full-response oracle, and 30-cold/30-warm benchmark matrix. (adv://change/fixChangeEnumerationStarvation/design)
- **[research_citation]** sources: Current validation projection: Current validation still requests includeArchived/includeClosed and derives authority from the mixed list response. (file:///home/jon/dev/advance/plugin/src/tools/change/validation-projection.ts#L101-L219)
- **[research_citation]** sources: Current resolved enumeration: Current implementation unions memo, Temporal Visibility, active disk, and archive directory IDs, then hydrates mixed candidates under one deadline and deduplicates loaded rows by canonical ID. (file:///home/jon/dev/advance/plugin/src/storage/store-temporal/index.ts#L801-L1217)
- **[research_citation]** sources.omitted: 8 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The high-level split is correct: active conflict authority remains fail-closed, terminal history becomes non-authoritative, and version/hash-checked summaries fall back to durable bundles. Temporal's official surfaces support separating Visibility enumeration from potentially failing Workflow queries (https://docs.temporal.io/visibility; https://github.com/temporalio/sdk-typescript/blob/main/packages/client/src/workflow-client.ts). However, revised design is not yet exact enough to implement safely. Blocker 1: it says to publish a bundle marker after summary publication but never names or schemas that marker, while current code treats change.json itself as the archive sentinel and publishes it first (file:///home/jon/dev/advance/plugin/src/storage/json.ts#L938-L973; file:///home/jon/dev/advance/plugin/src/archive/archive.ts#L813-L898). New-v1 visibility, crash states, and legacy marker compatibility therefore remain ambiguous. Blocker 2: summaryHash is included but reader acceptance only requires version 1 and matching bundleChangeHash; hash input/canonicalization, exclusion of summaryHash itself, and summaryHash verification are unspecified, so the field does not provide a testable integrity invariant. Blocker 3: 'durable' publication lists file fsync and rename but omits parent-directory fsync or an explicit weaker durability claim; current helper has the same gap (file:///home/jon/dev/advance/plugin/src/utils/fs.ts#L27-L60), while a verified TypeScript pattern syncs the parent after rename (https://github.com/gregpriday/json-store/blob/develop/packages/sdk/src/io.ts). POSIX rename provides atomic namespace replacement, not the design's fully specified crash-durability protocol by itself (https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html). The 8s/30s separation, complete-response differential oracle, 50+50 fixture, concurrency matrix, 30 cold/30 warm samples, nearest-rank p95, zero-omission condition, and p95<=6.4s threshold are concrete and testable as regression contracts; deterministic deadline tests appropriately remain separate.
- **[unresolved_action]** validation.blockers: Define the final publication marker: exact filename/schema, creation sequence, reader visibility rule for new v1 bundles, crash-state behavior, and compatibility rule for legacy change.json-only bundles.
- **[unresolved_action]** validation.blockers: Define summaryHash precisely: exact byte serialization, exclusion rule for the self-referential field, verification behavior, and typed fallback/degradation on mismatch; define bundleChangeHash as hash of exact persisted change.json bytes or specify one canonicalization algorithm.
- **[unresolved_action]** validation.blockers: Make publication durability exact: require parent-directory fsync after each visibility-changing rename (with explicit platform/error policy), or weaken the claim from crash-durable to atomic reader visibility and test only that claim.
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; review used the explicit user scope and records this packet-contract warning without inferring missing anchors.
- **[report_follow_up]** follow_ups: Add fault-injection tests at: before/after change temp sync, after change rename before directory sync, after sentinel durability before summary, after summary rename before directory sync, and after creation of a new bundle directory before archiveDir sync.
- **[report_follow_up]** follow_ups: Specify whether unsupported directory fsync is a hard error under strict durability; recommended behavior is fail publication with typed environmental error rather than silently downgrade.
- **[research_citation]** sources: Revised ADV design: Keeps change.json as sentinel, adds optional summary.v1.json with base/summary hashes, separates 8s archive authority from 30s history rendering, and defines oracle/benchmark coverage. (adv://change/fixChangeEnumerationStarvation/design)
- **[research_citation]** sources: Current archive writer: Writes change.json through atomicWriteFile before other bundle artifacts; archive directory may be created implicitly. (file:///home/jon/dev/advance/plugin/src/archive/archive.ts#L816-L899)
- **[research_citation]** sources: Current atomic-write helper: Writes and fsyncs a sibling temp file, closes it, and renames it, but does not fsync the containing directory. (file:///home/jon/dev/advance/plugin/src/utils/fs.ts#L27-L60)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Core shape is sound: change.json remains sole authority/sentinel; summary is optional acceleration; active completeness alone authorizes a clean result; history has a separate bounded partial-result contract. Strict durability is not yet fully specified. A successful final fsync of the bundle directory can persist both file renames, but a crash after change.json rename and before that final sync leaves the sentinel directory entry uncommitted. For a newly created dated bundle directory, syncing only that directory also does not commit the bundle directory entry in archiveDir. The summaryHash preimage is underspecified by the phrase canonical summary bytes, and optional-sidecar publication failure semantics are absent. Exact-byte integrity must hash the one serialized Buffer actually written for change.json and the exact UTF-8 preimage Buffer produced by one named summary serializer with summaryHash omitted; readers must hash bytes read before parse/reserialization. Benchmark design should require every authority run to remain within 8s in addition to p95 <=6.4s and zero authority omissions.
- **[unresolved_action]** validation.blockers: Strict durability requires fsync of the bundle directory immediately after publishing change.json, before summary work; the current design only names a parent-directory fsync after summary rename, leaving a crash window before the sentinel directory entry is durable.
- **[unresolved_action]** validation.blockers: When a dated archive bundle directory is newly created, strict durability also requires syncing its parent archive directory so the directory entry itself survives a crash; this level is not specified.
- **[unresolved_action]** validation.blockers: The summaryHash contract does not name an exact deterministic serializer/preimage byte sequence, so independent writer/reader implementations can disagree despite equivalent JSON; optional summary publication failure behavior is also unspecified.
- **[report_follow_up]** follow_ups: Packet omitted explicit TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION labels; validation used the user's stated objective and boundaries without inferring additional scope.
- **[research_citation]** sources: Linux fsync(2) manual: File fsync alone does not guarantee containing-directory entry durability; explicit directory fsync is required. (https://man7.org/linux/man-pages/man2/fsync.2.html)
- **[research_citation]** sources: Linux rename(2) manual: Rename atomically replaces an existing destination, supporting sibling-temp publication. (https://man7.org/linux/man-pages/man2/rename.2.html)
- **[research_citation]** sources: Node.js v24 FileHandle.sync documentation: FileHandle.sync requests flushing file data to storage and delegates durability specifics to OS/POSIX behavior. (https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlesync)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: PASS. Design follows documented crash-durable publication sequence: fsync temp file, close, atomic rename, then fsync containing bundle directory; separately fsyncing archiveDir after creating the dated bundle makes the new directory entry durable (https://man7.org/linux/man-pages/man2/fsync.2.html, https://man7.org/linux/man-pages/man2/rename.2.html). Keeping change.json as sole authority and publishing optional summary only afterward prevents summary failure from invalidating authority. Hash definitions use exact change.json Buffer bytes and a deterministic summary preimage excluding summaryHash; Node supports Buffer reads and SHA-256 hashing directly (https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesreadfilepath-options, https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptocreatehashalgorithm-options). Active-only fail-closed authority with terminal-shadow reconciliation, separate 8s authority and 30s non-authoritative history budgets, full response-oracle coverage, and a maximum-every-run <=8s benchmark are coherent and simpler than cache authority or mixed full hydration.
- **[unresolved_action]** required_main_agent_actions: Record commit 7c311527 as acceptance-review remediation evidence.
- **[unresolved_action]** required_main_agent_actions: Use the persisted review report to complete acceptance only after normal gate-level evidence requirements are satisfied.
- **[wisdom_candidate]** wisdom_candidates: [pattern] When a lightweight sidecar claims a content hash, reader-side integrity must verify both the sidecar preimage and its binding to the persisted sibling; schema validation alone is insufficient.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Active conflict authority must not use terminal archive reads even for shadow reconciliation. Confirm disagreement through the bounded active authority or fail closed.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/ src/tools/change/validation-projection.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/archive/terminal-history.test.ts --reporter=verbose
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts src/archive/terminal-summary.test.ts --reporter=verbose
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/active-conflict-authority.test.ts src/storage/store-temporal/active-conflict-authority-benchmark.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- Persist explicit spec deltas before approval: reconcile active-only validation with rq-disc04's includeArchived requirement, and reconcile the larger history-view budget with rq-boundedAuthoritativeRead01's single 8,000 ms requirement. The change currently has no deltas.
- Define active-authority completeness structurally: enumerate authoritative active candidate sources, preserve stale terminal-shadow invalidation/dominance, require capabilities for every non-own active peer, and map each source/candidate omission to fail-closed typed evidence.
- Define terminal-summary schema and coherence contract against the full ChangeListResponse/ChangeSummary compatibility surface, including required currentGate/created_at/lastActivityAt/task counts and decisions for lifecycle, lineage, ops follow-up, Epic membership, and capabilities. Specify write ordering and stale-but-valid summary handling, not only corrupt/missing fallback.
- Define benchmark protocol and pass thresholds before enabling source concurrency or choosing the larger history budget: fixture shape, cold/warm runs, concurrency candidates, measured percentile/sample count, maximum regression, and deterministic correctness tests must be explicit.
- Define the final publication marker: exact filename/schema, creation sequence, reader visibility rule for new v1 bundles, crash-state behavior, and compatibility rule for legacy change.json-only bundles.
- Define summaryHash precisely: exact byte serialization, exclusion rule for the self-referential field, verification behavior, and typed fallback/degradation on mismatch; define bundleChangeHash as hash of exact persisted change.json bytes or specify one canonicalization algorithm.
- Make publication durability exact: require parent-directory fsync after each visibility-changing rename (with explicit platform/error policy), or weaken the claim from crash-durable to atomic reader visibility and test only that claim.
- Strict durability requires fsync of the bundle directory immediately after publishing change.json, before summary work; the current design only names a parent-directory fsync after summary rename, leaving a crash window before the sentinel directory entry is durable.
- When a dated archive bundle directory is newly created, strict durability also requires syncing its parent archive directory so the directory entry itself survives a crash; this level is not specified.
- The summaryHash contract does not name an exact deterministic serializer/preimage byte sequence, so independent writer/reader implementations can disagree despite equivalent JSON; optional summary publication failure behavior is also unspecified.
- Record commit 7c311527 as acceptance-review remediation evidence.
- Use the persisted review report to complete acceptance only after normal gate-level evidence requirements are satisfied.
