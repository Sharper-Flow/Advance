## Why

`GitHubProjectConfigSchema` cannot express "this ADV project reads from GH Project X but only items belonging to repository Y." This forces multi-repo orgs that share a single GitHub Project (the canonical Sharper-Flow setup: Project #1 holds both Example-Web and ExampleProduct issues) into N separate ADV-only project boards — fragmenting the single source of truth and losing cross-repo visibility on the shared backlog.

The `gh` CLI Projects v2 surface already supports server-side filtering via `--query "repo:owner/name"` (confirmed live against Sharper-Flow project #1). ADV's schema and read paths just don't propagate that filter.

## What Changes

1. **Schema** — `GitHubProjectConfigSchema` (`plugin/src/storage/github-project-config.ts`) gains optional `repository_filter: z.string().min(1).optional()`. Value is the bare repo name (e.g. `"Example-Web"`); the owner is taken from `config.owner`. Existing configs without the field continue to parse.
2. **Live read path** — `readLiveProject` (`plugin/src/tools/roadmap.ts:283`) accepts `repository_filter` from config. When set, the `gh project item-list` invocation gains `--query "repo:${owner}/${repository_filter}"`. Server-side filter — the CLI returns only matching items. No client-side filter step needed. Existing `fetchClosedIssueNumbers` + `filterOpenItemsOnly` operate on the already-filtered set without modification.
3. **File read path** — `adv_roadmap source: "file"` reads a pre-filtered snapshot written by `/adv-triage`. No filter logic at read time.
4. **Triage reader** — `/adv-triage` Phase 1 (`gh project item-list <N> --owner <owner> --format json --limit 500`) gains the same `--query "repo:..."` arg when `repository_filter` is set. The Phase 1 cached `project_items` map then contains only filtered items, and Phase 4 mutations + Phase 5 snapshot write naturally inherit the filter without per-phase changes.
5. **Triage bootstrap** — `/adv-triage --execute` Phase 0 parses `git remote get-url origin` (SSH + HTTPS forms, strip `.git` suffix), extracts owner/name, and:
   - If current owner matches the resolved project owner AND the project is not the per-repo `ADV: <name>` board (heuristic: title does not match), set `repository_filter: "<repo-name>"` on first-run config write.
   - If the project IS the per-repo `ADV: <name>` board, omit the filter (preserves existing single-repo deployments).
6. **Snapshot header** — Snapshot JSON gains optional `repository_filter` at top level so `adv_roadmap source: "file"` consumers can see what filter the snapshot was written with. Additive: older snapshots without the field still parse.
7. **Docs** — Linkage config spec/skill documents `repository_filter` semantics, the bare-name convention, server-side query mechanism, and bootstrap auto-detect rules.
8. **Tests** — Schema test: filter present, absent (backcompat), empty (rejected). Roadmap test: live-mode passes `--query` arg to `gh` invocation (test by spy/mock on `execFileP`), file-mode honors snapshot header. Triage bootstrap unit (extracted helper for git-remote parsing, testable independent of `bash` invocation).

## Success Criteria

1. `GitHubProjectConfigSchema` parses configs with `repository_filter: "Example-Web"` and without (backwards compatible — same shape as today).
2. `adv_roadmap source: "live"` with filter set invokes `gh` with `--query "repo:${owner}/${filter}"` and returns only matching items.
3. `adv_roadmap source: "file"` reads filtered snapshot written by `/adv-triage`.
4. `/adv-triage --execute` auto-writes `repository_filter` on first run when current repo's owner matches project owner and the project is not a per-repo `ADV: <name>` board.
5. Existing FE/BE deployments without the filter behave identically to today.
6. `pnpm run check && pnpm test` pass.
7. Linkage spec/skill updated.

## Acceptance Criteria

- FE ADV pointing at Project #1 (Sharper-Flow shared) with `repository_filter: "Example-Web"` → `adv_roadmap` output contains only FE items, zero BE items.
- BE ADV pointing at Project #1 with `repository_filter: "ExampleProduct"` → only BE items.
- Removing the filter from a config restores the all-items behavior.
- A FE deployment that never sets the filter (current state) sees no behavior change.
- New schema test cases cover: filter present, filter absent (backcompat), filter empty (rejected).
- Triage Phase 1 cached `project_items` map respects the filter (Phase 4 mutations operate only on filtered set — no cross-repo writes).
- The 500-item `--limit` cap continues to apply, but only against the FILTERED set (per-repo, not whole project) — confirmed reasonable: Sharper-Flow project #1 has 123 items total, 68 in ExampleProduct.

## Scope

### In Scope

- Schema field on `GitHubProjectConfigSchema` (`plugin/src/storage/github-project-config.ts`).
- `readLiveProject` adds `--query` arg when filter is set (`plugin/src/tools/roadmap.ts`).
- `/adv-triage` Phase 1 adds same `--query` arg; Phase 4 + Phase 5 inherit filtered cache.
- `/adv-triage --execute` Phase 0 first-run bootstrap auto-detect from `git remote get-url origin`.
- Snapshot JSON gains optional `repository_filter` top-level field.
- Schema tests (`github-project-config.test.ts`) covering filter on/off/empty.
- Roadmap tests (`roadmap.test.ts`) covering live-mode `--query` arg presence/absence and file-mode pre-filtered snapshot.
- Extracted git-remote URL parser helper + unit tests.
- Linkage config spec/skill update for the new field.

### Out of Scope

- One-time data migration of existing FE/BE configs from per-repo boards (`#6` etc.) to the shared board (`#1`). Manual op after ship.
- Archiving the legacy ADV-specific project boards (`#6` etc.).
- Multi-repo union filter (e.g. `repository_filter: ["A", "B"]`).
- Owner-different-from-project filter (e.g. user-owned project filtering org repos). Out of scope until a real use case appears.
- Public-facing `/roadmap` page in `example-web` (separate code path, uses `ROADMAP_GITHUB_TOKEN`, not ADV).
- Backporting filter logic to legacy `project_metadata['github_project']` fallback path.
- Implicit "default to current repo" filter when unset.
- Client-side filter on `item.content.repository` (research showed server-side `--query` is the LBP path).

## Affected Code

- `plugin/src/storage/github-project-config.ts` — schema field
- `plugin/src/storage/github-project-config.test.ts` — new schema tests
- `plugin/src/tools/roadmap.ts` — `readLiveProject` `--query` arg; snapshot type gains optional `repository_filter` field
- `plugin/src/tools/roadmap.test.ts` — live-mode `--query` presence test, file-mode header round-trip test
- `plugin/src/utils/` — new `parseGitRemoteUrl` helper + tests (SSH + HTTPS + `.git`-suffix handling)
- `.opencode/command/adv-triage.md` — Phase 0 bootstrap auto-detect, Phase 1 reader passes `--query`, Phase 5 snapshot includes filter in header
- `.adv/specs/` — linkage capability requirement update (extend `rq-issueChangeLinkage03` or add a new sibling requirement)
- Linkage skill (if exists)

## Related Repositories

None directly modified. Downstream operators (Example-Web and ExampleProduct ADV deployments) will re-bootstrap configs after this ships — that re-bootstrap is OUT OF SCOPE for this change (manual op).

## Constraints

- Backwards compatible: existing configs without `repository_filter` MUST behave identically (no implicit "default to current repo" filter).
- Filter is single-repo only (`z.string()`, not `z.array(z.string())`).
- Filter value semantics: BARE repo name (e.g. `"Example-Web"`); owner inherited from `config.owner`. Avoids ambiguity around cross-owner filtering and stays aligned with user-facing config legibility.
- Legacy `project_metadata['github_project']` fallback path is read-only and IGNORES the filter.
- Bootstrap auto-detect MUST NOT overwrite an existing filter on re-bootstrap. First-run only.
- Snapshot file format change: MUST be additive; old snapshots without the field continue to parse.

## Impact

- Multi-repo orgs gain the LBP setup: one shared GH Project as planning source of truth + per-repo filtered ADV views.
- Eliminates the per-repo-board fragmentation hack.
- One-time manual migration after ship: FE/BE deployments re-run `/adv-triage --execute` pointing at the shared project (out of scope here).
- Performance: server-side filter is strictly faster than client-side — fewer items over the wire, fewer parsed.
- No runtime cost beyond the existing `gh` invocation.

## Context

- GH Projects v2 auto-populates `Repository` field on issue/PR add. No manual tagging.
- The shared-project pattern is the GitHub-recommended setup for org-wide planning; per-repo boards are an ADV workaround for the missing filter capability.
- `gh project item-list --query` accepts GitHub Projects filter syntax including `repo:owner/name`. Confirmed live (see Research Validation).

## Research Validation

Phase 1b knowledge gaps probed during research. Updated dispositions:

| Gap | Status | Disposition |
|-----|--------|-------------|
| **D1: GraphQL field path** | RESOLVED | `gh project item-list --format json` returns each item with `content.repository` as STRING in `owner/name` short form (e.g. `"Sharper-Flow/Example-Web"`) and a top-level `repository` URL. Verified live against Sharper-Flow Project #1. Original proposal's `item.content.repository.name` was wrong — `content.repository` is not an object. |
| **D2: `readLiveProject` location + parser** | RESOLVED | `plugin/src/tools/roadmap.ts:283`. Iterates `parsed.items`, dispatches by `item.aDV Type`. Filter applies BEFORE this loop by adding `--query` to the `gh` args. `LiveProjectItem` interface at line 201 already has `content.repository?: string`. |
| **D3: Pagination behavior** | RESOLVED → DOWNGRADED | Original concern (`--limit 500` cap + client-side filter under-counts on big shared projects) is moot when filter is server-side. `--query` filters BEFORE the limit applies. Sharper-Flow project #1: 123 total items, 68 ExampleProduct — well under 500. |
| **D4: ROADMAP.md / snapshot visibility** | DECIDED | Snapshot JSON gains optional top-level `repository_filter` for transparency. ROADMAP.md format unchanged. |
| **D5: Skill/spec locations** | DECIDED | Extend `rq-issueChangeLinkage03` (canonical github-project-config requirement) with the new field. No new skill needed; existing linkage docs are sufficient surface. |
| **D6: Bootstrap edge cases** | DECIDED | Extract `parseGitRemoteUrl(url): {owner, name} \| null` helper. Handle `git@github.com:Owner/Repo.git`, `https://github.com/Owner/Repo.git`, and trailing `.git` strip. Skip auto-set when remote owner ≠ project owner. Skip auto-set when project title looks like `ADV: <name>` (per-repo board heuristic). |

### Pivot from original proposal

The original problem statement framed this as a CLIENT-SIDE filter on `item.content.repository.name`. Research showed:

1. `content.repository` is a string, not an object — the field path was wrong.
2. `gh project item-list --query "repo:owner/name"` is supported server-side (confirmed live).

Switching to server-side filter:

- **Simpler:** No client-side filter step in `readLiveProject`. One extra `--query` arg.
- **Faster:** Fewer items over the wire.
- **Correct under pagination:** The 500-item cap applies to the FILTERED set, not the whole project.
- **Triage symmetry:** Same `--query` arg added to Phase 1; downstream phases inherit the filter via the cached `project_items` map (per `rq-cacheRefresh01` discipline).

User AC text refers to `item.content.repository.name === repository_filter` — this is preserved in spirit (filter scopes the read to one repo) but the mechanism is server-side. Acceptance criteria above updated to reflect "returns only matching items" without binding to the specific field-path mechanism.

### Architecture health

- Existing pattern: pure data-fetch in `readLiveProject` + downstream pure transforms (`filterOpenItemsOnly`, type-dispatch loop). Layered cleanly.
- Reference pattern: server-side filter at the data-fetch boundary. Matches what this proposal adds.
- Classification: **SOUND**. Change extends existing patterns; no architectural correction required.

### Sources

- Live probe: `gh project item-list 1 --owner Sharper-Flow --format json --limit 2 --query "repo:Sharper-Flow/ExampleProduct"` → 68 items (ExampleProduct-only) vs 123 unfiltered.
- `gh project item-list --help`: documents `--query expression` flag using GitHub Projects filter syntax, referencing `docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects`.
- `plugin/src/tools/roadmap.ts:201-220, 283-399`: existing `LiveProjectItem` shape and `readLiveProject` impl.

## Discovery Agenda

All six prior unknowns resolved during this research pass. Remaining items for `/adv-discover` (lighter pass than originally scoped):

1. Confirm `rq-issueChangeLinkage03` is the right requirement to extend (spec inspection).
2. Confirm whether any existing `parseGitRemoteUrl` helper already exists in the codebase (avoid duplication).
3. Decide naming for the snapshot header field: `repository_filter` (matches config) vs `filter.repository` (forward-extensible).
4. Confirm `/adv-triage` Phase 0 bootstrap order — where the auto-detect step fits relative to existing project-create/owner-resolve logic.