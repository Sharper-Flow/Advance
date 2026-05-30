# Agreement

## Objectives

1. Eliminate unconditional backup creation in `scripts/deploy-local.sh --fix` — only back up when a patch will actually run.
2. Surface JSONC drift with an actionable, fail-loud message and non-zero exit instead of a silent warning.
3. Auto-prune `~/.config/opencode/opencode.jsonc.bak.*` to keep at most 3 most-recent backups.

## Success Criteria

1. `--fix` against clean JSONC config: no new `.bak.*` file created; exit 0.
2. `--fix` against JSONC config with drift: one backup created, fail-loud message with exact missing keys/values + restore hint, exit non-zero.
3. `--fix` against plain JSON config: unchanged behavior — existing backup, patch, cleanup semantics preserved.
4. After any `--fix` run, `ls -1 ~/.config/opencode/opencode.jsonc.bak.* | wc -l` ≤ 3.
5. `--check` surfaces JSONC drift explicitly in its summary.
6. `--dry-run --fix` previews fail-loud message without creating a backup.

## Acceptance Criteria

1. `patch_config` reorders to detect drift before backup creation.
2. JSONC + no drift returns early without `cp` or backup.
3. JSONC + drift creates one backup, prints exact missing keys/values diff, prints restore-from-backup hint, exits non-zero.
4. JSON path (non-JSONC) auto-patch behavior is byte-for-byte unchanged on the happy path.
5. New `prune_config_backups` helper keeps the 3 most-recent backups by mtime and deletes the rest; called at end of every `--fix` run.
6. `--check` mode (no `--fix`) reports JSONC drift in its existing summary block.
7. `DRY_RUN=true` is honored everywhere — no `cp`, no `rm`, no write under dry-run.

## Constraints

1. Pure shell + `jq` + GNU coreutils. No new dependencies.
2. Single-file change: `scripts/deploy-local.sh` only.
3. Preserve JSON (non-JSONC) auto-patch path semantics exactly.
4. Honor `DRY_RUN` and any existing `--quiet` flag.
5. Drift detection reuses the same `jq` patch computation used by `--fix` — do not duplicate logic.

## Avoidances

1. Do not implement a comment-preserving JSONC AST patcher in this change (separate /adv-proposal scope).
2. Do not change JSON behavior on the non-JSONC path.
3. Do not retroactively delete existing user backups outside of the natural retention pass triggered by a `--fix` run.
4. Do not silently rewrite JSONC as plain JSON.
5. Do not delete the backup the script just created in this run.

## Out of Scope

1. JSONC AST patcher.
2. Format migration (JSONC → JSON).
3. Tests for `scripts/deploy-local.sh` (no test infra exists for shell scripts today; verification is manual + `--check` + `--dry-run --fix`).
4. Other scripts under `scripts/`.
5. Any ADV spec/agent/command/runtime change.

## Spec-Law Impact

**No spec law update required.** Maintenance script, no governing capability spec.

## Sign-Off

Quick Contract confirmed by user via question tool reply "Confirmed — execute". Fast-track exemption per `/adv-task` Phase 0.
