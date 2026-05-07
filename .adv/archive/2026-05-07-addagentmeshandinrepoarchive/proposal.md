## Discovery Findings

### Current State (Code Evidence)

**Archive write path:**
- `archiveChange()` (archive.ts:782-4841) writes to external `paths.archive` only — configurable via `archive_dir` in `project.json`, defaults to `.adv/archive/`
- `createArchive()` (archive.ts:5170-7395) writes `change.json`, `ARCHIVE_SUMMARY.md`, `wisdom.json`, and copies sibling files (proposal.md, problem-statement.md) to the external archive bundle
- `ArchiveContext.paths` has `archive: string` but NO in-repo path — confirmed gap
- Phase 9 Step 1 stages `.adv/archive/` but `.gitignore` line 58 blocks it: `.adv/archive/` — the staging is a no-op for git tracking
- `atomicWriteFile` (utils/fs.ts:27-60) is the standard write primitive — temp+rename, PID-based

**Cross-project schema:**
- `CrossProjectLinkSchema` (types.ts:1044-1058) — target_path, target_project_id, changeId, relationship, linked_at
- `ExternalDependencySchema` (types.ts:1073-1091) — advisory-only, non-blocking by design (advisory: z.literal(true))
- `CrossProjectOriginSchema` (types.ts:885-899) — source_project, source_path, source_change_id, linked_at
- `RelatedRepoSchema` (types.ts:1201-1208) — id, path, role (no trusted_sources, no gh configuration)
- `ProjectConfigSchema` (types.ts:1331-1347) — related_repos[] but no trusted_sources[] or cross_project section

**Issue tracking:**
- `adv_change_update_issues` (change.ts:1947-1997) — URL-only stub, stores `github_issues: string[]` on change
- No `gh` CLI usage anywhere in plugin — entirely greenfield
- No `integrations/` directory exists yet
- `applyIssueUpdates` (change.ts:137-171) — simple add/remove on URL array, no API calls

**Auth surface:**
- `runGit` (checkpoint.ts:56-95) — execFile pattern with GIT_TERMINAL_PROMPT=0, timeout, maxBuffer — reusable pattern for `gh` subprocess
- `gh auth status` confirmed working locally (gh 2.92.0, JRedeker account)
- No token management in ADV codebase — `gh` CLI is the trust boundary

### Conflict Scan
- `makeAdvTaskEvidenceFallback` (draft, hot) — no overlapping files; orthogonal to this change
- `makeAdvContextEmissionSingle` (draft, 19/19 tasks done) — no overlapping files; orthogonal
- No archived changes conflict on advance-workflow or advance-delivery deltas
- Agenda item `ag-7f9d4c6a` (adv_delta_add tool) — complementary; this change should use manual delta spec for now
- Validation passed (17 warnings all pre-prep: NO_TASKS, NO_DELTAS, PROPOSAL_TASK_DRIFT — expected)

### Edge Cases

**E1: `.gitignore` blocks in-repo archive**
- `.adv/archive/` is gitignored → Phase 9 staging is cosmetic
- Fix: either un-gitignore the specific bundle format or use a different path (e.g., `.adv/archive-bundles/` tracked, `.adv/archive/` stays gitignored for runtime)
- Edge: what if user has custom `archive_dir` pointing outside `.adv/`?

**E2: `gh` CLI not installed or not authenticated**
- Archive Phase 5.5 conformance check doesn't involve gh — but mesh creation does
- Agent mesh should degrade gracefully: detect `gh` at init, skip mesh features if unavailable
- Edge: `gh` installed but auth expired mid-session

**E3: Cross-project write to target without ADV**
- Target repo may not have ADV initialized — no `project.json`, no external state
- Proposal says "create follow-up change in target" but that requires ADV state
- Need: detection + fallback (plain GH issue only, no ADV metadata)

**E4: Concurrent archive from two worktrees**
- Two changes in same project both hit archive simultaneously
- Temporal serializes state writes, but git filesystem ops (in-repo write) could race
- Mitigation: atomic writes + file-lock per archive bundle

**E5: GH issue body size limits**
- Markdown payload for complex changes could exceed GH issue body limits (~65K chars)
- Need: payload truncation strategy (link to archive bundle instead of full dump)

**E6: Inbox scan rate limits**
- `gh api` calls count against rate limit (5000/hr for authenticated)
- With multiple trusted sources, polling inbox every session could exhaust limits
- Need: configurable TTL / on-demand refresh

### Open Design Questions

**DQ1: In-repo archive path strategy**
- Trust model: agent-only (path decision is technical)
- Blast radius: affects git-blame traceability, gitignore, Phase 9
- Options: (a) un-gitignore `.adv/archive/` bundles selectively, (b) use new `.adv/archive-bundles/` tracked path, (c) write to `docs/archive/`
- Recommendation: option (a) with bundle-specific gitignore pattern

**DQ2: GH issue payload format**
- Trust model: agent-only (format is technical)
- Blast radius: affects mesh consumers, parsing stability
- Options: (a) full proposal+tasks in issue body, (b) summary + link to archive bundle, (c) structured YAML frontmatter in body
- Recommendation: (c) with size-limit fallback to (b)

**DQ3: Mesh inbox scan trigger model**
- Trust model: user-facing (affects session startup behavior)
- Blast radius: affects latency, rate limits, user experience
- Options: (a) scan on every `/adv-status`, (b) scan on explicit command, (c) scan on session start with TTL cache
- This is a user-facing outcome question — ask user

