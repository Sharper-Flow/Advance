# Advance (ADV) - Agent Instructions

> `project.md` is the canonical agent-facing context file read by `adv_project_context`.
> `AGENTS.md` remains the developer-facing quick-reference with repo architecture, commands, and implementation gotchas.

## Repository Layout

This is an OpenCode plugin repo, not a monorepo. All buildable code lives in `plugin/`.

```
plugin/              # TypeScript plugin (the only buildable package)
  src/
    index.ts         # Plugin entrypoint — hooks, event handlers, tool registration
    tool-registry.ts # Binds all tool definitions to the SDK
    manifest.ts      # Command manifest (phases, gates, scopes)
    tools/           # MCP tool implementations (spec, change, task, gate, wisdom, agenda, test, status, project)
    storage/         # JSON + SQLite persistence, migrations, handoff, external state
    guards/          # Runtime policy enforcement (bash sanitization, task nesting + parallelism)
    validator/       # Spec validation, prep-readiness, task classification
    events/          # Terminal UI, status markers
    utils/           # Helpers (debug-log, project-id, safe-execute)
    __mocks__/       # Vitest aliases, including @opencode-ai/plugin → mock
    __tests__/setup.ts  # Shared fixtures and assertion helpers
  schemas/           # JSON schema stubs ($ref pointers; Zod types in src/types.ts are authoritative)
.adv/specs/          # Capability specs (the laws) — git-tracked, branch-local
.opencode/
  command/           # 24 slash-command workflow files (adv-*.md)
  agents/            # adv-researcher (bundled global), adv-engineer (bundled global), adv-tron (repo-local); overlay-managed: adv, plan (absorbed scout), build (absorbed refine)
  overlays/          # Managed overlay blocks synced into global shared agents
skills/              # Bundled methodology skills synced to ~/.config/opencode/skills/
scripts/             # sync-global.sh (main), migrate-openspec.ts, recover-db.js, model-blind-test
docs/                # Gate contracts, workflow diagram, checklists, spec docs
```

## Development Commands

**All commands run from `plugin/`, not the repo root.**

```bash
pnpm test                    # vitest run — 1356+ tests, ~55s
pnpm run check               # typecheck → lint → format:check (no tests)
pnpm run build               # tsup (ESM) — emits dist/index.js + dist/index.d.ts
pnpm run typecheck            # tsc --noEmit
pnpm run lint                 # eslint src/
pnpm run lint:fix             # eslint --fix
pnpm run format               # prettier --write
pnpm run format:check         # prettier --check
# Note: `pnpm run validate:temporal` and its harness were retired by the
# `migrateAdvStateTemporalRetire` change (D3). The Temporal cutover has shipped;
# `docs/decisions/temporal-readiness-decision.md` is preserved as the historical record.
# Note: no `generate:schemas` or `generate:docs` scripts exist.
# plugin/schemas/ contains $ref stub files only — Zod types in src/types.ts
# are the authoritative source. When extending Zod schemas, no separate
# JSON-schema regeneration step is needed.
```

**Single test file:** `pnpm test -- src/tools/change.test.ts`

**CI order** (`.github/workflows/ci.yml`): typecheck → lint → format:check → test → build. Node 20.x + 22.x.

### Source-vs-Dist Reload Gotcha

OpenCode loads the plugin from `plugin/dist/index.js` at session startup and caches it in process memory. **Source edits to `plugin/src/` do NOT take effect in the current OpenCode session.** Unit tests run against source via vitest and pick up changes immediately, but live tool invocations (`adv_*` calls from the agent) continue to use the cached pre-build `dist/index.js` until the session restarts.

To validate a source change end-to-end through live tool invocations:

1. `pnpm run build` — regenerates `dist/index.js` (and `dist/temporal/*.js`)
2. Restart the OpenCode session (or restart the plugin host)
3. Re-invoke the affected tool

For agent-driven changes that modify ADV tool behavior, the practical workflow is:

