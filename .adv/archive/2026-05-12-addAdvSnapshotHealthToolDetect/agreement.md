## Agreement — addAdvSnapshotHealthToolDetect

### Current State (Discovery Evidence)

#### Live snapshot health (just measured)

- 18 OpenCode projects with snapshot dirs (post-cleanup, was 19)
- 22 git bare repos across them (post-cleanup, was 23)
- 0 critical findings (clean state)
- The 4.6 GB orphan at `~/.local/share/opencode/snapshot/548a340e…` was deleted during proposal phase
- Detection logic exists as `/tmp/opencode/snapshot-health-scan.py` — validated against real tree

#### Integration seam map

| Surface | Current state | Touch point |
|---|---|---|
| Tool surface pattern | `temporalOpsTools` in `plugin/src/tools/temporal-ops.ts` (lines 328-685) — `{ description, args, execute }` shape; uses `formatToolOutput`, returns structured JSON | clone the pattern |
| Tool registration | `plugin/src/tool-registry.ts` line ~298 — `bindTool(statusTools.adv_status, "adv_status", store)` pattern | add `bindTool(snapshotTools.adv_snapshot_health, ...)` |
| Manifest declaration | `plugin/src/manifest.ts` (488 lines) — declares tool names for agent allowlist sync | add new entry |
| Status integration | `plugin/src/tools/status.ts:809` `applyStatusView()` filters per `view: "summary"\|"health"\|"changes"\|"hygiene"` | add `snapshot_health` to full output + filter inclusion in `health` and `hygiene` |
| Formatted section | `formatted.worktreeSection`, `formatted.sessionDebtSection`, `formatted.peerSessionsSection` exist | add `formatted.snapshotHealthSection` |
| Audit trail | `agendaTools.adv_agenda_add` accepts `{title, description, priority, category}` | every repair action writes an agenda entry |
| Spec capability | No existing `health-diagnostics` or `snapshot-health` spec. Closest: `advance-meta`, `advance-workflow` | create new `.adv/specs/snapshot-health/` capability |
| Agent allowlist | `.opencode/agents/adv.md`, `adv-atc.md`, `adv-engineer.md`, `adv-researcher.md`, `adv-tron.md` (repo-local); provider-keyed `adv-claude/gpt/glm/kimi/atc` are sync-generated globals | add tool name; `scripts/sync-global.sh` propagates |

#### OpenCode snapshot service architecture (from binary forensics)

- Path layout: `{XDG_DATA}/opencode/snapshot/{projectID}/{hash(worktreePath)}/` (modern) or `{projectID}/` directly (legacy)
- Single-process snapshot ops: serialized by a 1-permit semaphore per gitdir (`y9.makeUnsafe(1)`)
- Cross-process ops: **unprotected** — only git's `index.lock` arbitrates → race
- Cleanup loop: runs every hour after 1-minute initial delay, prunes 7-day-old snapshots
- Source: minified in `/home/jrede/.opencode/bin/opencode` binary (148 MB), function `O5` / `h9.effect` / `Z=new Map; V=(F)=>...withPermits(1)`

### Objectives

| # | Objective |
|---|---|
| O1 | Add a read-only ADV tool that scans OpenCode's snapshot store and surfaces structural health (locks, corruption, orphans, oversize, legacy layout) |
| O2 | Surface findings automatically in `adv_status view: health` (summary line) and `view: hygiene` (full table) |
| O3 | Provide an approval-gated repair action with a closed whitelist of safe operations (stale-lock delete, zero-byte-object delete, orphan-bare-repo delete) |
| O4 | Record every repair in the ADV agenda for full audit trail |
| O5 | Establish a `snapshot-health` spec capability documenting the requirement and the OpenCode snapshot subsystem invariants ADV depends on |

### Acceptance Criteria

| # | Criterion | Measurement |
|---|---|---|
| AC1 | `adv_snapshot_health` returns structured JSON with stable schema (`schema_version: 1`) covering all 6 detection patterns | Unit test with 6 fixture bare repos, one per finding type, returns expected shape |
| AC2 | Modern layout `{pid}/{worktreeHash}/` detected correctly | Unit test with modern-layout fixture |
| AC3 | Legacy layout `{pid}/` (bare repo at top level with HEAD/objects/refs) detected correctly | Unit test with legacy-layout fixture mirroring the `548a340e…` shape |
| AC4 | Stale lock detection: only flags `*.lock` files >5min mtime with NO `lsof` holder; never flags a lock with live holder pid | Unit test with two fixtures: stale + live-held |
| AC5 | Zero-byte object detection: only flags `objects/{xx}/{40-char-name}` files of size 0 | Unit test with one fixture containing zero-byte object |
| AC6 | `git fsck --connectivity-only` errors captured (max 10 per bare repo); skipped on dirs >500 MB | Unit test with deliberately corrupted bare repo |
| AC7 | Orphan bare repo: project worktree path missing → reported as warning, not critical | Unit test with fixture where worktree path doesn't exist |
| AC8 | Total scan time on real `~/.local/share/opencode/snapshot/` tree (18 projects, 22 bare repos) <10s | Performance test against live tree (in-session timer) |
| AC9 | `adv_snapshot_health` defaults to `scope: "project"` (caller-project only); `scope: "global"` scans all 18 projects | Unit test asserts both scopes work and respect boundary |
| AC10 | Repair action `action: "repair"` refuses without `approvedByUser: true` AND non-empty `approvalEvidence` | Unit test with both missing-flag and missing-evidence cases |
| AC11 | Repair scope is closed-whitelist: `["delete_stale_locks", "delete_zero_byte_objects", "delete_orphan_bare_repos"]`. Other strings rejected with error listing valid values | Unit test |
| AC12 | Every successful repair appends an agenda entry with `{title, description, priority: "low", category: "snapshot-repair"}` referencing the repair action and target path | Unit test reads agenda after repair |
| AC13 | Repair re-checks `lsof` immediately before deleting a lock; refuses if a holder appeared since scan | Race-condition unit test |
| AC14 | `adv_status view: health` includes one-line snapshot health summary (`✓ clean` / `🟨 N warnings` / `🟥 N critical`) | Unit test renders status output |
| AC15 | `adv_status view: hygiene` includes the full finding table | Unit test renders status output |
| AC16 | New spec at `.adv/specs/snapshot-health/spec.json` declares ≥4 requirements (probe-coverage, safe-default, audit-trail, scope-boundary) tagged with stable `rq-` identifiers | Spec file present + lints |
| AC17 | Documentation at `docs/snapshot-health.md` covers detection patterns, repair whitelist, integration surfaces, and known limitations (upstream race not fixed) | Doc present, referenced from AGENTS.md / project.md |
| AC18 | `pnpm run check` passes; `pnpm test` includes new tests, all green | CI verification |

