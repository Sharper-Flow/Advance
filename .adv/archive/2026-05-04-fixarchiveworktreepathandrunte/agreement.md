## Agreement

### Objectives

Resolve 2 ADV tool bugs (#2 + #4) and document 2 procedural gotchas (#1 + #3). Backward-compatible additions only — no semantic changes to existing defaults.

### Discovery Findings

| Item | Evidence | Status |
|---|---|---|
| #2 root cause | `change.ts:1834` `inRepoArchive = join(store.paths.root, ".adv", "archive")` | confirmed |
| #2 execute signature | `(args, store)` — no cwd injection point per `tool-registry.ts:74` | confirmed |
| #2 fix locus | Add optional arg; preserve default behavior | locked |
| #4 root cause | `test.ts:28` `DEFAULT_TEST_TIMEOUT_MS = 30_000`; `bounds?.timeoutMs` exists at L187 but not exposed in schema L124-144 | confirmed |
| #4 fix locus | Schema arg with range validation; plumb through to `effective.timeoutMs` | locked |
| #1 platform | OpenCode plugin lifecycle — not fixable in ADV | doc-only |
| #3 design | `task.ts:497-500` intentional default with comment | doc-only |

**Prior research:** No `docs/*-prep.md` covers archive bundle paths or run-test timeout configuration.

**LBP Check:**
- Schema arg pattern matches existing optional args in same files (e.g. `dryRun`, `target_path`).
- `z.number().int().min(1000).max(300_000)` — Zod-canonical range constraint.
- Backward-compat-via-default mirrors how `wisdom_accumulation` feature flag was added.

**Risk:**
- #2: zero behavioral change when `worktreePath` omitted; new code path tested.
- #4: schema additive only; existing callers unaffected.
- #1, #3: doc additions only.

### Acceptance

(See proposal § Acceptance Criteria — 10 items.)