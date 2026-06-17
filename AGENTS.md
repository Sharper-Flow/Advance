# Advance (ADV) - Agent Instructions

> `project.md` is the canonical agent-facing context file read by `adv_project_context`.
> `AGENTS.md` remains the developer-facing quick-reference with repo architecture, commands, and implementation gotchas.

## Repository Layout

This is an OpenCode plugin repo, not a monorepo. All supported buildable code lives in `plugin/`. `acp-mux/` is an archived ACP experiment kept for reference only; do not treat it as a supported package, release surface, or current install path until upstream OpenCode ACP blockers are fixed.

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
    utils/           # Helpers (debug-log, project-id, safe-execute, tool-arg-preflight)
    __mocks__/       # Vitest aliases, including @opencode-ai/plugin → mock
    __tests__/setup.ts  # Shared fixtures and assertion helpers
  schemas/           # Generated public JSON schemas from the curated Zod registry
.adv/specs/          # Capability specs (the laws) — git-tracked, branch-local
.opencode/
  command/           # Slash-command workflow files (adv-*.md)
  agents/            # adv-researcher, adv-engineer, adv-reviewer, adv-designer (bundled global; designer is the apply-phase frontend specialist), adv-tron (repo-local), adv-atc; overlay-managed: adv, plan (absorbed scout), build (absorbed refine)
  overlays/          # Managed overlay blocks synced into global shared agents
