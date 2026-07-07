# Acceptance

Reviewed at: 2026-07-07T02:05:28.668Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | [ ] `.adv/backlog.jsonl` exists with `schemaVersion: 1` header line | pass | .adv/backlog.jsonl with {"schemaVersion":1} header line |
| AC2 | acceptance_criterion | [ ] `adv_backlog_add` appends new item, returns item ID | pass | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_add appends item, returns itemId+createdAt |
| AC3 | acceptance_criterion | [ ] `adv_backlog_list` reads + filters (status, tags, origin) | pass | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_list with status/tags filters; tail-read for >1MB |
| AC4 | acceptance_criterion | [ ] `adv_backlog_show` reads single item by ID | pass | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_show returns item + promotions + archives |
| AC5 | acceptance_criterion | [ ] `adv_backlog_promote` is idempotent on `(item_id, change_id)` pair | pass | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_promote idempotent on (itemId, changeId) |
| AC6 | acceptance_criterion | [ ] `adv_backlog_archive` soft-deletes (line marked, retained) | pass | plugin/src/__tests__/backlog-shell.test.ts — adv_backlog_archive soft-delete marker line |
| AC7 | acceptance_criterion | [ ] `adv_epic_add_shell` accepts `backlog_ref` parameter | pass | plugin/src/tools/epic.ts:1214-1271 — adv_epic_add_shell accepts optional backlog_ref; title/success_hint optional when backlog_ref present |
| AC8 | acceptance_criterion | [ ] Imported backlog item in Epic shell entry preserves title + success_hint as provenance | pass | plugin/src/__tests__/backlog-epic-bridge.test.ts — imported_from provenance field on imported shell entries |
| AC9 | acceptance_criterion | [ ] Same-checkout concurrency uses `acquireFileLock` | pass | plugin/src/__tests__/backlog-concurrency.test.ts — same-checkout serialization via acquireFileLock with line-order verification |
| AC10 | acceptance_criterion | [ ] Cross-worktree concurrent append works without conflict (git 3-way merge of disjoint JSONL lines) | pass | .gitattributes — .adv/backlog.jsonl merge=union for cross-worktree disjoint append auto-merge |
| AC11 | acceptance_criterion | [ ] Schema versioning: `migrate-on-read` + `.passthrough()` tested with synthetic bump | pass | plugin/src/__tests__/backlog-migrations.test.ts — v0→v1 migrate-on-read; refuses writes against old schema without explicit consent |
| AC12 | acceptance_criterion | [ ] New spec `.adv/specs/backlog/spec.json` defines contract | pass | .adv/specs/backlog/spec.json — capability purpose + 8 requirements |
| AC13 | acceptance_criterion | [ ] Zod schemas registered in `plugin/schemas/` via `pnpm run schemas:generate` | pass | plugin/schemas/*.schema.json — Zod schemas regenerated via pnpm run schemas:generate + schemas:check |
| AC14 | acceptance_criterion | [ ] No regression: `pnpm run check` green, full test suite green | pass | pnpm run check green; pnpm test 4640 pass; one flaky concurrent-signaling passed on retry |
| C1 | constraint | Append-only JSONL — never rewrite the file as a whole; always append. | respected | plugin/src/utils/backlog-store.ts — appendFile(content+"\n") under acquireFileLock, no whole-file rewrite |
| C2 | constraint | Filesystem-authoritative — no Temporal mirror. | respected | No Temporal mirror; .adv/backlog.jsonl filesystem-authoritative |
| C3 | constraint | Lifecycle states: `draft → ready → {promoted | archived}`. No in-progress state. | respected | Lifecycle states: draft → ready → {promoted | archived}; no in-progress |
| C4 | constraint | Archived items retained for audit (not hard-deleted). | respected | Archive line marked, retained for audit (not hard-deleted) |
| C5 | constraint | Promote writes provenance; never mutates original item line. | respected | promote writes provenance line; never mutates original item line |
| C6 | constraint | Backlog items in Epics are one-way bound: cannot round-trip back to standalone. | respected | imported_from provenance field on bound shells; one-way binding enforced |
| C7 | constraint | Epic shells (`rq-epicEntries01`) keep their current Temporal storage; backlog is complementary, not replacement. | respected | Epic shells in Temporal preserved (rq-epicEntries01 unchanged) |
| DONT1 | avoidance | × Do NOT replace Temporal Epic shell storage. (`rq-epicEntries01` stays.) | respected | No replacement of Temporal Epic shell storage |
| DONT2 | avoidance | × Do NOT migrate existing agenda items into backlog. | respected | No agenda migration |
| DONT3 | avoidance | × Do NOT share backlog across projects (single-repo only). | respected | Single-repo only; no cross-project sharing |
| DONT4 | avoidance | × Do NOT integrate with GH Project / `ROADMAP.md` (deferred). | respected | No GH Project / ROADMAP.md integration |
| DONT5 | avoidance | × Do NOT add Jira-like assignees / estimates / sprints / boards. | respected | No Jira-like assignees/estimates/sprints/boards |
| DONT6 | avoidance | × Do NOT use a single-array JSON format (rejected — see Discovery §Q1). | respected | JSONL format used (not single-array JSON) |
| DONT7 | avoidance | × Do NOT use a global file lock for cross-worktree coordination. | respected | No global file lock; git 3-way merge handles cross-worktree |
| DONT8 | avoidance | × Do NOT use CRDT. | respected | No CRDT |

