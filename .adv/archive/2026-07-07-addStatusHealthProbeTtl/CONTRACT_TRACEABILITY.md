# Contract Traceability

**Change ID:** addStatusHealthProbeTtl
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T15:43:16.520Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | tr_mratb3pw_ea9a391b targeted suite passed; status tests cover within-TTL reuse and forceRefresh advisory refresh behavior. |
| SC2 | success_criterion | pass | review | tr_mrat55fs_03a5869c probe-cache tests passed; ProbeCacheFreshness includes cached_at, stale, age_ms, ttl_ms, optional error. |
| SC3 | success_criterion | pass | review | adv-reviewer report addStatusHealthProbeTtl|change:review:acceptance|adv-reviewer|1 READY; temporal-ops tests enforce stale data cannot prove safety-critical serviceability. |
| AC1 | acceptance_criterion | pass | test | tr_mrat55fs_03a5869c and tr_mratb3pw_ea9a391b passed; freshness metadata assertions cover cached_at, stale, age_ms, ttl_ms, optional error shape. |
| AC2 | acceptance_criterion | pass | test | tr_mrat7zy6_771ce05e and tr_mratb3pw_ea9a391b passed; forceRefresh status tests prove cache bypass attempt while normal calls reuse cache. |
| AC3 | acceptance_criterion | pass | test | tr_mrata01e_e17c74a5 and tr_mratb3pw_ea9a391b passed; summary tests assert no detailed _freshness or detailed diagnostic payloads. |
| AC4 | acceptance_criterion | pass | test | tr_mrat55fs_03a5869c probe-cache tests passed; stale fallback/error metadata behavior covered in shared cache tests. |
| AC5 | acceptance_criterion | pass | test | tr_mrata01e_e17c74a5 temporal-ops safety guard tests passed; stale serviceability proof rejected and fresh proof accepted. |
| AC6 | acceptance_criterion | pass | test | Spec-law task tk-21dcdbe44979 updated rq-statusProbeCache01; tr_mrat3ee0_81d1267e and tr_mratb3pw_ea9a391b asset tests passed. |
| AC7 | acceptance_criterion | pass | test | tr_mrat7zy6_771ce05e status tests passed; health view keeps existing raw temporal health details while adding freshness metadata. |
| C1 | constraint | respected | static_check | adv-reviewer READY report found no correctness-critical ADV/Temporal state caching; changes limited to advisory status probes, spec, and tests. |
| C2 | constraint | respected | static_check | All file mutations occurred in ADV worktree /home/jon/.local/share/opencode/worktree/.../change/addStatusHealthProbeTtl; task checkpoints recorded branch change/addStatusHealthProbeTtl. |
| C3 | constraint | respected | static_check | Live deployed ADV behavior not claimed; verification uses source tests in-session. Rebuild/deploy/restart remains release note if live tool validation is needed. |
| C4 | constraint | respected | static_check | Implementation selected central ProbeCacheFreshness enrichment and existing forceRefresh plumbing per approved design; no agreement boundary changes. |
| C5 | constraint | respected | static_check | tr_mrata01e_e17c74a5 and tr_mratb3pw_ea9a391b passed stale-safety tests; stale diagnostics remain advisory-only. |
| DONT1 | avoidance | respected | review | adv-reviewer READY; no change/task/gate/contract/archive/release truth caching added. |
| DONT2 | avoidance | respected | review | tr_mratb9g8_1a4d8063 schemas:check passed; no Temporal workflow or typed tool boundary weakening reported by review. |
| DONT3 | avoidance | respected | review | Freshness output includes age_ms/ttl_ms/stale/error; stale state is explicit instead of hidden beyond TTL. |
| DONT4 | avoidance | respected | review | temporal-ops tests in tr_mrata01e_e17c74a5 prove stale diagnostics do not authorize safety-critical serviceability. |
| DONT5 | avoidance | respected | review | Affected files limited to status health probe cache/status/spec/tests; reviewer found no unrelated dashboard or OCA refactor. |
| OOS1 | out_of_scope | respected | not_applicable | No caching added for change, gate, task, contract, archive, or release truth. |
| OOS2 | out_of_scope | respected | not_applicable | Safety proof remains independent; stale health cache rejected for restart/serviceability proof in temporal-ops tests. |
| OOS3 | out_of_scope | respected | not_applicable | No broad status/dashboard refactor; changes localized to probe cache/status health/status tests/spec. |
| OOS4 | out_of_scope | respected | not_applicable | No OCA-specific code or unrelated cleanup included. |
| OOS5 | out_of_scope | respected | not_applicable | Target-project mutation readiness behavior unchanged; review found advisory status cache remains independent from mutation authority. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-21dcdbe44979 | AC6 | AC6 | C1, DONT2 |  |
| tk-6618cbfc327f | AC1, AC4, SC2 | AC1, AC4 | C4, C5, DONT3, DONT4 |  |
| tk-8e143a01e075 | AC1, AC2, AC7, SC1, SC2 | AC1, AC2, AC7 | C1, C4, C5, DONT1, DONT3 |  |
| tk-7186a69332c4 | AC3, AC5, SC3 | AC3, AC5 | C5, DONT1, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS5 |  |
| tk-8d9eb8abd51c |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
