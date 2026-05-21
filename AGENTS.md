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
    storage/         # Temporal-only persistence adapters, migrations, handoff, external state
    validator/       # Spec validation, prep-readiness, task classification
    events/          # Terminal UI, status markers
    utils/           # Helpers (debug-log, project-id, safe-execute)
    __mocks__/       # Vitest aliases, including @opencode-ai/plugin → mock
    __tests__/setup.ts  # Shared fixtures and assertion helpers
  schemas/           # JSON schema stubs ($ref pointers; Zod types in src/types.ts are authoritative)
.adv/specs/          # Capability specs (the laws) — git-tracked, branch-local
.opencode/
  command/           # Slash-command workflow files (adv-*.md)
  agents/            # adv-researcher (bundled global), adv-engineer (bundled global), adv-tron (repo-local); overlay-managed: adv, plan (absorbed scout), build (absorbed refine)
  overlays/          # Managed overlay blocks synced into global shared agents
skills/              # Bundled methodology skills synced to ~/.config/opencode/skills/
scripts/             # deploy-local.sh (main), migrate-openspec.ts, recover-db.js, model-blind-test
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

### Signal-driven change workflows

Change workflows are signal-driven state holders: tools fire signals (`taskAddedSignal`, `gateCompletedSignal`, `taskCompletedSignal`, etc.) and read via queries (`getStateQuery`, `getTasksQuery`, `getGateStatusQuery`). No `defineUpdate`-based mutation contract on the change-workflow surface. Per-change workflow state is the source of truth; on-disk `change.json` is a downstream projection updated only on terminal/gate transitions. Cross-change visibility (e.g. branch-in-use detection) flows through Temporal Visibility search attributes (`AdvWorktreeBranches`, `AdvWorktreePaths`).

<!-- rq-changeWorkflowSignalOnly01 rq-temporalTsDeterminismDocs01 -->

Temporal TypeScript workflow sandbox patches `Date.now()`, `new Date()`, and `Math.random()` to deterministic replay-safe values; do not cargo-cult ban those APIs in workflow code. Use Temporal workflow APIs such as `sleep()` / `condition()` for timers. The project-specific replay cliff to guard is reintroducing `defineUpdate` on the change-workflow surface without explicit migration handling: old `WorkflowExecutionUpdateAccepted` history events can poison replay after code changes. `plugin/src/temporal/workflow-bundle-boundary.test.ts` enforces this signal/query-only surface.

#### Cache-refresh discipline (rq-cacheRefresh01)

Tool-layer code SHALL use `fireSignalAndRefresh(handle, store, changeId, signal, ...args)` from `plugin/src/tools/_adapters.ts` for any signal targeting a change workflow. The helper fires the signal AND invalidates the in-memory `changeCache` so subsequent `store.changes.get()` calls return fresh state. Direct `fireSignal` use is permitted only for signals NOT associated with a single change (none currently exist; documented exemptions require a `// rq-cacheRefresh01-exempt: <reason>` annotation at the call site). The grep gate `grep -rn "fireSignal(handle" plugin/src/tools/ | grep -v ".test.ts" | grep -v rq-cacheRefresh01-exempt` MUST return zero matches.

Cross-project note: when mutating a change in another project via `target_path`, the helper invalidates the TARGET project's cache via the `store` argument that wraps that project's StoreBackend. Use `withTargetPathStore(...)` upstream to obtain the correct store reference before calling the helper. Task mutation tools (`add`, `cancel`, `update`, `reclassify_tdd`) must route lookup, validation, signal, cache refresh, and snapshot through the target store (`rq-crossProjectTaskMutation01`).

Dry-run note (`rq-dryRunMutation01`): preview-capable mutation tools return same-shape success + `dryRun: true` and skip all writes/signals/hooks/audit entries. Cross-project dry-runs may validate against target state with read-only trust posture.

Non-LLM tool exec note (`rq-nonLlmToolExec01`): do not ship direct ADV CLI/tool exec unless OpenCode exposes stable tool execution or equivalent structural runtime. Current #71 outcome: document/defer; no duplicate STSL/Temporal/store runtime.

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

Shared global agents (`general`, `build`, `plan`) are NOT fully replaced by sync. Instead, `.opencode/overlays/*.overlay.md` contains managed blocks that `scripts/deploy-local.sh` injects into the global agent files without overwriting user customization. The `adv` runtime agent is repo-owned and full-file synced from `.opencode/agents/adv.md`.

### Provider ADV runtime hints

`scripts/deploy-local.sh` now assembles one global ADV runtime agent:

1. **Copy canonical ADV body** — `.opencode/agents/adv.md` remains the source of truth.
2. **Preserve ADV protocol by coverage** — repository `ADV_INSTRUCTIONS.md` remains the full reference, but is not appended wholesale into global `~/.config/opencode/agents/adv.md`; runtime coverage is tracked in `docs/adv-runtime-protocol-coverage.md`, specs, tests, and command contracts.
3. **Retire provider variants** — stale global `adv-{provider}.md` files and concatenated provider prompt files are removed instead of regenerated.
4. **Runtime hints** — `plugin/src/utils/system-block.ts` injects one provider hint into `output.system[0]` when structured provider/model identity is known.
5. **Drift checks** — `check_tool_drift` validates the canonical ADV agent allowlist only.

No `adv-claude`, `adv-gpt`, `adv-glm`, or `adv-kimi` compatibility aliases are generated. User-owned `agent.adv-{provider}` config requires one-time manual cleanup; see `docs/provider-agent-assembly.md`.

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

`scripts/deploy-local.sh` is the primary maintenance tool:

```bash
./scripts/deploy-local.sh --check      # Report what's out of date
./scripts/deploy-local.sh --fix        # Sync assets + patch opencode.json
./scripts/deploy-local.sh --dry-run --diff  # Preview changes
```

Requires `jq` for config patching and `rsync` for runtime plugin deployment.

## Key References

- `ADV_INSTRUCTIONS.md` — full agent operating protocol (gates, TDD, doom loop, cancellation, re-entry)
- `SETUP.md` — installation, project init, troubleshooting
- `docs/adv-gates.md` — gate contracts and sequencing rules
- `docs/checklists/` — prep, review, and harden checklists
- `docs/snapshot-health.md` — detect/repair OpenCode snapshot-store corruption (stale locks, zero-byte objects, fsck errors, orphan repos)
