# Design — adv_snapshot_health Tool

## Open Question Resolutions

### Q1: Legacy-layout bare repo repair — delete entire repo or only zero-byte objects?

**Resolution: Delete entire bare repo (nuke-and-rebuild).**

Rationale:
- Legacy layout (`{projectID}/` directly as bare repo) is structurally incompatible with modern layout (`{projectID}/{worktreeHash}/`). A legacy bare repo at the project level cannot be upgraded in-place — the parent dir would need to become a container for `{worktreeHash}` subdirs, but it already IS a git bare repo (has HEAD, objects/, refs/).
- Partial cleanup (only zero-byte objects) leaves the bare repo in a degraded state that the next scan will flag again. The operator must then decide what to do with the legacy layout — defeating the purpose of the repair action.
- OpenCode's cleanup loop will recreate the snapshot bare repo on next session start in the correct modern layout. There is no user data at risk — snapshots are derived state, not source of truth.
- Precedent: we nuked the 4.6 GB `548a340e…` legacy bare repo during proposal phase with no ill effects.
- The repair action label is `delete_orphan_bare_repos`. Legacy-layout bare repos are definitionally orphaned (no worktree hash path, likely no matching active worktree). The label fits.

Implementation: `delete_orphan_bare_repos` applies to both orphan modern-layout bare repos AND legacy-layout bare repos. The repair validates orphan status (worktree path gone) before deletion.

### Q2: Global-scope repair — per-project confirmation or batch approval?

**Resolution: Single batch approval with per-project detail in `approvalEvidence`.**

Rationale:
- Matches `adv_change_bulk_close` pattern: one approval call, scoped repairs applied atomically.
- Per-project confirmation would require N sequential `question` calls — poor UX, especially for the common case (global scan finds 2-3 orphans).
- The `approvalEvidence` string must contain a human-readable summary of what will be repaired (e.g., `"Repair 3 orphan bare repos across 2 projects: advance/old-branch, example-web/stale-session, orphan-project/legacy"`).
- Implementation: `scope: "global"` + `action: "repair"` validates all projects, collects repair candidates, applies only after single `approvedByUser: true`.

### Q3: Detect missing expected bare repos?

**Resolution: Yes, as advisory `info` finding (not warning/critical).**

