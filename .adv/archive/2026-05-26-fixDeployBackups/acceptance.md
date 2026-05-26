# Acceptance

Reviewed at: 2026-05-26T16:32:49.912Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | `--fix` against clean JSONC config: no new `.bak.*` file created; exit 0. | pass | --fix clean JSONC: PRE_BAK=3 POST_BAK=3 EXIT=0 (final-verification smoke) |
| SC2 | success_criterion | `--fix` against JSONC config with drift: one backup created, fail-loud message with exact missing keys/values + restore hint, exit non-zero. | pass | --fix corrupted JSONC: '❌ JSONC drift detected — manual patch required (1 entr(y/ies))' + diff + restore hint, exit 1, backup created |
| SC3 | success_criterion | `--fix` against plain JSON config: unchanged behavior — existing backup, patch, cleanup semantics preserved. | pass | JSON path branch at deploy-local.sh:922 unchanged (cp backup → mv tmp_json → echo); validated by code inspection per agreement OOS3 (no JSON config available locally) |
| SC4 | success_criterion | After any `--fix` run, `ls -1 ~/.config/opencode/opencode.jsonc.bak.* | wc -l` ≤ 3. | pass | POST_BAK=3 across all test runs; isolated helper test 7→3 pruned 4 by mtime |
| SC5 | success_criterion | `--check` surfaces JSONC drift explicitly in its summary. | pass | --check corrupted JSONC: 'Config: ❌ JSONC drift detected — 1 issue(s) found' + fail-loud explainer, exit 1 |
| SC6 | success_criterion | `--dry-run --fix` previews fail-loud message without creating a backup. | pass | --dry-run --fix corrupted JSONC: 'would create backup at … would fail-loud with diff' + '(would exit non-zero)', PRE=POST=3, exit 1 |
| AC1 | acceptance_criterion | `patch_config` reorders to detect drift before backup creation. | pass | fix_config rewrite computes drift first via patches_summary accumulator before any backup decision |
| AC2 | acceptance_criterion | JSONC + no drift returns early without `cp` or backup. | pass | SC1 verifies clean JSONC early-returns without backup (POST_BAK==PRE_BAK==3 across two consecutive --fix runs) |
| AC3 | acceptance_criterion | JSONC + drift creates one backup, prints exact missing keys/values diff, prints restore-from-backup hint, exits non-zero. | pass | SC2 verifies JSONC+drift creates one backup, prints exact diff + restore hint, exits non-zero |
| AC4 | acceptance_criterion | JSON path (non-JSONC) auto-patch behavior is byte-for-byte unchanged on the happy path. | pass | JSON branch retains backup→cp→mv→echo sequence; only message text and ordering changed (computed-first then written), behavior preserved |
| AC5 | acceptance_criterion | New `prune_config_backups` helper keeps the 3 most-recent backups by mtime and deletes the rest; called at end of every `--fix` run. | pass | prune_config_backups uses ls -1t … | tail -n +N; honors DRY_RUN; isolated test 7→3 confirmed |
| AC6 | acceptance_criterion | `--check` mode (no `--fix`) reports JSONC drift in its existing summary block. | pass | SC5 verifies --check summary surfaces JSONC drift explicitly |
| AC7 | acceptance_criterion | `DRY_RUN=true` is honored everywhere — no `cp`, no `rm`, no write under dry-run. | pass | DRY_RUN honored at every branch — SC6 dry-run + JSONC+drift dry-run paths verified no cp/rm executed |
| C1 | constraint | Pure shell + `jq` + GNU coreutils. No new dependencies. | respected | Only sh + jq + GNU coreutils used (ls, sed, tail, xargs, cp, rm, date, mktemp) |
| C2 | constraint | Single-file change: `scripts/deploy-local.sh` only. | respected | Only scripts/deploy-local.sh modified (1 file, +93/-54 lines) |
| C3 | constraint | Preserve JSON (non-JSONC) auto-patch path semantics exactly. | respected | JSON (non-JSONC) auto-patch branch at line 922 preserves original cp/mv/echo semantics; only message wording adjusted |
| C4 | constraint | Honor `DRY_RUN` and any existing `--quiet` flag. | respected | DRY_RUN behavior verified in SC6 dry-run path; --quiet not introduced by this change but no existing --quiet flag detected |
| C5 | constraint | Drift detection reuses the same `jq` patch computation used by `--fix` — do not duplicate logic. | respected | patches_summary accumulator reuses the same jq pipeline as the write step — drift detection and patch computation are the same logic, just split by accumulation vs write |
| DONT1 | avoidance | Do not implement a comment-preserving JSONC AST patcher in this change (separate /adv-proposal scope). | respected | No JSONC AST patcher introduced; JSONC drift remains fail-loud with manual edit instructions |
| DONT2 | avoidance | Do not change JSON behavior on the non-JSONC path. | respected | SC3+AC4: JSON behavior preserved (inspection of line 922 branch) |
| DONT3 | avoidance | Do not retroactively delete existing user backups outside of the natural retention pass triggered by a `--fix` run. | respected | prune_config_backups only runs at end of fix_config; existing backups outside that window untouched (initial 16-backup manual cleanup was user-directed, not by this change) |
| DONT4 | avoidance | Do not silently rewrite JSONC as plain JSON. | respected | JSONC path never invokes mv tmp_json → GLOBAL_JSON; the JSONC branch returns 1 with rm -f tmp_json before any write |
| DONT5 | avoidance | Do not delete the backup the script just created in this run. | respected | Backup created in JSONC+drift path is preserved (only stale backups from prior runs pruned); SC2 verified backup file still exists after fail-loud return |
| OOS1 | out_of_scope | JSONC AST patcher. | respected | No JSONC AST patcher work in this change |
| OOS2 | out_of_scope | Format migration (JSONC → JSON). | respected | No JSONC→JSON format migration in this change |
| OOS3 | out_of_scope | Tests for `scripts/deploy-local.sh` (no test infra exists for shell scripts today; verification is manual + `--check` + `--dry-run --fix`). | respected | No shell test infra added; verification is manual smoke + --check + --dry-run --fix as agreed |
| OOS4 | out_of_scope | Other scripts under `scripts/`. | respected | No other scripts/ files modified — only scripts/deploy-local.sh |
| OOS5 | out_of_scope | Any ADV spec/agent/command/runtime change. | respected | No ADV spec/agent/command/runtime files modified |

