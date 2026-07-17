# Contract Traceability

**Change ID:** fixCrossProjectTrunkFirewall
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-17T05:17:06.094Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY (0 findings, 190 scoped tests): foreign default-branch main-checkout writes block target-relatively with worktree remediation (tr_mrohfj78_79fc615d: 123 firewall/integration tests green). |
| SC2 | success_criterion | pass | review | Eligible non-prunable target linked worktrees allow while main checkouts stay protected; direct/Bash parity covered (tr_mrohfj78_79fc615d). |
| SC3 | success_criterion | pass | review | Checkpoint target workdir binding: explicit workdir wins over target default; unrelated/blank workdirs reject before Git/task-state mutation (checkpoint.test.ts in tr_mrohfzn8_8c6d2cfd: 207 tests). |
| SC4 | success_criterion | pass | review | Target queue readiness: local queue registration first, per-queue liveness, conservative fresh-poller admission, typed refusal with queue/status/confidence/blockers/remediation before mutation (target-project.test.ts, tr_mrohfzn8_8c6d2cfd). |
| SC5 | success_criterion | pass | review | Target routing identity audited: all withTargetPathStore routes bind workflow/store to resolved target project ID; snapshot reads carry non-authoritative disk-snapshot marker (change.test.ts + target-project.test.ts seam proofs). |
| SC6 | success_criterion | pass | review | Contract/spec alignment verified: delta dl-crossProjectTrunkFirewall01 consistent with implementation; spec-assets + citation invariant green (tr_mrohfj78, tr_mrohga6h); reviewer confirmed all 29 rows passable. |
| AC1 | acceptance_criterion | pass | test | Foreign repo default-branch checkout write from session in repo A blocks with worktree remediation (trunk-write-firewall.test.ts, tr_mrohfj78_79fc615d). |
| AC2 | acceptance_criterion | pass | test | Direct file and recognized Bash writes to registered repo-B worktrees allow (tr_mrohfj78_79fc615d). |
| AC3 | acceptance_criterion | pass | test | Exact ROADMAP.md/CHANGELOG.md/.adv/github-project.json/.adv/roadmap-snapshot.json at target root allow; nested lookalikes and other .adv paths block (tr_mrohfj78_79fc615d). |
| AC4 | acceptance_criterion | pass | test | Missing-parent nested targets classified by nearest existing ancestor; foreign-default ancestors block (worktree-paths.test.ts, tr_mrohfj78_79fc615d). |
| AC5 | acceptance_criterion | pass | test | Unknown/unverifiable default branch → target main-checkout writes block with remediation (tr_mrohfj78_79fc615d). |
| AC6 | acceptance_criterion | pass | test | Same-project trunk/worktree block/allow behavior unchanged (trunk-write-firewall.regression.test.ts green, tr_mrohfj78_79fc615d). |
| AC7 | acceptance_criterion | pass | test | Recognized destructive Bash targets get identical foreign-trunk protection as direct writes (parity tests, tr_mrohfj78_79fc615d). |
| AC8 | acceptance_criterion | pass | test | adv_task_checkpoint with target_path + explicit target worktree workdir uses supplied workdir for Git and routes task state through target store (checkpoint.test.ts, tr_mrohfzn8_8c6d2cfd; prior tr_mrmocnu6: 104). |
| AC9 | acceptance_criterion | pass | test | Target queue: registers or accepts fresh server-poller evidence; otherwise returns queue name/status/confidence/blockers/remediation without mutating target state (target-project.test.ts RED-first matrix, tr_mrohfzn8_8c6d2cfd; prior tr_mrmo42x7: 49). |
| AC10 | acceptance_criterion | pass | test | Artifact mutation/close routes prove workflow ID and store project ID equal resolved target project ID incl. negative source-identity guards (change.test.ts pins, tr_mrohfzn8_8c6d2cfd; prior tr_mrmq5clm: 212). |
| AC11 | acceptance_criterion | pass | test | Target-path snapshot reads self-identify as non-authoritative disk snapshots (seam tests in target-project.test.ts, tr_mrohfzn8_8c6d2cfd). |
| C1 | constraint | respected | static_check | Topology resolution bounded to one hook invocation; memoized without caching mutable branch/default/recovery probes (reviewer static review; check green tr_mrohi92k_850de2e2). |
| C2 | constraint | respected | static_check | Target store routing preserves project identity; explicit workdir binding prevents wrong-worktree commits (static review + identity pins). |
| C3 | constraint | respected | static_check | Fail-closed behavior on uncertainty: unknown default blocks, queue-unready refuses before mutation (check green tr_mrohi92k_850de2e2). |
| C4 | constraint | respected | static_check | Prunable worktree records never grant linked-worktree allowance (worktree-paths tests + static review). |
| C5 | constraint | respected | static_check | Same-project firewall semantics and established exceptions (non-Git, recovery) preserved (regression suite green). |
| DONT1 | avoidance | respected | review | No weakening of session-project firewall; foreign protection is additive (regression tests green, reviewer READY). |
| DONT2 | avoidance | respected | review | No session-root-relative evaluation of target artifacts; allowlist evaluated relative to target main root (engineer decision record + tests). |
| DONT3 | avoidance | respected | review | No target-state mutation on unready queue; typed refusal path proven (AC9 tests). |
| DONT4 | avoidance | respected | review | No silent fallbacks: uncertainty surfaces as block/refusal with remediation; snapshot reads marked non-authoritative (reviewer READY, 0 findings). |
| OOS1 | out_of_scope | not_applicable | not_applicable | Out-of-scope item untouched. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Out-of-scope item untouched. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Out-of-scope item untouched. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-71036bbf8b61 | SC1, SC2, AC1, AC2, AC3, AC4, AC5, AC6, AC7 |  | C1, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-87598e4d7356 | AC6 |  | C4, DONT3 |  |
| tk-e7071a2aebba |  | SC1, SC2, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-3a553a6d2ba9 | SC4, AC9 |  | C3, DONT4 |  |
| tk-ef1f18171f58 | SC3, AC8 |  | C2, DONT4 |  |
| tk-e30fb19f02f5 | SC5, AC10, AC11 |  | C2, C3, DONT4 |  |
| tk-56346d82586a |  | SC1, SC2, SC3, SC4, SC5, SC6, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-8924a2710749 |  |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-0a59634d014c |  | SC6 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-7e3e2c298bc5 |  |  |  | Re-entry repair addresses deterministic repository-wide citation and law drift discovered after initial contract approval; it preserves existing executable routing. |