Rationale:
- An active ADV project (has external state dir) with zero snapshot bare repos may indicate snapshots were never created (normal for new projects) or were deleted (potentially unexpected).
- The probe cannot distinguish "never created" from "deleted" — so the finding is advisory only.
- Finding shape: `{ severity: "info", pattern: "no_snapshot_dirs", message: "Project has no snapshot bare repos — expected if sessions have not run recently" }`.
- Not surfaced in `adv_status view: health` summary (info-severity findings don't affect the summary line).

### Q4: Schema versioning — semver vs integer?

**Resolution: Single integer, starting at 1.**

Rationale:
- ADV's existing schema-versioned output (e.g., `worker_lock.schema_version`) uses integers.
- Semver adds semantic overhead for a single-tool output that evolves monolithically.
- `schema_version: 1` is already specified in AC1 and the proposal's success criteria.
- Breaking changes bump the integer; consumers check `schema_version >= N`.

---

## Architecture

### Module Structure

```
plugin/src/tools/snapshot.ts          # Tool definition + execute
plugin/src/tools/snapshot-scan.ts     # Pure scan logic (testable in isolation)
plugin/src/tools/snapshot.test.ts     # Unit tests
plugin/src/tools/snapshot-scan.test.ts # Scan logic tests
```

Split rationale:
- `snapshot-scan.ts` contains all filesystem probing logic (pure functions, no Store dependency, no Zod). Testable with temp dirs and fixtures.
- `snapshot.ts` contains the ADV tool wrapper (Zod args, Store binding, approval gate, audit trail). Thin orchestration layer.
- This mirrors the existing pattern where `status.ts` uses helper functions but doesn't separate them into a distinct file (acceptable for status due to legacy; new tools should prefer separation).

### Tool Interface

```typescript
// Zod arg schema
const snapshotHealthArgs = {
  action: z.enum(["scan", "repair"]).default("scan")
    .describe("scan = read-only detection; repair = approval-gated fix"),
  scope: z.enum(["project", "global"]).default("project")
    .describe("project = caller-project snapshot dir; global = all OpenCode projects"),
  repair_actions: z.array(z.enum([
    "delete_stale_locks",
    "delete_zero_byte_objects",
    "delete_orphan_bare_repos",
  ])).optional()
    .describe("Which repair actions to apply. Required when action=repair."),
  approvedByUser: z.boolean().optional()
    .describe("Required for repair. Must be true."),
  approvalEvidence: z.string().optional()
    .describe("Required for repair. Human-readable summary of what is being approved."),
  dryRun: z.boolean().optional().default(false)
    .describe("Preview repair actions without executing."),
};
```

### Output Schema (schema_version: 1)

```typescript
interface SnapshotHealthOutput {
  schema_version: 1;
  scan_duration_ms: number;
  scope: "project" | "global";
  project_id: string;                    // caller project
  summary: {
    projects_scanned: number;
    bare_repos_scanned: number;
    critical: number;
    warnings: number;
    info: number;
  };
  findings: SnapshotFinding[];
  repair_preview?: {                     // present when dryRun=true or action="repair"
    actions_planned: number;
    actions_executed: number;            // 0 for dryRun
    details: RepairActionRecord[];
  };
}

interface SnapshotFinding {
  pattern: string;                       // e.g., "stale_lock", "zero_byte_object", "fsck_error", "orphan_bare_repo", "oversized_dir", "legacy_layout", "no_snapshot_dirs"
  severity: "critical" | "warning" | "info";
  project_id: string;
  bare_repo_path: string;
  detail: string;
  remediation?: string;                  // e.g., "delete_orphan_bare_repos"
  metadata?: Record<string, unknown>;    // e.g., { holder_pid: null, lock_age_min: 47, size_bytes: 4900000000 }
}

interface RepairActionRecord {
  action: string;                        // from whitelist
  target_path: string;
  status: "success" | "skipped" | "failed";
  reason: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}
```

### Detection Patterns (6 core + 1 advisory)

| Pattern | Severity | Detection Logic |
|---|---|---|
| `stale_lock` | critical | `*.lock` file with mtime >5min ago AND (`lsof` shows no holder OR `lsof` unavailable with `holder_pid: "unknown_no_lsof"`) |
| `zero_byte_object` | critical | File under `objects/{xx}/` with name matching `^[0-9a-f]{38,}$` and size === 0 |
| `fsck_error` | critical | `git fsck --no-dangling --connectivity-only` returns non-zero exit; max 10 errors captured per repo; skipped on dirs >500MB |
| `orphan_bare_repo` | warning | Bare repo dir where the expected worktree path doesn't exist on disk |
| `oversized_dir` | info | Snapshot bare repo dir >100MB (advisory — not structural corruption) |
| `legacy_layout` | info | `{projectID}/` dir contains HEAD + objects/ + refs/ (bare repo signature) at project level, not under a worktree hash |
| `no_snapshot_dirs` | info | Project has external state dir but no snapshot subdirs |

### Scan Algorithm

```
scanSnapshotHealth(basePath: string, scope: "project" | "global"):
  findings = []
  
  if scope === "project":
    projects = [basePath]
  else:
    projects = listSubdirs(snapshotRoot)  // all {projectID}/ dirs
  
  for each projectDir:
    detect legacy layout (HEAD + objects/ + refs at top level)
    if legacy:
      findings.push({ pattern: "legacy_layout", severity: "info", ... })
      scan bare repo at projectDir level
    fi
    
    for each subDir under projectDir:
      if isBareRepo(subDir):
        scanBareRepo(subDir, findings)
  
  return findings

scanBareRepo(repoPath, findings):
  // 1. Stale locks
  for each *.lock under repoPath:
    age = now - mtime(lock)
    if age > 5min:
      holder = checkLsofHolder(lock)
      if holder is null or "unknown_no_lsof":
        findings.push({ pattern: "stale_lock", severity: "critical", ... })
  
  // 2. Zero-byte objects
  for each file under objects/{xx}/ matching hex name pattern:
    if size === 0:
      findings.push({ pattern: "zero_byte_object", severity: "critical", ... })
  
  // 3. fsck (if dir < 500MB)
  if dirSize < 500MB:
    run git fsck --no-dangling --connectivity-only
    capture stderr lines (max 10)
  
  // 4. Orphan check
  extract worktree path from bare repo config or dir hash
  if worktree path !exists:
    findings.push({ pattern: "orphan_bare_repo", severity: "warning", ... })
  
  // 5. Size check
  if dirSize > 100MB:
    findings.push({ pattern: "oversized_dir", severity: "info", ... })
```

### Repair Flow

```
repair(approvedByUser, approvalEvidence, repair_actions, dryRun):
  REQUIRE approvedByUser === true
  REQUIRE approvalEvidence is non-empty string
  REQUIRE repair_actions is non-empty array of whitelisted values
  
  findings = scanSnapshotHealth(...)
  repairable = findings.filter(f => f.remediation in repair_actions)
  
  results = []
  for each finding in repairable:
    if pattern is stale_lock:
      re-check lsof (race guard)
      if holder appeared: skip with reason
      if !dryRun: unlink lock file
    
    if pattern is zero_byte_object:
      if !dryRun: unlink file
    
    if pattern is orphan_bare_repo (includes legacy_layout):
      re-check worktree path still missing
      if worktree reappeared: skip with reason
      if !dryRun: rm -rf bare repo dir
    
    record result
  
  if !dryRun:
    for each successful repair:
      agendaAdd({
        title: `snapshot-repair: {action} on {target_path}`,
        description: `Finding: {pattern}. Before: {before}. Result: {status}.`,
        priority: "low",
        category: "snapshot-repair"
      })
  
  return { repair_preview: results }
```

### Integration with adv_status

**Where it hooks in:**

1. **`adv_status` execute function** (status.ts ~line 1122): After `computeHealthSnapshot` and `computeExternalStateHygiene`, add a call to `scanSnapshotHealth` cached with a TTL probe (same pattern as `fetchStatusTemporalHealth`).

2. **`fullOutput` object** (status.ts ~line 1218): Add `snapshot_health: snapshotHealthResult` field.

3. **`applyStatusView`** (status.ts ~line 837):
   - `case "health"`: add `projection.snapshot_health_summary = ...` (one-line: `✓ clean` / `🟨 N warnings` / `🟥 N critical`)
   - `case "hygiene"`: add `projection.snapshot_health = full.snapshot_health` (full findings table)

4. **`formatStatusOutput`** (tool-formatters.ts): Add `snapshotHealthSection` to `FormattedStatus`:
   - `## Snapshot Health` + summary line + finding table (if any)
   - Input extends `StatusInput` with optional `snapshotHealth?: { critical: number; warnings: number; info: number; findings: SnapshotFinding[] }`

5. **Caching**: Wrap scan in a TTL-cached probe (60s TTL, matching existing probe patterns). Key: `snapshot-health:{projectID}`.

### Files Changed (enumerated)

| File | Change |
|---|---|
| `plugin/src/tools/snapshot-scan.ts` | **NEW** — Pure scan logic, detection patterns, repair execution |
| `plugin/src/tools/snapshot.ts` | **NEW** — Tool definition (Zod args, execute, `snapshotHealthTools` export) |
| `plugin/src/tools/snapshot-scan.test.ts` | **NEW** — Scan logic unit tests (8 fixture types) |
| `plugin/src/tools/snapshot.test.ts` | **NEW** — Tool integration tests (approval gate, schema, scope) |
| `plugin/src/tool-registry.ts` | Import `snapshotTools` + `bindTool(snapshotTools.adv_snapshot_health, "adv_snapshot_health", store)` |
| `plugin/src/tools/status.ts` | Import scan, add cached probe call, add to `fullOutput`, update `applyStatusView` health/hygiene cases |
| `plugin/src/utils/tool-formatters.ts` | Add `snapshotHealth` to `StatusInput`, add `snapshotHealthSection` to `FormattedStatus`, format in `formatStatusOutput` |
| `plugin/src/manifest.ts` | Add tool declaration for agent allowlist sync |
| `.adv/specs/snapshot-health/spec.json` | **NEW** — Spec capability with rq- identifiers |
| `docs/snapshot-health.md` | **NEW** — User documentation |
| `AGENTS.md` | One-line reference in Repository Layout table |
| `.opencode/agents/adv.md` | Add tool to allowlist |
| `.opencode/agents/adv-atc.md` | Add tool to allowlist |
| `.opencode/agents/adv-engineer.md` | Add tool to allowlist |
| `.opencode/agents/adv-researcher.md` | Add tool to allowlist |
| `.opencode/agents/adv-tron.md` | Add tool to allowlist |
| `scripts/sync-global.sh` | Propagation to provider variants (automatic from manifest entry) |

### Test Strategy

8 fixture bare repos in temp dirs:

| # | Fixture | Expected Finding |
|---|---|---|
| 1 | Clean bare repo | No findings |
| 2 | Stale lock (>5min mtime, no holder) | `stale_lock` critical |
| 3 | Lock with live `lsof` holder | Not flagged (mock lsof to return PID) |
| 4 | Zero-byte object file | `zero_byte_object` critical |
| 5 | Deliberately corrupted bare repo (missing object referenced by ref) | `fsck_error` critical |
| 6 | Orphan bare repo (worktree path missing) | `orphan_bare_repo` warning |
| 7 | Legacy layout (projectID dir IS bare repo) | `legacy_layout` info |
| 8 | Oversized dir (>100MB synthetic) | `oversized_dir` info |

Plus tool-level tests:
- Repair refuses without `approvedByUser: true`
- Repair refuses without `approvalEvidence`
- Repair refuses unknown action string
- Repair with `dryRun: true` returns preview but no mutations
- Audit trail written after successful repair
- Schema validation (schema_version: 1 shape)
- Scope boundary (`project` vs `global`)

### Performance Target

- Single-project scan: <2s (typical: 1-3 bare repos)
- Global scan: <10s for 20 projects / 30 bare repos
- `git fsck --connectivity-only` per repo: <2s target
- `lsof` check per lock: <100ms
- File size scan (zero-byte objects): `fs.stat` only, no content reads

### Security Considerations

- No file content reads — only metadata (stat, readdir, lsof)
- No git operations that mutate history
- Repair operations are strictly file deletions (unlink/rm-rf of specific targets)
- Cross-project read scope is directory metadata only; repair requires per-call approval
- `lsof` re-check before lock deletion prevents TOCTOU races
- All repairs audit-logged to ADV agenda