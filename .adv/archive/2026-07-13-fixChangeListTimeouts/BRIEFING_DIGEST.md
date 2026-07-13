# Archive Briefing Digest

**Change ID:** fixChangeListTimeouts
**Title:** Fix change list timeouts
**Status:** archived
**Generated:** 2026-07-13T16:07:04.422Z

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

Showing 100 of 141 durable facts (41 omitted).

- **[archive_only_evidence]** decisions: Deadline type + 8s constant live in retry-wrapper.ts, re-exported from shared.ts — retry-wrapper is the single timeout mechanism (design KD1/leverage-3); re-export gives resolver task a stable import beside runTemporalQuery without duplicating the type
- **[archive_only_evidence]** decisions: Throw TemporalQueryTimeoutError(deadline.budgetMs) when refusing a post-expiry attempt; propagate the original error when budget exhausts after a transient failure — Reuses existing timeout machinery instead of a second timer abstraction; preserves diagnostic error rather than swallowing the abandoned read (design execution note 2)
- **[archive_only_evidence]** decisions: Backoff sleep capped to remaining budget so the next admission check fires exactly at expiry — Design-derived criterion 1: no new attempt or backoff begins once remaining budget is non-positive; capping keeps the loop deterministic under fake timers
- **[archive_only_evidence]** decisions: Deadline context is request-scoped value ({budgetMs, deadlineAt}) created via createTemporalReadDeadline, not a class/singleton — Per-request instantiation with no shared state (KD5: never shared across projects or calls); trivially mockable with vi.useFakeTimers
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts (1) — RED (tr_mrihfnsd_cb6fd2dd): 6 deadline tests failed before implementation (missing exports/behavior), 15 existing tests passed
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts (0) — GREEN (tr_mrihhlp1_bcf4febc): 21/21 pass — 8s default budget, remaining-budget tracking, per-attempt timeout cap, no post-expiry attempt/backoff, default retry/backoff preserved, fatal non-retry, runTemporalQuery 5s ceiling + reconnect hook preserved
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY (tr_mrihj5f0_59f60a4f): schemas:check, tsc --noEmit, test-isolation, lockfile policy, eslint, prettier all green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal src/temporal src/tools/_adapters.test.ts (0) — Consumer regression sweep: 692 passed, 2 skipped, 0 failed across 61 files. concurrent-signaling.itest.ts flaked once under full-suite load; passed in isolation both with and without the changes (environmental, not a regression)
- **[archive_only_evidence]** consumer_warnings: consumer_failure: TemporalQueryTimeoutError thrown on aggregate expiry classifies as "transient" via classifyTemporalError (message matches /timeout/). Resolver task tk-bd6e4d2adece must treat post-expiry outcomes as typed incompleteness rather than re-entering another retry loop.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal src/temporal src/tools/_adapters.test.ts
- **[archive_only_evidence]** decisions: One-pass accumulator replaces the terminal classification reload — KD2/design criterion 3: loadCandidate now records document+provenance+terminal+omission in the single load pass; the second per-candidate load loop is deleted (closed-disk candidate: 2 legacy.changes.get reads → 1, regression-locked by test)
- **[archive_only_evidence]** decisions: raceWithTemporalDeadline added in shared.ts (no retry, no STSL reconnect) instead of wrapping source enumeration in runTemporalQuery — runTemporalQuery's transient classification fires makeReconnectingHook→reinitStsl (real connection attempt) on plain enumeration failures, breaking existing unit tests; the race helper is a pure admission gate that rejects with TemporalQueryTimeoutError on expiry
- **[archive_only_evidence]** decisions: Source-failure warnings stay terminal-only; deadline degradation (SOURCE_DEADLINE_EXCEEDED + hydrationStats.deadlineExceeded) is typed on BOTH active and terminal paths — Preserves the codified compat test ('does not include terminal degraded metadata on active/default list') while satisfying C2 — a deadline-truncated result can never look complete; changes.list/listSummary forward warnings whenever present
- **[archive_only_evidence]** decisions: Cheap local disk enumeration (readdir) is NOT deadline-gated; network iteration, the archive-bundle pre-scan loop, the archive-inventory×candidate scan in loadArchiveProjection, and all per-candidate hydration/fallback stages are — AC5 targets unbounded source work; keeping bounded local enumeration available after Temporal degradation lets omission evidence name candidates precisely (DONT3 bounded via per-iteration admission checks)
- **[archive_only_evidence]** decisions: Deadline expiry after a failed load skips the entire fallback chain and records omissionReason:'deadline' without further reads — Design execution note 2 / task-1 consumer warning: TemporalQueryTimeoutError classifies as transient, so the resolver detects expiry structurally (remainingDeadlineMs<=0 or instanceof) instead of re-entering retry loops
- **[archive_only_evidence]** decisions: TerminalWarning gains omittedIds (capped 20) and HydrationStats gains deadlineExceeded — additive optional fields, no Zod/schema-registry impact (response types are TS-only) — AC1/SC4 require naming incomplete candidates; additive fields preserve existing toMatchObject/objectContaining assertions and JSON-schema generation
- **[archive_only_evidence]** decisions: Fake-timer deadline tests synchronize on fixture state (wait until query attempt starts with frozen clock) rather than fixed advancement — advanceTimersByTimeAsync drains microtasks only after advancing each step and vitest fakes setImmediate, making fs/async-generator stages drain at nondeterministic clock positions (observed flakes); waiting on queryCount with a frozen fake clock is deterministic (5/5 isolated + full-suite load)
- **[archive_only_evidence]** verification: pnpm vitest run src/storage/store-temporal/bounded-read-deadline.test.ts (1) — RED (tr_mrii5gne_c736709e): 5/6 new tests failed before implementation — duplicate classification reload (2 disk reads vs 1), missing deadline machinery (hangs/timeouts), no typed degradation metadata
- **[archive_only_evidence]** verification: pnpm vitest run src/storage/store-temporal/bounded-read-deadline.test.ts (0) — GREEN: 6/6 pass, deterministic across 5 consecutive runs — one load per candidate, visibility-source deadline typed degradation, archive pre-scan/candidate-load admission after budget exhaustion, cold listSummary miss bounded with warm rows preserved, complete path emits no deadline metadata, hung query → typed omission with ≤3 attempts and no post-expiry retry loop
- **[archive_only_evidence]** verification: pnpm vitest run src/storage/store-temporal (0) — GREEN (tr_mrij92bs_df49165d, tr_mrijdl3x_3e09b649): full store-temporal suite passes including all pre-existing terminal degraded-metadata compat tests (TERMINAL_SOURCE_DEGRADED / TERMINAL_CANDIDATE_OMITTED semantics unchanged) and listSummary tests
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-hygiene.test.ts src/tools/_adapters.test.ts (0) — GREEN (tr_mrij9dnl_59192783): 192/192 consumer tests pass — task-1 deadline plumbing intact, tool-layer warning forwarding compatible
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY (tr_mrijepdg_81188a51): schemas:check, tsc --noEmit, test-isolation, lockfile policy, eslint, prettier all green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-hygiene.test.ts src/tools/_adapters.test.ts (0) — Consumer regression sweep via throttled runner: 331 passed, 0 failed across 15 files
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/storage/store-temporal/bounded-read-deadline.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/storage/store-temporal/bounded-read-deadline.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/storage/store-temporal
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-hygiene.test.ts src/tools/_adapters.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-hygiene.test.ts src/tools/_adapters.test.ts
- **[agenda]** follow_ups: plugin/src/tools/status-health.ts also calls listChangeDirs (hygiene/leak-detection path at lines 241-242) without a deadline wrapper. Out of scope for AC1/AC5 change-list fix but worth a follow-up if slow-disk detection on the hygiene path becomes a concern.
- **[archive_only_evidence]** decisions: Wrapped both listChangeDirs(legacy.paths.changes) and listChangeDirs(legacy.paths.archive) in raceWithTemporalDeadline and, on TemporalQueryTimeoutError/expired, call markDeadline(source) in addition to degradedSources.add(source) — Mirrors the visibility branch's KD1/KD5 deadline-admission pattern. markDeadline flips deadlineExceeded=true and records the source in deadlineSources, which surfaces SOURCE_DEADLINE_EXCEEDED with the correct source identity ('active_disk' or 'archive') on BOTH active and terminal paths (C2/AC5) — closing the silent-complete gap. degradedSources.add preserves the terminal-path TERMINAL_SOURCE_DEGRADED compatibility signal.
- **[archive_only_evidence]** decisions: Updated the existing 'stops the archive pre-scan...' test to expect SOURCE_DEADLINE_EXCEEDED for archive instead of TERMINAL_CANDIDATE_OMITTED with omittedCount:1 — With archive enumeration now deadline-gated, a budget already consumed by visibility prevents archive discovery entirely — the archived candidate is never enumerated, so the candidate-level omission warning no longer fires. This is the intended AC1/AC5 behavior (no unbounded work after budget exhaustion). archiveGetCalls===0 assertion still holds (no fallback disk reads).
- **[archive_only_evidence]** decisions: Mocked listChangeDirs via vi.mock('../json') with importOriginal pass-through gated by a SLOW_LIST_CHANGE_DIRS path→delay map, and used globalThis.setTimeout looked up at call time inside the mock — vi.mock('../json') scopes the override to one export without touching node:fs/promises (which createTempDir/setup uses via 'fs/promises' — different specifier, but safer to avoid). globalThis.setTimeout at call time observes vitest's fake-timer install done in beforeEach; binding it at mock-factory time would capture the real timer and break advanceTimersByTimeAsync.
- **[archive_only_evidence]** decisions: Used a settle-loop (runAllTimersAsync + Promise.resolve yields) instead of a single advanceTimersByTimeAsync in the new hang tests — The mock's slow-read setTimeout is only scheduled after earlier awaits (visibility, active-disk enumeration) resolve, so a single advanceTimersByTimeAsync may return before the slow-read timer exists. Looping until the pending promise settles keeps the test deterministic without wall-clock sleeps.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check + tsc --noEmit + isolation + lockfile + eslint + prettier all pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts (0) — 9/9 pass — includes new active-disk hang, archive hang, and compat tests
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/ (0) — 400/400 storage tests pass — no regressions across store-disk, store-temporal, json, memo, etc.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/status (0) — 75/75 status tool tests pass — adv_status enrichment and probe paths unaffected
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — 62/62 smoke tests pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/status
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[archive_only_evidence]** decisions: Wrapped listSummary active-disk listChangeDirs in raceWithTemporalDeadline with markDeadline("active_disk") — Mirrors the existing pattern in index.ts:867-880 for listResolvedChanges; ensures a hung active-disk readdir degrades with typed source-specific incompleteness instead of outliving the 8s aggregate budget (AC1/AC5/C2)
- **[archive_only_evidence]** decisions: Added await vi.advanceTimersByTimeAsync(0) before the budget advance in the existing cold-miss test — Under vi.useFakeTimers(), advanceTimersByTimeAsync fires fake timers during its synchronous advance phase. Without a prior event-loop yield, the new disk-race timer rejected before the un-slowed fs callback resolved, causing an empty candidate set. The zero-ms advance yields to real I/O without advancing the fake clock.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts (0) — 10/10 tests pass including new active-disk listSummary hang regression test
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts src/storage/store-temporal/bounded-status.test.ts (0) — 24/24 tests pass — listSummary memo/warm paths and status repair readback preserved
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/shared.test.ts (0) — 42/42 tests pass — listResolvedChanges and retry/deadline shared helpers unaffected
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/status.test.ts (0) — 54/54 tests pass — adv_status summary path unaffected
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, isolation, lockfile, lint, format all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts src/storage/store-temporal/bounded-status.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/shared.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/status.test.ts
- **[agenda]** follow_ups: Orphan-on-disk rows (workflow unreachable, resolved via disk fallback) now render status snapshots with empty proposal text since resolved rows skip readArtifact; a direct disk proposal.md read could restore it without a Temporal re-query if this matters in practice
- **[archive_only_evidence]** decisions: Bound applied as candidateLimit inside listResolvedChanges with memo-recency ordering (memo lastActivityAt desc first, stable enumeration order for the rest), tail recorded as omissionReason 'bounded' — Design criterion 4 requires bounding resolver-level work while keeping the bounded set meaningful; memo summaries are the only cheap pre-hydration recency signal, and truncation without ordering would make summary's recent list arbitrary
- **[archive_only_evidence]** decisions: New typed degradation: TerminalWarningCode SOURCE_BOUND_EXCEEDED (+ omittedIds≤20) and HydrationStats.boundedOmitted, emitted on BOTH active and terminal paths; active-path hydrationStats no longer hardcodes deadlineExceeded — C2 — a bound-truncated result must never look complete; additive optional fields preserve task-2 compat test shapes (all store-temporal suites green)
- **[archive_only_evidence]** decisions: resolvedChanges travels as an optional ReadonlyMap field on ProjectStatus; status.ts extracts and deletes it before building fullOutput — Only adv_status calls store.status(); the map is request-local transport (KD4) and must never serialize into tool output (regression-locked by test)
- **[archive_only_evidence]** decisions: Resolved rows derive proposalText from change.documents?.proposal ?? '' with no readArtifact call; disk-fallback-resolved rows without workflow documents render with empty proposal in status enrichment — AC4/contract literal: no second store.changes.get or readArtifact for already-resolved rows; readArtifact's first step is itself a duplicate Temporal read. Trade-off noted: orphan-on-disk rows lose advisory proposal text in snapshots only
- **[archive_only_evidence]** decisions: StatusReadOptions.deadline exposed but not passed by status.ts; buildTemporalStatus creates one per-call deadline (KD5) — Per-request instantiation, never shared across projects/calls; the option exists for tests and future callers
- **[archive_only_evidence]** decisions: Disk store status ignores options; target-path snapshot flow untouched — C5 — snapshot authority markers preserved; the bound/deadline machinery is Temporal-oriented and disk fallback keeps existing behavior with the output-side slice still in place
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/status.test.ts src/tools/status-enrich.test.ts src/storage/store-temporal/bounded-status.test.ts (1) — RED (tr_mrikcxo3_601ac52c): new tests failed pre-implementation — 12 hydration queries vs bound of 10, no SOURCE_BOUND_EXCEEDED warning, resolvedChanges undefined, store.status called with no options, duplicate enrichment reads, no degradation recommendation
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/status.test.ts src/tools/status-enrich.test.ts src/storage/store-temporal/bounded-status.test.ts (0) — GREEN (tr_mriknjqo_069a2232): 70/70 pass — summary bound caps hydration at recentLimit with typed bounded omissions, memo-recency ordering, complete semantics under bound, no bound for full views, zero duplicate reads for resolved rows, fallback paths preserved, warnings surfaced as recommendations, map stripped from output
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY (tr_mrikr2ur_3ad0f046): schemas:check, tsc --noEmit, test-isolation, lockfile policy, eslint, prettier all green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-enrich.test.ts src/tools/status-hygiene.test.ts src/tools/status-recommendations.test.ts src/tools/status.probe-helpers.test.ts src/tools/_adapters.test.ts (0) — Consumer regression sweep (tr_mrikrq2z_9b98f452): 358/358 pass across 19 files — task-1/2 deadline plumbing and terminal degraded-metadata compat intact, tool-layer consumers green
- **[archive_only_evidence]** consumer_warnings: consumer_failure: Task 4 (spec codify) + task 5 (verification) must include the new SOURCE_BOUND_EXCEEDED warning code and HydrationStats.boundedOmitted in bounded-read spec law; change.ts warning rendering is pass-through (line 464) so no code change needed there.
- **[unresolved_action]** consumer_warnings: verification_mismatch: None — all verification recorded via adv_run_test (RED tr_mrikcxo3_601ac52c, GREEN tr_mriknjqo_069a2232, VERIFY tr_mrikr2ur_3ad0f046, sweep tr_mrikrq2z_9b98f452).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/tools/status.test.ts src/tools/status-enrich.test.ts src/storage/store-temporal/bounded-status.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/tools/status.test.ts src/tools/status-enrich.test.ts src/storage/store-temporal/bounded-status.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-enrich.test.ts src/tools/status-hygiene.test.ts src/tools/status-recommendations.test.ts src/tools/status.probe-helpers.test.ts src/tools/_adapters.test.ts
- **[agenda]** follow_ups: rq-temporalTsDeterminismDocs01 [advance-delivery] is uncited on this base and on origin/main, failing spec-citation-invariant.test.ts independent of this change; the citation exists only in the local main checkout's uncommitted AGENTS.md. Needs a committed citation (AGENTS.md or an enforcement-path comment) from the advance-delivery owner.
- **[unresolved_action]** required_main_agent_actions: Coordinate or commit the missing citation for rq-temporalTsDeterminismDocs01 [advance-delivery]: it fails spec-citation-invariant on the pristine base and origin/main and will keep CI red regardless of this change. Out of scope for fixChangeListTimeouts; owned by the advance-delivery determinism-docs work.
- **[archive_only_evidence]** decisions: Placed all four new requirements in the advance-workflow read-model cluster (after rq-activeListFastPath01, before rq-autonomy01) rather than splitting across advance-workflow/advance-meta — The contract is one cohesive capability (bounded authoritative change reads) governed by the shared resolver that both adv_change_list and adv_status use; advance-workflow already owns the read-model laws (rq-terminalAggregateRead01, rq-activeListFastPath01). advance-meta's summary/cache laws (rq-statusSummaryLazy01, rq-statusProbeCache01) are cross-referenced, not duplicated, avoiding competing requirements.
- **[archive_only_evidence]** decisions: Four focused requirements (deadline+typed degradation, Archive/Visibility source attribution, summary bound+request-local reuse, cache advisory) instead of one mega-requirement — Matches the existing focused-requirement style, maps cleanly to distinct ACs/constraints with no overlap, and lets each requirement carry bounded Given/When/Then scenarios as the task requires.
- **[archive_only_evidence]** decisions: Added '// rq-{ID}' citation comments to the four implementing source files — spec-citation-invariant.test.ts requires every non-planned requirement to have an external citation in plugin/src; the code is already implemented (not planned), so real enforcement-path citations are correct. Comment-only, zero behavior change, matching the existing rq-terminalAggregateRead01/rq-activeListFastPath01 convention.
- **[archive_only_evidence]** decisions: Bumped spec version 1.27.0→1.28.0 and updated_at to 2026-07-12 — Follows the observed convention (last advance-workflow edit bumped 1.26.0→1.27.0 with updated_at). docs/specs mirror is regenerated at archive time (archive.ts:707), not a CI sync gate, so no manual mirror regeneration was required.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: spec-citation-invariant.test.ts fails with exactly one uncited requirement: rq-temporalTsDeterminismDocs01 [advance-delivery]: Temporal TypeScript Determinism Guidance. Confirmed pre-existing by stashing my changes and re-running on the pristine base (identical single failure) and by grepping origin/main:AGENTS.md (citation absent there too — repo-wide gap; the citation lives only in the local main checkout's uncommitted AGENTS.md). The requirement is defined in .adv/specs/advance-delivery/spec.json:1120, a file I did not touch; my edits (advance-workflow/spec.json + four comment-only source additions) cannot have removed its citation. My four new requirements are all correctly cited and absent from the failure set.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, tsc --noEmit, test-isolation, lockfile policy, eslint, prettier all green (runId tr_mrillqd5_5542fffd)
- **[archive_only_evidence]** verification: pnpm vitest run src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/__tests__/spec-deltas-cull.test.ts src/tools/spec.test.ts (1) — 33/34 tests pass; no-retired-tool-spec-refs, spec-deltas-cull, spec.test all pass. Single failure is PRE-EXISTING and unrelated: rq-temporalTsDeterminismDocs01 [advance-delivery] uncited — reproduced on pristine base (runId tr_mrilg21b_dcbc1007). My 4 new requirements are cited and pass.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/manifest-doc-drift.test.ts src/schema-url-assets.test.ts src/deploy-local.test.ts src/tools/conformance.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts (0) — 113/113 spec asset/doc-drift/conformance tests pass
- **[archive_only_evidence]** verification: pnpm exec tsx -e 'SpecSchema.safeParse(advance-workflow/spec.json)' (0) — SpecSchema VALID — 102 requirements, no duplicate IDs, all 4 new requirements present with well-formed given/when/then scenarios
- **[archive_only_evidence]** verification: pnpm exec tsx -e 'generateSpecDoc(advance-workflow/spec.json)' (0) — Docs mirror generator renders cleanly; all 4 new requirement IDs present; Version header 1.28.0
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/__tests__/spec-deltas-cull.test.ts src/tools/spec.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/manifest-doc-drift.test.ts src/schema-url-assets.test.ts src/deploy-local.test.ts src/tools/conformance.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx -e 'SpecSchema.safeParse(advance-workflow/spec.json)'
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx -e 'generateSpecDoc(advance-workflow/spec.json)'
- **[archive_only_evidence]** decisions: Updated only the two version assertions; did not touch the prepSpec.version (1.4.0) assertion in the same test block or any other co-located spec assertions. — Scope explicitly limited to the two failing 1.27.0 assertions; other assertions in the same describe blocks already match their specs and are not failing.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts (0) — 2 files, 68 tests passed (55 adv-skill-backed-commands-assets + 13 ops-follow-up-assets). Both updated version assertions now match the bumped 1.28.0 spec.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, and prettier format:check all pass.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts
- **[archive_only_evidence]** decisions: Used call-count mock for legacy.changes.get in disk fallback test — getTemporalChange internally calls legacy.changes.get 3 times (loadDiskTerminalProjection, getGuardedChangeHandle, reseedChangeFromDisk) before the loadCandidate fallback chain. The mock must distinguish these fast internal calls from the hanging fallback call.
- **[archive_only_evidence]** decisions: Used HAS_ARCHIVE_BUNDLE_CALLS mock for archive fallback test — loadArchiveBundleDominantProjection short-circuits when hasArchiveBundle returns false. Forcing false on first call ensures getTemporalChange exercises the workflow query path, so the fallback chain is reached.
- **[archive_only_evidence]** verification: npx vitest run src/storage/store-temporal/bounded-read-deadline.test.ts --reporter=verbose --testTimeout=15000 (0) — All 12 tests pass (10 existing + 2 new). Disk fallback test verified RED (times out without fix) and GREEN (passes with fix).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/ src/temporal/ (0) — All 666 tests pass across store-temporal and temporal directories.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/storage/store-temporal/bounded-read-deadline.test.ts --reporter=verbose --testTimeout=15000

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/temporal/retry-wrapper.test.ts src/storage/store-temporal/shared.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal src/temporal src/tools/_adapters.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/storage/store-temporal/bounded-read-deadline.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/storage/store-temporal/bounded-read-deadline.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/storage/store-temporal
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-hygiene.test.ts src/tools/_adapters.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-hygiene.test.ts src/tools/_adapters.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/status
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/bounded-read-deadline.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts src/storage/store-temporal/index.status-repair-readback.test.ts src/storage/store-temporal/bounded-status.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/shared.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/status.test.ts
- verification_mismatch: None — all verification recorded via adv_run_test (RED tr_mrikcxo3_601ac52c, GREEN tr_mriknjqo_069a2232, VERIFY tr_mrikr2ur_3ad0f046, sweep tr_mrikrq2z_9b98f452).
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/tools/status.test.ts src/tools/status-enrich.test.ts src/storage/store-temporal/bounded-status.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/tools/status.test.ts src/tools/status-enrich.test.ts src/storage/store-temporal/bounded-status.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal src/temporal/retry-wrapper.test.ts src/tools/change.test.ts src/tools/status.test.ts src/tools/status-enrich.test.ts src/tools/status-hygiene.test.ts src/tools/status-recommendations.test.ts src/tools/status.probe-helpers.test.ts src/tools/_adapters.test.ts
- Coordinate or commit the missing citation for rq-temporalTsDeterminismDocs01 [advance-delivery]: it fails spec-citation-invariant on the pristine base and origin/main and will keep CI red regardless of this change. Out of scope for fixChangeListTimeouts; owned by the advance-delivery determinism-docs work.
- finish_owned_scope_then_report: spec-citation-invariant.test.ts fails with exactly one uncited requirement: rq-temporalTsDeterminismDocs01 [advance-delivery]: Temporal TypeScript Determinism Guidance. Confirmed pre-existing by stashing my changes and re-running on the pristine base (identical single failure) and by grepping origin/main:AGENTS.md (citation absent there too — repo-wide gap; the citation lives only in the local main checkout's uncommitted AGENTS.md). The requirement is defined in .adv/specs/advance-delivery/spec.json:1120, a file I did not touch; my edits (advance-workflow/spec.json + four comment-only source additions) cannot have removed its citation. My four new requirements are all correctly cited and absent from the failure set.
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/__tests__/spec-deltas-cull.test.ts src/tools/spec.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/manifest-doc-drift.test.ts src/schema-url-assets.test.ts src/deploy-local.test.ts src/tools/conformance.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx -e 'SpecSchema.safeParse(advance-workflow/spec.json)'
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx -e 'generateSpecDoc(advance-workflow/spec.json)'
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/ops-follow-up-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/storage/store-temporal/bounded-read-deadline.test.ts --reporter=verbose --testTimeout=15000
