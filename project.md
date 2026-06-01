# Advance (ADV) — Project Context

> **Note:** This file is read by the `adv_project_context` tool to provide agents with project context. For developer-facing quick-reference with common pitfalls, see `AGENTS.md`.

## What This Is

OpenCode plugin repo implementing ADV — a spec-driven development orchestrator. Not a monorepo: all buildable TypeScript lives in `plugin/`. The root holds docs, specs, scripts, agent configs, and skills.

## Tech Stack

| Layer             | Technology                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin runtime    | Bun (ESM)                                                                                                                              |
| Test runner       | Vitest on Node.js                                                                                                                      |
| Language          | TypeScript (strict)                                                                                                                    |
| Runtime state     | Temporal workflows + JSON projections                                                                                                  |
| DB compatibility  | `db_dir` accepted as deprecated config only                                                                                            |
| Schema validation | Zod v4                                                                                                                                 |
| Package manager   | pnpm (`plugin/pnpm-lock.yaml` is authoritative; `bun.lock`/`bun.lockb` are ignored and rejected by `scripts/check-lockfile-policy.ts`) |
| Build             | tsup                                                                                                                                   |

**Runtime ≠ test environment.** OpenCode runs under Bun, while tests run on Node. `@opencode-ai/plugin` is mocked in tests via vitest aliases in `vitest.config.ts`; runtime storage is Temporal-only.

## Key Directories

```
plugin/src/
  tools/        # MCP tool implementations (spec, change, task, gate, wisdom, agenda, project, status, test)
  storage/      # JSON projections, Temporal adapters, migrations, external state paths
  validator/    # Spec compliance, prep-readiness checks, task classification
  events/       # Terminal UI helpers, status markers
  utils/        # project-id (root commit SHA), debug-log, safe-execute, banner

.adv/specs/           # Capability specs — git-tracked, branch-local (the laws)
.opencode/
  command/            # 21 slash-command workflow files (adv-*.md)
  agents/             # adv-researcher (bundled global), adv-engineer (bundled global), adv-reviewer (bundled global), adv-designer (bundled global, apply-phase frontend specialist), adv-tron (repo-local); overlay-managed: adv, plan (absorbed scout), build (absorbed refine)
  overlays/           # Managed overlay blocks for global shared agents
skills/               # Bundled methodology skills → synced to ~/.config/opencode/skills/
docs/                 # Gate contracts, workflow diagram, checklists, generated spec docs
scripts/              # deploy-local.sh, migrate-openspec.ts, retired recover-db.js stub
```

## Development Commands

**All commands run from `plugin/`, not the repo root.**

```bash
pnpm test                    # vitest — large test suite (~55s)
pnpm run check               # schemas:check → typecheck → lint → format:check (no tests)
pnpm run build               # tsup ESM build — emits dist/index.js + dist/index.d.ts
pnpm run typecheck            # tsc --noEmit
pnpm run lint                 # eslint src/
pnpm run lint:fix             # eslint --fix
pnpm run format               # prettier --write
pnpm run format:check         # prettier --check
pnpm run schemas:generate     # regenerate public JSON schemas from Zod registry
pnpm run schemas:check        # deterministic schema drift check
```

> Note: no `generate:docs` script exists. `plugin/schemas/*.schema.json`
> are generated public JSON schemas from the curated Zod registry in
> `plugin/src/schema-registry.ts` using Zod v4 `z.toJSONSchema()`.

Single test file: `pnpm test -- src/tools/change.test.ts`

CI order: typecheck → lint → format:check → test → build (Node 20.x + 22.x)

## Architecture Conventions

### Specs are laws

`.adv/specs/` defines capability requirements. Spec always wins over proposal. Archive blocks until all 7 gates pass. Spec files are git-tracked and branch-local — spec changes in one worktree are not visible in another until merged.

### ADV state is external

Changes, archive, wisdom, agenda, reflections, and handoff live **outside the repo** at:

```
$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/
```

`project-id` = root commit SHA (see `plugin/src/utils/project-id.ts`). All worktrees of the same repo share this external state. ADV worktrees live at `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. `db_dir` / physical `db/` are legacy-only and should appear only in compatibility docs or dry-run hygiene reports.

### Never read ADV state files directly

Use ADV MCP tools (`adv_change_show`, `adv_task_list`, etc.). Direct reads via `cat`/`read`/`ls` are forbidden — state format may change and direct reads bypass caching/migration logic.

### Conformance state

External CI-isolated spec conformance state lives at `~/.local/share/opencode/plugins/advance/{project-id}/conformance.json`. Conformance test source lives in `.adv/specs/_conformance/` (default, in-repo subfolder) or `{project-parent}/advance-conformance-{pid}/` (opt-in sibling repo). Use `adv_conformance` tool for all conformance operations.

### Tool registration pattern

Each `src/tools/*.ts` exports a `*Tools` object. `tool-registry.ts` collects all via `createToolMap()`. To add a tool: define in the relevant tools file → export from `src/tools/index.ts` → auto-picked up.

### Schema source of truth

Zod schemas remain the authoritative source. Public JSON schema artifacts in `plugin/schemas/*.schema.json` are generated deterministically by `plugin/src/schema-registry.ts` and `plugin/scripts/generate-json-schemas.ts` via Zod v4 `z.toJSONSchema()`. When extending a public Zod schema, add it to the curated registry if it should be published, run `pnpm run schemas:generate`, and keep `pnpm run schemas:check` green so committed artifacts do not drift.

### Overlay sync model

Global shared agents (`adv`, `general`, `build`, `plan`) are patched, not replaced, by `scripts/deploy-local.sh`. Managed blocks in `.opencode/overlays/*.overlay.md` are injected into global agent files without overwriting user customizations.

### Zod cast is intentional

Tool arg schemas use `as any` in `tool-registry.ts` for SDK compatibility. Do not remove it.

## Testing Conventions

- Tests co-located with source: `foo.ts` → `foo.test.ts`
- Asset tests (`*-assets.test.ts`) verify command/manifest consistency
- Shared helpers in `src/__tests__/setup.ts`: `createTestProject`, `parseToolOutput`, `createTempDir`, `cleanupTempDir`
- Temp dirs for full isolation — no external services needed

## Maintenance Scripts

```bash
./scripts/deploy-local.sh --check          # What's out of date?
./scripts/deploy-local.sh --fix            # Rebuild/sync runtime plugin + assets/config
./scripts/deploy-local.sh --dry-run --diff # Preview changes
```

Requires `jq` for config patching and `rsync` for runtime plugin deployment.

## Key Reference Files

| File                      | Purpose                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `ADV_INSTRUCTIONS.md`     | Full agent operating protocol: gates, TDD, doom loop, cancellation, re-entry |
| `AGENTS.md`               | Developer quick-reference: commands, layout, gotchas                         |
| `SETUP.md`                | Installation, project init, troubleshooting                                  |
| `docs/adv-gates.md`       | Gate contracts and sequencing rules                                          |
| `docs/checklists/`        | Prep, review, and harden checklists                                          |
| `docs/snapshot-health.md` | Detect/repair OpenCode snapshot-store corruption                             |
