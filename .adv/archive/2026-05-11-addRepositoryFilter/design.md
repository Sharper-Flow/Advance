# Design — addRepositoryFilter

## Architecture Overview

Repository scoping for ADV's GitHub Project linkage is a single-field schema extension propagated to one server-side filter argument at every read boundary. No new modules, no new data flow, no new dependencies.

The change touches:

- 1 schema (Zod) — adds optional `repository_filter` field
- 1 plugin tool (`readLiveProject`) — adds `--query` arg when filter is set
- 1 new pure utility (`parseGitRemoteUrl`) — single-purpose URL parser for bootstrap
- 1 command-doc workflow (`/adv-triage`) — Phase 0 auto-detect + Phase 1 reader filter + Phase 5 writer-side fresh-read filter. Phase 4 inherits via the existing Phase 1 cached `project_items` map (the project's standing protocol). **The Phase 5 fresh read is a distinct read boundary that MUST get its own `--query` arg** — it deliberately does not reuse Phase 1 cache because Phase 4 mutations may have changed field values (see `adv-triage.md:432`).
- 1 snapshot type — adds optional `repository_filter` mirror field

Data flow (with filter set, `repository_filter: "Example-Web"`, owner: `Sharper-Flow`):

```
git remote get-url origin → parseGitRemoteUrl() → { owner, name }
                                                       │
                                                       ▼
                                    .adv/github-project.json
                                    { owner: "Sharper-Flow",
                                      project_number: 1,
                                      repository_filter: "Example-Web", ... }
                                                       │
       ┌───────────────────────────────────────────────┼───────────────────────────────────────────────┐
       ▼                                               ▼                                               ▼
readGitHubProjectConfig                       /adv-triage Phase 1                          /adv-triage Phase 5
       │                                               │                                               │
       ▼                                               ▼                                               ▼
readLiveProject(metadata + filter)         gh project item-list 1 \                   gh project item-list 1 \
       │                                       --owner Sharper-Flow \                   --owner Sharper-Flow \
       ▼                                       --query "repo:Sharper-Flow/Example-Web"  --query "repo:Sharper-Flow/Example-Web"
gh project item-list 1 \                              │                                               │
    --owner Sharper-Flow \                            ▼                                               ▼
    --query "repo:Sharper-Flow/Example-Web"   cached project_items (filtered)            fresh items (filtered)
       │                                              │                                               │
       ▼                                              ▼                                               ▼
LiveProjectItem[] (already filtered)            Phase 4 scoring                       .adv/roadmap-snapshot.json
       │                                                                                  + ROADMAP.md
       ▼                                                                                  { repository_filter: ... }
filterOpenItemsOnly (unchanged)
       │
       ▼
RoadmapSnapshot
```

## Key Decisions

### D1 — Server-side filter via `gh --query "repo:owner/name"`

**Decision:** Every `gh project item-list` invocation gains `--query "repo:${config.owner}/${config.repository_filter}"` when `repository_filter` is set. Three call sites: `readLiveProject` (plugin), `/adv-triage` Phase 1 (command doc), `/adv-triage` Phase 5 (command doc).

**Rationale (LBP):** Probe-confirmed live (Sharper-Flow Project #1: 123 items unfiltered → 68 ExampleProduct filtered). gh CLI documents the `--query` flag and GitHub Projects filter syntax explicitly supports `repo:OWNER/REPO`. Server-side beats client-side on:

- Simplicity — zero new loop
- Pagination correctness — filter applies BEFORE the 500-item cap
- Performance — less data over wire
- Triage symmetry — Phase 4 inherits via Phase 1 cache; Phase 5 (fresh read) gets the same `--query` arg directly

DONT1 in agreement. Alternative (client-side post-fetch filter) rejected during research: `content.repository` is a string, not an object, and post-fetch filtering loses pagination correctness.

### D2 — Bare-name semantics, owner inherited from config

**Decision:** `repository_filter` value is the bare repo name (e.g. `"Example-Web"`). The gh query string is constructed as `${config.owner}/${config.repository_filter}`.

**Rationale:** User-facing config legibility ("filter to Example-Web" > "filter to Sharper-Flow/Example-Web" when owner is already in config). Aligns with `config.owner` as single source of truth for the org/user namespace. C2 in agreement.

**Alternative considered:** Store full `owner/name` in the filter. Rejected — duplicates `config.owner` and creates ambiguity when the two disagree.

### D3 — First-run-only bootstrap via remote owner + title heuristic

**Decision:** `/adv-triage --execute` Phase 0 parses `git remote get-url origin` via new `parseGitRemoteUrl` helper. Writes `repository_filter: "${repoName}"` only when:

1. Resolved owner matches `config.owner`
2. Project title does not match `^ADV: ` regex (the per-repo board convention)
3. Existing config has no `repository_filter` field

**Rationale:** Q3 in agreement, option (a) chosen — reduces friction for the canonical multi-repo case while preserving existing single-repo deployments. Title heuristic is the only signal available without external metadata.

**Escape hatch:** User can edit `.adv/github-project.json` manually to override or clear the filter.

### D4 — Snapshot header field at top level

**Decision:** `RoadmapSnapshot` type gains optional `repository_filter?: string` at the top level alongside existing `version`, `generated_at`, `project`, `counts`.

**Rationale:** Q1 in agreement, option (a) chosen — minimal change, mirrors config field naming, no anticipated need for nested filter namespace.

### D5 — gh CLI version requirement documented, not probed

**Decision:** Note in linkage docs that `--query` requires `github.com` host or GHES 3.20+ (gh CLI documents this). No runtime probe in `readLiveProject` or `/adv-triage`.

**Rationale:** Q2 in agreement, option (a) chosen. ADV's user base is github.com; a runtime version probe is over-engineering. Existing `gh project item-list failed: ${error.message}` surface already reports failure cleanly.

### D6 — No formal spec capability; inline `rq-*` anchors

**Decision:** No new `.adv/specs/github-linkage/` capability. Documentation lives as `<!-- rq-repoFilter01 -->` HTML comments in modified files:

- `plugin/src/storage/github-project-config.ts` — schema field
- `plugin/src/tools/roadmap.ts` — live-read filter
- `.opencode/command/adv-triage.md` — Phase 0 + Phase 1 + Phase 5 docs

**Rationale:** C4 + DONT6 in agreement. Matches existing pattern (`rq-issueChangeLinkage*`). `.adv/specs/` has 11 capabilities, none own GH linkage; creating a capability for one field would be heavyweight.

### D7 — Extract `parseGitRemoteUrl` as standalone utility + tests

**Decision:** New file `plugin/src/utils/git-remote.ts` exports `parseGitRemoteUrl(url: string): { owner: string; name: string } | null`. Handles SSH (`git@github.com:Owner/Repo.git`), HTTPS (`https://github.com/Owner/Repo.git`), and trailing `.git` strip. Returns `null` on unparseable input.

**Rationale:** Pure function, trivially unit-testable, reusable. Consumed by `/adv-triage` Phase 0 documentation. Available for internal consumers (e.g. future archive-flow refactor).

## Implementation Strategy

### Sequencing

1. **Foundation — `parseGitRemoteUrl` utility**
   - RED: test SSH form, HTTPS form, `.git` suffix, malformed input → null
   - GREEN: implement in `plugin/src/utils/git-remote.ts`
   - Files: 1 new + 1 new test

2. **Schema — `GitHubProjectConfigSchema` extension**
   - RED: parses with `repository_filter`, parses without (backcompat), rejects empty string
   - GREEN: add `repository_filter: z.string().min(1).optional()`
   - Files: 1 modified + 1 modified test

3. **Live read — `readLiveProject` filter plumb**
   - RED: spy on `execFileP`; assert `--query "repo:${owner}/${filter}"` when filter set; assert no `--query` when unset
   - GREEN: update `readLiveProject` signature + arg construction
   - Files: 1 modified + 1 modified test

4. **Snapshot type — optional `repository_filter` field**
   - RED: snapshot parses with and without the field; serializer round-trips it
   - GREEN: extend type + serialization path
   - Files: same `roadmap.ts` + test as step 3

5. **Live-mode integration — config → filter → query**
   - RED: end-to-end through `adv_roadmap source: "live"`: config with filter → `gh` args include `--query`; config without → no `--query`
   - GREEN: update `adv_roadmap` execute path (`roadmap.ts:564-590`) to read `config.repository_filter` and pass to `readLiveProject`
   - Files: covered by step 3

6. **Triage command doc — Phase 0 + Phase 1 + Phase 5 updates**
   - `.opencode/command/adv-triage.md`:
     - **Phase 0 (line ~41):** add bootstrap auto-detect (parse remote → owner+title check → first-run write)
     - **Phase 1 (line 96):** add `--query "repo:${config.owner}/${config.repository_filter}"` to `gh project item-list` when filter set in config
     - **Phase 5 (line 432):** add the SAME `--query` arg to the fresh `gh project item-list` read used to generate the snapshot + ROADMAP.md. This is a distinct read boundary — Phase 5 explicitly does not reuse Phase 1 cache (Phase 4 mutations may have changed field values). Without this, the snapshot writer would emit cross-repo items and break AC3.
     - Snapshot writer in Phase 5 also writes `repository_filter` (when set) to the snapshot JSON header (matches D4).
     - Inline `rq-repoFilter01` anchors at each touchpoint.
   - No plugin source impact for this step (Phase 4 inherits the filter via the existing Phase 1 cached `project_items` map per the standing protocol documented at adv-triage.md:335).
   - Files: 1 modified
   - Verification: command-doc inspection + manual triage rerun against a shared project; assert generated snapshot contains only filtered items

7. **Verification gate**
   - `pnpm run check && pnpm test` pass
   - Spot check: `adv_roadmap source: "live"` against Sharper-Flow Project #1 with `repository_filter: "ExampleProduct"` → 68 items (matches probe baseline)

### Order rationale

Steps 1–4 are independent and could parallelize. Sequenced as written, they form a clean TDD chain (utility → schema → read path → snapshot type). Step 5 depends on step 3. Step 6 is command-doc only and depends conceptually on step 5 (documented behavior matches implementation). Step 7 is the final verification gate.

## LBP Analysis

1. **Server is the source of truth.** GitHub Projects v2 owns the item↔repository relationship. Filtering on the server means ADV stays a thin client; the filter scales with the project's size without any client-side change.

2. **Pagination correctness.** With `--limit 500` and server-side filter, the cap applies AFTER filtering — up to 500 items _in the target repo_. Client-side filter applies AFTER the cap — up to 500 items across the whole shared project, potentially missing matches if the project exceeds 500 total.

3. **The existing extension surface already supports it.** `gh project item-list --query` is the documented escape hatch for Projects v2 filter expressions. Aligns with GitHub's intended customization point; avoids inventing parallel mechanisms.

4. **Backwards compatibility is structural, not heuristic.** Optional Zod field + missing query arg = current behavior. Adding the filter never breaks an existing deployment because the unset case is preserved at every boundary.

5. **Minimal surface.** One schema field, one CLI arg passed at three call sites (one plugin, two command-doc), one helper utility, one command-doc update. No new module, no new dependency, no new data store.

## Affected Components

| Component | File | Change |
|---|---|---|
| Schema | `plugin/src/storage/github-project-config.ts` | Add `repository_filter` optional field |
| Schema test | `plugin/src/storage/github-project-config.test.ts` | 3 new test cases (present / absent / empty) |
| Live reader + snapshot type | `plugin/src/tools/roadmap.ts` (lines 58-71, 201-220, 283-399, 540-590) | Plumb filter into `gh` args; add snapshot field + serialization |
| Live reader test | `plugin/src/tools/roadmap.test.ts` | `--query` presence/absence tests + snapshot round-trip |
| Remote parser | `plugin/src/utils/git-remote.ts` (NEW) | New utility |
| Remote parser test | `plugin/src/utils/git-remote.test.ts` (NEW) | Unit tests (SSH, HTTPS, `.git`, invalid) |
| Triage command doc | `.opencode/command/adv-triage.md` | Phase 0 bootstrap + Phase 1 `--query` + **Phase 5 `--query` on fresh read** + snapshot header field |

## Risks / Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `gh project item-list --query` syntax changes upstream | Low | Medium | Doc comment with link to gh docs; existing failure surface reports gh error verbatim |
| Title heuristic for "shared vs per-repo" misclassifies edge cases (user-renamed `ADV: foo` project) | Medium | Low | First-run only + manual `.adv/github-project.json` escape hatch |
| Old GHES (<3.20) lacks `--query` | Low | High (for affected installs) | Documented requirement; existing error path reports cleanly |
| Shared project >500 items in a single repo bucket | Low | Medium | Cap applies to FILTERED set. If breached, `--limit` bump is a separate follow-up. |
| Bootstrap accidentally writes filter on per-repo board | Low | Low | Title regex `^ADV: ` skip + first-run-only guard |
| `parseGitRemoteUrl` misses an edge URL form | Low | Low | Pure function with explicit-test coverage; null return path documented and surfaced |
| **Phase 5 fresh read forgets `--query` arg** | Low (now-documented) | High (would write unfiltered snapshot, breaks AC3) | Validator caught this gap; step 6 of implementation now explicitly enumerates all three `gh` invocations |

## Validator Result

**Verdict:** CAUTION (one correctness gap caught; design amended).

**Findings:**

| Dim | Level | Summary | Resolution |
|---|---|---|---|
| 1 Correctness | caution | Phase 5 fresh `gh project item-list` read (line 432) is a SEPARATE read boundary that does NOT reuse Phase 1 cache. Without `--query` it would emit unfiltered snapshot → break AC3. | **Resolved in this revision.** D1 now enumerates three call sites; step 6 of Implementation Strategy explicitly covers Phase 5. Risks table adds the regression risk. |
| 1 Correctness | info | Server-side `--query "repo:OWNER/REPO"` validated against `cli.github.com/manual/gh_project_item-list` and GitHub Projects filter syntax docs. Syntactically and semantically correct. | No change needed. |
| 2 Simplicity | info | `parseGitRemoteUrl` extraction + snapshot field are justified; no materially simpler core mechanism exists. | No change needed. |
| 3 Spec compliance | info | No spec conflicts across 11 capabilities. No spec owns GH project linkage. Inline rq-anchor pattern matches existing practice. | No change needed. |
| 4 Alternatives | caution | GraphQL alternative correctly rejected; Phase 5 read boundary was the missed alternative (completeness gap, now fixed). | Resolved by D1 expansion. |
| 4 Alternatives | info | Promoting inline rq-anchors to a formal `github-linkage` spec capability correctly deferred — out of scope here. | No change needed. |

**`rq-cacheRefresh01` misattribution corrected:** the prior revision cited it as justification for Phase 4+5 cache inheritance. It is a Temporal cache-invalidation pattern (`plugin/src/tools/_adapters.ts:156`) — unrelated to triage's project-items map caching. Removed from this revision; replaced with neutral description "the standing protocol documented at adv-triage.md:335".

**Final assessment:** CAUTION → resolved in design. Architecturally sound, single correctness gap caught and amended. Spec compliance clean. Simplicity preserved. Alternatives evaluated.