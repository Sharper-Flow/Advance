# Advance (ADV) - Agent Instructions

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
    guards/          # Runtime policy enforcement (bash sanitization, task nesting depth)
    validator/       # Spec validation, prep-readiness, task classification
    events/          # Terminal UI, status markers
    utils/           # Helpers (debug-log, project-id, safe-execute)
    __mocks__/       # Vitest aliases: @opencode-ai/plugin → mock, bun:sqlite → better-sqlite3
    __tests__/setup.ts  # Shared fixtures and assertion helpers
  schemas/           # Generated JSON schemas (from Zod types via generate:schemas)
.adv/specs/          # Capability specs (the laws) — git-tracked, branch-local
.opencode/
  command/           # 21 slash-command workflow files (adv-*.md)
  agents/            # Repo-local agents (adv-researcher, tron, plus overlay-managed: adv, build, plan, refine, scout)
  overlays/          # Managed overlay blocks synced into global shared agents
skills/              # Bundled methodology skills synced to ~/.config/opencode/skills/
scripts/             # sync-global.sh (main), migrate-openspec.ts, recover-db.js, model-blind-test
docs/                # Gate contracts, workflow diagram, checklists, spec docs
```

## Development Commands

**All commands run from `plugin/`, not the repo root.**

```bash
pnpm test                    # vitest run — 1290+ tests, ~55s
pnpm run check               # typecheck → lint → format:check (no tests)
pnpm run build               # tsup (ESM) + generate:schemas
pnpm run typecheck            # tsc --noEmit
pnpm run lint                 # eslint src/
pnpm run lint:fix             # eslint --fix
pnpm run format               # prettier --write
pnpm run format:check         # prettier --check
pnpm run generate:schemas     # Zod → JSON Schema (writes to schemas/)
pnpm run generate:docs        # Spec → markdown docs (writes to docs/specs/)
```

**Single test file:** `pnpm test -- src/tools/change.test.ts`

**CI order** (`.github/workflows/ci.yml`): typecheck → lint → format:check → test → build. Node 20.x + 22.x.

## Architecture Gotchas

### Runtime is Bun, tests run on Node
The plugin uses `bun:sqlite` at runtime. Tests mock it via vitest aliases in `vitest.config.ts`:
- `bun:sqlite` → `src/__mocks__/bun-sqlite.ts` (wraps `better-sqlite3`)
- `@opencode-ai/plugin` → `src/__mocks__/opencode-plugin.ts`

If you add imports from the SDK or Bun APIs, ensure the mocks cover them or tests will fail with resolution errors.

### Zod v4 with v3 compatibility
Dependencies use Zod v4 (`^4.3.6`). Tool arg schemas use Zod and are cast via `as any` in tool-registry.ts for SDK compatibility. The cast is intentional — don't "fix" it.

### External mutable state
ADV state (changes, archive, wisdom, agenda, handoff) lives **outside the repo** at `~/.local/share/opencode/plugins/advance/{project-id}/`, keyed by root commit SHA. All worktrees of the same repo share this state. Specs (`.adv/specs/`) remain in-repo and branch-local.

**Never read ADV state files directly** (`read`, `cat`, `ls`). Always use ADV MCP tools (`adv_change_show`, `adv_task_list`, etc.).

### Overlay sync model
Shared global agents (`adv`, `general`, `build`, `plan`, `refine`, `scout`) are NOT fully replaced by sync. Instead, `.opencode/overlays/*.overlay.md` contains managed blocks that `scripts/sync-global.sh` injects into the global agent files without overwriting user customization.

### Guard system
- `guards/bash.ts` — sanitizes bash commands at runtime (blocks destructive patterns)
- `guards/task.ts` — enforces single-level sub-agent nesting (hard depth limit of 1)

### Tool registration pattern
Each tool file in `src/tools/` exports a `*Tools` object with description, args schema, and execute function. `tool-registry.ts` binds them all via `createToolMap()`. To add a new tool:
1. Define it in the relevant `src/tools/*.ts` file
2. Export from `src/tools/index.ts`
3. `tool-registry.ts` picks it up via the `*Tools` import

### Schema generation
`pnpm run generate:schemas` converts Zod types → JSON Schema files in `schemas/`. These are committed. If you change Zod schemas in `src/types.ts` or storage types, regenerate.

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
