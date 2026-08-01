# Acceptance

Reviewed at: 2026-08-01T17:46:18.518Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | A contributor can run the suite on a machine without ripgrep installed and get the same results as a machine with it. | pass | tr_ms9akj8t_bfe348f9; CI |
| SC2 | success_criterion | Trunk CI is a trustworthy baseline, so a branch's red check indicates that branch's own defect. | pass | CI and READY review |
| SC3 | success_criterion | Recording a spec delta actually persists it, so callers do not silently lose staged spec work. | pass | spec-delta tests |
| SC4 | success_criterion | Bun CLI tests that exercise live Temporal have a ready Temporal endpoint in GitHub Actions. | pass | #351; CI |
| AC1 | acceptance_criterion | `findExecutableSaveChangeCalls` invokes no child process or external executable, and the targeted suites `save-change-allow-list.test.ts` plus the writer-allowlist case in `read-command-boundary.test.ts` exit 0 while detecting the same executable call-site set as the ripgrep implementation. | pass | tr_ms9akj8t_bfe348f9 |
| AC2 | acceptance_criterion | Tests prove direct executable `saveChange(...)` calls are detected; comments, strings, and non-call identifiers are excluded; unrelated malformed TypeScript is excluded before AST parsing; a missing `plugin/src` scan root returns empty instead of throwing; and output ordering is deterministic, with TypeScript AST checks remaining the primary authority. | pass | tr_ms9akj8t_bfe348f9 |
| AC3 | acceptance_criterion | Every `deploy-local.sh` spawn in `overlay-sync-assets.test.ts`, `deploy-local-plugin-manifest.test.ts`, and `deploy-local-worker-refresh.test.ts` runs against a temporary real git worktree with controlled tooling shims rather than the repository root, routed through one shared fixture helper that refuses a repository-root working directory. | pass | tr_ms9chb10_1e390350 |
| AC4 | acceptance_criterion | Those three targeted files exit 0 within their existing per-test time limits, leave the source worktree and its build output unmodified, and still verify real deployed overlay and manifest content rather than mocking the asserted outcome, with fixture manifests seeded so hash validation exercises its real comparison path. | pass | tr_ms9ecqvi_29b34884 |
| AC5 | acceptance_criterion | `bounded-read-deadline.test.ts` exits 0 with 4 of 4 tests passing and zero unhandled runner errors, its client double returns a rejecting async iterable matching the real `WorkflowClient.list` contract, and routine reads that must not consult Visibility assert this through explicit call-count assertions rather than relying on a thrown error surfacing. | pass | tr_ms9f4ho8_bdeed792 |
| AC6 | acceptance_criterion | The bounded Visibility fallback for terminal reads remains executable and tested, and no production read-gate semantics change in this change. | pass | tr_msamtk86_d4f08c01 |
| AC7 | acceptance_criterion | `pnpm --dir plugin run check` exits 0 with no new warnings. | pass | plugin check passed |
| AC8 | acceptance_criterion | `bin/oc-test full` exits 0 apart from failures independently classified as host-load environmental, with no failing test file, failed test, or unhandled test-runner error attributable to code. | pass | CI plus classified host exception |
| AC9 | acceptance_criterion | The repair PR's GitHub Actions CI reaches terminal `success` before merge, and merge-state evidence alone does not satisfy this criterion. | pass | PR #355 6/6 |
| AC10 | acceptance_criterion | `createSpecDeltaOps` obtains its persistence collaborators through typed, explicitly passed dependencies rather than closure bindings it cannot reach; `spec-deltas.test.ts` and `spec-deltas.disk-projection.test.ts` exit 0; and a regression test asserts a recorded delta is actually readable from the on-disk projection afterwards, failing if the collaborator is unwired. | pass | spec-delta tests |
| AC11 | acceptance_criterion | `adv-skill-backed-commands-assets.test.ts` exits 0, after inspecting what grew `.opencode/command/adv-apply.md` from 492 to 852 lines, removing content that is duplicated or non-load-bearing, and re-freezing the baseline only for growth shown to be legitimate. | pass | CI assets |
| AC12 | acceptance_criterion | `tool-name-assets.test.ts` exits 0, after the same inspection for `.opencode/agents/adv-verifier.md`, whose prompt exceeds the 400-byte budget by 1102 bytes. | pass | CI assets |
| AC13 | acceptance_criterion | The CI workflow starts the Temporal development server using the existing installed CLI, waits for a bounded health probe to succeed, and `bun test bin/` passes in GitHub Actions without weakening or skipping live-Temporal tests. | pass | #351; PR #355 |
| C1 | constraint | No test deletion, skip, assertion weakening, timeout increase, retry masking, or suppression of unhandled rejections. | respected | READY review |
| C2 | constraint | No new dependency on ripgrep or another external executable for source discovery. | respected | Node scan |
| C3 | constraint | Content filtering may reduce AST parse candidates but may not own correctness; TypeScript AST checks remain authoritative. | respected | AST unchanged |
| C4 | constraint | Deploy fixtures must exercise the real synchronization logic and asserted file outputs; only unrelated build and tooling cost may be shimmed. | respected | fixture tests |
| C5 | constraint | Correcting the test double must preserve its power to detect an unwanted production Visibility call. | respected | call-count tests |
| C6 | constraint | All implementation, tests, commits, and PR operations remain in the `change/fixCiRipgrepOverlayTimeout` worktree. | respected | worktree review |
| C7 | constraint | A frozen baseline may be raised only after inspecting what drove the growth and recording why the new value is correct; raising a baseline to silence a failure without that inspection is prohibited. | respected | recorded rationale |
| C8 | constraint | The spec-delta repair must fix the dependency wiring, not paper over it by re-exporting internals or duplicating persistence logic. | respected | single-writer tests |
| C9 | constraint | Use the documented `temporal server start-dev --headless` command from the existing `temporalio/setup-temporal@v0` action; make readiness explicit and bounded before Bun tests begin. | respected | #351 readiness |
| OOS1 | out_of_scope | Installing ripgrep in CI to hide the undeclared dependency. | respected | no CI package |
| OOS2 | out_of_scope | Increasing existing test timeouts. | respected | no timeout rise |
| OOS3 | out_of_scope | Attaching no-op rejection handlers merely to silence Vitest. | respected | no suppression |
| OOS4 | out_of_scope | Narrowing the terminal-read Visibility gate, which the design validator showed risks hiding orphan terminal rows for only a performance gain. | respected | no gate change |
| OOS5 | out_of_scope | Deploying or rebuilding Advance from the change worktree. | respected | no worktree deploy |
| OOS6 | out_of_scope | Merging based only on local evidence or PR mergeability. | respected | PR CI |
| OOS7 | out_of_scope | Repairing the nine temporal integration tests classified as host-load environmental, which pass on an isolated rerun and behave identically on trunk. | respected | not repaired |
| OOS8 | out_of_scope | Broader refactoring of the storage module beyond the dependency wiring required by AC10. | respected | bounded storage change |
| OOS9 | out_of_scope | Replacing the existing Temporal CLI action, changing test semantics, or introducing a new CI service dependency. | respected | CLI action retained |

