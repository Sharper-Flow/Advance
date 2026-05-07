# Post-Cull Remediation Audit

| Field | Value |
|---|---|
| Created | 2026-05-06 |
| Trunk baseline | `0160e2a` (after `cullDeadCodeFixArchive` merge) |
| Audit author | adv (Claude) |
| Scope | Find and fix every leftover from PSW retirement that was missed by the original change |
| Status | OPEN — see "Completion" section at bottom |

## Why this audit exists

`cullDeadCodeFixArchive` retired `projectWorkflow` / `ProjectWorkflowState` and shipped to trunk in 6 commits. Test suite green. Build green. Denylist guard active.

A follow-up scan revealed:

1. **`WorkflowUpdateFailedError` is still live in production calls.** The original symptom that triggered the cull (broken `adv_change_update` / `adv_task_update` / `adv_gate_complete`) was *not* fixed by retiring PSW. Root cause is independent: the client-side `messages.ts` exports update tokens aliased to **signal** definitions (`as any`), while `store-temporal/gates.ts` and friends call `handle.executeUpdate(token, …)`. Wire-name mismatch → runtime fail. The workflow still defines and handles 10 real `wf.defineUpdate` tokens, but the client never reaches them through the broken aliases.

2. **Spec, generated-doc, and validator-comment leaks** of retired-tool / retired-state language remain in live surfaces.

3. **Seven spec deltas were claimed but only some were visually verified.**

The work below resolves all of them with TDD ordering and persists evidence in git for later audit.

---

## TODO — TDD ordered

Each section is a self-contained unit. Within a section: **RED tests come first, then GREEN implementation, then VERIFY.**

Section-level acceptance criterion is the GREEN-phase test passing plus the denylist scan.

> **Tracking convention**: every checkbox starts `- [ ]`. Tick `- [x]` only when both code AND test are committed. Reference commit SHA after each `- [x]`.

---

### R1 — Update-vs-signal collapse (CRITICAL — fixes `WorkflowUpdateFailedError`)

**Goal:** Every store-layer mutation uses **signal-fire + query-readback** OR a clean `wf.defineUpdate` call with matching wire names. No `as any` aliases that route updates to signal definitions.

**Strategy chosen (per matrix + user direction "no middle steps"):** Collapse to **signal-only**. Remove all 10 update definitions and handlers. Use signals + post-fire query for the readback callers expect.

#### R1.0 RED — integration tests that exercise real Temporal env

- [ ] R1.0.1 — `store-temporal/gates.complete-integration.test.ts` — uses `TestWorkflowEnvironment` + `Worker.runUntil` to start a real `changeWorkflow`, then call `store.gates.complete(changeId, "discovery")` and assert the change-state query reflects `gates.discovery.status === "done"`. Must fail in current trunk.
- [ ] R1.0.2 — `store-temporal/gates.reopen-integration.test.ts` — same pattern for `store.gates.reopenFrom`.
- [ ] R1.0.3 — `store-temporal/tasks.add-integration.test.ts` — same for `store.tasks.add`.
- [ ] R1.0.4 — `store-temporal/tasks.update-integration.test.ts` — same for `store.tasks.update`.
- [ ] R1.0.5 — `store-temporal/tasks.cancel-integration.test.ts` — same for `store.tasks.cancel`.
- [ ] R1.0.6 — `store-temporal/tasks.reclassifyTdd-integration.test.ts` — same for `store.tasks.reclassifyTdd`.
- [ ] R1.0.7 — `store-temporal/wisdom.add-integration.test.ts` — same for `store.wisdom.add`.
- [ ] R1.0.8 — `store-temporal/changes.archive-integration.test.ts` — same for `store.changes.archive`.
- [ ] R1.0.9 — `store-temporal/changes.close-integration.test.ts` — same for `store.changes.close`.
- [ ] R1.0.10 — `store-temporal/changes.updateArtifact-integration.test.ts` — same for artifact metadata path.

