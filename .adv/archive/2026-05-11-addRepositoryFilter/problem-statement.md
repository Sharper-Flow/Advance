## Problem

ADV's `GitHubProjectConfigSchema` (`plugin/src/storage/github-project-config.ts`) assumes a 1:1 mapping between an ADV project and a GitHub Project v2 board. Recorded fields are `owner`, `project_number`, `project_id`, `title`, custom-field IDs, and option maps — none of which can express "read items from this project, but only those whose source repository is X."

This breaks organizations that share a single GitHub Project across multiple repos. The canonical Sharper-Flow setup uses Project #1 "Sharper-Flow" as the org-wide backlog, with both PokeEdge-Web and PokeEdge issues auto-tagged via GitHub's built-in `Repository` field. When per-repo ADV deployments point at the shared project, each repo's roadmap snapshot pulls in items from the other repo — frontend ADV sees backend bugs, backend ADV sees frontend features.

The current workaround creates dedicated ADV-only project boards per repo (FE → #6, BE → distinct), which fragments the actual single source of truth and loses cross-repo visibility on the shared backlog. The shared project is the team's planning surface; ADV per-repo views must be a filter on it, not a replacement.

## Success Criteria

1. `GitHubProjectConfigSchema` accepts optional `repository_filter: string` (min length 1). Unset configs continue to parse identically to today.
2. `adv_roadmap source: "live"` with `repository_filter` set returns only items whose `content.repository.name` matches the filter; draft items (no repository) are excluded.
3. `adv_roadmap source: "file"` reads a snapshot pre-filtered by `/adv-triage`; same item set as live mode for the same project + filter.
4. `/adv-triage --execute` Phase 0 auto-writes `repository_filter` on first-run when the current `git remote get-url origin` owner matches the resolved project owner AND the project is not the per-repo `ADV: <name>` board.
5. Existing FE/BE deployments without the filter behave identically to today (no implicit defaulting).
6. `/adv-triage` Phase 1 cached `project_items` map respects the filter so Phase 4 scoring + mutations operate only on filtered items (no cross-repo writes).
7. New schema test cases pass: filter present, filter absent (backcompat), filter empty string (rejected).
8. Linkage spec/skill documents `repository_filter` semantics and bootstrap auto-detect rules.
9. `pnpm run check && pnpm test` pass.

## Acceptance Criteria

- FE ADV pointing at Project #1 (Sharper-Flow shared) with `repository_filter: "PokeEdge-Web"` → `adv_roadmap` output contains only FE items, zero BE items.
- BE ADV pointing at Project #1 with `repository_filter: "PokeEdge"` → only BE items.
- Removing the filter from a config restores the all-items behavior.
- A FE deployment that never sets the filter (current state) sees no behavior change.
- Triage Phase 4 mutations target only filtered items in the project (verified by command-doc inspection + cached-map filter test).

## Scope

### In Scope

- Add optional `repository_filter` field to `GitHubProjectConfigSchema`.
- Apply filter in `adv_roadmap source: "live"` (`plugin/src/tools/roadmap.ts` live branch).
- Apply filter in `/adv-triage` Phase 1 reader, Phase 4 mutation guard, Phase 5 snapshot + ROADMAP.md writer.
- Auto-detect filter in `/adv-triage --execute` Phase 0 from `git remote get-url origin` when owner matches and project is shared.
- Schema and roadmap-tool tests covering filter on/off/empty.
- Update linkage config spec/skill documentation.

### Out of Scope

- One-time data migration of existing FE/BE configs from per-repo boards (`#6` etc.) to the shared board (`#1`). Manual op after this ships.
- Archiving the legacy ADV-specific project boards (`#6` etc.).
- Multi-repo union filter (e.g. `repository_filter: ["A", "B"]`). Explicitly single-repo per linkage; revisit only if a real multi-repo use case emerges.
- Public-facing `/roadmap` page in `pokeedge-web` (separate code path, uses `ROADMAP_GITHUB_TOKEN`, not ADV).
- Backporting filter logic to the legacy `project_metadata['github_project']` fallback path (read-only; legacy data won't have the field; migration forward writes without filter unless explicitly set).
- Implicit "default to current repo" filter when unset. Silent default would break existing deployments that intentionally read all items.