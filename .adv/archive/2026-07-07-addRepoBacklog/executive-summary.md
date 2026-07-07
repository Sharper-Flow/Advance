# Executive Summary — addRepoBacklog

## Outcome
New durable in-repo backlog for shell items (`.adv/backlog.jsonl` append-only JSONL). All 11 tasks complete; CI green (4640 tests pass; one flaky concurrent-signaling test passed on retry).

## Verdict
APPROVED

## What Was Built
1. **Add `.adv/specs/backlog/spec.json`** — capability purpose + 8 requirements: `rq-backlogDurability01`, `Format01`, `Lifecycle01`, `Promotion01`, `Archive01`, `SchemaVersion01`, `Concurrency01`, `EpicBridge01`. Mirrors `advance-epics` spec structure.
2. **Add `plugin/src/utils/backlog-store.ts`** — read (stream-parse via `readline`; per-line Zod-validate; header cache); write (`acquireFileLock` → `appendFile(content+"\n")` → release, mirrors `agenda.ts:279-286`, NOT `writeJsonlAtomic`); read-time reduction (>1MB tail-reads last N lines, default 1000). Header line written on first add.
3. **Add `plugin/src/utils/backlog-migrations.ts`** — hand-rolled branching per version (mirrors `worker-lock.ts:140-179`, NOT Zod passthrough). Sample `v0→v1` migrator. Refuses writes against old schema without explicit consent.
4. **Add `plugin/src/tools/backlog-shell.ts`** — 5 MCP tools: `adv_backlog_add`, `_list` (tail-read for >1MB), `_show`, `_promote` (idempotent on `(itemId, changeId)`), `_archive` (soft-delete marker). All Zod-validated responses.
5. **Register tools + schemas** — `plugin/src/tools/index.ts`, `tool-registry.ts`, `schema-registry.ts`. `pnpm run schemas:generate` + `schemas:check` clean. Schemas in `plugin/schemas/*.schema.json`.
6. **Update `plugin/src/tools/epic.ts`** — `adv_epic_add_shell` (~line 1214-1271) gains optional `backlog_ref`. When present, `title` and `success_hint` become OPTIONAL (derived from backlog item); when absent, both REQUIRED (backward compat). `imported_from: { backlog_id, imported_at }` provenance field added for imported shells.
7. **Update `.adv/specs/advance-epics/spec.json`** — Epic shell entry MAY carry `backlog_ref`. Imported items are one-way bound.
8. **Add `.gitattributes`** — `.adv/backlog.jsonl merge=union` for cross-worktree disjoint append auto-merge.
9. **Add `.opencode/command/adv-backlog.md`** — guided user flow mirroring `/adv-epic`. Phases: add → list → show → promote → archive.
10. **Add 5 test files** — `backlog-shell`, `backlog-store`, `backlog-migrations`, `backlog-concurrency`, `backlog-epic-bridge`. Edge cases: archived import refused, malformed JSONL typed error with line/column, >1MB tail-read, same-item conflict.
11. **CI gate** — `pnpm run check` + `pnpm test`. Pre-archive: `.gitattributes` has `merge=union`; `.adv/backlog.jsonl` exists with `schemaVersion: 1` header.

## What Was Verified
- **Verdict:** APPROVED. 14/14 ACs pass, 7/7 Cs respected, 8/8 DONTs respected (per contract.reviewMatrix).
- **Tests:** 4640 pass. One flaky `concurrent-signaling` test passed on isolated retry; second full run was clean.
- **Preview URL:** not_applicable. No visual surface; plugin code + spec + tests only.
- **Contract matrix:** All required rows pass/respected; no fail/violated/unknown.

## Remaining Concerns
None.

## Consequence Context

| # | Category | Status | Source / Evidence |
|---|---|---|---|
| 1 | Delivered value | ready | Durable in-repo shell store (`.adv/backlog.jsonl`); 5 new MCP tools (`add`, `list`, `show`, `promote`, `archive`); Epic bridge via `backlog_ref`; new spec at `.adv/specs/backlog/spec.json`. |
| 2 | Enabling-only / follow-up dependency | n/a | No upstream dependents. Backlog is additive; existing flows unchanged. |
| 3 | Ops readiness | pending | Harden owns release/deploy/production/docs/cleanup readiness. |
| 4 | Migration / data impact | n/a | New file + new tool surface. No data migration; existing agenda + Epic shells untouched. |
| 5 | Frontend / preview impact | not_applicable | No visual surface; plugin + spec changes only. |
| 6 | Collision / release risk | low | No other change touches backlog tools or `.adv/specs/advance-epics`. Single-change release. |
| 7 | Open follow-ups | n/a | No open follow-ups. |
| 8 | Next action | inline | User acceptance → `/adv-harden addRepoBacklog` → release gate. |