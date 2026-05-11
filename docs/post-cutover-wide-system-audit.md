# Post-cutover wide system audit

<!-- adv-audit generated: 2026-05-11 | source change: postCutoverWideSystemAudit -->

## Purpose

Roadmap item #98 started as a Temporal stabilization tracker. During proposal
shaping, the scope changed: no external scoreboard is needed while ADV has one
primary maintainer. The useful deliverable is a cleanup and optimization audit
for post-cutover debt.

This report records the current state, evidence, direct cleanup targets, and
follow-up work. It does **not** propose replacing Temporal or changing the core
per-change workflow + signal/query architecture.

## Method

- ADV state: roadmap, agenda, active changes, validation, Temporal diagnose.
- Repo reconnaissance: implementation, command contracts, agents/skills, specs,
  docs, scripts, CI, tests.
- External signal scan: OpenCode core issues and Sharper-Flow/Opencode-Advance
  issues that affect ADV reliability or UX.
- Axes: code quality, architecture, performance, DX / agent UX.

## Current state

- Roadmap mirror generated at `2026-05-11T01:48:05Z` shows **0 open bugs** and
  **32 open features**.
- Recent issue trend since 2026-05-01: **59 closed issues**, including many ADV
  fixes around archive, Temporal, worktree, validation, status, cache, and
  worker health.
- Active changes at discovery time:
  - `postCutoverWideSystemAudit`
  - `optimizeAdvCommandTokenLoadVia`
  - `updateAdvTriagePhase3bUse`
  - `fixForcedWorktreeDelete`
- Pending agenda after housekeeping: 13 items, mostly aligned with open roadmap
  features (#64, #66, #68, #69, #71, #78-84).
- `adv_change_validate` passed for this change with expected pre-prep warnings:
  `NO_TASKS`, `NO_DELTAS`.
- `adv_change_list includeArchived:true` timed out once while active-only list
  and `adv_temporal_diagnose` were healthy. Treat this as evidence of archived
  listing / terminal-state performance fragility, not as a current blocker.

## Findings by axis

### Code quality

| Finding | Evidence | Disposition |
|---|---|---|
| Oversized tool implementation files remain multi-concern. | `plugin/src/tools/change.ts` (~2553 lines), `plugin/src/tools/worktree/index.ts` (~2140 lines), `plugin/src/tools/status.ts` (~1139 lines). | Already represented by #82/#83; do not duplicate. |
| Unused export sweep remains valid cleanup. | Roadmap #84. | Existing backlog item; no new issue. |
| Stale post-cutover terminology remains in comments. | `safeUpdateHandler` update-era wording; retired PSW/projectWorkflow comments; OCX/SQLite worktree wording. | Direct cleanup in this change. |

### Architecture

| Finding | Evidence | Disposition |
|---|---|---|
| Temporal architecture remains aligned. | Per-change workflows, signal-driven mutations, query reads, workflow-bundle boundary tests. | Keep architecture; no Temporal replacement. |
| Read/list fallback path remains complex. | `plugin/src/storage/store-temporal/index.ts` combines workflow query, disk reseed, terminal/archive short-circuit, poisoned-history handling, visibility, disk, and archive sources. | Follow-up issue or existing issue update. |
| Disk projection vs archive bundle mismatch can produce confusing terminal state. | Discovery found archive/listing state-shadow risk and prior bugs around stale gates / archive recovery. | Follow-up issue. |
| Traceability has shipped structure but roadmap #99 remains open. | Types/archive/tests exist; #99 still tracks structural traceability across review/archive. | Reconcile under #99; no duplicate. |

### Performance

| Finding | Evidence | Disposition |
|---|---|---|
| Archived listing path can exceed the 10s tool timeout. | `adv_change_list includeArchived:true` timed out once during discovery; Temporal health was OK. | Follow-up issue. |
| Status / health probes likely need shared TTL. | Discovery identified repeated diagnostics calls outside existing health snapshot cache. | Follow-up issue. |
| Fixed list batch size may become bottleneck. | `CHANGE_LIST_BATCH_SIZE = 20` noted in recon. | Lower priority follow-up; avoid premature implementation. |

### DX / agent UX

| Finding | Evidence | Disposition |
|---|---|---|
| Stale comments cause agent confusion. | Update vs Signal, retired PSW, OCX/SQLite wording. | Direct cleanup. |
| Live source vs built worker bundle remains recurring gotcha. | AGENTS.md documents it; external issue signals include stale worker bundle. | Keep as constraint; no code change here. |
| Upstream OpenCode friction can impact ADV. | Subagent tool access regression, MCP process leaks, prompt frontmatter/body override, token bloat, git contention. | Track constraints; file ADV-owned mitigations only when actionable. |
| Cross-project mutation routing needs attention. | External signal: task mutation target_path routing gap. | Follow-up if not already represented. |

## External signals

| Signal | Owner | Impact on ADV |
|---|---|---|
| Subagent tool access regression in OpenCode core. | Upstream | Can break ADV delegated execution patterns. |
| MCP process leak on disconnect/replace. | Upstream | Session hygiene and resource pressure. |
| Agent prompt frontmatter/body override. | Upstream | ADV agent generation must keep non-empty bodies. |
| System prompt token bloat. | Upstream + ADV | Reinforces #72 / token-load work. |
| ADV stale worker bundle / archive partial-write / dangling commits / target_path task routing issues. | ADV-owned external tracker | Follow-up hardening candidates. |

## Direct cleanup completed in this change

Planned safe cleanup:

- Refresh stale `safeUpdateHandler` comments/JSDoc; no symbol rename.
- Refresh clearly stale retired PSW/projectWorkflow comments; no `sourceVersion`
  behavior or memo lifecycle changes.
- Refresh stale OCX/SQLite worktree wording.
- Remove ignored provider-eval output only if present and ignored/untracked.

## Follow-up reconciliation

Existing roadmap / agenda items cover:

- #82 — reduce ESLint complexity violations.
- #83 — decompose long factory closures.
- #84 — sweep unused type exports flagged by knip.
- #99 — structural change-contract traceability across review/archive.
- #104 — stable ADV read surface for OCA consumption.
- #72 — scope ADV instruction load to ADV-using sessions.
- #105 — `/adv-triage` Phase 3b question-tool flow.

Recommended new or updated follow-ups:

1. Archived/terminal listing timeout and state-shadow fragility.
2. Status/health probe TTL caching.
3. Projection/memo/sourceVersion lifecycle after PSW retirement.
4. Dangling commit / branch reachability checks before archive.
5. `target_path` routing audit for task mutation tools.

## Guardrails for execution

- No Temporal replacement.
- No broad architecture rewrite.
- No behavior change in workflow-reachable files.
- No `safeUpdateHandler` rename.
- No `sourceVersion` or memo lifecycle behavior change.
- Follow-up work must reconcile against current roadmap and agenda before
  creating new issues.
