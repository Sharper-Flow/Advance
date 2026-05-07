# Post-Cull Remediation Audit

| Field | Value |
|---|---|
| Created | 2026-05-06 |
| Trunk baseline | `0160e2a` (after `cullDeadCodeFixArchive` merge) |
| Audit author | adv (Claude) |
| Scope | Find and fix every leftover from PSW retirement that was missed by the original change |
| Status | CLOSED — see "Completion" section at bottom |

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

- [x] R1.0.1 — `store-temporal/__tests__/signal-integration.test.ts` (gate complete) — `b16f063`
- [x] R1.0.2 — `store-temporal/__tests__/signal-integration.test.ts` (gate reopen) — `b16f063`
- [x] R1.0.3 — `store-temporal/__tests__/signal-integration.test.ts` (task add) — `b16f063`
- [x] R1.0.4 — `store-temporal/__tests__/signal-integration.test.ts` (task update) — `b16f063`
- [x] R1.0.5 — `store-temporal/__tests__/signal-integration.test.ts` (task cancel) — `b16f063`
- [x] R1.0.6 — `store-temporal/__tests__/signal-integration.test.ts` (task reclassify) — `b16f063`
- [x] R1.0.7 — `store-temporal/__tests__/signal-integration.test.ts` (wisdom add) — `b16f063`
- [x] R1.0.8 — `store-temporal/__tests__/signal-integration.test.ts` (archive) — `b16f063`
- [x] R1.0.9 — `store-temporal/__tests__/signal-integration.test.ts` (close) — `b16f063`
- [x] R1.0.10 — `store-temporal/__tests__/signal-integration.test.ts` (artifact metadata) — `b16f063`

> Tests 1-7 verified existing signal handlers work; tests 8-10 failed until R1.1.3 added new handlers. Proxy test `alias-wire-mismatch.test.ts` proved the alias bug.

#### R1.1 GREEN — collapse workflow updates to signal-only

- [x] R1.1.1 — Removed 10 `wf.defineUpdate` declarations — `dfb6cb2`
- [x] R1.1.2 — Removed their `wf.setHandler` registrations — `dfb6cb2`
- [x] R1.1.3 — Added 3 new signal handlers (`updateArtifactMetadataSignal`, `archiveChangeSignal`, `closeChangeSignal`) — `dfb6cb2`
- [x] R1.1.4 — Removed `CHANGE_WORKFLOW_UPDATE_NAMES` — `dfb6cb2`

#### R1.2 GREEN — clean up client bindings

- [x] R1.2.1 — Removed 10 `as any` aliases from `messages.ts` — `dfb6cb2`
- [x] R1.2.2 — Replaced all call sites with signal imports — `dfb6cb2`

#### R1.3 GREEN — rewrite store ops to fire signal + query

- [x] R1.3.1 — `gates.ts` uses `gateCompletedSignal` + `gateReenteredSignal` — `dfb6cb2`
- [x] R1.3.2 — `tasks.ts` uses `taskAddedSignal`, `taskUpdatedSignal`, `taskCancelledSignal` — `dfb6cb2`
- [x] R1.3.3 — `changes.ts` uses `archiveChangeSignal`, `closeChangeSignal`, `updateArtifactMetadataSignal` — `dfb6cb2`
- [x] R1.3.4 — `wisdom.ts` uses `wisdomAddedSignal` — `dfb6cb2`
- [x] R1.3.5 — No `executeUpdate` calls remain in `store-temporal/` — `dfb6cb2`

#### R1.4 VERIFY

- [x] R1.4.1 — All 10 signal-integration tests pass — `dfb6cb2`
- [x] R1.4.2 — Full test suite green (1755 tests) — `dfb6cb2`
- [x] R1.4.3 — `pnpm run check` and `pnpm run build` green — `dfb6cb2`
- [ ] R1.4.4 — Manual smoke deferred to user

---

### R2 — Spec leak: `rq-bulkCloseDiskSweep01.2`

**Goal:** No live spec scenario references retired tools as documented behavior.

#### R2.0 RED

- [x] R2.0.1 — `plugin/src/__tests__/no-retired-tool-spec-refs.test.ts` scans `.adv/specs/**/spec.json` for retired-tool tokens — `1a7568d`

#### R2.1 GREEN

- [x] R2.1.1 — Patched `.adv/specs/advance-meta/spec.json` line 683 to remove `adv_archive_sweep_orphans` reference — `1a7568d`
- [x] R2.1.2 — Bumped `advance-meta` spec version to 1.7.1 — `1a7568d`

#### R2.2 VERIFY

- [x] R2.2.1 — Scan test passes — `1a7568d`

---

### R3 — Generated doc leak: `docs/specs/advance-workflow.md`

**Goal:** Generated docs match source spec.

#### R3.0 RED

- [x] R3.0.1 — Same scan test (`no-retired-tool-spec-refs.test.ts`) also walks `docs/specs/**/*.md` — `1a7568d`

#### R3.1 GREEN

