# Contract Traceability

**Change ID:** adoptCodebaseDesignImprove
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-08T18:33:19.169Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| C1 | constraint | respected | static_check | Verified: all 5 vendored files carry the 5-line MIT attribution HTML comment block before any other content (mirrors adv-diagnose/SKILL.md lines 1-5). Each header cites Author (Matt Pocock), source path, ADR-001 reference, and Imported-at timestamp. LICENSE-THIRD-PARTY.md entries updated. |
| C2 | constraint | respected | static_check | Verified: frontmatter adaptation bounded to name (renamed to adv-codebase-design / adv-improve-codebase-architecture), description (kept verbatim), keywords (added per CQ1: [module-design, deep-module, interface, seam, adapter] / [architecture, refactoring, deepening]). All other frontmatter preserved. No description rewrites. |
| C3 | constraint | respected | static_check | Verified: skills/adv-improve-codebase-architecture/SKILL.md frontmatter retains 'disable-model-invocation: true' verbatim on line 9. Honored by OpenCode at skill-load time (deploy glob copies SKILL.md files verbatim with no frontmatter post-processing per scripts/deploy-local.sh line 29). |
| C4 | constraint | respected | static_check | Verified: git diff shows 7 files changed, all in skills/ or doc files; zero TypeScript files in plugin/src/ touched. pnpm test passes (4772/4773, with 1 pre-existing Temporal integration test flake verified to pass in isolation; my change is docs-only with zero src/ impact). |
| C5 | constraint | respected | static_check | Verified: scripts/deploy-local.sh unchanged (no edits). Line 29 glob 'skills/adv-*/SKILL.md' auto-covers both new SKILL.md files. Manual glob simulation shows adv-codebase-design/SKILL.md and adv-improve-codebase-architecture/SKILL.md both match. |
| C6 | constraint | respected | static_check | Verified: no new ADR created under docs/adr/. Reused ADR-001 (docs/adr/0001-adv-prefix-vendored-skills.md). LICENSE-THIRD-PARTY.md is the durable record of all 6 vendored skills (4 from adoptMattpocockSkills + 2 from this change). ADV_INSTRUCTIONS.md 'Adopted Skills (Open-Zone Resolutions)' table documents the open-zone resolution. |
| C7 | constraint | respected | static_check | Verified: .adv/specs/arch-scan/spec.json unchanged (rq-archp33, rq-archstack01, rq-archstack02, rq-archcov01 all preserved). adv-arch-scan and adv-slop-scan JSON output schemas unchanged (verified by 4772/4773 pnpm test pass rate). New skills are methodology supplements, not scanner backends. |
| C8 | constraint | respected | static_check | Verified: /adv-clarify unchanged (no grill-loop replacement). New skills supplement; they don't replace. The 7-gate lifecycle is preserved. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-28a4ff863054 | C1 |  |  |  |
| tk-570fb361e230 | C1, C2, C3 |  | C4, C5 |  |
| tk-9cd29d507958 | C1 |  | C6 |  |
| tk-d190130a0b64 |  |  | C6 |  |
| tk-ac8380e433b0 |  | C1, C2, C3, C4, C5 |  |  |
| tk-18e33845100b |  |  | C6 |  |
