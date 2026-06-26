# Contract Traceability

**Change ID:** removeAdvAtc
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T01:59:45.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Exact `adv-atc` source search after implementation shows only historical CHANGELOG and absence assertions in tests; source assets `.opencode/agents/adv-atc.md` and `.opencode/command/adv-atc.md` deleted; manifest/docs current support removed. Reviewer READY after fixing final spec mention. |
| AC2 | acceptance_criterion | pass | test | `plugin/src/manifest.ts` no longer contains `adv-atc`; `src/manifest.test.ts` asserts 26 commands, no `adv-atc` property, and absent source assets. Targeted manifest suite passed. |
| AC3 | acceptance_criterion | pass | test | `./scripts/deploy-local.sh --fix` passed and removed stale global ATC command/agent files; explicit absence check passed for `~/.config/opencode/agents/adv-atc.md`, command/commands variants, and backup adv-atc path. |
| AC4 | acceptance_criterion | pass | test | `./scripts/deploy-local.sh --check` passed after fix: config all ADV entries present; `adv.md` allowlist matches plugin registry (70 tools). |
| AC5 | acceptance_criterion | pass | test | Removed current ATC docs/spec requirements from ADV_INSTRUCTIONS, README, CLI surface matrix, advance-workflow spec/docs, advance-meta ATC clause, and delegation-defaults current primary lists. Targeted docs/spec/delegation tests passed; reviewer fixed final delegation-defaults utility-command mention. |
| AC6 | acceptance_criterion | pass | test | `delegation-matrix.test.ts` and `phantom-subagent-roster.test.ts` now pin remaining primary agents (`adv`, `plan`, `build`) and continue forbidding primary-agent subagent routing. Targeted and full suites passed. |
| AC7 | acceptance_criterion | pass | test | Targeted final suite passed (263 tests), post-review targeted suite passed (158 tests), `pnpm run check` passed, and `bin/oc-test full` passed after review fix. |
| AC8 | acceptance_criterion | pass | test | `pnpm run build`, `./scripts/deploy-local.sh --fix`, `./scripts/deploy-local.sh --check`, and dotfile backup sync completed. Toolbox backup repo shows expected `adv.md` update and `adv-atc.md` deletion; explicit backup absence check passed. |
| C1 | constraint | respected | static_check | Changes removed ATC references only; `adv` agent remains present and deploy-local check validates `adv.md` frontmatter/tool drift. No gate/checkpoint behavior changed. |
| C2 | constraint | respected | static_check | No ADV sub-agent files were removed; deletion limited to `.opencode/agents/adv-atc.md`, the primary ATC agent. Deploy output shows remaining agents synced; tests passed. |
| C3 | constraint | respected | static_check | No alias, shim, wrapper, hidden successor, or replacement async pipeline was added. Reviewer checked clean removal/no stale legacy code and verdict READY. |
| C4 | constraint | respected | static_check | Implementation edited source worktree and used `scripts/deploy-local.sh --fix`; no deployed file was used as source of truth. Backup sync was copied from deployed current state after deploy. |
| C5 | constraint | respected | static_check | Non-secret dotfile backup sync done: `/home/jon/toolbox/backups/dotfiles/opencode/agents/adv.md` updated and `adv-atc.md` removed. Backup absence check passed. |
| C6 | constraint | respected | static_check | Remaining `adv-atc` source hit in `CHANGELOG.md` is historical; current runtime/docs/spec/manifest references removed or converted to absence assertions. |
| DONT1 | avoidance | respected | review | Explicit absence check passed for global `adv-atc.md` agent and command paths after deploy-local fix. |
| DONT2 | avoidance | respected | review | Manifest test asserts `COMMAND_MANIFEST` lacks `adv-atc`; CLI surface matrix row removed and targeted tests passed. |
| DONT3 | avoidance | respected | review | Main ADV gate/checkpoint instructions remain; removals are ATC-only. Reviewer found no safety checkpoint weakening. |
| DONT4 | avoidance | respected | review | Primary-agent routing prevention tests pass and pin remaining primaries (`adv`, `plan`, `build`) as forbidden sub-agent targets. |
| DONT5 | avoidance | respected | review | `./scripts/deploy-local.sh --check` passed after `--fix`; local deployment not claimed until check was clean. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7fb47f76ea5a | AC1, AC2, AC6, C1, C2 | AC1, AC2, AC6 | DONT2, DONT3, DONT4 |  |
| tk-4bf5c5b13315 | AC1, AC5, C6 | AC1, AC5 | DONT2, DONT3 |  |
| tk-4ab35e05139e | AC3, AC4, AC8, C4, C5 | AC3, AC4, AC8 | DONT1, DONT5 |  |
| tk-295fe8813541 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | DONT1, DONT2, DONT3, DONT4, DONT5 | Verification/hardening task; no primary implementation contract ownership. |