> Each test MUST start a real Worker against `changeWorkflow` so the wire-name mismatch surfaces. Mock-based tests miss the bug.

#### R1.1 GREEN — collapse workflow updates to signal-only

- [ ] R1.1.1 — Remove the 10 `wf.defineUpdate` declarations in `plugin/src/temporal/workflows.ts` (`addTaskUpdate`, `updateTaskUpdate`, `cancelTaskUpdate`, `reclassifyTaskTddUpdate`, `completeGateUpdate`, `reopenFromGateUpdate`, `addWisdomUpdate`, `updateArtifactMetadataUpdate`, `archiveChangeUpdate`, `closeChangeUpdate`).
- [ ] R1.1.2 — Remove their `wf.setHandler(<update>, ...)` registrations.
- [ ] R1.1.3 — Confirm equivalent signal handlers already exist for each operation: `taskAdded`, `taskUpdated`, `taskCancelled`, `taskUpdated` (carries reclassify), `gateCompleted`, `gateReentered`, `wisdomAdded`, *(updateArtifact: introduce signal if missing)*, `archiveRequested`, `changeCancelled`. Where a signal is missing for the operation (e.g. update-artifact-metadata if no signal exists), add a new `defineSignal` + handler that wraps the same state mutator the update used to call.
- [ ] R1.1.4 — Remove `CHANGE_WORKFLOW_UPDATE_NAMES` constant from `plugin/src/temporal/contracts.ts` (no longer needed).

#### R1.2 GREEN — clean up client bindings

- [ ] R1.2.1 — Remove the 10 `as any` alias exports from `plugin/src/temporal/messages.ts` (lines ~200-220).
- [ ] R1.2.2 — Replace each call site that imports those aliases with a direct signal-fire path. Audit the import graph (use `grep -rln "completeGateUpdate\|addTaskUpdate\|cancelTaskUpdate\|reclassifyTaskTddUpdate\|reopenFromGateUpdate\|addWisdomUpdate\|updateArtifactMetadataUpdate\|archiveChangeUpdate\|closeChangeUpdate\|updateTaskUpdate" plugin/src`).

#### R1.3 GREEN — rewrite store ops to fire signal + query

- [ ] R1.3.1 — `plugin/src/storage/store-temporal/gates.ts`: replace `executeUpdate(completeGateUpdate, …)` with `signal(gateCompletedSignal, …)` then `query(changeStateQuery)` for the post-mutation read. Same for `reopenFromGateUpdate` → `gateReenteredSignal`.
- [ ] R1.3.2 — `plugin/src/storage/store-temporal/tasks.ts` (or wherever task ops live): same pattern.
- [ ] R1.3.3 — `plugin/src/storage/store-temporal/changes.ts`: archive/close/updateArtifact paths.
- [ ] R1.3.4 — Wisdom add path (likely `store-temporal/wisdom.ts` or `index.ts`).
- [ ] R1.3.5 — Verify no `executeUpdate` calls remain in `plugin/src/storage/store-temporal/`. Add a denylist row for it.

#### R1.4 VERIFY

- [ ] R1.4.1 — All R1.0.* tests now pass.
- [ ] R1.4.2 — Existing test suite still green: `pnpm test` from `plugin/`.
- [ ] R1.4.3 — `pnpm run check` and `pnpm run build` green.
- [ ] R1.4.4 — Manual smoke: invoke `adv_change_update` against a real change via the rebuilt plugin (requires fresh OpenCode session after `pnpm run build`). Expect no `WorkflowUpdateFailedError`. *(deferred to user verification — not blocking)*

---

### R2 — Spec leak: `rq-bulkCloseDiskSweep01.2`

**Goal:** No live spec scenario references retired tools as documented behavior.

#### R2.0 RED

