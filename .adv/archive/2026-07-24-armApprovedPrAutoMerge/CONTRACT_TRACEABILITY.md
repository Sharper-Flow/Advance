# Contract Traceability

**Change ID:** armApprovedPrAutoMerge
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-24T23:35:39.507Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Agent requires explicit merge grant and defines continuing authority only within current active ADV orchestration session; test pins session wording. |
| AC2 | acceptance_criterion | pass | test | Agent binds changeId, repository, change head, default base, requested end-state, and active session; parsed asset test pins identity tuple. |
| AC3 | acceptance_criterion | pass | test | Immediate repo-qualified `gh pr merge ... --squash --auto` command asserted. |
| AC4 | acceptance_criterion | pass | test | Reviewer-hardened sequence includes fix, push, PR number/repository/head/base/state read, re-arm, enabledAt verification, waiter. |
| AC5 | acceptance_criterion | pass | test | Policy requires MERGED/default reachability; CI green explicitly nonterminal. |
| AC6 | acceptance_criterion | pass | test | No-delete command rule asserted. |
| AC7 | acceptance_criterion | pass | test | Agent/spec invalidate on revocation, stop/cancel, drift, scope/completion, session restart, compaction/context loss; require new explicit grant. |
| AC8 | acceptance_criterion | pass | test | Tier-B archive sign-off remains whitelist-only and unchanged. |
| AC9 | acceptance_criterion | pass | test | Parsed asset test has 187 assertions across session scope, identity, flags, re-arm, proof, invalidators, Tier-B, and no-delete. |
| AC10 | acceptance_criterion | pass | test | rq-approvedPrAutoMerge01 records active-session behavior and restart invalidation; JSON parses. |
| C1 | constraint | respected | static_check | No unrelated PR/repo authority. |
| C2 | constraint | respected | static_check | No generic global instructions changed. |
| C3 | constraint | respected | static_check | Reviewer archive-runtime hardening was explicitly reverted; Phase 9 implementation unchanged. |
| C4 | constraint | respected | static_check | No restart-persistent authorization claim; structural boundary documented. |
| DONT1 | avoidance | respected | review | No repeated merge prompt within valid active-session authority. |
| DONT2 | avoidance | respected | review | Auto-merge arms immediately rather than manual merge after green. |
| DONT3 | avoidance | respected | review | Push-only permission explicitly excluded. |
| DONT4 | avoidance | respected | review | CI green not equated with merge completion. |
| DONT5 | avoidance | respected | review | Agent/spec explicitly invalidate on session authority loss; no prompt-only durable persistence claim. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5be407ad86f8 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-625cb6885837 | AC10 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
