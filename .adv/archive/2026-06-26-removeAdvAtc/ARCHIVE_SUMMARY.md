# Archive: Remove ADV ATC

**Change ID:** removeAdvAtc
**Archived:** 2026-06-26T03:17:54.739Z
**Created:** 2026-06-26T00:42:03.609Z

## Tasks Completed

- ✅ Remove ATC runtime assets and manifest wiring
  > Removed supported adv-atc runtime entry points: `.opencode/agents/adv-atc.md`, `.opencode/command/adv-atc.md`, `COMMAND_MANIFEST['adv-atc']`, and existence-only ATC asset tests. Updated manifest tests to assert ATC absence, command count 26, and absent source assets. Updated delegation and phantom roster tests to preserve primary-agent subagent bans for the remaining primaries (`adv`, `plan`, `build`) without keeping ATC as a supported primary.
- ✅ Remove current-support ATC docs and specs
  > Removed `adv-atc` current-support documentation and specs while preserving historical changelog references. Retired the ATC workflow requirement (`rq-atc01`) from advance-workflow spec/doc mirror; removed the vacuous `rq-orchestratorOpsDelegation01.6` ATC out-of-scope clause; updated delegation-defaults primary-agent references to `adv`, `plan`, and `build`; updated asset tests to assert ATC absence and retained delegation safety checks.
- ✅ Update deploy-local stale cleanup and backup path
  > Updated deploy-local source and tests for clean ATC removal. Removed the now-vacuous `REPO_AGENTS/adv-atc.md` frontmatter/tool-drift check and the obsolete `adv-autopilot files replaced by adv-atc` cleanup block. Added deploy-local test coverage that generic stale `adv-*.md` command and agent loops own removed ATC cleanup and that no ATC-specific guard remains.
- ✅ Run final ATC-removal verification sweep
  > Final verification plus release-hardening remediation completed. Reviewer fixed the final stale current-support spec mention; harden scanners found one safe adjacent stale runtime warning string, which was reworded and verified. Final source state has no supported/current `adv-atc` runtime, docs, manifest, spec, deploy, or roadmap wording; exact search retains only historical changelog and structural absence assertions. Current checkpoint 294a1508d2f8.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Clean command/agent retirement should delete source assets and remove manifest registration, then shrink primary-agent spawn-ban rosters rather than disabling/hiding the command. RED should assert absence before deleting so removal is structurally proven.
- **[gotcha]** Removing a current-support command can require spec-law cleanup in both JSON and rendered docs. Search results should classify remaining hits: historical changelog/archive is OK, but current specs/docs/tests must either assert absence or remove support text.
- **[success]** For clean removal of deployed command/agent assets, source deletion can rely on generic deploy-local stale `adv-*.md` cleanup loops. Remove product-specific drift guards and obsolete migration comments so stale code does not survive as disabled legacy logic.
- **[success]** Final removal verification should include a source search classification plus deployed/global absence checks. In this change, `adv-atc` remained only in historical changelog and absence-assertion tests; global and backup `adv-atc.md` files were explicitly absent after deploy-local fix.
