## Agreement — addRepositoryFilter

Final agreement after `/adv-proposal` confirmation, `/adv-research` validation (server-side filter pivot), and `/adv-discover` evidence gathering.

## Objectives

### SC1 — Schema field

Add optional `repository_filter: z.string().min(1).optional()` to `GitHubProjectConfigSchema` in `plugin/src/storage/github-project-config.ts`. Configs without the field continue to parse identically to today (additive only — no `.passthrough()` change required).

### SC2 — Live read path filter

`readLiveProject` (`plugin/src/tools/roadmap.ts:283`) accepts `repository_filter` from config. When set, the `gh project item-list` invocation gains `--query "repo:${owner}/${repository_filter}"`. Filter is server-side; client code does not iterate or post-filter items.

### SC3 — Snapshot writer filter

`/adv-triage` Phase 1 reader gains the same `--query` arg when `repository_filter` is set. Phase 4 mutations and Phase 5 snapshot + ROADMAP.md generation operate on the filtered cached map; no per-phase filter additions needed.

### SC4 — Bootstrap auto-detect

`/adv-triage --execute` Phase 0 parses `git remote get-url origin` via a new `parseGitRemoteUrl` helper (`plugin/src/utils/`). When the resolved owner matches the project owner AND the project title is not the per-repo `ADV: <name>` form, write `repository_filter: "<repo-name>"` on first-run only. Never overwrite an existing filter.

### SC5 — Snapshot header transparency

`adv_roadmap source: "file"` snapshot JSON gains optional top-level `repository_filter` mirroring the config field. Older snapshots without it continue to parse.

### SC6 — Backwards compatibility

Existing FE/BE deployments without `repository_filter` MUST behave identically to today. No implicit "default to current repo" filter. Legacy `project_metadata['github_project']` fallback continues to be read-only and ignores the filter.

### SC7 — Documentation

Inline `<!-- rq-... -->` doc anchors in the modified files (schema, roadmap.ts, adv-triage.md) following the existing `rq-issueChangeLinkage*` convention. No new formal spec capability — no `github-linkage` capability exists in `.adv/specs/` and creating one is out of scope.

### SC8 — Verification

`pnpm run check && pnpm test` pass.

## Acceptance Criteria

### AC1 — Filter scopes live reads

Given Sharper-Flow Project #1 (shared) and a config with `repository_filter: "Example-Web"`, `adv_roadmap source: "live"` returns only Example-Web items. Probe-confirmed: `gh project item-list 1 --owner Sharper-Flow --format json --limit 2 --query "repo:Sharper-Flow/ExampleProduct"` returns only ExampleProduct items (68 of 123 total).

### AC2 — Filter scopes file reads through pre-filtered snapshot

Given `/adv-triage` writes a snapshot with `repository_filter: "Example-Web"`, `adv_roadmap source: "file"` returns only Example-Web items.

### AC3 — Backwards compat

Given a config with NO `repository_filter`, `adv_roadmap source: "live"` and `source: "file"` return all items (current behavior).

### AC4 — Bootstrap auto-detect

Given `git remote get-url origin` returns `git@github.com:Sharper-Flow/Example-Web.git` and the project owner is `Sharper-Flow` with title `Sharper-Flow` (not `ADV: Example-Web`), `/adv-triage --execute` first-run writes `repository_filter: "Example-Web"`. Re-run with existing filter does not overwrite.

### AC5 — Bootstrap skip on per-repo board

Given the project title matches `ADV: <repo-name>`, bootstrap does NOT write a filter (preserves existing single-repo deployments).

### AC6 — Triage mutation safety

`/adv-triage` Phase 4 only mutates items present in the Phase 1 filtered cache (rq-cacheRefresh01 discipline already in place). No cross-repo writes.

### AC7 — Schema rejects empty filter

`GitHubProjectConfigSchema.parse({...config, repository_filter: ""})` rejects.

### AC8 — Tests pass

`pnpm test -- src/storage/github-project-config.test.ts src/tools/roadmap.test.ts` passes including new cases.

## Constraints

### C1 — Server-side filter only

Filter implementation is server-side via `gh ... --query "repo:..."`. Client-side filtering on `item.content.repository` is rejected (see DONT1).

### C2 — Bare-name semantics

`repository_filter` value is the bare repo name (e.g. `"Example-Web"`). Owner is inherited from `config.owner`. Avoids cross-owner ambiguity.

### C3 — Single-repo per linkage

`repository_filter` is `z.string()`, not an array. Multi-repo union filtering is out of scope.

### C4 — Inline rq anchors, no formal spec