skills/              # Bundled methodology skills synced to ~/.config/opencode/skills/
scripts/             # deploy-local.sh (main), migrate-openspec.ts, recover-db.js, model-blind-test
docs/                # Gate contracts, workflow diagram, checklists, spec docs
acp-mux/             # Archived ACP experiment; reference only, not supported/released
```

## Development Commands

**All commands run from `plugin/`, not the repo root.** Tests run on Node via vitest; the plugin runtime is Bun.

```bash
pnpm test                    # vitest run — full suite (~267 spec files under src/)
pnpm run check               # pre-push gate: schemas:check → typecheck → check-test-isolation → check-lockfile-policy → lint → format:check (no tests)
pnpm run build               # tsup ESM (dist/index.js + .d.ts) && build:worker (dist/temporal/*.js)
pnpm run build:worker        # TEMPORAL WORKER BUNDLE — must build before OOP integration tests
pnpm run typecheck            # tsc --noEmit
pnpm run lint                 # eslint src/
pnpm run lint:fix             # eslint --fix
pnpm run format               # prettier --write src/
pnpm run format:check         # prettier --check src/
pnpm run schemas:generate     # regenerate public JSON schemas from Zod registry
pnpm run schemas:check        # deterministic schema drift check (CI-enforced)
pnpm run dev                  # tsup --watch (plugin only)
pnpm run test:watch           # vitest watch mode
pnpm run test:coverage        # vitest --coverage
pnpm run bench:latency        # bun --smol scripts/bench-adv-latency.ts
# Note: no `generate:docs` script. Public JSON schemas are generated from
# plugin/src/schema-registry.ts using Zod v4 z.toJSONSchema().
```

**Single test file:** `pnpm test -- src/tools/change.test.ts`

**Lockfile policy** (`scripts/check-lockfile-policy.ts`, enforced in `check`): pnpm is authoritative — never commit `bun.lock`/`bun.lockb` beside `plugin/pnpm-lock.yaml`. Bun is the OpenCode runtime, not the package manager for this repo.

**Test isolation** (`scripts/check-test-isolation.ts`, enforced in `check`): any test calling `adv_change_create`/`changeCreate` MUST use an isolated project dir (`createTempDir`/`tmpdir`/`os.tmpdir`). Allowlisted: `*-assets.test.ts`, `target-project.test.ts`.

**OpenCode/ADV test routing:** prefer the repo-local throttle wrapper when running suites from the repo root:

```bash
bin/oc-test targeted -- src/tools/change.test.ts
bin/oc-test smoke
bin/oc-test full
```

`bin/oc-test` delegates to `oc-test-gate` when available and falls back to direct plugin commands without changing `adv_run_test` semantics.

**`bin/adv` — read-only status CLI** (Bun runtime; covered by `bun test bin/` in CI):

```bash
bin/adv status      # live active-changes table from Temporal (default subcommand)
bin/adv roadmap     # prioritized backlog from .adv/roadmap-snapshot.json
bin/adv slop-scan   # deterministic slop scanner
bin/adv --json      # JSON output (status/roadmap/slop-scan)
```

**CI order** (`.github/workflows/ci.yml`, Node 24.x, pnpm 11): schemas:check → typecheck → lint → format:check → test → build. Within the test job, `build:worker` runs before `pnpm test`, Temporal CLI + Bun are installed, and `bun test bin/` runs as a separate surface; the `build` job (`pnpm run build`) runs only after tests pass. Auto-release (`auto-release.yml`) cuts a GitHub Release after CI succeeds on main/trunk using conventional commits.

**Git hooks** (`.githooks/`, opt-in via `scripts/install-git-hooks.sh` which sets `core.hooksPath=.githooks`): `post-commit` and `pre-push` run `deploy-local.sh --fix` when a commit touches `.opencode/`, `ADV_INSTRUCTIONS.md`, or `skills/`, keeping `~/.config/opencode/` in sync. Idempotent no-ops otherwise; never block the push.

### Source-vs-Dist Reload Gotcha

OpenCode loads the plugin from the deployed runtime copy (normally `~/.local/share/Advance/plugin/dist/index.js`) at session startup and caches it in process memory. **Source edits to `plugin/src/` do NOT take effect in the current OpenCode session.** Unit tests run against source via vitest and pick up changes immediately, but live tool invocations (`adv_*` calls from the agent) continue to use the cached deployed `dist/index.js` until the runtime copy is rebuilt/synced and the session restarts.

To validate a source change end-to-end through live tool invocations:

1. `pnpm run build` — regenerates source-checkout `dist/index.js` (and `dist/temporal/*.js`)
2. `./scripts/deploy-local.sh --fix` — rebuilds if needed and syncs `plugin/` to the stable runtime path
3. Restart the OpenCode session (or restart the plugin host)
4. Re-invoke the affected tool

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

Tool-layer code SHALL use `fireSignalAndRefresh(handle, store, changeId, signal, ...args)` from `plugin/src/tools/_adapters.ts` for change-workflow signals. Helper fires signal + invalidates `changeCache`; later `store.changes.get()` returns fresh state. Direct `fireSignal` allowed only for signals not tied to one change (none now). Exemptions require `// rq-cacheRefresh01-exempt: <reason>`. Gate: `grep -rn "fireSignal(handle" plugin/src/tools/ | grep -v ".test.ts" | grep -v rq-cacheRefresh01-exempt` MUST return zero matches.

Cross-project: target mutations use target store cache. Use `withTargetPathStore(...)` before helper; target store wraps target project's `StoreBackend`, so helper invalidates target cache. Task mutation tools (`add`, `cancel`, `update`, `reclassify_tdd`) route lookup, validation, signal, cache refresh, snapshot through target store (`rq-crossProjectTaskMutation01`).

Dry-run (`rq-dryRunMutation01`): preview-capable mutation tools return same-shape success + `dryRun: true`; no writes/signals/hooks/audit. Cross-project dry-runs may validate target state read-only.

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

Public JSON schema artifacts are generated from Zod with `z.toJSONSchema()` through `plugin/src/schema-registry.ts`; keep `pnpm run schemas:check` green after schema edits.

### External mutable state

ADV state (changes, archive, wisdom, agenda, reflections, handoff) lives **outside the repo** at `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/` (default `~/.local/share/...`), keyed by root commit SHA. All worktrees of the same repo share this state. Specs (`.adv/specs/`) remain in-repo and branch-local. Runtime storage is Temporal-only; physical `db/` directories and `db_dir` config are legacy compatibility artifacts only.

ADV-managed worktrees live under `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. Empty branch-prefix parents may be reaped with bounded `rmdir` only; broad cleanup remains dry-run/approval-gated via hygiene tools.

Archived ADV changes clean up their `change/{id}` branches (local + remote). Direct-archive mode deletes at archive time. PR-mode archives require post-merge cleanup via `adv_archive_repair action=cleanup_merged` (operator-explicit; safe `git branch -d` semantics; squash-merge-safe detection).

`adv_status` also reports a worktree census from `git worktree list --porcelain` plus root-directory mtime. Stale worktrees (>7d inactive) appear in the `worktree_census` raw field and formatted Worktrees section; disk usage is intentionally not scanned in status.

**Never read ADV state files directly** (`read`, `cat`, `ls`). Always use ADV MCP tools (`adv_change_show`, `adv_task_list`, etc.).

### ADV MCP tool call hygiene (P1.12)

Invoke ADV tools with explicit required args — never with empty parameter sets.

- `adv_change_update` — pass `changeId` + at least one non-blank artifact field (`proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`). Zero-args or all-blank artifact payloads fail fast with `INVALID_TOOL_ARGS` before execution; omit fields you do not want to change.
- `adv_task_add` — before passing `blockedBy`, call `adv_task_list changeId: <id>` to fetch current task IDs. Invalid IDs are rejected; the error response lists the valid IDs.
- `adv_task_cancel` — all `taskIds` must exist in the same change. Cancellations are atomic: if any ID is unknown, no task is cancelled.
- Read each tool's field `describe()` text before constructing calls — it documents relational constraints (source-of-truth tool, at-least-one-of patterns, valid enum values).

**Strict-mode tolerance.** OpenAI Responses API (GPT-5 / reasoning models) auto-applies `strict: true`, causing placeholder fills (`""`, `0`, `[]`) in every optional parameter. Preflight normalizes these automatically: optional content, path, and lineage blanks are omitted, and `origin_issue_number: 0` is treated as omitted. Required-when-present audit, evidence, reason, command, branch, and identity fields still reject blanks. This is a safety-net workaround for Vercel AI SDK issue #12200. Agents should still aim to omit fields they do not intend to set.

Tool-arg placeholder behavior is centralized in `FIELD_POLICIES` (`plugin/src/utils/tool-arg-preflight.ts`). Policy drift tests require audited fields to reject or normalize before handlers run and representative malformed calls to fail with `INVALID_TOOL_ARGS`; do not add ad hoc handler-only placeholder logic for correctness-critical fields.

See `ADV_INSTRUCTIONS.md § ADV MCP Tool Invocation` for the full protocol.

### Overlay sync model

Shared global agents (`general`, `build`, `plan`) are not fully replaced. `.opencode/overlays/*.overlay.md` managed blocks are injected by `scripts/deploy-local.sh`; user customization stays. The `adv` agent is repo-owned and full-file synced from `.opencode/agents/adv.md`.

### Provider ADV runtime hints

`scripts/deploy-local.sh` assembles one global ADV runtime agent:

1. Copy canonical ADV body from `.opencode/agents/adv.md`.
2. Preserve protocol by coverage. `ADV_INSTRUCTIONS.md` remains full reference, not appended wholesale. Coverage tracked in `docs/adv-runtime-protocol-coverage.md`, specs, tests, command contracts.
3. Retire provider variants. Stale global `adv-{provider}.md` and concatenated provider prompts removed.
4. Runtime hints. `plugin/src/utils/system-block.ts` injects one provider hint into `output.system[0]` when provider/model identity known.
5. Drift checks. `check_tool_drift` validates canonical ADV agent allowlist only.

No `adv-claude`, `adv-gpt`, `adv-glm`, `adv-kimi` aliases generated. User-owned `agent.adv-{provider}` config needs one-time manual cleanup; see `docs/provider-agent-assembly.md`.

### Tool registration pattern

Each `src/tools/*.ts` file exports a `*Tools` object: description, args schema, execute. `tool-registry.ts` binds via `createToolMap()`. Add tool:

1. Define it in the relevant `src/tools/*.ts` file
2. Export from `src/tools/index.ts`
3. `tool-registry.ts` picks it up via the `*Tools` import

### Schema source of truth

Zod schemas are authoritative. `plugin/src/schema-registry.ts` curates public schemas and `plugin/scripts/generate-json-schemas.ts` writes deterministic `plugin/schemas/*.schema.json` artifacts with canonical Advance `$id`/`$schema` URLs. Extending a public Zod schema requires `pnpm run schemas:generate`; CI/`pnpm run check` enforces `pnpm run schemas:check`.

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
- `docs/temporal-recovery.md` — Temporal worker recovery model (replaces retired `validate:temporal`)
- `docs/checklists/` — prep, review, and harden checklists
- `docs/snapshot-health.md` — detect/repair OpenCode snapshot-store corruption (stale locks, zero-byte objects, fsck errors, orphan repos)
