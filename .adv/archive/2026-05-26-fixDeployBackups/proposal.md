# Fix deploy backups

## Why

`scripts/deploy-local.sh --fix` creates a `.bak.{timestamp}` backup of `~/.config/opencode/opencode.jsonc` (or `.json`) on every run via an unconditional `cp` (line 787). When the config is JSONC (the common case for advanced users), the script intentionally skips auto-patching to preserve comments (line 795–800) — but the backup has already been created. Two real consequences:

1. Backups pile up indefinitely (observed: 19 backups in `~/.config/opencode/` before manual cleanup) with no retention bound. The user explicitly requested "we only need to save a couple."
2. When JSONC config does drift, the script silently skips the patch and only warns. There is no actionable diff, no exit code, and no remediation instructions — a JSONC user has no clear signal that they need to hand-patch their config.

This is a hygiene + correctness fix for a maintenance script that ships to every ADV user via `scripts/deploy-local.sh --fix`.

## Intent

Tighten the JSONC patch path so:

1. Backup is created only when an actual patch will be applied (or when the fail-loud preservation path needs it).
2. JSONC drift surfaces with an actionable, non-zero-exit message containing exact patch instructions instead of a silent warning.
3. Backups auto-prune to keep at most 3 most recent on every run.

## What Changes

- Reorder `patch_config` (around lines 770–900 of `scripts/deploy-local.sh`):
  - Detect drift FIRST (re-use existing `validate_config` drift signals or extract drift-detection into a helper).
  - For JSON: keep existing behavior — backup, patch, clean up unnecessary backup on no-change.
  - For JSONC with no drift: skip backup entirely; return success.
  - For JSONC with drift: create one backup, emit "JSONC drift detected — manual patch required" with exact key/value diff + restore-from-backup hint, exit non-zero (fail-loud).
- Add `prune_config_backups` helper that lists `${GLOBAL_JSON}.bak.*` by mtime, keeps the 3 most recent, deletes the rest. Call it at end of every `--fix` run (whether or not a backup was created this run).
- Update `--check` output to surface the JSONC-drift-detected state explicitly so users see it without needing `--fix`.

## Scope

### In Scope

- `scripts/deploy-local.sh` patch_config function and backup creation/retention logic.
- Help-text / message updates if needed for fail-loud JSONC drift output.
- No tests exist for deploy-local.sh today; add a smoke script or inline shell-test if practical, otherwise rely on manual `--dry-run --fix` verification documented in success criteria.

### Out of Scope

- Implementing a comment-preserving JSONC AST patcher (separate /adv-proposal scope).
- Changing global config file format from JSONC to JSON.
- Touching any other script under `scripts/`.
- Spec/agent/command/runtime ADV behavior.

### Must Not

- Must not silently rewrite JSONC as plain JSON.
- Must not delete the backup file the script just created in this run.
- Must not change the JSON (non-JSONC) auto-patch path semantics.
- Must not skip the existing config-drift validation step (lines 658–728); the new flow must reuse or invoke that detection.

## Success Criteria

1. `--fix` against clean JSONC config: zero new `.bak.*` files created; exit 0.
2. `--fix` against JSONC config with simulated drift: one backup created, fail-loud message with exact missing keys/values, exit non-zero.
3. `--fix` against plain JSON config (drift or no): unchanged behavior — backup created, patch applied or skipped per existing logic.
4. After any `--fix` run, `ls ~/.config/opencode/opencode.jsonc.bak.*` returns at most 3 files.
5. `--check` surfaces JSONC drift explicitly in its summary so users see it without `--fix`.
6. `--dry-run --fix` against JSONC drift previews the would-be fail-loud message without actually creating a backup.

## Constraints

- Pure shell + jq + standard coreutils only (no new deps).
- Preserve existing JSON path semantics exactly.
- Honor `DRY_RUN=true` everywhere.
- Honor existing `--quiet` mode if present.
- Maintain backward-compat with existing `--check` consumers.

## Spec-Law Impact

**No spec law update required.** This is a maintenance script behavior fix; it does not change ADV workflow contracts, gate semantics, sub-agent routing, report schemas, or any capability spec. The `scripts/deploy-local.sh` script is not governed by any spec in `.adv/specs/`. Rationale persisted here per `/adv-task` Phase 2 requirement.

## Verification

- `bash scripts/deploy-local.sh --check` from repo root.
- `bash scripts/deploy-local.sh --dry-run --fix` from repo root.
- Manual: temporarily corrupt `~/.config/opencode/opencode.jsonc` (remove an ADV key), run `--fix`, verify fail-loud message + non-zero exit + single backup created.
- Backup count check: `ls -1 ~/.config/opencode/opencode.jsonc.bak.* | wc -l` ≤ 3.
- Restore from backup, re-run, verify clean exit + no new backup.
