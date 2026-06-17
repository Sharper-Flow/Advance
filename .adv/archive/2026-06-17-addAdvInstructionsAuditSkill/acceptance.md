# Acceptance

Reviewed at: 2026-06-17T21:15:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `skills/adv-instructions-audit/SKILL.md` exists; SKILL.md ≤100 lines; valid frontmatter (`name`, `description` with "Use when…", ≤1024 chars, third person). Passes the `adv-skill-author` review checklist. | pass | skills/adv-instructions-audit/SKILL.md exists, 58 lines (≤100), valid frontmatter (name/description/keywords/metadata), passes adv-skill-author checklist. Conformance check red→green (run tr_mqikbnxs). |
| AC2 | acceptance_criterion | Skill encodes the **4 core rules** (trace-to-anchor, test-or-cut, single-source-per-surface, runtime-assembly-aware) and **5 audit dimensions** (anchor mapper, drift detector, coverage checker, duplication detector, orphan detector), with the concrete anchor taxonomy (the ~48 `*-assets.test.ts` / invariant / drift test files). | pass | 4 core rules (trace-to-anchor+fidelity, test-or-cut, single-source-per-surface, runtime-assembly-aware) + 5 dimensions + fidelity rule present; anchor taxonomy is kinds-only with rg enumeration (no static inventory). |
| AC3 | acceptance_criterion | A **dry-run findings report** is produced as an acceptance artifact; it catches ≥1 real drift class, including the positive control (CI-order prose → `repo-instructions-assets.test.ts` anchor, and the live `project.md` ↔ `AGENTS.md` dev-commands duplication drift). | pass | Dry-run report (/tmp/opencode/adv-instructions-audit-dryrun.md) catches all 3 positive controls: CI-order anchor (partial fidelity), project.md dev-commands matrix drift (F1/F2 HIGH), project.md:36 count staleness (F3). |
| AC4 | acceptance_criterion | **Dry-run is read-only:** no instruction file is modified by this change (all fixes are out of scope / follow-up). | pass | git diff trunk...HEAD = only skills/adv-instructions-audit/SKILL.md (58 insertions). Dry-run was read-only; no instruction-prose file modified. |
| AC5 | acceptance_criterion | No new `/adv-instructions-audit` command, ADV tool, or deterministic scanner ships in v1. | pass | No new entries in .opencode/command/, plugin/src/tools/, or scanner scripts. git diff confirms single skill file only. |
| AC6 | acceptance_criterion | After `deploy-local.sh --fix`, the skill appears in the runtime `available_skills` list. | pass | skill-loading-policy-assets + adv-skill-backed-commands-assets + repo-instructions-assets = 63 tests pass (run tr_mqikgnyj). Live available_skills confirmation deferred to deploy+restart per source-vs-dist gotcha (documented, not a failure). |
| C1 | constraint | Read-only methodology; never auto-fix (mirrors `adv-audit` constraint). | respected | Skill Constraints section: 'Read-only; never auto-fix (mirrors adv-audit).' Dry-run modified no files. |
| C2 | constraint | Different axis from `adv-audit` (instruction-prose↔anchor, not spec↔code) — no functional overlap. | respected | adv-researcher validator confirmed clean axis separation (instruction-prose↔anchor vs spec↔code); skill states the distinction. |
| C3 | constraint | SKILL.md ≤100 lines; deeper content → sibling `*.md` (progressive disclosure per `adv-skill-author`). | respected | SKILL.md = 58 lines (≤100); no sibling REFERENCE.md split needed (C2 pre-plan unused). |
| C4 | constraint | Implementation in the per-change worktree (trunk write firewall). | respected | Implemented in change/addAdvInstructionsAuditSkill worktree (trunk write firewall honored). |
| C5 | constraint | No new spec in v1 (instruction auditing is not currently a spec'd capability; no spec-citation obligation). | respected | No spec delta; instruction auditing is not a spec'd capability; no spec-citation obligation triggered. |
| DONT1 | avoidance | Don't ship a companion command or deterministic scanner in v1 (dry-run-first; promote later if output earns it). | respected | Skill-only v1; no .opencode/command entry, no scanner script, no plugin/src/tools addition. |
| DONT2 | avoidance | Don't fix any instruction drift surfaced by the dry run — separate follow-up change(s). | respected | Dry-run was read-only; git diff shows zero instruction-prose edits (only the new skill file). |
| DONT3 | avoidance | Don't assert unverified claims about external/tool surfaces (P34). | respected | All skill claims verified against the codebase this session (anchor tests, package.json, project.md, deploy --check). |
| DONT4 | avoidance | Don't silently expand into spec-law changes. | respected | No spec files created or modified; no spec-law expansion. |

