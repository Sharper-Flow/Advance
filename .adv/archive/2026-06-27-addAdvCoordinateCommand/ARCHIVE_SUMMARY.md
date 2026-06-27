# Archive: Add adv-coordinate command

**Change ID:** addAdvCoordinateCommand
**Archived:** 2026-06-27T22:56:49.820Z
**Created:** 2026-06-27T20:39:02.840Z

## Tasks Completed

- ✅ Add RED contract tests for /adv-coordinate surfaces
  > Updated manifest tests to require 28 commands including adv-coordinate and allow Audit as a strong verb. Extended advance-epics asset tests to require rq-epicCoordinateCommand01 and new adv-coordinate command contract assertions. RED run failed as expected on missing implementation/spec/command surfaces.
- ✅ Implement advance-epics spec law for /adv-coordinate
  > Added rq-epicCoordinateCommand01 to advance-epics spec JSON with four scenarios covering read-first report, advisory order, approval-gated typed mutations, and no new planning primitive. Bumped spec/docs mirror version to 1.5.0 and mirrored requirement in docs/specs/advance-epics.md. Verified spec JSON parses.
- ✅ Add /adv-coordinate command contract asset
  > Created .opencode/command/adv-coordinate.md with frontmatter, manifest comment, boundary, read-first inventory, alignment/sequencing/health audits, approval grammar, and typed-tool apply phase. Contract preserves optional membership, advisory order, target trust, expected_version/evidence handling, no direct state filesystem access, and no CLI mutation verbs.
- ✅ Register manifest and synchronize command docs
  > Added adv-coordinate manifest entry, strong-verb support for Audit via manifest test allowlist, updated manifest expected command count/list to 29, synchronized README/ADV_INSTRUCTIONS/SETUP command tables, and added cli-surface-matrix agent-workflow-only row. Green verification passed for manifest, doc drift, and CLI matrix tests.
- ✅ Run targeted verification and close readiness gaps
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Manifest command count was already stale relative to wording: before adding adv-coordinate, COMMAND_MANIFEST had 28 entries while manifest.test.ts label/count expected 27. When adding a command, verify actual Object.keys(COMMAND_MANIFEST).length before hardcoding count-based AC/tests; be ready to correct approved criteria if source evidence contradicts discovery assumptions.
