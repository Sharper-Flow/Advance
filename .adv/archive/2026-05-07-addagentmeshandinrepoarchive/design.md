# Design: addAgentMeshAndInRepoArchive

## Architecture Overview

Four subsystems, all additive, no breaking changes:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Archive Pipeline                            │
│                                                                 │
│  archiveChange() ──► createArchive() ──► external bundle        │
│                   └──► createInRepoArchive() ─► .adv/archive/   │
│                        (new, atomic, same format)               │
│                                                                 │
│  Phase 9: git add -f .adv/archive/{bundle}  (gitignore exempt) │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     GH Integration Functions                    │
│                                                                 │
│  execGh(args, cwd) → {stdout, stderr, exitCode}                │
│   (modeled on runGit from checkpoint.ts)                        │
│                                                                 │
│  createMeshIssue(repo, payload) → IssueRef                     │
│  listMeshIssues(repo, labels) → Issue[]                         │
│  getGhIssue(repo, number) → Issue                               │
│                                                                 │
│  gh auth detection → graceful degradation                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Agent Mesh                                  │
│                                                                 │
│  Mesh creation: archive → detect trusted links → GH issue       │
│  Mesh inbox: /adv-discover → scan trusted GH repos → surface    │
│  Mesh scan tool: adv_mesh_scan → on-demand refresh               │
│                                                                 │
│  Payload: YAML frontmatter + markdown body in GH issue          │
│  Labels: adv-mesh, adv-{relationship} on created issues         │
│                                                                 │
│  Boundary:                                                      │
│   ADV-to-ADV targets: cross_project_links + optional mesh issue │
│   Non-ADV targets: mesh issue only (no cross_project_links)     │
│   Mesh issue URLs stored in github_issues[] (existing field)    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Schema Extension                            │
│                                                                 │
│  RelatedRepoSchema:                                             │
│   + trusted: boolean (default false)                            │
│   + gh_repo: string (e.g. "owner/repo")                         │
│                                                                 │
│  ProjectConfigSchema: unchanged except RelatedRepoSchema extend │
└─────────────────────────────────────────────────────────────────┘
```

## Key Decisions

### KD-1: Dual-write at archive time, not during in-flight

**Decision:** `createArchive()` writes to BOTH external and in-repo paths in the same call. External state remains runtime authority. In-repo is durable-intent backup. In-repo failure is warning-only.

**Rationale:** External state is the runtime source of truth (Temporal-enforced). In-repo bundle is git-traceable backup written atomically alongside. No dual-write consistency risk because both writes are independent filesystem operations — if in-repo fails, external still succeeds.

### KD-2: `gh` CLI subprocess via direct `execGh()` function

**Decision:** `execGh(args, cwd)` function modeled on `runGit()` from checkpoint.ts. Uses `execFile("gh", args, ...)` with timeout and structured error output. No abstract adapter interface in v1 — direct functions matching existing codebase convention.

**Rationale:** Matches existing subprocess pattern. `runGit` in checkpoint.ts is a direct function, not an adapter. YAGNI for abstract interface until second backend is needed. Refactoring cost to add adapter later is low.

### KD-3: Extend `RelatedRepoSchema`, not new `trusted_sources[]`

**Decision:** Add `trusted: boolean` and `gh_repo: string` to existing `RelatedRepoSchema`. No new top-level array.

**Rationale:** Single source of truth for repo definitions. Extending existing schema avoids config duplication and migration burden.

### KD-4: YAML frontmatter in GH issue body

**Decision:** GH issue body starts with YAML frontmatter block containing machine-readable metadata, followed by human-readable markdown.

### KD-5: Inbox scan in `/adv-discover` only, on-demand otherwise

**Decision:** `/adv-discover` integrates mesh inbox scan as part of conflict scan (extends existing Phase 1.6). On-demand via `adv_mesh_scan` tool. No background polling.

### KD-6: Target-without-ADV creates plain issue

**Decision:** When target repo lacks ADV initialization, create plain GH issue with mesh payload but skip ADV metadata references. No ADV state mutation on foreign repos.

### KD-7: Mesh/`cross_project_links` boundary

**Decision:** Mesh issues and `cross_project_links` are parallel mechanisms with explicit boundary:
- **ADV-to-ADV targets**: Existing `cross_project_links` (ADV state coordination) + optional mesh issue
- **Non-ADV targets**: Mesh issue only (no `cross_project_links` since no ADV state to link)
- Mesh issue URLs stored in existing `github_issues[]` field on change

**Rationale:** Prevents duplicate tracking. Existing field for issue URLs. Clear boundary between ADV-coordinated and mesh-only targets.

### KD-8: `.gitignore` change — negation pattern

**Decision:** Replace current `.adv/archive/` gitignore line with negation pattern that allows bundle directories. Specific approach: remove blanket `.adv/archive/` ignore, add targeted ignores for non-bundle files only.

**Rationale:** Without this change, AC-1 cannot pass — `git add` silently skips in-repo archive bundles.

## Implementation Strategy

### Phase 1: Foundation (schema + GH integration)
1. Extend `RelatedRepoSchema` with `trusted`, `gh_repo` fields
2. Create `plugin/src/integrations/` directory
3. Implement `execGh()` subprocess function (modeled on `runGit`)
4. Implement `createMeshIssue()`, `listMeshIssues()`, `getGhIssue()` functions
5. Implement `gh` auth detection + graceful degradation
6. Tests for execGh, mesh functions, auth detection

### Phase 2: In-repo archive
7. Add `createInRepoArchive()` function to `archive.ts`
8. Extend `ArchiveContext.paths` with optional `inRepoArchive` path
9. Update `archiveChange()` to call both `createArchive()` and `createInRepoArchive()`
10. Update `.gitignore` — replace blanket ignore with targeted pattern
11. Update `adv_change_archive` tool to pass in-repo path
12. Update Phase 9 staging to use `git add -f` for in-repo bundles
13. Tests for dual-write, gitignore behavior, Phase 9 interaction

### Phase 3: Agent mesh creation
14. Implement mesh payload builder (YAML frontmatter + markdown)
15. Implement mesh issue creation in archive flow (post-bundle, pre-cleanup, as explicit Phase 7.5 step)
16. Wire mesh creation to trusted-source detection from `related_repos`
17. Handle target-without-ADV fallback
18. Store mesh issue URLs in `github_issues[]` on change
19. Tests for payload format, issue creation, fallback

### Phase 4: Agent mesh inbox
20. Implement `adv_mesh_scan` tool (on-demand inbox scan)
21. Integrate mesh scan into `/adv-discover` Phase 1.6 (extend existing conflict scan)
22. Add to Discovery Checklist per rq-disc01
23. Implement TTL cache for scan results (per-session, in-memory)
24. Update `adv_status` to show inbox count
25. Tests for scan, cache, status display

## LBP Analysis

- **`gh` CLI subprocess**: Industry-standard pattern for GitHub automation. Matches existing codebase conventions. No dependency bloat.
- **Direct functions over adapter interface**: Follows existing `runGit` pattern. YAGNI for abstract layer until second backend.
- **YAML frontmatter**: Established convention. Machine-parseable without custom API.
- **Schema extension**: Open/closed principle. Additive, no migration.
- **Dual-write atomic**: Follows `atomicWriteFile` convention. Warning-only failure preserves external authority.

## Affected Components

| Component | Change Type | Files |
|---|---|---|
| `types.ts` | Extend schema | `RelatedRepoSchema` (+2 fields) |
| `archive/archive.ts` | Add function | `createInRepoArchive()`, extend `archiveChange()` |
| `archive/types.ts` | Extend interface | `ArchiveContext.paths` (+inRepoArchive) |
| `integrations/` (new) | New module | `exec-gh.ts`, `mesh-issues.ts`, `gh-auth.ts`, `types.ts` |
| `tools/change.ts` | Add tool | `adv_mesh_scan` |
| `storage/json.ts` | Extend | `getProjectPaths()` to resolve in-repo archive path |
| `.gitignore` | Modify | Replace blanket ignore with targeted pattern |
| `tools/status.ts` | Extend | Add Inbox section |
| `.opencode/command/adv-discover.md` | Extend | Phase 1.6 mesh inbox integration |
| `.opencode/command/adv-archive.md` | Extend | Phase 7.5 mesh creation, Phase 9 git add -f |

## Risks / Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `gh` CLI not available | Low | Auth detection at init; graceful skip with diagnostic |
| GH API rate limits | Medium | TTL cache; discover + on-demand only; respect rate limit headers |
| In-repo write fails | Low | Warning-only; external authority preserved |
| Issue body exceeds 65K | Low | Truncation + link to archive bundle |
| Gitignore exception too broad | Low | Test specific bundle paths; targeted pattern |
| Concurrent archive | Low | Atomic writes; Temporal serializes; file-lock per bundle |
| Format divergence | Medium | Single format constant shared by both write paths |

## Validation Result

**Validator: CAUTION** (3 findings resolved inline)

Resolved findings:
- C1 (.gitignore specificity) → KD-8: explicit negation pattern, not blanket un-ignore
- S1 (adapter YAGNI) → KD-2: direct `execGh()` function, no abstract interface in v1
- C6 (mesh/cross_project_links boundary) → KD-7: explicit parallel mechanism with clear boundary

Remaining info-level findings acknowledged but non-blocking.
