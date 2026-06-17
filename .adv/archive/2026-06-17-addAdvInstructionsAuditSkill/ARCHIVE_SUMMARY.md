# Archive: Add adv-instructions-audit skill

**Change ID:** addAdvInstructionsAuditSkill
**Archived:** 2026-06-17T21:34:20.963Z
**Created:** 2026-06-17T20:52:34.068Z

## Tasks Completed

- ✅ Write `skills/adv-instructions-audit/SKILL.md`
  > Created skills/adv-instructions-audit/SKILL.md (62 lines). Methodology-only: 4 core rules (trace-to-anchor with fidelity, test-or-cut, single-source-per-surface, runtime-assembly-aware), 5 audit dimensions, finding schema + health bands. Anchor taxonomy is kinds-only with rg enumeration commands — no static inventory (rq-skillProseCompression01). Frontmatter mirrors adv-audit. Conformance check red→green.
- ✅ Dry-run the skill against the instruction corpus; produce findings report
  > Dry-run applied to project.md, AGENTS.md, ADV_INSTRUCTIONS.md sample. Anchor layer enumerated at runtime (47 tests). 5 findings emitted; 3 positive controls fired (CI-order anchor partial-fidelity; project.md dev-commands matrix drift F1/F2 HIGH; project.md:36 count staleness F3). Health MAJOR_DRIFT. Report at /tmp/opencode/adv-instructions-audit-dryrun.md. Read-only — no instruction files modified. Meta-finding (presence≠fidelity) persisted as wisdom ws-LS1EAh.
- ✅ Verify acceptance criteria and runtime load
  > All 6 AC verified. Governing skill tests (skill-loading-policy, adv-skill-backed-commands, repo-instructions-assets) = 63 passed. Git diff scope vs trunk = exactly skills/adv-instructions-audit/SKILL.md (58 lines); no command/tool/scanner. AC6 live-load deferred to deploy+restart (source-vs-dist). Bonus: deploy --check surfaced pre-existing adv_change_forget tool-drift (out of scope).

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Anchor presence ≠ anchor fidelity. repo-instructions-assets.test.ts asserts the canonical CI-order SUMMARY string is present across AGENTS.md + project.md, but does not assert the per-command `# check`/`# build` COMMENTS match package.json. Result: project.md passes the anchor while its dev-command comments are stale (missing check-test-isolation/check-lockfile-policy/build:worker). The drift-detector dimension MUST require "assertion fails for THIS claim's failure mode," or dry-runs yield false-anchored (ALIGNED) verdicts over stale prose. This is the bug class that broke CI in PR #172.
