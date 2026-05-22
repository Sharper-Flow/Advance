# Acceptance

Reviewed at: 

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Runtime `adv-*` command files do not direct agents to follow/read `docs/checklists/*` for methodology. | pass | Runtime command scan: no `.opencode/command` matches for `docs/checklists/`; reviewer contract assessment pass. |
| SC2 | success_criterion | Affected proposal/discovery/prep/review/harden/improve methodology remains available through skills or embedded fallback text without losing required workflow checks. | pass | Embedded methodology blocks and existing `skill("adv-improve")`/`skill("adv-slop-detection")` retained; targeted asset tests passed 83 tests. |
| SC3 | success_criterion | Automated tests fail if a runtime command reintroduces a directive to read source/install checklist files for reusable methodology. | pass | `pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/adv-improve-assets.test.ts --reporter=dot` passed: 2 files, 83 tests; regression test failed red before cleanup. |
| SC4 | success_criterion | ADV commands invoked from a non-Advance repository do not send agents searching `~/.local/share/Advance` for checklist methodology. | pass | Runtime command scans found no `docs/checklists/` or `~/.local/share/Advance` matches; reviewer assessment pass. |
| SC5 | success_criterion | Durable guidance/spec surfaces describe the no-source-checklist-read boundary and command-vs-skill ownership. | pass | `rq-noSourceChecklistReads01` added to advance-meta spec/docs; ADV_INSTRUCTIONS boundary updated. |
| AC1 | acceptance_criterion | Audit all runtime `.opencode/command/adv-*.md` references to `docs/checklists/*` and classify each as remove, replace with skill load, replace with embedded fallback, or maintainer-only documentation. | pass | Affected commands audited and updated: adv-proposal, adv-discover, adv-prep, adv-review, adv-harden, adv-improve. |
| AC2 | acceptance_criterion | Replace runtime checklist-read directives with skill-backed methodology loading or embedded fallback instructions. | pass | Command cleanup replaced checklist path directives with embedded runtime-source wording or existing skill/fallback wording. |
| AC3 | acceptance_criterion | Add or update regression tests that inspect command assets and fail on runtime checklist-read directives. | pass | Forbidden-pattern scan added in `plugin/src/adv-skill-backed-commands-assets.test.ts`; targeted tests passed 83 tests. |
| AC4 | acceptance_criterion | Verify skill sibling-file sync remains sufficient for any methodology moved into skill reference files. | pass | No new skill sibling files required; `adv-improve` skill already contains six-category methodology; existing skill loads preserved. |
| AC5 | acceptance_criterion | Add/refine a spec requirement for the durable runtime boundary. | pass | advance-meta spec bumped to 1.11.0 with `rq-noSourceChecklistReads01`; docs/specs mirror updated. |
| C1 | constraint | Skills must remain read-only guidance and must not mutate ADV state, create tasks, complete gates, or own workflow sequencing. | respected | No skill files required state mutation; command/state ownership preserved; reviewer assessment pass. |
| C2 | constraint | Commands must continue to own user entry points, gate transitions, state mutation, and artifact persistence. | respected | Only command guidance/tests/spec/docs changed; no gate/state ownership moved to skills. |
| C3 | constraint | Do not solve this with path hacks, symlinks, environment-variable overrides, wrapper scripts, or hardcoded install paths. | respected | No symlinks/env overrides/wrappers/hardcoded install paths added; source pointers removed. |
| C4 | constraint | Core ADV workflows must remain usable offline after skills are installed/synced. | respected | Core workflows use embedded guidance or installed skills; no network dependency introduced. |
| C5 | constraint | Regression tests should be structural and low wording-churn where possible. | respected | Structural regex-based command asset scan added and passing. |
| DONT1 | avoidance | Do not instruct agents to read `~/.local/share/Advance/**` methodology files. | respected | Runtime command scan for `~/.local/share/Advance` returned no matches. |
| DONT2 | avoidance | Do not duplicate large methodology blocks across many command files when a skill can own the reusable guidance cleanly. | respected | Did not add new single-command methodology skills or duplicate large blocks; reused embedded/skill guidance. |
| DONT3 | avoidance | Do not remove methodology coverage merely to shrink prompts. | respected | Embedded methodology and existing skills retained; only source path pointers removed. |
| DONT4 | avoidance | Do not expand into redesigning the seven-gate workflow, Temporal state, or worktree mechanics. | respected | No changes to gate semantics, Temporal state, or worktree mechanics. |
| OOS1 | out_of_scope | Redesigning ADV gate semantics or approval checkpoints. | not_applicable | No gate semantics redesign attempted. |
| OOS2 | out_of_scope | Changing ADV state storage, Temporal workflow behavior, or worktree lifecycle mechanics. | not_applicable | No ADV state storage, Temporal workflow, or worktree lifecycle changes made. |
| OOS3 | out_of_scope | Removing maintainer-facing repo docs when they are no longer runtime instructions. | not_applicable | Maintainer-facing checklist docs retained. |
| OOS4 | out_of_scope | Implementing duplicate proposal prevention; tracked separately as agenda item `ag-wg8YdGFm`. | not_applicable | Duplicate proposal prevention tracked separately as agenda `ag-wg8YdGFm`; not implemented here. |

