## Agreement

### Objectives
1. Add in-repo archive support — write archive bundles within the repository for git-tracking
2. Add agent mesh protocol — GH CLI adapter, mesh issue creation, inbox scanning
3. Extend RelatedRepoSchema with trusted and gh_repo fields for mesh configuration

### Acceptance Criteria
1. **rq-inRepoArchive01**: `createInRepoArchive()` writes identical bundle to in-repo path; failure is warning-only
2. **rq-agentMesh01**: `createMeshIssue()` creates GH issues with YAML frontmatter and adv-mesh labels
3. **rq-meshInbox01**: `adv_mesh_scan` tool scans trusted repos for mesh issues with TTL cache
4. **rq-ghCliAuth01**: `execGh` provides argv-based GH CLI adapter with graceful degradation
5. **rq-issueTrackerAdapter01**: `mesh-issues.ts` provides payload builder, frontmatter parser, and label management

### User Decisions
- jc-m3sh01: scope_boundary — Mesh creation during archive only for trusted repos
- jc-m3sh02: extensibility — GH CLI adapter modeled on runGit pattern for consistency