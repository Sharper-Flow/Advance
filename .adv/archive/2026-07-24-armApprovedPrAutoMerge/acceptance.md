# Acceptance

Reviewed at: 2026-07-24T23:35:39.507Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Only an explicit user grant to merge the current change (for example `merge`, `merge and push`, or equivalent) creates session-scoped continuing merge authority. Push-only permission, generic Tier-A gate approval, and archive sign-off inference do not. | pass | Agent requires explicit merge grant and defines continuing authority only within current active ADV orchestration session; test pins session wording. |
| AC2 | acceptance_criterion | Authority is bound to the current `changeId`, repository, `change/<changeId>` head branch, resolved default base branch, stated requested end-state, and active orchestration session. | pass | Agent binds changeId, repository, change head, default base, requested end-state, and active session; parsed asset test pins identity tuple. |
| AC3 | acceptance_criterion | For an OPEN PR matching those identities, ADV immediately runs `gh pr merge <number> --repo <owner/repo> --squash --auto` after PR creation/push instead of waiting for CI green or asking again. | pass | Immediate repo-qualified `gh pr merge ... --squash --auto` command asserted. |
| AC4 | acceptance_criterion | After remediation: fix in worktree → push change branch → re-read PR number/repository/head/base/state → arm or re-arm auto-merge → verify PR remains OPEN with `autoMergeRequest.enabledAt` present → spawn `adv-ci-waiter`. | pass | Reviewer-hardened sequence includes fix, push, PR number/repository/head/base/state read, re-arm, enabledAt verification, waiter. |
| AC5 | acceptance_criterion | CI green alone remains nonterminal; completion requires `gh pr view` proof that `state == MERGED` or canonical default-branch reachability. | pass | Policy requires MERGED/default reachability; CI green explicitly nonterminal. |
| AC6 | acceptance_criterion | Auto-merge command never includes `--delete-branch` or `-d`; cleanup remains post-merge. | pass | No-delete command rule asserted. |
| AC7 | acceptance_criterion | Authority ends on explicit revocation, stop/cancel, change/repo/head/base drift, unrelated scope, terminal/requested-end-state completion, session restart, or compaction/context loss that removes authoritative approval evidence. A new session requires a new explicit merge grant. | pass | Agent/spec invalidate on revocation, stop/cancel, drift, scope/completion, session restart, compaction/context loss; require new explicit grant. |
| AC8 | acceptance_criterion | Tier-B archive sign-off remains whitelist-only and unchanged. | pass | Tier-B archive sign-off remains whitelist-only and unchanged. |
| AC9 | acceptance_criterion | Asset tests fail if session scope, identity bounds, invalidators, canonical command/flags, arm verification, MERGED proof, Tier-B preservation, or no-delete behavior disappear. | pass | Parsed asset test has 187 assertions across session scope, identity, flags, re-arm, proof, invalidators, Tier-B, and no-delete. |
| AC10 | acceptance_criterion | Advance workflow capability law records session-scoped approved-PR auto-merge behavior without claiming typed persistent authorization. | pass | rq-approvedPrAutoMerge01 records active-session behavior and restart invalidation; JSON parses. |
| C1 | constraint | No blanket authority for unrelated PRs or repositories. | respected | No unrelated PR/repo authority. |
| C2 | constraint | No duplication in generic global Git instructions. | respected | No generic global instructions changed. |
| C3 | constraint | Existing archive Phase 9 runtime behavior remains unchanged. | respected | Reviewer archive-runtime hardening was explicitly reverted; Phase 9 implementation unchanged. |
| C4 | constraint | No claim that prompt/session authority survives restart or missing approval context. | respected | No restart-persistent authorization claim; structural boundary documented. |
| DONT1 | avoidance | No second merge prompt for same-change remediation PRs while session-scoped authority remains valid. | respected | No repeated merge prompt within valid active-session authority. |
| DONT2 | avoidance | No manual-merge-after-green default when GitHub auto-merge is available. | respected | Auto-merge arms immediately rather than manual merge after green. |
| DONT3 | avoidance | No inference that push permission authorizes merge. | respected | Push-only permission explicitly excluded. |
| DONT4 | avoidance | No claim that CI success equals merge completion. | respected | CI green not equated with merge completion. |
| DONT5 | avoidance | No prompt-only claim of durable persisted authorization. | respected | Agent/spec explicitly invalidate on session authority loss; no prompt-only durable persistence claim. |

