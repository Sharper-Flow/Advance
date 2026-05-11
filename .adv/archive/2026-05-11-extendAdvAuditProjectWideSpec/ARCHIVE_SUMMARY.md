# Archive: Extend /adv-audit with project-wide spec ambiguity scanning

**Change ID:** extendAdvAuditProjectWideSpec
**Archived:** 2026-05-11T22:03:23.636Z
**Created:** 2026-05-11T17:16:22.139Z

## Tasks Completed

- ✅ Create `plugin/src/validator/spec-ambiguity.ts` — pure-function ambiguity validator for spec laws
  > Task checkpoint completed
- ✅ Create `plugin/src/validator/spec-ambiguity.test.ts` — unit tests for spec ambiguity validator
  > Created spec-ambiguity.test.ts with 24 test cases covering all 5 check functions, type guard, and orchestrator. Fixed SCENARIO_PATTERN to avoid false positives from mid-sentence when/then.
- ✅ Export `spec-ambiguity` from `plugin/src/validator/index.ts`
  > Task completed
- ✅ Update `.opencode/command/adv-audit.md` — add ambiguity detection to audit phases
  > Task checkpoint completed
- ✅ Update `skills/adv-audit/SKILL.md` — add Ambiguity Scanner dimension to audit skill
  > Task checkpoint completed
- ✅ Update `.opencode/command/adv-clarify.md` — document spec-input entry point
  > Task completed
- ✅ Update `skills/adv-clarify/SKILL.md` — document spec-input mode
  > Task completed
- ✅ Update `.adv/specs/advance-workflow.md` — add requirements for project-wide ambiguity scanning
  > Task completed
- ✅ Update `.adv/specs/advance-meta.md` — document clarify_enforcement audit-context behavior
  > Task completed
- ✅ Update `ADV_INSTRUCTIONS.md` — add taxonomy note for spec-law surface
  > Task completed
- ✅ Create asset tests for audit ambiguity contract
  > Task completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** SCENARIO_PATTERN must require capital-letter Given/When/Then at line start (e.g., /^[ \t]*-?[ \t]*(?:Given|When|Then)[ :]/m). Lowercase "when"/"then" mid-sentence ("when upstream services are unavailable") triggers false positives in the error-handling check's hasFailureScenario guard.
