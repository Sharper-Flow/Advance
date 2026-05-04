# Design

## Architecture Overview

This change updates agent/operator-facing guidance surfaces only. Runtime code paths remain unchanged:

- OpenCode host loads ADV plugin tools from `plugin/src/index.ts` and imported `plugin/src/tools/*.ts` modules for this repo session.
- Temporal worker restart calls `restartCurrentProjectTemporalWorker`, which drains registered workers and spawns either an in-process worker or an out-of-process Node child depending on runtime support.
- The out-of-process worker script resolves to `plugin/dist/temporal/worker.js`, so worker source edits under `plugin/src/temporal/*` require `pnpm run build:worker` before restart.

The design uses precise wording at each user-facing surface so agents choose the correct reload path without changing restart semantics.

## Key Decisions

1. **Hybrid wording depth**
   - Short recovery strings stay concise and action-oriented.
   - The `adv_temporal_worker_restart` description and `docs/temporal-recovery.md` carry the fuller reload matrix.
   - Rationale: OpenCode agents consume `recommendedNextAction` in tight loops; long strings reduce actionability, but at least one rich surface must state the caveat plainly.

2. **No runtime behavior changes**
   - Do not touch `restartCurrentProjectTemporalWorker`, worker lock handling, or STSL recovery behavior.
   - Rationale: issue #20 is a docs/UX guidance defect, and current runtime behavior matches the intended separation.

3. **Docs included, but bounded**
   - Update `docs/temporal-recovery.md` around external restart boundary and worker troubleshooting.
   - Avoid broader docs churn outside worker restart/reload guidance.
   - Rationale: user requested docs too; bounded updates prevent unrelated Temporal recovery changes.

4. **Tests lock guidance intent, not brittle full prose everywhere**
   - Update existing string assertions for recommendation outputs.
   - Add/adjust assertions that the restart tool description mentions the no-tool-code-reload caveat and build-worker requirement.
   - Rationale: preserve behavior coverage while preventing reintroduction of misleading wording.

5. **Issue #20 handling remains post-landing**
   - Do not auto-close during implementation.
   - If PR flow is used, include a GitHub-supported closing keyword (`Fixes #20`) in PR body. If direct local workflow lands without PR, report evidence and let user decide issue comment/closure.

## Implementation Strategy

1. Update `plugin/src/tools/temporal-ops.ts`:
   - Replace `in-process Temporal worker` description with project Temporal worker process wording.
   - Explicitly state Bun hosts use an out-of-process Node child; Node hosts may use in-process worker.
   - Explicitly state worker restart does not reload `plugin/src/tools/*.ts`; restart OpenCode for that.
   - Explicitly state `plugin/src/temporal/*` changes require `pnpm run build:worker` before worker restart.
   - Tune recovery recommendations:
     - search-attribute unverified path: include worker restart only as worker-child restart, not plugin reload.
     - worker not alive/path exhausted: keep direct `run adv_temporal_worker_restart` style but include scope caveat where practical.
     - post-registration path: mention retry and scope caveat.

2. Update `plugin/src/tools/change.ts`:
   - Replace `ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT` with a concise sequence that preserves diagnose/register/restart/retry archive.
   - Add caveat that worker restart does not reload plugin tool code; restart OpenCode for `plugin/src/tools/*.ts` drift.

3. Update `docs/temporal-recovery.md`:
   - Extend the “External restart boundary” section with a reload-path matrix:
     - `plugin/src/tools/*.ts` → restart OpenCode.
     - `plugin/src/temporal/*` → `pnpm run build:worker`, then `adv_temporal_worker_restart`.
     - worker wedged/exhausted → `adv_temporal_worker_restart`.
   - Align worker troubleshooting table row(s) to mention rebuild-before-restart when worker code changed.

4. Update tests:
   - `plugin/src/tools/temporal-ops.test.ts`: update expected recovery strings and add description assertions.
   - `plugin/src/tools/change.test.ts`: assert archive recovery hint includes `adv_temporal_worker_restart`, `retry archive`, and OpenCode/tool-code caveat.

5. Verify:
   - Targeted: `pnpm test -- src/tools/temporal-ops.test.ts src/tools/change.test.ts` from `plugin/`.
   - Full pre-completion check later: `pnpm run check` from `plugin/`.

## LBP Analysis

Best long-term path is source-specific recovery guidance rather than a new abstraction or runtime reload behavior. It keeps local behavior obvious: OpenCode host-loaded tool modules reload with host restart; Temporal worker bundle reloads after rebuild + worker restart. This avoids hiding two distinct reload paths behind one command and reduces future agent doom-loops.

## Affected Components

- `plugin/src/tools/temporal-ops.ts` — tool description and recommendation strings.
- `plugin/src/tools/change.ts` — archive recovery hint.
- `docs/temporal-recovery.md` — operator/agent recovery documentation.
- `plugin/src/tools/temporal-ops.test.ts` — expectations for Temporal ops guidance.
- `plugin/src/tools/change.test.ts` — expectations for archive recovery guidance.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Recovery strings become too verbose for agent loops | Keep short hints concise; put full caveat in tool description/docs. |
| Tests become overly brittle on prose | Assert critical substrings and exact strings only where output contract requires exact `recommendedNextAction`. |
| Docs imply runtime behavior changed | Keep wording explicit: guidance-only; restart function behavior unchanged. |
| Issue #20 workflow overstepped | Do not auto-close; use PR linkage if applicable or report evidence only. |

## Validator Result

Verdict: CAUTION.

Cautions recorded for prep:

1. Enumerate the five implementation sites in task descriptions, including current/proposed replacement and affected test assertions.
2. Clarify docs update as a new reload-path matrix or inline addition in `docs/temporal-recovery.md`.
3. Use runtime-agnostic short wording such as “Temporal worker process”; put Bun/Node distinction in rich description/docs rather than overloading every short hint.

No conflict or contract-compromise risk found. Core guidance-only design validated.