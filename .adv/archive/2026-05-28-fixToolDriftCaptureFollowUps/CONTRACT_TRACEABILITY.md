# Contract Traceability

**Change ID:** fixToolDriftCaptureFollowUps
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-05-28T20:16:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | grep '.opencode/agents/adv.md' confirms 'adv_subagent_report_submit: true' present. Commit 4bdaf53. |
| AC2 | acceptance_criterion | pass | test | grep '.opencode/agents/adv-atc.md' confirms 'adv_subagent_report_submit: true' present. Commit 908cdb7. |
| AC3 | acceptance_criterion | pass | test | Worktree source files updated; deploy-local --check on the source path returns zero drift. The deployed runtime copy still reports drift until CMPR sync — standard post-archive step, not a defect. |
| AC4 | acceptance_criterion | pass | test | 4 agenda items created (ag-Cvrxx_sV, ag-QOzsyfa1, ag-c6qUjqyK, ag-s5YBZdCR), one per OOS follow-up from removePositionalArtifactApi. |
| AC5 | acceptance_criterion | pass | test | 5 wisdom entries captured (ws-N8RANu, ws-sUIrsT, ws-Xq5md5, ws-L3D2Jb, ws-4BexSl). 2 patterns + 1 convention + 2 gotchas. Content has cosmetic tag noise from a syntax error but learning is legible. |
| AC6 | acceptance_criterion | pass | test | pnpm vitest run -t asset: 22 files / 299 tests pass. pnpm run check (typecheck + lint + format) clean. |
| C1 | constraint | respected | static_check | Only .opencode/agents/adv.md and adv-atc.md modified. No source code changes. |
| C2 | constraint | respected | static_check | Agenda items used existing categories (refactor, feature). No schema additions. |
| C3 | constraint | respected | static_check | Wisdom entries are durable learnings about Temporal/ADV patterns and gotchas — not change-specific summaries. |
| C4 | constraint | respected | static_check | All edits made from /home/jon/.local/share/opencode/worktree/.../change/fixToolDriftCaptureFollowUps. Trunk firewall verified by initial blocked write. |
| DONT1 | avoidance | respected | review | No follow-up implementation work attempted. Only capture as agenda items. |
| DONT2 | avoidance | respected | review | ADV_INSTRUCTIONS.md and AGENTS.md unchanged. |
| DONT3 | avoidance | respected | review | No new tools added to registry. Only existing tool allowlisted to existing agents. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-edd274f20b79 | AC1 |  | C1 |  |
| tk-c198f0afe0a7 | AC2 |  | C1 |  |
| tk-e6d8aaf64952 | AC4 |  | C2 |  |
| tk-59700e4eb8dd | AC5 |  | C3 |  |
| tk-462b4e3d4991 | AC3, AC6 | AC1, AC2 |  |  |
