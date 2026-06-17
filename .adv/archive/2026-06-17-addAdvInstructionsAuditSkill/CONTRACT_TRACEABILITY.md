# Contract Traceability

**Change ID:** addAdvInstructionsAuditSkill
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-17T21:15:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | skills/adv-instructions-audit/SKILL.md exists, 58 lines (≤100), valid frontmatter (name/description/keywords/metadata), passes adv-skill-author checklist. Conformance check red→green (run tr_mqikbnxs). |
| AC2 | acceptance_criterion | pass | test | 4 core rules (trace-to-anchor+fidelity, test-or-cut, single-source-per-surface, runtime-assembly-aware) + 5 dimensions + fidelity rule present; anchor taxonomy is kinds-only with rg enumeration (no static inventory). |
| AC3 | acceptance_criterion | pass | test | Dry-run report (/tmp/opencode/adv-instructions-audit-dryrun.md) catches all 3 positive controls: CI-order anchor (partial fidelity), project.md dev-commands matrix drift (F1/F2 HIGH), project.md:36 count staleness (F3). |
| AC4 | acceptance_criterion | pass | test | git diff trunk...HEAD = only skills/adv-instructions-audit/SKILL.md (58 insertions). Dry-run was read-only; no instruction-prose file modified. |
| AC5 | acceptance_criterion | pass | test | No new entries in .opencode/command/, plugin/src/tools/, or scanner scripts. git diff confirms single skill file only. |
| AC6 | acceptance_criterion | pass | test | skill-loading-policy-assets + adv-skill-backed-commands-assets + repo-instructions-assets = 63 tests pass (run tr_mqikgnyj). Live available_skills confirmation deferred to deploy+restart per source-vs-dist gotcha (documented, not a failure). |
| C1 | constraint | respected | static_check | Skill Constraints section: 'Read-only; never auto-fix (mirrors adv-audit).' Dry-run modified no files. |
| C2 | constraint | respected | static_check | adv-researcher validator confirmed clean axis separation (instruction-prose↔anchor vs spec↔code); skill states the distinction. |
| C3 | constraint | respected | static_check | SKILL.md = 58 lines (≤100); no sibling REFERENCE.md split needed (C2 pre-plan unused). |
| C4 | constraint | respected | static_check | Implemented in change/addAdvInstructionsAuditSkill worktree (trunk write firewall honored). |
| C5 | constraint | respected | static_check | No spec delta; instruction auditing is not a spec'd capability; no spec-citation obligation triggered. |
| DONT1 | avoidance | respected | review | Skill-only v1; no .opencode/command entry, no scanner script, no plugin/src/tools addition. |
| DONT2 | avoidance | respected | review | Dry-run was read-only; git diff shows zero instruction-prose edits (only the new skill file). |
| DONT3 | avoidance | respected | review | All skill claims verified against the codebase this session (anchor tests, package.json, project.md, deploy --check). |
| DONT4 | avoidance | respected | review | No spec files created or modified; no spec-law expansion. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4207ea920d35 |  | AC1, AC2 | C1, C2 |  |
| tk-d1e8b59028f7 |  | AC3, AC4 | C1 |  |
| tk-4860e2bace0a |  | AC1, AC2, AC3, AC4, AC5, AC6 | C2, C3, C4 |  |