- Verify the source fix via unit/integration tests in the same session (TDD red→green)
- Defer end-to-end validation of live tool calls to a fresh session after rebuild
- Note this rebuild requirement in the change's archive notes when the live behavior cannot be validated in-session

## Architecture Gotchas

### Runtime is Bun, tests run on Node

OpenCode ships as a Bun executable, while the Vitest suite runs on Node. Runtime storage is Temporal-only; the old `bun:sqlite` / `better-sqlite3` path was removed by `completeTemporalOnlyMigration`.

Tests still mock OpenCode SDK imports via vitest aliases in `vitest.config.ts`:

- `@opencode-ai/plugin` → `src/__mocks__/opencode-plugin.ts`

If you add imports from the SDK or Bun APIs, ensure the mocks cover them or tests will fail with resolution errors.

### Layer boundaries (enforced by test)

`temporal/workflows.ts` is the webpack root for the Temporal worker bundle. Every internal module reachable via static `import` / `export … from` must stay workflow-safe: `temporal/` modules or `types.ts` only. No reachable module may import from `storage/`, `tools/`, `tool-registry`, `plugin-init`, or any `node:*` external.

`utils/context-snapshot.ts` is a pure formatter over already-loaded data. It must not import from `../storage/` or `../tools/`; storage-backed snapshot loading lives in `storage/context-snapshot-fetch.ts`.

Enforcing tests:

- `plugin/src/temporal/workflow-bundle-boundary.test.ts` — transitive workflow-bundle import walker
- `plugin/src/temporal/workflows.test.ts` — fast direct-import guard
- `plugin/src/utils/context-snapshot.purity.test.ts` — utility purity guard

Rationale: prevent the `Webpack finished with errors` worker-bundle regression class and keep `utils/` reusable from workflow-safe contexts.

### Zod v4 with v3 compatibility

Dependencies use Zod v4 (`^4.3.6`). Tool arg schemas use Zod and are cast via `as any` in tool-registry.ts for SDK compatibility. The cast is intentional — don't "fix" it.

### External mutable state

ADV state (changes, archive, wisdom, agenda, reflections, handoff) lives **outside the repo** at `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/` (default `~/.local/share/...`), keyed by root commit SHA. All worktrees of the same repo share this state. Specs (`.adv/specs/`) remain in-repo and branch-local. Runtime storage is Temporal-only; physical `db/` directories and `db_dir` config are legacy compatibility artifacts only.

