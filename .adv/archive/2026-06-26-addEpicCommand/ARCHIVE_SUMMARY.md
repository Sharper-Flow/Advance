# Archive: Add epic command

**Change ID:** addEpicCommand
**Archived:** 2026-06-26T19:05:10.932Z
**Created:** 2026-06-26T17:35:51.310Z

## Tasks Completed

- ✅ Add `/adv-epic` command contract and Epic spec anchors
  > Added `.opencode/command/adv-epic.md` with goal-first, overlap-aware Epic creation workflow using typed Epic tools. Updated advance-epics spec and docs to version 1.3.0 with `rq-epicCreateCommand01`. Added targeted asset tests for command existence, ultimate goal, neutral overlap handling, optional entries, and spec/doc mirror.
- ✅ Register `/adv-epic` in manifest and public command surfaces
  > Added `adv-epic` manifest entry with pre-implementation/no-gate scope and honest Epic mutation boundary. Updated manifest count/list/title, README, SETUP, CLI surface matrix, ADV_INSTRUCTIONS command tables/classification, and token budget baseline. Targeted manifest/doc drift/CLI matrix tests pass.
- ✅ Run final command/spec verification and fix touched-scope drift
  > Ran final command/spec verification, acceptance review remediation, and harden cleanup. Adjusted `/adv-epic` description to an allowed strong verb, added explicit `requiresChangeId: false` frontmatter, strengthened asset tests, and aligned `.opencode/token-budgets.json` `adv-epic.md` baseline to the actual 110-line command file. Harden scanners found no blocker/high findings; remaining README/SETUP/CLI doc-table drift-test suggestion is low, pre-existing pattern, and nonblocking.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** `advance-epics-assets.test.ts` command-boundary assertions should allow canonical bold command docs (`**Gate:** None`) rather than only plain `Gate: None`; command files commonly use bold labels in boundary sections.
- **[gotcha]** Manifest voice-standard strong-verb allowlist does not include `Create`; new command descriptions must start with an allowed verb such as `Gather`, and exact wording must be propagated to command frontmatter and command tables to satisfy manifest-doc-drift tests.
