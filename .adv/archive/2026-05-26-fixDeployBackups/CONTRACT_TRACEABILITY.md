# Contract Traceability

**Change ID:** fixDeployBackups
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-05-26T16:32:49.912Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | --fix clean JSONC: PRE_BAK=3 POST_BAK=3 EXIT=0 (final-verification smoke) |
| SC2 | success_criterion | pass | review | --fix corrupted JSONC: '❌ JSONC drift detected — manual patch required (1 entr(y/ies))' + diff + restore hint, exit 1, backup created |
| SC3 | success_criterion | pass | review | JSON path branch at deploy-local.sh:922 unchanged (cp backup → mv tmp_json → echo); validated by code inspection per agreement OOS3 (no JSON config available locally) |
| SC4 | success_criterion | pass | review | POST_BAK=3 across all test runs; isolated helper test 7→3 pruned 4 by mtime |
| SC5 | success_criterion | pass | review | --check corrupted JSONC: 'Config: ❌ JSONC drift detected — 1 issue(s) found' + fail-loud explainer, exit 1 |
| SC6 | success_criterion | pass | review | --dry-run --fix corrupted JSONC: 'would create backup at … would fail-loud with diff' + '(would exit non-zero)', PRE=POST=3, exit 1 |
| AC1 | acceptance_criterion | pass | test | fix_config rewrite computes drift first via patches_summary accumulator before any backup decision |
| AC2 | acceptance_criterion | pass | test | SC1 verifies clean JSONC early-returns without backup (POST_BAK==PRE_BAK==3 across two consecutive --fix runs) |
| AC3 | acceptance_criterion | pass | test | SC2 verifies JSONC+drift creates one backup, prints exact diff + restore hint, exits non-zero |
| AC4 | acceptance_criterion | pass | test | JSON branch retains backup→cp→mv→echo sequence; only message text and ordering changed (computed-first then written), behavior preserved |
| AC5 | acceptance_criterion | pass | test | prune_config_backups uses ls -1t … | tail -n +N; honors DRY_RUN; isolated test 7→3 confirmed |
| AC6 | acceptance_criterion | pass | test | SC5 verifies --check summary surfaces JSONC drift explicitly |
| AC7 | acceptance_criterion | pass | test | DRY_RUN honored at every branch — SC6 dry-run + JSONC+drift dry-run paths verified no cp/rm executed |
| C1 | constraint | respected | static_check | Only sh + jq + GNU coreutils used (ls, sed, tail, xargs, cp, rm, date, mktemp) |
| C2 | constraint | respected | static_check | Only scripts/deploy-local.sh modified (1 file, +93/-54 lines) |
| C3 | constraint | respected | static_check | JSON (non-JSONC) auto-patch branch at line 922 preserves original cp/mv/echo semantics; only message wording adjusted |
| C4 | constraint | respected | static_check | DRY_RUN behavior verified in SC6 dry-run path; --quiet not introduced by this change but no existing --quiet flag detected |
| C5 | constraint | respected | static_check | patches_summary accumulator reuses the same jq pipeline as the write step — drift detection and patch computation are the same logic, just split by accumulation vs write |
| DONT1 | avoidance | respected | review | No JSONC AST patcher introduced; JSONC drift remains fail-loud with manual edit instructions |
| DONT2 | avoidance | respected | review | SC3+AC4: JSON behavior preserved (inspection of line 922 branch) |
| DONT3 | avoidance | respected | review | prune_config_backups only runs at end of fix_config; existing backups outside that window untouched (initial 16-backup manual cleanup was user-directed, not by this change) |
| DONT4 | avoidance | respected | review | JSONC path never invokes mv tmp_json → GLOBAL_JSON; the JSONC branch returns 1 with rm -f tmp_json before any write |
| DONT5 | avoidance | respected | review | Backup created in JSONC+drift path is preserved (only stale backups from prior runs pruned); SC2 verified backup file still exists after fail-loud return |
| OOS1 | out_of_scope | respected | not_applicable | No JSONC AST patcher work in this change |
| OOS2 | out_of_scope | respected | not_applicable | No JSONC→JSON format migration in this change |
| OOS3 | out_of_scope | respected | not_applicable | No shell test infra added; verification is manual smoke + --check + --dry-run --fix as agreed |
| OOS4 | out_of_scope | respected | not_applicable | No other scripts/ files modified — only scripts/deploy-local.sh |
| OOS5 | out_of_scope | respected | not_applicable | No ADV spec/agent/command/runtime files modified |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-26dfd4677e76 | SC4, AC5 | SC4, AC5, AC7 | C1, C2, C4, DONT3 |  |
| tk-7fee01045bc9 | SC1, SC3, AC1, AC2, AC4 | SC1, SC3, AC1, AC2, AC4, AC7 | C1, C2, C3, C4, C5, DONT2, DONT4, DONT5 |  |
| tk-bdd3663b5253 | SC2, AC3 | SC2, AC3, AC7 | C1, C2, C4, DONT1, DONT4, DONT5 |  |
| tk-571aeea46c56 | SC5, AC6 | SC5, AC6 | C2, C4, C5 |  |
| tk-2d8215d0245f |  | SC1, SC2, SC3, SC4, SC5, SC6, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
