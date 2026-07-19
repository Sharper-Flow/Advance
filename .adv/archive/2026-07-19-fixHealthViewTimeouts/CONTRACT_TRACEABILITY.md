# Contract Traceability

**Change ID:** fixHealthViewTimeouts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-19T01:24:09.295Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Pressure and integration fixtures prove cold health force-refresh returns within the fixed 8,000ms budget. |
| SC2 | success_criterion | pass | review | Source-ranked orientation and pressure tests bound candidates to 10 and executor tests bound concurrency to 4. |
| SC3 | success_criterion | pass | review | Executor and status integration tests prove provider-specific typed degradation while preserving completed diagnostics. |
| SC4 | success_criterion | pass | review | Health routing disables worktree cleanup; read-only boundary tests prove no cleanup invocation or deletion. |
| SC5 | success_criterion | pass | review | Status compatibility tests and full suite preserve required fields, ordering, privacy, and authoritative state semantics. |
| AC1 | acceptance_criterion | pass | test | Deterministic 57-candidate pressure fixture returns by virtual 8,000ms. |
| AC2 | acceptance_criterion | pass | test | Source-ranked integration fixture admits globally newest 10, hydrates only admitted candidates, and reports bounded omissions. |
| AC3 | acceptance_criterion | pass | test | Executor tests prove maximum concurrency 4 and critical-path execution rather than sequential latency accumulation. |
| AC4 | acceptance_criterion | pass | test | Cutoff tests prove no new starts after 7,500ms and bounded composition before 8,000ms. |
| AC5 | acceptance_criterion | pass | test | Discriminated executor tests cover ok, stale, timeout, error, unavailable, and not_admitted with bounded evidence. |
| AC6 | acceptance_criterion | pass | test | Stalled snapshot, worktree, peer-session, and runtime provider tests return typed partial output within deadline. |
| AC7 | acceptance_criterion | pass | test | Abort, cutoff, and late-completion tests prove immutable output and monotonic cache publication. |
| AC8 | acceptance_criterion | pass | test | Read-only worktree tests prove health invokes no cleanup discovery, draining, or deletion mutation. |
| AC9 | acceptance_criterion | pass | test | Status tests preserve required projection fields and stable _freshness while adding _health_execution metadata. |
| AC10 | acceptance_criterion | pass | test | Summary/health compatibility and request-owned cache tests prove cache values remain advisory, not authoritative completeness. |
| C1 | constraint | respected | static_check | Constants and shared request context enforce 8,000ms deadline, 7,500ms cutoff, and 500ms reserve. |
| C2 | constraint | respected | static_check | Tests enforce candidate limit 10 and provider concurrency 4. |
| C3 | constraint | respected | static_check | All independent provider caps use 1,500ms, below the 2,000ms maximum and remaining budget. |
| C4 | constraint | respected | static_check | Typed executor, source-ranked parser, admission bounds, and state transitions structurally own correctness. |
| C5 | constraint | respected | static_check | Static descriptor reduction and immutable enrichment tests prove stable deterministic ordering. |
| C6 | constraint | respected | static_check | Independent review confirmed caches are advisory and cannot authorize mutation or completeness. |
| C7 | constraint | respected | static_check | Health worktree boundary tests prove read-only operation. |
| C8 | constraint | respected | static_check | Host timeout was unchanged; implementation owns a lower internal deadline. |
| DONT1 | avoidance | respected | review | Cold-cache fixtures pass; correctness does not depend on warming caches. |
| DONT2 | avoidance | respected | review | Reviewer confirmed abort/cutoff state and CAS publication guard correctness beyond timeout-only racing. |
| DONT3 | avoidance | respected | review | Typed executor uses a fixed concurrency scheduler, not unbounded Promise.all. |
| DONT4 | avoidance | respected | review | Omission counts, samples, source-ranking warnings, and provider outcomes prevent silent omission. |
| DONT5 | avoidance | respected | review | Aborted and expired refresh tests prove late request cache publication is rejected. |
| DONT6 | avoidance | respected | review | Independent review found no authoritative decisions moved to snapshots, probe caches, or heuristic inputs. |
| DONT7 | avoidance | respected | review | Implementation uses a small internal typed executor with no new general queue dependency. |
| DONT8 | avoidance | respected | review | Candidate tests prove source-backed timestamps and canonical-ID ties, never memo warmth or enumeration order. |
| OOS1 | out_of_scope | respected | not_applicable | Terminal-history authority was not redesigned. |
| OOS2 | out_of_scope | respected | not_applicable | Archived-branch enumeration remained untouched. |
| OOS3 | out_of_scope | respected | not_applicable | Acceptance-readiness workflow state remained untouched. |
| OOS4 | out_of_scope | respected | not_applicable | Archive/release cleanup mutation ownership remained unchanged. |
| OOS5 | out_of_scope | respected | not_applicable | No frontend, browser-visible, or visual-output behavior was added; preview is not applicable. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a1d4cbcd6971 | SC2, SC3, AC3, AC4, AC5, AC6, AC7 | AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, DONT2, DONT3, DONT4, DONT7 |  |
| tk-2f6427617eb4 | SC2, AC2 | AC2 | C1, C2, C4, C6, DONT1, DONT4, DONT6, DONT8 |  |
| tk-250ef80057de | SC3, AC5, AC7, AC10 | AC5, AC7, AC10 | C3, C4, C5, C6, DONT1, DONT2, DONT5, DONT6, OOS1, OOS3 |  |
| tk-719e3566667b | SC1, SC2, SC3, SC4, AC1, AC3, AC4, AC5, AC6, AC7, AC8, AC10 | AC1, AC3, AC4, AC5, AC6, AC7, AC8, AC10 | C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
| tk-88cf605e196c | SC5, AC7, AC9, AC10 | AC7, AC9, AC10 | C4, C5, C6, DONT4, DONT6, OOS5 |  |
| tk-af2d45a81e5b |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, C1, C2, C3, C4, C5, C6, C7, C8 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
