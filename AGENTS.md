# Advance contributor notes

## Scope and entry points

- This is an OpenCode plugin repository, not a monorepo. Supported buildable code is only `plugin/`; `acp-mux/` is archived reference material, not a release surface.
- Plugin entry: `plugin/src/index.ts`. Tool definitions live beside handlers under `plugin/src/tools/`; `tool-registry.ts` binds exported `*Tools` groups to the SDK.
- `.adv/specs/` contains git-tracked, branch-local capability laws. Runtime change/task/gate state uses Temporal-only persistence written to per-project external state (keyed by the repo root commit); do not restore a legacy SQLite/file-backed runtime path.
- `project.md` is agent-facing project context. `ADV_INSTRUCTIONS.md` owns detailed ADV workflow protocol; do not duplicate either here.

## Commands

Run package commands from `plugin/`:

```bash
pnpm run check                 # schemas, typecheck, isolation/lockfile checks, lint, format; no tests
pnpm run build                 # plugin + Temporal worker bundles
pnpm run build:worker          # required before OOP Temporal integration tests
pnpm run schemas:generate      # regenerate tracked plugin/schemas artifacts after public Zod changes
pnpm test -- src/tools/foo.test.ts
```

Use root `bin/oc-test` for throttled suites:

```bash
bin/oc-test targeted -- src/tools/foo.test.ts
bin/oc-test smoke
bin/oc-test full
```

- CI uses Node 24 and pnpm 11. CI order: schemas:check → typecheck → lint → format:check → test → build. Tests run on Node/Vitest; the OpenCode runtime is Bun. CI builds the Temporal worker before `pnpm test` and separately runs `bun test bin/`.
- `pnpm` owns dependencies. Never add `bun.lock` or `bun.lockb` beside `plugin/pnpm-lock.yaml`.

## Boundaries enforced by tests

- Keep tests that create changes or access worktree/data-home state isolated with `createTempDir`, `tmpdir`, `os.tmpdir`, or `XDG_DATA_HOME`; the isolation checker enforces this outside its small explicit allowlist.
- `plugin/src/temporal/workflows.ts` is the worker-bundle root. Its static import graph must not reach `storage/`, `tools/`, `tool-registry.ts`, `plugin-init.ts`, or `node:*`; do not add `defineUpdate` handlers to workflow-reachable code.
- `utils/context-snapshot.ts` is a pure formatter. Persistence-backed loading belongs in `storage/context-snapshot-fetch.ts`.
- Zod schemas are authoritative. Public JSON schemas originate in `src/schema-registry.ts`, generated deterministically via Zod v4 `z.toJSONSchema()`; run `pnpm run schemas:generate` after public Zod changes and keep `pnpm run schemas:check` green.
- Tool-argument schemas use the intentional `as any` SDK-boundary cast in `tool-registry.ts`; do not remove it. Add tools through their `src/tools/*` group and its export rather than wiring handlers directly in `index.ts`.

## Deployment and local runtime

- OpenCode loads the deployed `~/.local/share/Advance/plugin/dist/index.js` at session start. Source edits do not change live `adv_*` behavior until `pnpm run build`, `./scripts/deploy-local.sh --fix`, and an OpenCode/plugin-host restart.
- `scripts/deploy-local.sh` mirrors supported plugin, command, agent, overlay, skill, and CLI assets. It needs `jq` to patch config and `rsync` for plugin deployment. Preview with `--dry-run --diff`.
- `.opencode/worktree.jsonc` installs `plugin/` dependencies after ADV worktree creation; `pnpm` must be on `PATH`.
- Opt-in hooks run `deploy-local.sh --fix` after commits and before pushes when deployed ADV assets change. They do not block a push if deployment fails.
