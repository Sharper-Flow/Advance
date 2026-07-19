# Acceptance

Reviewed at: 2026-07-19T01:24:09.295Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Cold health force-refresh reliably returns before OpenCode's host timeout. | pass | Pressure and integration fixtures prove cold health force-refresh returns within the fixed 8,000ms budget. |
| SC2 | success_criterion | Candidate volume and independent probe latency cannot accumulate without bound. | pass | Source-ranked orientation and pressure tests bound candidates to 10 and executor tests bound concurrency to 4. |
| SC3 | success_criterion | Slow providers degrade individually while completed diagnostics remain usable. | pass | Executor and status integration tests prove provider-specific typed degradation while preserving completed diagnostics. |
| SC4 | success_criterion | Health reads never trigger cleanup mutation. | pass | Health routing disables worktree cleanup; read-only boundary tests prove no cleanup invocation or deletion. |
| SC5 | success_criterion | Existing consumers retain compatible fields, ordering, privacy, and authoritative truth. | pass | Status compatibility tests and full suite preserve required fields, ordering, privacy, and authoritative state semantics. |
| AC1 | acceptance_criterion | Given 57 candidates and cold caches, when health force-refresh runs in the deterministic pressure fixture, then it returns by virtual 8,000 ms. | pass | Deterministic 57-candidate pressure fixture returns by virtual 8,000ms. |
| AC2 | acceptance_criterion | Given 57 source-ranked candidates, when health loads recent changes, then exactly the globally newest 10 are admitted, only those 10 may hydrate, and omission metadata reports `omittedCount: 47` plus a bounded deterministic omitted-ID sample. | pass | Source-ranked integration fixture admits globally newest 10, hydrates only admitted candidates, and reports bounded omissions. |
| AC3 | acceptance_criterion | Given independent probes with controlled delays, when health executes, then at most 4 run concurrently and aggregate wall-clock contribution follows admitted critical-path latency rather than sequential sum. | pass | Executor tests prove maximum concurrency 4 and critical-path execution rather than sequential latency accumulation. |
| AC4 | acceptance_criterion | Given the 7,500 ms execution cutoff, when unresolved non-composition work remains, then no new work starts, all such work becomes settled or typed degradation, and composition finishes within the remaining 500 ms. | pass | Cutoff tests prove no new starts after 7,500ms and bounded composition before 8,000ms. |
| AC5 | acceptance_criterion | Given any provider result, when health renders, then the source has one outcome: `ok`, `stale`, `timeout`, `error`, `unavailable`, or `not_admitted`, with bounded evidence. | pass | Discriminated executor tests cover ok, stale, timeout, error, unavailable, and not_admitted with bounded evidence. |
| AC6 | acceptance_criterion | Given snapshot, worktree, peer-session, or plugin-runtime probing stalls, when its allowance expires, then health still returns within 8,000 ms. | pass | Stalled snapshot, worktree, peer-session, and runtime provider tests return typed partial output within deadline. |
| AC7 | acceptance_criterion | Given request abort or deadline, when underlying work settles later, then returned output, deterministic ordering, authoritative state, and request-scoped cache publication remain unchanged. | pass | Abort, cutoff, and late-completion tests prove immutable output and monotonic cache publication. |
| AC8 | acceptance_criterion | Given health executes, when worktree diagnostics run, then no cleanup discovery, draining, or deletion mutation occurs. | pass | Read-only worktree tests prove health invokes no cleanup discovery, draining, or deletion mutation. |
| AC9 | acceptance_criterion | Given existing status consumers, when the refactor ships, then existing required fields and `_freshness` remain compatible; health-execution metadata is additive. | pass | Status tests preserve required projection fields and stable _freshness while adding _health_execution metadata. |
| AC10 | acceptance_criterion | Given summary and health views observe the same durable project state, when both complete, then authoritative truth does not conflict and cache values cannot independently establish completeness. | pass | Summary/health compatibility and request-owned cache tests prove cache values remain advisory, not authoritative completeness. |
| C1 | constraint | Use one 8,000 ms absolute request deadline, a 7,500 ms execution cutoff, and 500 ms composition reserve. | respected | Constants and shared request context enforce 8,000ms deadline, 7,500ms cutoff, and 500ms reserve. |
| C2 | constraint | Limit health candidate orientation to 10 and read-only provider concurrency to 4. | respected | Tests enforce candidate limit 10 and provider concurrency 4. |
| C3 | constraint | No independent probe allowance may exceed the remaining request budget or 2,000 ms. | respected | All independent provider caps use 1,500ms, below the 2,000ms maximum and remaining budget. |
| C4 | constraint | Structural deadline, admission, concurrency, source-ranked orientation, and discriminated-result types own correctness. | respected | Typed executor, source-ranked parser, admission bounds, and state transitions structurally own correctness. |
| C5 | constraint | Provider results are immutable and reduced in stable source/candidate order. | respected | Static descriptor reduction and immutable enrichment tests prove stable deterministic ordering. |
| C6 | constraint | Caches remain advisory and cannot authorize completeness or mutation. | respected | Independent review confirmed caches are advisory and cannot authorize mutation or completeness. |
| C7 | constraint | Health is read-only. | respected | Health worktree boundary tests prove read-only operation. |
| C8 | constraint | Do not increase the host timeout. | respected | Host timeout was unchanged; implementation owns a lower internal deadline. |
| DONT1 | avoidance | Do not solve by warming caches. | respected | Cold-cache fixtures pass; correctness does not depend on warming caches. |
| DONT2 | avoidance | Do not use timeout-only `Promise.race` as cancellation or correctness. | respected | Reviewer confirmed abort/cutoff state and CAS publication guard correctness beyond timeout-only racing. |
| DONT3 | avoidance | Do not use unbounded `Promise.all`. | respected | Typed executor uses a fixed concurrency scheduler, not unbounded Promise.all. |
| DONT4 | avoidance | Do not silently omit candidates or provider failures. | respected | Omission counts, samples, source-ranking warnings, and provider outcomes prevent silent omission. |
| DONT5 | avoidance | Do not allow late request-scoped cache publication after abort. | respected | Aborted and expired refresh tests prove late request cache publication is rejected. |
| DONT6 | avoidance | Do not move authoritative decisions to snapshot, probe cache, or heuristic data. | respected | Independent review found no authoritative decisions moved to snapshots, probe caches, or heuristic inputs. |
| DONT7 | avoidance | Do not add a general queue dependency when a small typed internal executor suffices. | respected | Implementation uses a small internal typed executor with no new general queue dependency. |
| DONT8 | avoidance | Do not infer recency from enumeration order or memo warmth. | respected | Candidate tests prove source-backed timestamps and canonical-ID ties, never memo warmth or enumeration order. |
| OOS1 | out_of_scope | Redesigning terminal-history authority shipped by `fixChangeEnumerationStarvation`. | respected | Terminal-history authority was not redesigned. |
| OOS2 | out_of_scope | Changing archived-branch enumeration owned by `routeArchivedBranchScanOff`. | respected | Archived-branch enumeration remained untouched. |
| OOS3 | out_of_scope | Changing acceptance-readiness workflow state owned by `fixAcceptanceReadiness`. | respected | Acceptance-readiness workflow state remained untouched. |
| OOS4 | out_of_scope | Changing archive/release-owned cleanup mutation. | respected | Archive/release cleanup mutation ownership remained unchanged. |
| OOS5 | out_of_scope | Adding frontend or browser-visible behavior. | respected | No frontend, browser-visible, or visual-output behavior was added; preview is not applicable. |
