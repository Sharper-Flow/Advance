# Acceptance

Reviewed at: 2026-07-16T00:45:06.867Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **Continuation:** With a worker-refresh result of `1`, `deploy-local.sh --fix` copies bundled agents before final exit. | pass | `plugin/src/deploy-local-worker-refresh.test.ts` stuck-worker fixture proves command and bundled-agent sync continues; 107 focused deploy/agent tests pass. |
| AC2 | acceptance_criterion | **Loud failure:** In that case, exit status is nonzero and output still includes `[ADV:ACTION_REQUIRED]`, worker path/PID evidence, and restart instructions. | pass | Stuck-worker test requires nonzero status, `[ADV:ACTION_REQUIRED]`, worker path/PID, and restart remediation; targeted suite passes. |
| AC3 | acceptance_criterion | **Success path:** With a successful worker refresh, supported assets synchronize and final status remains successful unless another existing validation fails. | pass | Success-path regression asserts exit 0, asset sync, and no stale summary; targeted suite passes. |
| AC4 | acceptance_criterion | **Engineer contract:** Source and deployed `adv-engineer.md` direct Morph calls to include `workdir: WORKING DIRECTORY` and `taskId: TASK`. | pass | `adv-engineer-assets.test.ts` requires exact Morph directive with both `workdir: WORKING DIRECTORY` and `taskId: TASK`; focused test passes. |
| AC5 | acceptance_criterion | **Authorization preserved:** Existing Morph capability tests still reject missing, mismatched, and reused capability requests. | pass | `bun test` in `/home/jon/dev/opencode-morph-fast-apply` passes 141 tests, including capability authorization coverage. |
| AC6 | acceptance_criterion | **Proof:** Regression tests cover continuation/final-status behavior plus the engineer profile contract; relevant source checks pass. | pass | Verifier reports 107 focused deploy/agent tests passing; `bash -n scripts/deploy-local.sh` and external Morph tests pass. |
| C1 | constraint | No manual copying into `~/.config/opencode`. | respected | Committed diff is limited to deploy script and repository tests; no direct `~/.config/opencode` copy was added. |
| C2 | constraint | No weakening of worker matching, SIGTERM behavior, grace period, or nonzero failure semantics. | respected | Review confirms worker matcher, `kill -TERM`, bounded grace period, and read-only branches are unchanged; existing deploy tests pass. |
| C3 | constraint | No claim that the new worker bundle is active until its refresh succeeds. | respected | Failure summary names stale workers; stuck-worker test forbids `bounce complete`; success-path test forbids stale claim. |

