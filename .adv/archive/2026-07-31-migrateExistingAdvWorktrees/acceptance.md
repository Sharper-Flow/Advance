# Acceptance

Reviewed at: 2026-07-31T01:24:00.210Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Given an exact branch batch and a ten-day cutoff, when each requested worktree has both last branch commit activity and last ADV change activity older than the cutoff, then preview returns one deterministic eligible/refused disposition per branch without mutation. | pass | Reviewer READY; dual-staleness tested. |
| SC2 | success_criterion | Given a clean, inactive, unambiguous branch and an approved matching apply request, when detach succeeds, then the directory is removed while the branch, commits, and ADV change record remain recoverable. | pass | Reviewer READY; directory-only detach and rollback tested. |
| SC3 | success_criterion | Evidence: detach receipt retention via durable change-record storage proves request, preflight facts, outcome, and approval evidence. | pass | Reviewer READY; receipt persistence tested. |
| AC1 | acceptance_criterion | Given a dry-run request with exact branch identifiers and a positive cutoff, when preflight evaluates it, then no Git, workspace, registry, or ADV lifecycle state changes and every branch has a typed disposition. | pass | tr_ms898ppl_19b17ff7 |
| AC2 | acceptance_criterion | Given an apply request, when its branch list differs from the approved dry-run set, its cutoff differs, or approval evidence is blank, then every affected branch is refused before detach. | pass | tr_ms898ppl_19b17ff7 |
| AC3 | acceptance_criterion | Given a requested branch, when it is dirty, locked, current-CWD, has an active ADV session, has ambiguous branch-to-path ownership, or its registry/workflow evidence is missing or poisoned, then it is refused with a typed reason. | pass | tr_ms898ppl_19b17ff7 |
| AC4 | acceptance_criterion | Given an eligible branch, when detach succeeds, then only its worktree directory is removed; its local branch, commits, and owning ADV change state are unchanged. | pass | tr_ms898ppl_19b17ff7 |
| AC5 | acceptance_criterion | Given a successful detach, when the owning change is resumed later, then the preserved branch record rematerializes through the normal worktree-create path. | pass | tr_ms898ppl_19b17ff7 |
| AC6 | acceptance_criterion | Given a successful or refused request, when its result is recorded, then a durable receipt retained with the change includes request identity, cutoff, branch, preflight facts, outcome, timestamp, and approval evidence. | pass | tr_ms898ppl_19b17ff7 |
| AC7 | acceptance_criterion | Given concurrent or replayed requests for the same branch, when they carry the same request identity, then at most one directory removal occurs and an already-detached branch returns an idempotent result. | pass | tr_ms898ppl_19b17ff7 |
| AC8 | acceptance_criterion | Given terminal cleanup, startup cleanup, triage, or automatic migration, when it runs without an explicit detach request, then it does not invoke directory-only detach. | pass | tr_ms89dt6c_6ce38a88 |
| AC9 | acceptance_criterion | Evidence: automated test coverage via the worktree test suite proves eligible detach, dry-run non-mutation, approval/cutoff mismatch, each refusal condition, registry preservation/rematerialization, receipt retention, idempotent replay/concurrency, and terminal-cleanup non-regression. | pass | tr_ms89dt6c_6ce38a88 |
| C1 | constraint | Must require both last Git branch activity and last ADV change activity to exceed the configured cutoff. | respected | Reviewer READY; dual-clock guard. |
| C2 | constraint | Must require an exact immutable branch batch; no filesystem glob, inferred batch, or age-only deletion. | respected | Reviewer READY; exact batch binding. |
| C3 | constraint | Must preserve all ADV records, local branches, commits, and uncommitted work. | respected | Reviewer READY; branch and records preserved. |
| C4 | constraint | Must use the existing Git/worktree abstraction and durable registry authority; no shell escape hatch. | respected | Reviewer READY; shared Git helper. |
| C5 | constraint | Must refuse unavailable Temporal, failed registry lookup, and poisoned history. | respected | Reviewer READY; unavailable state refuses. |
| C6 | constraint | Must retain audit receipts with the owning change record. | respected | Reviewer READY; durable receipts. |
| DONT1 | avoidance | Do not close, archive, cancel, re-enter, or otherwise mutate an owning ADV change. | respected | Reviewer READY; no lifecycle mutation. |
| DONT2 | avoidance | Do not delete a Git branch or commit. | respected | Reviewer READY; directory-only. |
| DONT3 | avoidance | Do not auto-trigger detach from startup, triage, cleanup, or migration. | respected | tr_ms89dt6c_6ce38a88 lifecycle boundary suite. |
| DONT4 | avoidance | Do not change terminal cleanup eligibility or integration rules. | respected | Reviewer READY; terminal cleanup unchanged. |
| OOS1 | out_of_scope | Production deployment or cross-project mutation. | not_applicable | No production or cross-project mutation. |
| OOS2 | out_of_scope | Automatic garbage collection or migration of live worktrees. | not_applicable | No automatic garbage collection or live migration. |