### Boundaries

#### In Scope
- New tool `adv_snapshot_health` (read-only + approval-gated repair)
- `adv_status` integration (`view: health` and `view: hygiene`)
- New spec capability `snapshot-health` with stable `rq-` identifiers
- Tests, docs, agent allowlist updates (already enumerated in proposal)
- Detection of both modern + legacy snapshot layouts

#### Out of Scope (explicit)
- Fixing OpenCode-core snapshot race (`Sharper-Flow/Opencode-Advance#1`)
- Worktree-keying changes to OpenCode's snapshot service
- Background daemon / scheduled polling — on-demand only
- History-altering repair (`git gc`, `git prune`, `git filter-repo`)
- Cross-machine sync or remote snapshot inspection
- Cleanup of `opencode.db` rows, `storage/session/*`, or `storage/project/*.json` for dead projects
- Automatic age-based pruning — only structural-corruption + orphan repair
- Changes to `adv_temporal_diagnose`, `adv_worktree_triage`, `adv_status` beyond the new section
- Migration of legacy-layout snapshot stores to modern layout (probe detects; user/repair decides per-instance)

### Constraints (Re-confirmed)

C1–C10 from proposal hold. Re-stated:

- C1: × MUST NOT write to ADV state files (snapshot-store-only)
- C2: × MUST NOT acquire `index.lock` itself during scanning
- C3: × MUST NOT run `git gc` / `git prune` / history-altering ops as repair
- C4: `git fsck --no-dangling --connectivity-only` only; <2s per repo target
- C5: Total scan <10s for 20 projects / 30 repos
- C6: `lsof` unavailable → `holder_pid: "unknown_no_lsof"`, scan continues
- C7: Repair idempotent
- C8: JSON output schema-versioned (`schema_version: 1`)
- C9: Follow existing ADV tool patterns (Zod, `*Tools` export, `formatToolOutput`)
- C10: Recognize legacy `{projectID}/` direct-bare-repo layout

### Risks (Re-confirmed)

R1–R7 from proposal hold; all have mitigations enumerated.

### Validation Plan

V1. Unit tests with 6 fixture bare repos (one per finding type) + 2 edge cases (lsof-missing, post-cleanup-state) — 8 fixtures total
V2. Run probe against live `~/.local/share/opencode/snapshot/` tree, compare with `/tmp/opencode/snapshot-health-scan.py` output (must match)
V3. Reproduce corrupted state in temp fixture, run repair with `approvedByUser: true`, verify clean state + agenda audit entry
V4. Cross-project read test (`scope: "global"` from this session sees pokeedge-web's snapshot dir)
V5. `adv_status view: health` and `view: hygiene` rendered output checks
V6. Legacy-layout replay: synthesize a `548a340e…`-shaped fixture, verify probe categorizes it correctly

### What Discovery Confirmed

| Question | Answer |
|---|---|
| Does ADV have a similar diagnostic tool to model on? | Yes — `adv_temporal_diagnose` (read-only, returns structured JSON, surfaces in `adv_status`) |
| Is there an existing `snapshot-health` spec? | No — new capability required |
| Where does `view: hygiene` filter live? | `applyStatusView()` at `plugin/src/tools/status.ts:809` |
| What's the audit pattern? | `agendaTools.adv_agenda_add` — accepts `{title, description, priority, category}` |
| How are agent allowlists kept in sync? | `.opencode/agents/*.md` declare allowlist; `scripts/sync-global.sh` propagates to `~/.config/opencode/agents/` |
| Is `lsof` reliably available? | Present on the operator's host; probe must tolerate absence gracefully |
| Are there other ADV files that need parallel updates? | Manifest, tool-registry, tools/index.ts export, AGENTS.md / project.md one-liner, spec, docs |

### Open Questions Remaining (for Design Phase)

| Q | Resolution timing |
|---|---|
| Q1: Should repair delete the ENTIRE legacy-layout bare repo, or only its zero-byte objects? | Design phase — propose nuke-and-rebuild as the safer option (matches what we did for `/home/jrede`) |
| Q2: Should `scope: "global"` repair require per-project confirmation, or batch approval? | Design phase — propose per-project confirmation to match `adv_change_bulk_close` pattern |
| Q3: Should the probe also detect MISSING expected bare repos (project has active sessions but no snapshot dir)? | Design phase — likely YES, advisory only |
| Q4: Output schema versioning — semver vs single integer? | Design phase — propose single integer matching `schema_version: 1` already in other tools |