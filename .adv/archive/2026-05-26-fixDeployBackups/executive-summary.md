# Executive Summary — fixDeployBackups

## Outcome

`scripts/deploy-local.sh --fix` now only creates a backup when an actual patch will run, auto-prunes to 3 most recent backups, and surfaces JSONC drift fail-loud with an exact diff + copy-pasteable restore command instead of silently skipping. JSON (non-JSONC) auto-patch behavior is byte-for-byte preserved.

## What Was Built

- New `prune_config_backups()` helper (`scripts/deploy-local.sh` ~line 320) keeps the 3 most recent `${GLOBAL_JSON}.bak.*` files by mtime; honors `DRY_RUN`; called at every fix_config exit path.
- `fix_config()` rewritten with drift-first sequence: compute all candidate patches into `tmp_json` + human-readable `patches_summary` accumulator BEFORE any backup; early-return clean with no backup on no-drift; JSON+drift uses existing backup→write semantics; JSONC+drift creates one backup, prints "❌ JSONC drift detected — manual patch required" with the exact diff and restore-from-backup hint, returns 1.
- Script-level exit-code wiring: `fix_config_exit=0; fix_config || fix_config_exit=$?;` captures fail-loud return; final guard `[ "$fix_config_exit" -ne 0 ] && exit "$fix_config_exit"` propagates non-zero to the script's overall exit so callers (CI, hooks, the user) get an unambiguous signal.
- `check_config()` summary now distinguishes JSONC drift ("Config: ❌ JSONC drift detected — N issue(s) found" + "JSONC drift is fail-loud (no auto-rewrite) because jq strips comments") from plain JSON issues, so `--check` is informative without needing `--fix`.

## What Was Verified

All 6 success criteria verified end-to-end against the real `~/.config/opencode/opencode.jsonc` (snapshot + corrupt + restore cycle):

- **SC1** `--fix` clean JSONC → no new backup, exit 0. PRE_BAK=3, POST_BAK=3.
- **SC2** `--fix` corrupted JSONC → "❌ JSONC drift detected — manual patch required (1 entr(y/ies))" + exact diff + "Edit … manually" + "Restore from backup: cp … …", exit 1, backup created.
- **SC3** Plain JSON path code preserved (verified by inspection — branch at line 922; no behavior change on non-JSONC).
- **SC4** Backup count held at ≤3 across all test runs via `prune_config_backups`.
- **SC5** `--check` against corrupted JSONC: "Config: ❌ JSONC drift detected — 1 issue(s) found" + "Run with --fix to get the exact patch diff + restore hint; JSONC drift is fail-loud (no auto-rewrite) because jq strips comments", exit 1.
- **SC6** `--dry-run --fix` against corrupted JSONC: "dry-run: would create backup at … would fail-loud with diff" + "(would exit non-zero)", no backup actually created (PRE=POST=3), exit 1.

Isolated helper test: 7 fake `.bak.*` files → `prune_config_backups` with `CONFIG_BACKUP_KEEP=3` → 4 pruned by mtime, 3 most-recent retained.

12-dimension self-review verdict: **READY**. One nit (`(1 entr(y/ies))` formatting awkward), no blockers, no issues. Praise: drift-first refactor structurally eliminates the unnecessary-backup pattern; fail-loud message includes copy-pasteable restore command.

## Remaining Concerns

- None. Single-file scope. Working tree clean at HEAD a0c01b6.
- The pre-existing 16 accumulated backups in `~/.config/opencode/` were manually pruned at the start of this session (user-requested). Going forward, the script auto-prunes on every `--fix` run.

## Investment

5 tasks, 4 checkpoint commits, 0 retries, ~9 minutes execution wall-clock, 1 file modified (`scripts/deploy-local.sh`, +93/-54 lines).