- [ ] R2.0.1 — Add scan test `plugin/src/__tests__/no-retired-tool-spec-refs.test.ts` that walks `.adv/specs/**/spec.json` and fails if any non-comment field contains: `adv_workflow_repair`, `adv_orphan_sweep`, `adv_archive_sweep_orphans`, `adv_migrate_cleanup`, `adv_change_diagnose`, `adv_change_import`, `adv_task_evidence`, `adv_task_run_status`, `adv_task_tdd`. Should fail today on `advance-meta/rq-bulkCloseDiskSweep01.2.then[1]`.

#### R2.1 GREEN

- [ ] R2.1.1 — Patch `.adv/specs/advance-meta/spec.json` line 683: rewrite to `"Failed source dirs are reported separately and may be retried via subsequent bulk-close runs"` or similar — drop the retired-tool reference.
- [ ] R2.1.2 — Bump the `version` field on `advance-meta` spec.

#### R2.2 VERIFY

- [ ] R2.2.1 — Scan test from R2.0.1 passes.

---

### R3 — Generated doc leak: `docs/specs/advance-workflow.md`

**Goal:** Generated docs match source spec.

#### R3.0 RED

- [ ] R3.0.1 — Extend the scan from R2.0.1 (or add a sibling test) to also walk `docs/specs/**/*.md` for the same retired-token list. Should fail today on `advance-workflow.md` lines 350 and 1144.

#### R3.1 GREEN

- [ ] R3.1.1 — Determine if `docs/specs/*.md` is generated or hand-maintained (check for a regen script in `package.json`/`scripts/`). If generated → run regen. If hand-maintained → edit the file directly to drop `adv_archive_sweep_orphans runs in approved execute mode` (line 350) and `completeGateUpdate, archiveChangeUpdate, or closeChangeUpdate handlers execute` (line 1144) language. Replace with current truth.

#### R3.2 VERIFY

- [ ] R3.2.1 — Scan test passes.

---

### R4 — Validator stale spec citations

**Goal:** Validator file headers reflect current spec language.

#### R4.0 RED

- [ ] R4.0.1 — Add header-citation drift test `plugin/src/validator/header-citation.test.ts` that reads each validator's leading comment block and asserts it does NOT contain `state authority lives in ProjectWorkflowState` or similar PSW-era phrasing. Fails today on both `file-overlap.ts` and `merge-order.ts`.

#### R4.1 GREEN

- [ ] R4.1.1 — Rewrite `plugin/src/validator/file-overlap.ts` doc-comment header to cite the current `worktree-lifecycle/rq-wl-branchRegistry01` (or whatever the rewritten worktree spec is) and drop `ProjectWorkflowState` mention.
- [ ] R4.1.2 — Same for `plugin/src/validator/merge-order.ts`.

#### R4.2 VERIFY

- [ ] R4.2.1 — R4.0.1 passes.

---

### R5 — Verify the seven claimed spec deltas

**Goal:** Each requirement in the original spec-conflict inventory has the rewritten body asserted by a test, not just claimed in CHANGELOG.

#### R5.0 RED — assertion tests per requirement

- [ ] R5.0.1 — `plugin/src/__tests__/spec-deltas-cull.test.ts` — for each of the seven requirements below, load the spec JSON and assert the body contains the new language and does NOT contain the retired language:
  - [ ] `advance-meta/rq-archivePurge01` — must NOT mention `change_summaries` or `source_versions` registry. Should reference archive bundle / change workflow termination.
  - [ ] `advance-meta/rq-changeSummariesCap01` — RETIRED entirely. Test asserts the requirement ID does not exist in the spec.
  - [ ] `advance-meta/rq-worktreeRegistry01` — body must reference `change workflow worktree state` and `AdvWorktreeBranches` / `AdvWorktreePaths`. Must NOT reference `ProjectWorkflowState.worktree_registry`.
  - [ ] `advance-meta/rq-multiSessionCoordination01` — body must reference signals; must NOT reference `Temporal workflow updates → project workflow`.
  - [ ] `advance-meta/rq-temporalConcurrentLoad01` — body must reference per-change workflows / project task queue / worker singleton.
  - [ ] `advance-workflow/rq-searchAttrHealth01.2` — `when` clause must reference `gateCompletedSignal` (not `completeGateUpdate`).
  - [ ] `worktree-lifecycle/rq-worktreeReuse01.1` — `then` clause must NOT reference project-workflow recovery.