**DQ4: Target-without-ADV fallback behavior**
- Trust model: user-facing (affects what happens when mesh targets non-ADV repo)
- Blast radius: affects cross-project reliability expectations
- Options: (a) refuse + error, (b) create plain GH issue with manual metadata, (c) silently skip ADV metadata
- This is a user-facing behavior question — ask user

**DQ5: `trusted_sources[]` vs expanding `related_repos[]`**
- Trust model: agent-only (schema design)
- Blast radius: affects project.json schema stability
- Options: (a) new `trusted_sources[]` array on ProjectConfigSchema, (b) extend RelatedRepoSchema with trust fields
- Recommendation: (b) — extend existing schema, avoid two parallel repo-lists

### Draft Spec Deltas

**advance-workflow delta (add requirements):**

`rq-inRepoArchive01` — In-repo archive bundle written atomically at archive time
- Given: a change passes archive validation and Phase 5.5 conformance
- When: adv_change_archive executes createArchive
- Then: both external bundle (paths.archive) AND in-repo bundle (.adv/archive/{date}-{id}/) are written; in-repo bundle is git-tracked

`rq-agentMesh01` — Agent mesh creates GH issue for cross-project changes
- Given: a change has cross_project links to a trusted source
- When: the change is archived or a cross-project task is created
- Then: a GH issue is created in the target repo via `gh` CLI with structured payload

`rq-meshInbox01` — Inbox scan discovers and imports cross-project issues
- Given: trusted_sources[] is configured in project.json
- When: inbox scan is triggered
- Then: GH issues from trusted sources matching ADV mesh labels are discovered and surfaced

`rq-ghCliAuth01` — gh CLI auth detection and graceful degradation
- Given: ADV is initializing mesh features
- When: gh CLI is not available or not authenticated
- Then: mesh features degrade gracefully with clear diagnostics; non-mesh features unaffected

**advance-delivery delta (add requirements):**

`rq-issueTrackerAdapter01` — IssueTracker adapter interface
- Given: an issue tracking operation is needed
- When: the adapter is invoked
- Then: the operation routes through a typed adapter interface; GitHub is the v1 implementation

### Related Pattern Scan
- `runGit` pattern (checkpoint.ts:56-95) — reusable subprocess pattern for `gh` CLI adapter
- `atomicWriteFile` pattern (utils/fs.ts:27-60) — reusable for in-repo archive bundle
- `createCrossProjectFollowUp` (change.ts:304-420) — cross-project mutation pattern to extend
- `applyIssueUpdates` (change.ts:137-171) — simple URL-array model to supersede with adapter
- No similar patterns for external API integration exist in the codebase

### LBP Check
The direction aligns with LBP:
- **`gh` CLI subprocess** is the canonical GitHub API access pattern (not OAuth, not REST client library) — matches existing `execGit` pattern in codebase
- **In-repo archive** follows the git-as-source-of-truth principle — archive bundles in `.adv/` are the natural home for git-tracked durable intent
- **IssueTracker adapter** follows the adapter/interface pattern recommended for external integrations
- **Trusted sources** follows established patterns from CI/CD (e.g., trusted orgs in GitHub Actions)
- No external alternatives needed — this is a greenfield integration using platform-native tools

### Skills Considered
- adv-worktree: keywords don't match (worktree/git-worktree vs archive/mesh)
- adv-arch-detection: keywords don't match (architecture/layer vs issues/coordination)
- All other skills: tangential at best, no direct match for "GitHub Issues integration" or "cross-project agent mesh"
- No skill creation triggered: the domain (GH Issues mesh) is specific to this change, not broadly reusable enough for a skill

### Judgment Calls

```json
[
  {
    "id": "jc-m3sh01",
    "category": "scope_boundary",
    "question": "Should mesh issue creation be mandatory or opt-out when trusted repos are configured in related_repos?",
    "agent_recommendation": "Mandatory with per-archive opt-out flag",
    "rationale": "If mesh creation is opt-in, users may forget to enable it and lose the cross-project audit trail. If mandatory with no override, it removes user agency for one-off archives. A per-archive flag preserves agency while defaulting to the useful behavior.",
    "options": [
      { "label": "Always create (mandatory, no override)", "description": "Every archive targeting a trusted repo creates a mesh issue. No exceptions." },
      { "label": "Default on, per-archive opt-out (Recommended)", "description": "Creates by default but allows skipping per archive via flag." },
      { "label": "Opt-in per archive", "description": "Only creates when explicitly requested. User must remember each time." }
    ]
  },
  {
    "id": "jc-m3sh02",
    "category": "extensibility",
    "question": "Should mesh inbox scan results persist across sessions or stay session-scoped (in-memory TTL cache)?",
    "agent_recommendation": "Session-scoped in-memory TTL cache",
    "rationale": "Persistent scan results would require disk storage and staleness management. Session-scoped is simpler and matches the user's stated preference for on-demand scanning. When persistence is needed later, the cache interface can be swapped without changing the scan logic.",
    "options": [
      { "label": "Session-scoped TTL cache (Recommended)", "description": "In-memory cache, resets on session restart. Simple, no disk I/O." },
      { "label": "Persist to external state", "description": "Write scan results to ADV external state. Survives restarts but adds staleness management." },
      { "label": "No cache (always fresh)", "description": "Hit GH API every time. Always current but higher rate-limit consumption." }
    ]
  }
]
```
