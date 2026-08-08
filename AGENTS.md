# Advance contributor notes

## Scope and entry points

- This is an OpenCode plugin repository, not a monorepo. `plugin/` is the only buildable/released code. Root-level `bin/`, `scripts/`, `skills/`, `.opencode/` are tooling and deployed assets, not shipped packages.
- Plugin entry: `plugin/src/index.ts`. Tool definitions live beside handlers under `plugin/src/tools/`; `tool-registry.ts` binds exported `*Tools` groups to the SDK. A second surface, `plugin/src/mcp-server/`, provides a stdio MCP server (deployed as Vision `adv-advance` on port 6298) that exposes 13 Tier-4 read tools as `tools.adv.*` under Code Mode, dispatching to the same `tool-registry.js` handlers via dynamic import.
- `.adv/specs/` contains git-tracked, branch-local capability laws. Runtime change/task/gate state uses per-project disk projections under `~/.local/share/opencode/plugins/advance/<projectId>/changes/<changeId>/change.json`; writes are transactionally locked, crash-safe, and fail closed on verification problems.
- `project.md` is agent-facing project context. `ADV_INSTRUCTIONS.md` owns detailed ADV workflow protocol; do not duplicate either here.

## Commands

Run package commands from `plugin/`:

```bash
pnpm run check                 # schemas:check, typecheck, agent-manifest/test-isolation/lockfile checks, lint, format:check; no tests
pnpm run build                 # plugin + build-identity bundles
pnpm run generate:manifests    # regenerate agent YAML tool lists from AGENT_TOOL_POLICY (run after editing tool-role-policy.ts)
pnpm run schemas:generate      # regenerate tracked plugin/schemas artifacts after public Zod changes
pnpm test -- src/tools/foo.test.ts
```

Use root `bin/oc-test` for throttled suites:

```bash
bin/oc-test targeted -- src/tools/foo.test.ts
bin/oc-test smoke
bin/oc-test full
```

- CI uses Node 24 and pnpm 11. CI order: schemas:check → typecheck → lint → format:check → test → build. Tests run on Node/Vitest; the OpenCode runtime is Bun. CI builds the emitted plugin bundle before separately running `bun test bin/` from the repo root because CLI parity tests execute `plugin/dist/reconcile-cli.js`.
- `pnpm` owns dependencies. Never add `bun.lock` or `bun.lockb` beside `plugin/pnpm-lock.yaml`.
- `bin/adv` is a Bun-powered standalone CLI (`adv status`, `adv roadmap`, `adv epic list --json`); requires Bun 1.3+ on PATH. `bun test bin/` covers it as a separate CI job — do not put bin/ tests under Vitest.

## Boundaries enforced by tests

- Vitest runs one project: `unit` (`src/**/*.test.ts` + `scripts/**/*.test.ts`, parallel). `@opencode-ai/plugin` is mocked via the vitest alias in `vitest.config.ts` — tests never load the real SDK.
- `pnpm test` requires `bun` on PATH: `opencode-session-debt.test.ts` shells out to `bun` to seed a `bun:sqlite` DB. Without it the suite fails with `spawnSync bun ENOENT`.
- Keep tests that create changes or access worktree/data-home state isolated with `createTempDir`, `tmpdir`, `os.tmpdir`, or `XDG_DATA_HOME`. The isolation checker (`scripts/check-test-isolation.ts`) enforces this for any test calling `adv_change_create`, `changeCreate`, `getWorktreeBase`, or `getDataHome`; the only exempt patterns are `*-assets.test.ts` and `target-project.test.ts`.
- `utils/context-snapshot.ts` is a pure formatter. Persistence-backed loading belongs in `storage/context-snapshot-fetch.ts`.
- Zod schemas are authoritative. Public JSON schemas originate in `src/schema-registry.ts`, generated deterministically via Zod v4 `z.toJSONSchema()`; run `pnpm run schemas:generate` after public Zod changes and keep `pnpm run schemas:check` green. Agent YAML `tools:` frontmatter is likewise generated from `AGENT_TOOL_POLICY` — run `pnpm run generate:manifests` after editing it and keep `pnpm run generate:manifests:check` green.
- Tool-argument schemas use the intentional `as any` SDK-boundary cast in `tool-registry.ts`; do not remove it. Add tools through their `src/tools/*` group and its export rather than wiring handlers directly in `index.ts`.

## Deployment and local runtime

- OpenCode loads the deployed `~/.local/share/Advance/plugin/dist/index.js` at session start. `plugin/` also ships `dist/mcp-server.js` (the ADV MCP server, run by Vision as `adv-advance` on port 6298) and `dist/reconcile-cli.js` (the disk-only handler loaded by `bin/adv reconcile`). Source edits do not change live `adv_*` behavior until `pnpm run build`, `./scripts/deploy-local.sh --fix`, and an OpenCode/plugin-host restart. There is no hot reload; OpenCode does not live-reload host-loaded plugin modules.
- `scripts/deploy-local.sh` publishes the plugin bundle manifest (`dist/plugin-bundle-manifest.json`) safely: it requires the manifest, excludes it from the payload rsync, validates the copied `dist/index.js`, `dist/mcp-server.js`, and `dist/reconcile-cli.js` SHA-256 hashes against the manifest, and copies the manifest last. The manifest generation/hash is the authoritative bundle identity; filesystem mtimes are advisory only.
- `scripts/deploy-local.sh` mirrors supported plugin, command, agent, overlay, skill, and CLI assets. It needs `jq` to patch config and `rsync` for plugin deployment. Preview with `--dry-run --diff`.
- The first deploy of this manifest-aware sequence requires one OpenCode restart to bootstrap the loaded plugin generation; after that, every system transform and health probe can report `PLUGIN_BUNDLE_STALE` when the deployed bundle is newer than the loaded one.
- `.opencode/worktree.jsonc` installs `plugin/` dependencies after ADV worktree creation; `pnpm` must be on `PATH`.
- Opt-in hooks run `deploy-local.sh --fix` after commits and before pushes when deployed ADV assets change. They do not block a push if deployment fails.