ADV-managed worktrees live under `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. Empty branch-prefix parents may be reaped with bounded `rmdir` only; broad cleanup remains dry-run/approval-gated via hygiene tools.

`adv_status` also reports a worktree census from `git worktree list --porcelain` plus root-directory mtime. Stale worktrees (>7d inactive) appear in the `worktree_census` raw field and formatted Worktrees section; disk usage is intentionally not scanned in status.

**Never read ADV state files directly** (`read`, `cat`, `ls`). Always use ADV MCP tools (`adv_change_show`, `adv_task_list`, etc.).

### ADV MCP tool call hygiene (P1.12)

Invoke ADV tools with explicit required args — never with empty parameter sets.

- `adv_change_update` — pass `changeId` + at least one of `proposal`, `problemStatement`, `agreement`, `design`. Zero-args invocations hit a 10s safety-net timeout (surfaced as `errorClass: ToolExecutionTimeout`).
- `adv_task_add` — before passing `blockedBy`, call `adv_task_list changeId: <id>` to fetch current task IDs. Invalid IDs are rejected; the error response lists the valid IDs.
- `adv_task_cancel` — all `taskIds` must exist in the same change. Cancellations are atomic: if any ID is unknown, no task is cancelled.
- Read each tool's field `describe()` text before constructing calls — it documents relational constraints (source-of-truth tool, at-least-one-of patterns, valid enum values).

See `ADV_INSTRUCTIONS.md § ADV MCP Tool Invocation` for the full protocol.

### Overlay sync model

Shared global agents (`adv`, `general`, `build`, `plan`) are NOT fully replaced by sync. Instead, `.opencode/overlays/*.overlay.md` contains managed blocks that `scripts/sync-global.sh` injects into the global agent files without overwriting user customization.

### Provider ADV agent assembly

`scripts/sync-global.sh` generates provider-specific ADV variants (`adv-claude`, `adv-gpt`, `adv-glm`, `adv-kimi`) as generated runtime agents backed by global prompt parts:

1. **Copy canonical body to prompt part** — `.opencode/agents/adv.md` syncs to `~/.config/opencode/agent-parts/advance/adv.md`
2. **Copy provider hints to prompt parts** — `.opencode/agent-parts/providers/{provider}.md` syncs to `~/.config/opencode/agent-parts/advance/providers/{provider}.md`
3. **Generate runtime provider agents** — global `adv-{provider}.md` preserves frontmatter/tool allowlist and embeds the concatenated canonical ADV body plus exactly one provider hint (markdown bodies win over JSON prompt refs in current OpenCode)
4. **Patch native prompt refs** — `agent.adv-{provider}.prompt` points to the matching single concatenated prompt file for JSON-only/future runtimes and inspection
5. **Drift checks** — `check_tool_drift` runs for all variants plus the canonical agent; prompt parts are checked for presence
6. **Legacy gating** — prompt-only keys do not activate provider mode. Active provider config sets `agent.adv.disable: true` and removes global generic `adv.md`; repo-local `.opencode/agents/adv.md` remains tracked.

Runtime visibility is controlled by OpenCode's native `agent.<name>.disable` field in `opencode.json` — no hidden routing, no fallback chains. The `opencode-model-preferences` (OMP) tool writes these config entries; ADV only generates the files.

### Guard system

- `guards/bash.ts` — sanitizes bash commands at runtime (blocks destructive patterns)
- `guards/task.ts` — enforces sub-agent nesting (depth ≤ 1) and parallelism (max 3 concurrent from primary agents)

### Tool registration pattern

Each tool file in `src/tools/` exports a `*Tools` object with description, args schema, and execute function. `tool-registry.ts` binds them all via `createToolMap()`. To add a new tool:

1. Define it in the relevant `src/tools/*.ts` file
2. Export from `src/tools/index.ts`
3. `tool-registry.ts` picks it up via the `*Tools` import

### Schema source of truth

Zod schemas in `plugin/src/types.ts` are the authoritative source. `plugin/schemas/*.json` contains `$ref`-only stub files that point at the Zod types; they are NOT auto-generated from Zod. When you extend a Zod schema (add a field, change a type), no separate schema-regeneration step is required — the Zod type is the contract, and the committed stubs are informational anchors only.

## Testing Conventions

- Tests are co-located: `foo.ts` has `foo.test.ts` in the same directory
- Asset-style test files (`*-assets.test.ts`) in `src/` test command/manifest consistency
- Shared fixtures and helpers in `src/__tests__/setup.ts` (`createTestProject`, `parseToolOutput`, etc.)
- Tests use temp directories for isolation (`createTempDir` / `cleanupTempDir`)
- No external services required — all storage is mocked or uses temp dirs

## Sync Script

`scripts/sync-global.sh` is the primary maintenance tool:

```bash
./scripts/sync-global.sh --check      # Report what's out of date
./scripts/sync-global.sh --fix        # Sync assets + patch opencode.json
./scripts/sync-global.sh --dry-run --diff  # Preview changes
```

Requires `jq` for config patching.

## Key References

- `ADV_INSTRUCTIONS.md` — full agent operating protocol (gates, TDD, doom loop, cancellation, re-entry)
- `SETUP.md` — installation, project init, troubleshooting
- `docs/adv-gates.md` — gate contracts and sequencing rules
- `docs/checklists/` — prep, review, and harden checklists
