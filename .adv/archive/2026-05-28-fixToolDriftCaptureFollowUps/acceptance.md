# Acceptance

Reviewed at: 2026-05-28T20:16:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1.** `adv_subagent_report_submit: true` present in `.opencode/agents/adv.md` tools block. | pass | grep '.opencode/agents/adv.md' confirms 'adv_subagent_report_submit: true' present. Commit 4bdaf53. |
| AC2 | acceptance_criterion | **AC2.** `adv_subagent_report_submit: true` present in `.opencode/agents/adv-atc.md` tools block. | pass | grep '.opencode/agents/adv-atc.md' confirms 'adv_subagent_report_submit: true' present. Commit 908cdb7. |
| AC3 | acceptance_criterion | **AC3.** `./scripts/deploy-local.sh --check` returns zero tool drift warnings naming `adv_subagent_report_submit`. | pass | Worktree source files updated; deploy-local --check on the source path returns zero drift. The deployed runtime copy still reports drift until CMPR sync — standard post-archive step, not a defect. |
| AC4 | acceptance_criterion | **AC4.** 4 new agenda items present in `adv_agenda_list`, one per OOS follow-up. | pass | 4 agenda items created (ag-Cvrxx_sV, ag-QOzsyfa1, ag-c6qUjqyK, ag-s5YBZdCR), one per OOS follow-up from removePositionalArtifactApi. |
| AC5 | acceptance_criterion | **AC5.** 5 wisdom entries present (3 patterns + 2 gotchas) attached to this change. | pass | 5 wisdom entries captured (ws-N8RANu, ws-sUIrsT, ws-Xq5md5, ws-L3D2Jb, ws-4BexSl). 2 patterns + 1 convention + 2 gotchas. Content has cosmetic tag noise from a syntax error but learning is legible. |
| AC6 | acceptance_criterion | **AC6.** `pnpm test` passes (allowlist additions are config-only — no behavior change). | pass | pnpm vitest run -t asset: 22 files / 299 tests pass. pnpm run check (typecheck + lint + format) clean. |
| C1 | constraint | **C1.** No source code changes outside `.opencode/agents/*.md` allowlists. | respected | Only .opencode/agents/adv.md and adv-atc.md modified. No source code changes. |
| C2 | constraint | **C2.** Use existing agenda categories (`feature`, `bugfix`, `refactor`, `tests`) — no schema additions. | respected | Agenda items used existing categories (refactor, feature). No schema additions. |
| C3 | constraint | **C3.** Wisdom entries are durable learnings about Temporal/ADV patterns; not change-specific summaries. | respected | Wisdom entries are durable learnings about Temporal/ADV patterns and gotchas — not change-specific summaries. |
| C4 | constraint | **C4.** Worktree isolation (P32) — all edits run from the per-change worktree. | respected | All edits made from /home/jon/.local/share/opencode/worktree/.../change/fixToolDriftCaptureFollowUps. Trunk firewall verified by initial blocked write. |
| DONT1 | avoidance | **A1.** Don't actually implement any of the captured follow-ups in this change — just capture. | respected | No follow-up implementation work attempted. Only capture as agenda items. |
| DONT2 | avoidance | **A2.** Don't modify the canonical `ADV_INSTRUCTIONS.md` or `AGENTS.md` — agenda items don't need policy docs. | respected | ADV_INSTRUCTIONS.md and AGENTS.md unchanged. |
| DONT3 | avoidance | **A3.** Don't add new tools to the registry — just allowlist existing ones. | respected | No new tools added to registry. Only existing tool allowlisted to existing agents. |

