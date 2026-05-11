# Archive: Add repository_filter to GitHubProjectConfig for shared-project scoping

**Change ID:** addRepositoryFilter
**Archived:** 2026-05-11T01:25:43.847Z
**Created:** 2026-05-11T00:11:34.919Z

## Tasks Completed

- ✅ Implement `parseGitRemoteUrl(url: string): {owner: string; name: string} | null` pure utility.
  > Added pure GitHub remote parser with support for SSH scp-like, HTTPS, ssh://, .git suffix normalization, and null on unsupported/ambiguous remotes. Added Vitest coverage.
- ✅ Add `repository_filter: z.string().min(1).optional()` to `GitHubProjectConfigSchema`.
  > Added optional repository_filter to GitHubProjectConfigSchema with min length 1 and schema tests for present, absent, and empty-string rejection.
- ✅ Plumb `repository_filter` through live read path: `readLiveProject` signature, `adv_roadmap` execute, and `RoadmapSnapshot` type.
  > Added buildProjectItemListArgs with server-side repo query, passed repository_filter from config into live read metadata, added optional RoadmapSnapshot.repository_filter, and surfaced it in adv_roadmap output. Added roadmap tests for unfiltered args, filtered args, and file snapshot transparency.
- ✅ Update `/adv-triage` command doc with Phase 0 bootstrap auto-detect, Phase 1 `--query` filter on cached read, and Phase 5 `--query` filter on fresh write-side read.
  > Added Phase 0 repository_filter auto-detect protocol with precondition table, Phase 1 --query annotation on `gh project item-list`, Phase 5 server-side scoping note requiring matching --query on the fresh read, and snapshot schema example showing optional `repository_filter` mirror field. All updates anchored with rq-repoFilter01.
- ✅ Final verification gate: run `pnpm run check && pnpm test` from `plugin/`, then optionally smoke-test live mode.
  > pnpm run check: PASS (typecheck, isolation, lockfile, eslint, prettier). pnpm test: PASS 169 files / 2079 tests / 2 skipped. Live smoke test skipped (out-of-scope for hermetic verify; covered manually during research probe).

## Specs Modified