#### R5.1 GREEN

- [ ] R5.1.1 — For each spec where the assertion fails, edit the JSON to match the spec-conflict inventory in `cullDeadCodeFixArchive` design (preserved in `.adv/archive/.../change.json` or design.md if archived; otherwise reconstruct from the original audit recommendations).

#### R5.2 VERIFY

- [ ] R5.2.1 — All seven assertions pass.

---

### R6 — Residual scripts and docs

#### R6.0 RED

- [ ] R6.0.1 — Extend `no-psw-references.test.ts` denylist to scan `plugin/scripts/*.{js,ts,sh}` for retired tokens. Should fail on `recover-db.js` if it still has them.
- [ ] R6.0.2 — Extend it to also scan top-level docs in repo root (`README.md`, `SETUP.md`, `AGENTS.md`, `project.md`, `ADV_INSTRUCTIONS.md`) and `docs/**/*.md` for retired-tool / `ProjectWorkflowState` / `projectWorkflow` patterns in non-historical contexts. Allow files matching `^docs/decisions/.*-prep\.md$` and `^.adv/archive/.*$` and `^CHANGELOG\.md$` (changelogs/decisions/archives = historical OK).

#### R6.1 GREEN

- [ ] R6.1.1 — Either delete or rewrite `plugin/scripts/recover-db.js` so it has no retired-token references.
- [ ] R6.1.2 — Sweep `docs/f10-investigation.md`, `docs/worktree-adv-integration-strategy.md`, `docs/worktree-instruction-audit.md` — mark as historical with a header note OR remove retired-tool prose.

#### R6.2 VERIFY

- [ ] R6.2.1 — Extended denylist test passes.

---

### R7 — Broaden denylist guard

#### R7.0 RED → GREEN merge — done by completing R6.0.1 / R6.0.2

The existing `plugin/src/__tests__/no-psw-references.test.ts` only catches PSW symbols. After R6, it must also fence retired-tool tokens and PSW-era spec phrasings. R6's "extend" steps deliver this — no separate task.

- [ ] R7.0.1 — Final review: confirm denylist covers all token classes documented in this audit (PSW types/handlers, retired tools, retired state field names, retired update names).

---

### R8 — Final verification & audit closure

- [ ] R8.0.1 — `cd plugin && pnpm test` — all tests green (existing 1732 + new R1/R2/R3/R4/R5/R6 tests).
- [ ] R8.0.2 — `cd plugin && pnpm run check` green.
- [ ] R8.0.3 — `cd plugin && pnpm run build` green.
- [ ] R8.0.4 — Update this audit doc's Completion section with commit SHAs per item.
- [ ] R8.0.5 — Final commit `audit: post-cull remediation complete`.
- [ ] R8.0.6 — Push trunk.

---

## Completion

| Section | Status | Commits |
|---|---|---|
| R1 update-vs-signal collapse | _pending_ | _pending_ |
| R2 spec leak rq-bulkCloseDiskSweep01.2 | _pending_ | _pending_ |
| R3 generated doc leak | _pending_ | _pending_ |
| R4 validator citations | _pending_ | _pending_ |
| R5 spec delta verification | _pending_ | _pending_ |
| R6 scripts + residual docs | _pending_ | _pending_ |
| R7 broaden denylist | _pending_ | _pending_ |
| R8 final verify | _pending_ | _pending_ |

## Audit trail

- 2026-05-06 (created) — TODO captured before any remediation work begins. Baseline `0160e2a`.