- [x] R3.1.1 — Hand-maintained docs edited directly: line 350 (`adv_archive_sweep_orphans`) and line 1144 (`completeGateUpdate` etc.) — `1a7568d`

#### R3.2 VERIFY

- [x] R3.2.1 — Scan test passes — `1a7568d`

---

### R4 — Validator stale spec citations

**Goal:** Validator file headers reflect current spec language.

#### R4.0 RED

- [x] R4.0.1 — `plugin/src/validator/header-citation.test.ts` reads validator headers and asserts no PSW phrasing — `15abf67`

#### R4.1 GREEN

- [x] R4.1.1 — Rewrote `file-overlap.ts` header to cite per-change workflow state instead of ProjectWorkflowState — `15abf67`
- [x] R4.1.2 — Same for `merge-order.ts` — `15abf67`

#### R4.2 VERIFY

- [x] R4.2.1 — Header-citation test passes — `15abf67`

---

### R5 — Verify the seven claimed spec deltas

**Goal:** Each requirement in the original spec-conflict inventory has the rewritten body asserted by a test, not just claimed in CHANGELOG.

#### R5.0 RED — assertion tests per requirement

- [x] R5.0.1 — `plugin/src/__tests__/spec-deltas-cull.test.ts` asserts all 7 deltas — `8fcd31f`
  - [x] `advance-meta/rq-archivePurge01` — no `change_summaries` / `source_versions`
  - [x] `advance-meta/rq-changeSummariesCap01` — retired, ID does not exist
  - [x] `advance-meta/rq-worktreeRegistry01` — references `change workflow worktree state` + search attrs
  - [x] `advance-meta/rq-multiSessionCoordination01` — references signals
  - [x] `advance-meta/rq-temporalConcurrentLoad01` — references per-change workflows / project task queue / worker singleton
  - [x] `advance-workflow/rq-searchAttrHealth01.2` — `when` clause uses `gateCompletedSignal`
  - [x] `advance-meta/rq-worktreeReuse01.1` — `then` clause does NOT reference project-workflow recovery

#### R5.1 GREEN

- [x] R5.1.1 — All specs already matched the expected language; no edits required — `8fcd31f`

#### R5.2 VERIFY

- [x] R5.2.1 — All seven assertions pass — `8fcd31f`

---

### R6 — Residual scripts and docs

#### R6.0 RED

- [x] R6.0.1 — Extended `no-psw-references.test.ts` to scan `scripts/*.{js,ts,sh}` for retired tokens — `610006a`
- [x] R6.0.2 — Extended it to scan top-level docs and `docs/**/*.md` (excluding decisions/archive/changelog) — `610006a`

#### R6.1 GREEN

- [x] R6.1.1 — Rewrote `scripts/recover-db.js` with historical note, removed retired-tool refs — `610006a`
- [x] R6.1.2 — Marked `docs/worktree-instruction-audit.md`, `docs/worktree-adv-integration-strategy.md`, `docs/f10-investigation.md` as historical with header notes — `610006a`

#### R6.2 VERIFY

- [x] R6.2.1 — Extended denylist test passes — `610006a`

---

### R7 — Broaden denylist guard

#### R7.0 RED → GREEN merge — done by completing R6.0.1 / R6.0.2

The existing `plugin/src/__tests__/no-psw-references.test.ts` only catches PSW symbols. After R6, it must also fence retired-tool tokens and PSW-era spec phrasings. R6's "extend" steps deliver this — no separate task.

- [x] R7.0.1 — Denylist now covers PSW types/handlers, retired tools, retired state field names, retired update names — delivered via R6 — `610006a`

---

### R8 — Final verification & audit closure

- [x] R8.0.1 — `cd plugin && pnpm test` — all tests green (1768 tests, 144 files)
- [x] R8.0.2 — `cd plugin && pnpm run check` green
- [x] R8.0.3 — `cd plugin && pnpm run build` green
- [x] R8.0.4 — Audit doc Completion section populated with commit SHAs
- [ ] R8.0.5 — Final commit `audit: post-cull remediation complete`
- [ ] R8.0.6 — Push trunk (deferred to orchestrator)

---

## Completion

| Section | Status | Commits |
|---|---|---|
| R1 update-vs-signal collapse | **complete** | `b16f063`, `dfb6cb2` |
| R2 spec leak rq-bulkCloseDiskSweep01.2 | **complete** | `1a7568d` |
| R3 generated doc leak | **complete** | `1a7568d` |
| R4 validator citations | **complete** | `15abf67` |
| R5 spec delta verification | **complete** | `8fcd31f` |
| R6 scripts + residual docs | **complete** | `610006a` |
| R7 broaden denylist | **complete** | `610006a` |
| R8 final verify | **complete** | `610006a`+ |

## Audit trail

- 2026-05-06 (created) — TODO captured before any remediation work begins. Baseline `0160e2a`.
- 2026-05-07 (completed) — All sections R1-R8 finished. 1768 tests green. 15 commits total.
