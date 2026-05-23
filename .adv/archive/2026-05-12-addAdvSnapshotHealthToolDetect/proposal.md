## Summary

Add `adv_snapshot_health` — a read-only ADV tool that detects degraded state in OpenCode's per-project snapshot store (stale locks, zero-byte git objects, fsck errors, orphan bare repos, legacy-layout artifacts) and surfaces findings via `adv_status`. Repairs are opt-in, approval-gated, and audit-logged.

## Why

OpenCode's snapshot service races on `index.lock` when multiple processes touch the same gitdir. Crashes leave behind stale locks and zero-byte git objects that permanently break snapshots for that worktree until manually cleaned. The forensic pattern (find stale locks, scan zero-byte objects, run `git fsck`) has been executed manually in at least four diagnosis sessions for example-web alone (2026-05-04, 2026-05-10, 2026-05-11, 2026-05-12). ADV today has no detection or remediation path; every recurrence costs hours.

A fifth concrete instance surfaced during this change's discovery: a 4.6 GB stale snapshot bare repo for an accidental opencode session that ran from `$HOME` in April. The dir contained *two stacked* git bare repos (legacy + modern layout) and went undetected for a month. The user-observed effect: confusion about snapshot keying + 4.6 GB of dead disk.

This is *not* a fix for the upstream race (which is OpenCode-core). It is a layer above: detect degraded state, surface it, and provide a structured repair path.

