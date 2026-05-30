# Design

## Spec-Law Impact

**No spec law update required.** `scripts/deploy-local.sh` is an OS-level maintenance script. Confirmed against `adv_spec list`: no capability spec (`advance-workflow`, `advance-meta`, `worktree-lifecycle`, etc.) governs deploy-script behavior. Rationale persisted per `/adv-task` Phase 2 contract.

## LBP Validation

Pure shell + `jq` + GNU coreutils. No external library decisions. `ls -1t … | tail -n +N` for retention and `cp` + `find -mtime` idioms are stable, well-known POSIX patterns. **Confirmed** — no research delegation needed.

## Architecture

Two surgical changes inside `scripts/deploy-local.sh` `patch_config` function (lines 770–900) plus one new helper `prune_config_backups`:

### `patch_config` rewrite (sequence)

```
1. validate (parse with jsonc_to_json)
2. detect drift by computing the would-be patched JSON and diffing key paths
3. if NO drift:
     log "no patch needed" and return 0
     (skip cp/backup entirely)
4. if drift AND format == JSON:
     existing behavior — backup, jq patch, atomic write, prune
5. if drift AND format == JSONC:
     backup, fail-loud with exact diff (missing keys/values + restore hint), exit non-zero
6. prune_config_backups (always runs at end, keep 3)
```

### `prune_config_backups` helper

```bash
prune_config_backups() {
  local dir="$(dirname "$GLOBAL_JSON")"
  local base="$(basename "$GLOBAL_JSON")"
  local keep=3
  ls -1t "$dir/${base}.bak."* 2>/dev/null | tail -n +$((keep + 1)) | xargs --no-run-if-empty rm
}
```

### `--check` mode

Add JSONC-drift detection to `validate_config` so it reports drift state explicitly in the summary, without needing `--fix`.

## Files Affected

- `scripts/deploy-local.sh` only (single-file change).

## Risks

| Risk | Mitigation |
| --- | --- |
| Drift detection diff diverges from `--fix` patch logic | Extract drift signal from the same `jq` patch computation; do not duplicate logic |
| `xargs --no-run-if-empty` not POSIX | Already used elsewhere in toolbox scripts; bash builtin alternative is more verbose — accept GNU coreutils dependency (already implicit via `find`/`jq`) |
| Existing users relying on every-run backup | Communicated in change; backups still created on actual patches; old backups in `~/.config/opencode/` not retroactively deleted by script |
| DRY_RUN path skipped | All new logic wrapped in `[ "$DRY_RUN" = true ]` checks consistent with surrounding code |
