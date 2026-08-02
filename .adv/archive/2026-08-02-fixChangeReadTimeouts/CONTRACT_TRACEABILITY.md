# Contract Traceability

**Change ID:** fixChangeReadTimeouts
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-08-02T22:57:24.746Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Disk-authoritative read remains useful under slow enrichment. |
| SC2 | success_criterion | pass | review | No new Temporal traffic or signals from routine reads. |
| AC1 | acceptance_criterion | pass | test | 199 focused tests tr_msccthou_b060e50e; bounded enrichment preserves disk projection and same-shape warnings; review attempt 2 READY. |
| AC2 | acceptance_criterion | pass | test | Shared aggregate deadline produces typed hydrationStats/omittedIds on exhaustion; fast errors distinguished from timeouts; review attempt 2 READY. |
| AC3 | acceptance_criterion | pass | test | assertNoWorkflowCalls now exercises real paths; persistClarifyFindings no longer mutates from read path (persist: false); review attempt 2 READY. |
| AC4 | acceptance_criterion | pass | test | PLUGIN_BUNDLE_STALE_RELEASE_PREFLIGHT preflight refuses strictly stale loaded bundle; current/unknown never blocks. |
| AC5 | acceptance_criterion | pass | test | Whole-show 8s budget test plus focused suites cover all four scenarios; pnpm run check and pnpm run build green. |
| C1 | constraint | respected | static_check | No per-change doctor probe introduced. |
| C2 | constraint | respected | static_check | No global tool timeout raised. |
| C3 | constraint | respected | static_check | Separate ADV change from fixTaskUpdatePersistence. |
| C4 | constraint | respected | static_check | Read path performs no workflow save/query/signal; clarify persistence display-only. |
| DONT1 | avoidance | respected | review | Stale-bundle guard is a structural preflight, not a restart-only remedy. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-611ccd97fac0 | AC1, AC3 |  | C1, C2, C4, DONT1 |  |
| tk-7313dcfa7d3d | AC2 |  | C2, C4 |  |
| tk-3921753af963 | AC4 |  | C1, C3, DONT1 |  |
| tk-fba1921ec917 |  | AC5 | C1, C2, C3, C4, DONT1 |  |
| tk-0f0ce5210959 | AC2 |  | C2, C4 |  |
| tk-55c8019ea464 |  | AC5 | C1, C2, C3, C4, DONT1 |  |
| tk-69d57f3fb757 | AC1, AC2, AC3 |  | C1, C2, C4, DONT1 |  |
