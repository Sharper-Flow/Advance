# Contract Traceability

**Change ID:** addRepoBacklog
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T02:05:28.668Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | .adv/backlog.jsonl with {"schemaVersion":1} header line |
| AC2 | acceptance_criterion | pass | test | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_add appends item, returns itemId+createdAt |
| AC3 | acceptance_criterion | pass | test | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_list with status/tags filters; tail-read for >1MB |
| AC4 | acceptance_criterion | pass | test | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_show returns item + promotions + archives |
| AC5 | acceptance_criterion | pass | test | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_promote idempotent on (itemId, changeId) |
| AC6 | acceptance_criterion | pass | test | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_archive soft-delete marker line |
| AC7 | acceptance_criterion | pass | test | plugin/src/tools/epic.ts:1214-1271 — adv_epic_add_shell accepts optional backlog_ref; title/success_hint optional when backlog_ref present |
| AC8 | acceptance_criterion | pass | test | plugin/src/__tests__/backlog-epic-bridge.test.ts — imported_from provenance field on imported shell entries |
| AC9 | acceptance_criterion | pass | test | plugin/src/__tests__/backlog-concurrency.test.ts — same-checkout serialization via acquireFileLock with line-order verification |
| AC10 | acceptance_criterion | pass | test | .gitattributes — .adv/backlog.jsonl merge=union for cross-worktree disjoint append auto-merge |
| AC11 | acceptance_criterion | pass | test | plugin/src/__tests__/backlog-migrations.test.ts — v0→v1 migrate-on-read; refuses writes against old schema without explicit consent |
| AC12 | acceptance_criterion | pass | test | .adv/specs/backlog/spec.json — capability purpose + 8 requirements |
| AC13 | acceptance_criterion | pass | test | plugin/schemas/*.schema.json — Zod schemas regenerated via pnpm run schemas:generate + schemas:check |
| AC14 | acceptance_criterion | pass | test | pnpm run check green; pnpm test 4640 pass; one flaky concurrent-signaling passed on retry |
| C1 | constraint | respected | static_check | plugin/src/utils/backlog-store.ts — appendFile(content+"\n") under acquireFileLock, no whole-file rewrite |
| C2 | constraint | respected | static_check | No Temporal mirror; .adv/backlog.jsonl filesystem-authoritative |
| C3 | constraint | respected | static_check | Lifecycle states: draft → ready → {promoted | archived}; no in-progress |
| C4 | constraint | respected | static_check | Archive line marked, retained for audit (not hard-deleted) |
| C5 | constraint | respected | static_check | promote writes provenance line; never mutates original item line |
| C6 | constraint | respected | static_check | imported_from provenance field on bound shells; one-way binding enforced |
| C7 | constraint | respected | static_check | Epic shells in Temporal preserved (rq-epicEntries01 unchanged) |
| DONT1 | avoidance | respected | review | No replacement of Temporal Epic shell storage |
| DONT2 | avoidance | respected | review | No agenda migration |
| DONT3 | avoidance | respected | review | Single-repo only; no cross-project sharing |
| DONT4 | avoidance | respected | review | No GH Project / ROADMAP.md integration |
| DONT5 | avoidance | respected | review | No Jira-like assignees/estimates/sprints/boards |
| DONT6 | avoidance | respected | review | JSONL format used (not single-array JSON) |
| DONT7 | avoidance | respected | review | No global file lock; git 3-way merge handles cross-worktree |
| DONT8 | avoidance | respected | review | No CRDT |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1b57d7f0e10b | AC13 |  | C1 |  |
| tk-43c33887d44b |  |  |  |  |
| tk-dc5a43741c1c | AC10 |  |  |  |
| tk-3c6a5cf580bb | AC11 |  | C1, C4 |  |
| tk-062af8f64d30 | AC7, AC8 |  | C6, C7 |  |
| tk-8abc74bc790c | AC2, AC3, AC4, AC5, AC6 |  | C1 |  |
| tk-a069a55812cf |  |  |  |  |
| tk-f7d11eb1315c |  |  |  |  |
| tk-b3148e98ace2 |  |  |  |  |
| tk-78ae2c27178d |  |  |  |  |
| tk-f8c23fd4f00b | AC1, AC9 |  | C1, C2 |  |
| tk-7616439814c0 |  |  |  | UX flow file mirroring /adv-epic style; no direct contract AC. Tracks the new /adv-backlog command surface. |
| tk-eac2cffbb2d2 | AC14 | AC13 | C1 |  |
| tk-a297895f14ff |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13, AC14 | C1 |  |
| tk-2471d467ece0 | AC12 |  |  |  |
| tk-7920890fd4f8 | AC7 |  | C6, C7 |  |
