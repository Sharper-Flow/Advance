# Contract Traceability

**Change ID:** fixDeploymentSyncOrdering
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-16T00:45:06.867Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `plugin/src/deploy-local-worker-refresh.test.ts` stuck-worker fixture proves command and bundled-agent sync continues; 107 focused deploy/agent tests pass. |
| AC2 | acceptance_criterion | pass | test | Stuck-worker test requires nonzero status, `[ADV:ACTION_REQUIRED]`, worker path/PID, and restart remediation; targeted suite passes. |
| AC3 | acceptance_criterion | pass | test | Success-path regression asserts exit 0, asset sync, and no stale summary; targeted suite passes. |
| AC4 | acceptance_criterion | pass | test | `adv-engineer-assets.test.ts` requires exact Morph directive with both `workdir: WORKING DIRECTORY` and `taskId: TASK`; focused test passes. |
| AC5 | acceptance_criterion | pass | test | `bun test` in `/home/jon/dev/opencode-morph-fast-apply` passes 141 tests, including capability authorization coverage. |
| AC6 | acceptance_criterion | pass | test | Verifier reports 107 focused deploy/agent tests passing; `bash -n scripts/deploy-local.sh` and external Morph tests pass. |
| C1 | constraint | respected | static_check | Committed diff is limited to deploy script and repository tests; no direct `~/.config/opencode` copy was added. |
| C2 | constraint | respected | static_check | Review confirms worker matcher, `kill -TERM`, bounded grace period, and read-only branches are unchanged; existing deploy tests pass. |
| C3 | constraint | respected | static_check | Failure summary names stale workers; stuck-worker test forbids `bounce complete`; success-path test forbids stale claim. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-ccb1a8fb008b |  | AC1, AC2, AC3, AC6 | C2, C3 |  |
| tk-0d5183f9e5f7 | AC1, AC2, AC3, AC6 |  | C2, C3 |  |
| tk-6c8e543f73fe |  | AC4 | C1 |  |
| tk-240e3e94d96c |  | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3 |  |
