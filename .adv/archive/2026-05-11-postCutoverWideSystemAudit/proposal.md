# Post-cutover wide system audit

## Context

Roadmap item #98 started as a Temporal-cutover stabilization tracker. During proposal shaping, the user clarified that this project currently has one active user/maintainer, so an external-facing stability scoreboard is unnecessary overhead. The useful work is deeper: investigate what still needs cleanup and optimization after the Temporal cutover and recent bug-fix wave.

Recent signals:

- 19 stale bug entries disappeared after live roadmap refresh; recent ATC/archive work closed them.
- Four pending agenda items mapped to already-closed GitHub issues and were completed as housekeeping.
- Project wisdom contains many post-cutover lessons around cache refresh, gate staleness, worker health, search attributes, workflow replay, and disk-projection fallback.
- Existing open backlog includes known cleanup/debt items such as complexity reduction, long factory closures, unused exports, validation hardening, traceability, and ADV read-surface stabilization.

## Problem

The Temporal cutover is functionally complete, but follow-up fixes and agenda churn show that debt may be scattered across code, commands, docs, tests, specs, release hygiene, and integration surfaces. There is no single current inventory of remaining cleanup, optimization, and UX friction across the full ADV system.

## Scope

### In Scope

- Wide audit across the full repository:
  - `plugin/src/**` implementation code
  - `.opencode/command/**` workflow contracts
  - `.opencode/agents/**` and bundled skills
  - `.adv/specs/**` capability requirements
  - `docs/**`, `scripts/**`, `.github/workflows/**`, test infra
- Recon and investigation inputs:
  - ADV project state: open changes, agenda, wisdom, reflections, roadmap
  - Recent bug/closure trends from GitHub issues and project board
  - Recent archive and commit history around Temporal/workflow/cache/worker/search-attribute changes
  - Known external integration friction, including OpenCode-core issue signals and Sharper-Flow/Opencode-Advance issues
  - Existing methodology commands/scans where useful: adv-tron, slop/arch/audit/improve-style recon
- Optimization axes:
  - Code quality: dead code, unused exports, complexity hotspots, long closures, brittle tests
  - Architecture: boundary drift, leaky abstractions, post-cutover seams, duplicated logic
  - Performance: startup cost, redundant Temporal round trips, cache misses, slow health/status paths
  - DX / agent UX: misleading errors, confusing tool outputs, command friction, stale docs/instructions
- Direct cleanup only when safe and local:
  - dead-code deletion with proof
  - small docs/wording fixes
  - simple test/fixture cleanup
  - local refactors that do not alter public behavior
- Larger or riskier findings become separate GitHub issues / agenda items with priority and WSJF suggestions instead of being fixed inside this change.

### Out of Scope

- Replacing Temporal or changing the core Temporal architecture.
- Building an external stability dashboard or weekly scoreboard for #98.
- Broad rewrites of workflow/storage/tool architecture inside this change.
- Shipping behavior changes without a dedicated ADV change, tests, and review.
- Cutting or automating a v0.9.0 release.
- Closing roadmap items automatically without evidence.

## Success Criteria

1. A wide audit report exists with findings grouped by code quality, architecture, performance, and DX/agent UX.
2. The report cites concrete evidence: file paths, issue numbers, command outputs, spec references, wisdom/reflection entries, or source URLs.
3. Safe direct cleanup found during the audit is applied and verified in this change.
4. Non-trivial findings are converted into actionable follow-up items with suggested priority/WSJF and clear scope boundaries.
5. Existing known backlog items (#82, #83, #84, etc.) are reconciled against findings to avoid duplicate work.
6. Final verification runs the repo-defined checks needed for touched areas.

## Affected Code / Surfaces

Expected broad read scope; write scope intentionally narrow until findings justify it.

Potentially inspected:

- `plugin/src/temporal/**`
- `plugin/src/storage/**`
- `plugin/src/tools/**`
- `plugin/src/validator/**`
- `plugin/src/events/**`
- `.opencode/command/**`
- `.opencode/agents/**`
- `skills/**`
- `.adv/specs/**`
- `docs/**`
- `scripts/**`
- `.github/workflows/**`

## Related Repositories / External Signals

- Primary repo: `Sharper-Flow/Advance`
- External signals to inspect during discovery:
  - `sst/opencode` GitHub issues involving plugins, MCP, snapshot race, agent prompt loading, tool registration, session/worktree behavior
  - `Sharper-Flow/Opencode-Advance` issues involving OCA↔ADV integration friction

## Constraints

- Specs remain laws; findings that imply spec changes must be recorded explicitly and handled through normal gates.
- ADV state must be accessed through ADV tools only, not direct state-file reads.
- Direct cleanup must stay safe, local, and well-verified.
- Anything architectural, behavior-changing, or broad becomes a separate issue/change.
- Worktree isolation applies before repo mutations.

## Discovery Agenda

### Codebase unknowns

- Which post-cutover orphans remain in Temporal/storage/tool code?
- Are there lingering `defineUpdate` assumptions, signal/replay hazards, stale disk-projection fallback paths, or duplicated recovery logic?
- Which complexity/long-closure/unused-export issues are already represented by #82/#83/#84 versus newly discovered?
- Are specs, command docs, and implementation still aligned after recent rapid bug-fix churn?

### Ecosystem / upstream unknowns

- What current Temporal TypeScript SDK guidance matters for workflow/signal/query usage, worker recovery, and determinism boundaries?
- What OpenCode upstream issues materially affect ADV reliability or UX?
- Are there current LBP patterns for OpenCode plugin tool registration, agent prompts, and MCP wiring that differ from this repo's patterns?

### Domain / maintainer unknowns

- Which solo-maintainer friction points are painful but not yet filed?
- Which cleanup opportunities should be fixed immediately versus filed for later?

### Integration unknowns

- How much of the remaining friction is ADV-owned versus OpenCode-core/OCA/MCP infrastructure?
- Are worktree/session snapshot races still relevant to current workflows?

### Performance unknowns

- Which status/health/list paths still perform redundant Temporal calls or cache invalidations?
- Are startup and instruction-load costs still excessive for non-ADV sessions?

## Notes

This change repurposes roadmap issue #98 from external stabilization-tracker infrastructure into an internal cleanup/optimization audit. The stabilization tracker itself is not the deliverable.