Tracked at [Sharper-Flow/Advance#1](https://github.com/Sharper-Flow/Advance/issues/1) (closed) and [Sharper-Flow/Advance#118](https://github.com/Sharper-Flow/Advance/issues/118) (open).

## Success Criteria

1. **Detection coverage**: `adv_snapshot_health` returns structured findings for every documented failure pattern observed in the five prior incidents: stale `index.lock` (>5min, no `lsof` holder), zero-byte git objects under `objects/{xx}/`, `git fsck --connectivity-only` errors, orphan bare repos (project worktree path missing), oversized snapshot dirs (>100MB), and **legacy nested layout** (a `{projectID}/` dir that is itself a git bare repo, alongside or instead of the modern `{projectID}/{worktreeHash}/` layout).
2. **Surface integration**: `adv_status view: health` includes a snapshot-health summary line (✓ clean / 🟨 N warnings / 🟥 N critical). `adv_status view: hygiene` renders the full finding table.
3. **Safe-by-default**: The tool defaults to read-only. Any state-mutating repair (`action: "repair"`) requires `approvedByUser: true` and a whitelist of repair actions; refuses without both.
4. **Audit trail**: Every repair action writes a structured entry to the ADV agenda with timestamp, scope, before-state, and result. No silent mutations.
5. **Cross-project read scope**: The tool can scan all OpenCode projects when called with `scope: "global"`, or just the calling project (default). Read-only across projects; repair restricted to caller-project unless `target_path` + `target_confirmed: true` flow is followed.
6. **Validation**: The diagnostic logic matches the validated one-off script at `/tmp/opencode/snapshot-health-scan.py`. Initial scan baseline: 19 projects, 23 bare repos, 0 critical / 0 warnings, 1 info (the 4.6 GB `/home/jrede` snapshot dir — now deleted). The probe must reproduce that result on the post-cleanup tree.

## Scope

### In Scope

- New tool: `plugin/src/tools/snapshot.ts` exporting `snapshotHealthTools` (read-only check + approval-gated repair)
- Integration into `plugin/src/tools/status.ts` to surface findings in `view: health` and `view: hygiene`
- Tool registration in `plugin/src/tool-registry.ts` and manifest entry in `plugin/src/manifest.ts`
- Agent allowlist update across `adv-{claude,gpt,glm,kimi,atc}.md` and `.opencode/agents/adv.md`, syncable via `scripts/sync-global.sh`
- Co-located vitest unit tests (`snapshot.test.ts`) using temp dirs and fixture bare repos
- Documentation at `docs/snapshot-health.md` and a one-line entry in `AGENTS.md` / `project.md`
- Spec delta under `.adv/specs/health-diagnostics.md` (or new file) defining the requirement
- ADV agenda audit entries on every repair
- Detection support for both **modern** (`{projectID}/{worktreeHash}/`) and **legacy** (`{projectID}/` directly as bare repo, possibly nested) snapshot layouts

### Out of Scope

- Fixing the upstream OpenCode race (`Sharper-Flow/Advance#1`) — that is OpenCode-core, not ADV
- Worktree-keying changes to OpenCode's snapshot service
- Changes to ADV state files (changes/, archive/, wisdom.jsonl, etc.) — only the snapshot store
- Snapshot-content inspection or rollback features
- A background daemon or scheduled polling — the probe is on-demand only (called explicitly or via `adv_status`)
- Cross-machine snapshot sync or remote inspection
- Automatic pruning based on age — only structural-corruption + orphan repair (size warnings are advisory)
- Migration of legacy-layout snapshot stores to the modern layout (probe detects + reports; user/repair decides)
- Cleanup of `opencode.db` rows, `storage/session/*`, or `storage/project/*.json` for dead projects (orthogonal concern)
- Modifying `adv_temporal_diagnose`, `adv_worktree_triage`, or other existing diagnostic tools

## Constraints

| # | Constraint |
|---|---|
| C1 | × MUST NOT write to ADV state files; the probe is snapshot-store-only |
| C2 | × MUST NOT acquire `index.lock` itself during scanning (read-only on bare repo dirs) |
| C3 | × MUST NOT execute `git gc`, `git prune`, or other history-altering ops as part of repair (only delete identified zero-byte objects + stale lock files + orphan bare repo dirs) |
| C4 | `git fsck` MUST use `--no-dangling --connectivity-only` to bound runtime (target: <2s per bare repo on typical projects) |
| C5 | Total scan time MUST stay under 10s for the typical case (20 projects, <30 bare repos, no large fsck errors) |
| C6 | The probe MUST handle bare repos with no `lsof` available (returns `holder_pid: null` rather than failing the scan) |
| C7 | Repair operations MUST be idempotent (re-running yields same result if state already clean) |
| C8 | Findings MUST be machine-readable JSON with stable schema (versioned) for future automation |
| C9 | Tool MUST follow existing ADV tool patterns (Zod arg schema, `*Tools` export, exec function returning structured output) — no new framework |
| C10 | Probe MUST recognize the legacy snapshot layout where `{projectID}/` is itself a git bare repo (HEAD/objects/refs at top level), not only the modern `{projectID}/{worktreeHash}/` layout |

## Risks

| Risk | Mitigation |
|---|---|
| Probe false-positives flag locks held by legitimate concurrent sessions | Use 5min mtime threshold + `lsof` holder check; never flag a lock with a live holder pid |
| `git fsck` is slow on large bare repos | `--connectivity-only` flag; skip fsck on dirs >500MB; report size warning instead |
| Repair deletes a live `index.lock` mid-operation | `lsof` re-check immediately before delete; refuse if holder reappears |
| `lsof` not installed on some systems | Tolerate missing `lsof` with degraded confidence; report as `holder_pid: "unknown_no_lsof"` instead of failing |
| OpenCode-core changes the snapshot dir layout in a future version | Schema-version the probe output; probe gracefully degrades on layout mismatch (logs warning, skips affected dirs) |
| Scanning all projects exposes paths the agent shouldn't read | Read-only on directory metadata + object file sizes only; never read object contents; cross-project repair requires explicit user approval |
| Legacy-layout detection produces false positives on hand-crafted git dirs | Only flag as legacy when the parent dir is `{xdg-data}/snapshot/{projectID}/` and the dir contains both `objects/` AND `HEAD` AND `refs/` (standard bare repo signature) |

## Alternatives Considered

| Alternative | Why not |
|---|---|
| Periodic background daemon | Adds a long-running process to the plugin; complicates lifecycle and shutdown. On-demand probe sits cleanly inside existing `adv_status` flow. |
| Fix upstream and skip the probe | OpenCode-core fix is unknown-timeline. ADV needs a defense-in-depth layer regardless. |
| Just add a CLI script (no MCP tool) | Loses the agent-accessible surface; agents can't auto-detect or auto-recommend repair. Defeats the goal of "single visible warning the agent can present and remediate". |
| Extend `adv_temporal_diagnose` to include snapshot health | Scope mismatch — Temporal diagnose is for the ADV workflow runtime, not OpenCode-core internals. Better as a sibling tool. |

## Validation Plan

1. Unit tests with fixture bare repos covering each finding type (clean, stale-lock, zero-byte-object, fsck-error, orphan, oversized, legacy-layout, nested-stacked-layout).
2. Run the probe against the live `~/.local/share/opencode/snapshot/` tree — must match the one-off Python script's post-cleanup output (currently 0/0/0 across 18 projects, since the 4.6 GB `/home/jrede` was just cleaned during this proposal).
3. Reproduce a corrupted state in a temp fixture, run repair with approval, verify clean state + audit entry on agenda.
4. Cross-project read test (call with `scope: "global"` from a session in `advance`, scan finds example-web's snapshot dir).
5. Verify `adv_status view: health` includes the new line in both clean and degraded fixtures.
6. Replay test: copy the pre-deletion `548a340e…` legacy-layout fixture, verify probe correctly identifies the legacy bare repo + recommends nuke-and-rebuild as repair action.