No new `.adv/specs/` capability is created. Documentation lives as inline `<!-- rq-... -->` HTML comments in modified files, matching the existing `rq-issueChangeLinkage*` and `rq-cacheRefresh01` pattern. Confirmed no `github-linkage` spec capability exists.

### C5 — Snapshot format additive

Snapshot JSON change is additive only — old snapshots without `repository_filter` continue to parse. Field is optional.

### C6 — First-run-only bootstrap

Bootstrap auto-detect MUST NOT overwrite an existing `repository_filter` value. Detect-and-skip if config already has the field.

## Rejected Approaches

### DONT1 — Client-side filter on `item.content.repository`

Original proposal framed this as a post-fetch client-side filter on `item.content.repository.name`. Research showed: (1) `content.repository` is a string `"owner/name"`, not an object — field path was wrong; (2) server-side `--query "repo:owner/name"` is supported by `gh` CLI and confirmed working live. Server-side filter wins on simplicity, performance, and pagination correctness.

### DONT2 — Multi-repo union filter

E.g. `repository_filter: ["A", "B"]`. Single-repo is the explicit scope. Revisit only if a concrete multi-repo use case emerges.

### DONT3 — Implicit "default to current repo" filter

Silent default would break existing FE/BE deployments that intentionally read all items (no filter today). Unset MUST mean unfiltered.

### DONT4 — Cross-owner filtering

E.g. user-owned project filtering org repos. Owner is inherited from `config.owner`. Configs targeting a project owned by `OwnerA` cannot filter for repos under `OwnerB`. Out of scope until real use case appears.

### DONT5 — Backporting filter to legacy `project_metadata['github_project']`

Legacy path is read-only and migrates forward on first read. Adding filter logic to the migration-forward write would couple a deprecation path to a new feature. Legacy data won't have the filter; migration writes the new file without it.

### DONT6 — Creating a new `github-linkage` spec capability

`.adv/specs/` has 11 capabilities; none own GH project linkage. The existing pattern is inline `<!-- rq-... -->` doc anchors in command files and source comments. Stay consistent.

## Out of Scope

### OOS1 — Data migration from per-repo boards

Migrating existing FE (#6) and BE configs from dedicated ADV-only project boards to the shared project (#1) with `repository_filter` set. Manual op after this ships.

### OOS2 — Archiving legacy ADV-specific project boards

Closing/archiving `#6` etc. on GitHub after migration. Out-of-band cleanup.

### OOS3 — Public `/roadmap` page in `example-web`

Separate code path using `ROADMAP_GITHUB_TOKEN`. Not ADV.

### OOS4 — `parseGitRemoteUrl` consumer beyond this change

The helper is created here for `/adv-triage` Phase 0. Other potential consumers (e.g. archive flow's remote detection) MAY adopt it later but are not refactored in this change.

### OOS5 — Migration of triage Phase 0 metadata read path

`/adv-triage` currently reads config via `adv_project_metadata action: 'read' key: 'github_project'` (legacy path) at Phase 0. The modern path is `readGitHubProjectConfig`. Switching that read path is a follow-up — this change extends the existing read path only.

## Open Design Questions

### Q1 — Snapshot header field placement

`repository_filter` in snapshot JSON: top-level field vs nested under a `filter` namespace. **Trust model:** agent. **Blast radius:** affects `adv_roadmap source: "file"` consumers and any external tools reading the snapshot. **Alternatives:**
- (a) Top-level `repository_filter`, mirroring config field (Recommended — minimal change, easy to extend later)
- (b) Nested `filter: { repository: "..." }` for forward-extensibility to other filter types

Default to (a) unless `/adv-design` surfaces a concrete second filter type already on the roadmap.

### Q2 — gh CLI version pinning

`--query` flag on `gh project item-list` requires `github.com` API host or GHES 3.20+. **Trust model:** joint. **Blast radius:** breaks on older GHES installations. **Alternatives:**
- (a) Document the requirement; no runtime check (Recommended)
- (b) Probe `gh --version` and fail with a clear error before the call

(a) is the LBP — the user community for ADV is github.com; a runtime probe is over-engineering. Add a doc note in the linkage section.

### Q3 — Triage bootstrap heuristic for "shared vs per-repo board"

Per-repo board heuristic: project title equals `ADV: <repo-name>`. **Trust model:** agent. **Blast radius:** if heuristic is wrong, bootstrap writes (or skips) a filter the user didn't want. **Alternatives:**
- (a) Title regex `^ADV: ` + non-equal owner check (Recommended)
- (b) User confirmation prompt every first-run

(a) reduces friction for the common case. Add escape hatch: user can edit `.adv/github-project.json` manually to override.