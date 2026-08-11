# Contract Traceability

**Change ID:** reduceAgentSessionContextFloor
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-11T18:49:36.536Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Instruction file floor reduced 48,345->~15,000B (69%), exceeding the 50KB target for instruction files. Budget check measures broader surface (231,281B including all manifests). User accepted calibration caveat at acceptance. |
| SC2 | success_criterion | pass | review | adv-ci-waiter floor 94%->89%. 60% target was unrealistic (AGENTS.md x2=10,570B baseline exceeds 60% threshold of 7,590B). User accepted calibration caveat. |
| SC3 | success_criterion | pass | review | 7 config-home instruction files synced to ~/toolbox/backups/dotfiles/opencode/instructions/ and verified via diff. adv-tools.md pre-existing gap fixed. 2 untouched files (lgrep-tools.md, morph-tools.md) have pre-existing drift. |
| SC4 | success_criterion | pass | review | 20/20 manifest-doc-drift.test.ts assertions pass. Pointer integrity verified for all demoted sections. No behavior-gating rule classified lazy. |
| AC1 | acceptance_criterion | pass | test | check-prompt-budget.ts wired into pnpm run check. Measures byte+count, fails on regression. pnpm run check passes (tr_msozz995). Full suite 5300/5300. |
| AC2 | acceptance_criterion | pass | test | permission.skill deny globs on 7 manifests. generate:manifests:check passes. deny entries verified in frontmatter. |
| AC3 | acceptance_criterion | pass | test | rules.yaml truncated to 5,923B with adv-rule-rationale pointer. Skill body exists (129 lines). manifest-doc-drift assertion rq-loadClassAxis01.1 passes. |
| AC4 | acceptance_criterion | pass | test | No LCEP/ETP headings in any .opencode/agents/*.md. generate:manifests:check passes. Canonical content verified in lgrep-tools.md/morph-tools.md. |
| AC5 | acceptance_criterion | pass | test | adv-state-access.md created and registered in instructions[]. 6 manifest copies deleted. Reviewer's 3 unique rows + researcher's surface list preserved. |
| AC6 | acceptance_criterion | pass | test | Change Report skeleton in adv-archive.md. adv.md Output Contract code block restored. handoff-footer-drift.test.ts passes. |
| C1 | constraint | respected | static_check | ADV_INSTRUCTIONS.md not in instructions[]. deploy-local.sh:792-799 guard intact. |
| C2 | constraint | respected | static_check | pnpm run generate:manifests:check passes. No hand-edited tools: frontmatter. |
| C3 | constraint | respected | static_check | All repo edits from worktree change/reduceAgentSessionContextFloor. No deploy from worktree. |
| C4 | constraint | respected | static_check | 3 new skills created: adv-rule-rationale, adv-runbook-git, adv-runbook-ci. At cap. |
| DONT1 | avoidance | respected | review | adv.md retains behavioral framing. Output Contract code block restored. ADV State Access Policy heading present. Conservative template relocation only. |
| DONT2 | avoidance | respected | review | check-prompt-budget.ts measures both byte size AND instruction count. Count is primary metric per F4 evidence. |
| DONT3 | avoidance | respected | review | No upstream blocking. Change works under V1 and V2. Per-agent scoping tracked as backlog bl-u7wvyS3n. |
| DONT4 | avoidance | respected | review | No edits to ~/.local/share/Advance/. All source edits, built via pnpm run build. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e6089a4d707c | AC2 |  | C2, C4 |  |
| tk-5b729511722e | AC4 |  |  |  |
| tk-41ca3d497213 | AC1 | SC1 |  |  |
| tk-2cc3925306c0 | AC6 |  | DONT1 |  |
| tk-af5a74613fab | AC5 |  |  |  |
| tk-02b9813fda2f |  |  |  | Enabling cleanup: removes dead config (zero live consumers per F6) superseded by the new check-prompt-budget.ts (tk-41ca3d497213). No AC/SC/constraint directly governs dead-config deletion; the new budget check task (AC1) owns the replacement surface. |
| tk-f677c6cbdce6 | AC3 |  | DONT2 |  |
| tk-ea5879734b46 | SC1 |  |  |  |
| tk-ee3139909ba6 |  | AC3, AC4, SC4 |  |  |
| tk-ea9509782971 | AC5 |  | DONT1 |  |
| tk-0e4d6e747f4e | SC3 |  |  |  |
