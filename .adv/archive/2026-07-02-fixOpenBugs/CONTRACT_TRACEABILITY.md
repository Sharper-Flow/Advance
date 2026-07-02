# Contract Traceability

**Change ID:** fixOpenBugs
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-02T04:12:00.178Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | `gh issue list --repo Sharper-Flow/Advance --label bug --state open --json number,title` returned `[]` after closing remaining bugs. |
| SC2 | success_criterion | pass | review | Issues #1, #127, #168, #174, #183, #185, #191 closed with evidence comments; #131, #136, #138, #175 previously closed with source-backed no-longer-current evidence during discovery. |
| SC3 | success_criterion | pass | review | `adv_roadmap source:file kind:bug` shows counts bugs=0, features=25, deferred=1; trunk commit `1bb7b053 chore(roadmap): refresh after bug closures` pushed ROADMAP.md and .adv/roadmap-snapshot.json. |
| SC4 | success_criterion | pass | review | Targeted regression evidence: tr_mr2ry1vx, tr_mr2tagjn, tr_mr2u7odp, tr_mr2utvc7, tr_mr2vgll8, tr_mr2wxcg9, tr_mr2yom8c, tr_mr2yr1uv; smoke/check tr_mr2zkfd1 and build tr_mr2zkt9x pass on final head. |
| AC1 | acceptance_criterion | pass | test | Active duplicate create rejection implemented and verified: `tr_mr2ry1vx_a05d4f12` passed 173 targeted tests including change/create and tool surface cases. |
| AC2 | acceptance_criterion | pass | test | Audited active origin repair implemented with claim conflict rejection; `tr_mr2tagjn_3740316b` passed 227 targeted tests. |
| AC3 | acceptance_criterion | pass | test | Status repair public read-path parity fixed; `tr_mr2u7odp_0e03bb8e` passed 69 targeted tests including index.status-repair-readback. |
| AC4 | acceptance_criterion | pass | test | Worktree stale registry cleanup through durable workflow state verified; `tr_mr2utvc7_d11bac4e` passed 163 worktree tests. |
| AC5 | acceptance_criterion | pass | test | Epic terminal child projection during direct link verified; `tr_mr2vgll8_740a6a40` passed 52 Epic tests. |
| AC6 | acceptance_criterion | pass | test | Archive/checkpoint target_path routing verified; `tr_mr2wxcg9_f24b5a2e` passed 223 targeted tests; acceptance-review regression `tr_mr2ziooa_4b0a01df` passed 22 checkpoint tests. |
| AC7 | acceptance_criterion | pass | test | Archived archive retry reconciliation/no-op verified; `tr_mr2yom8c_57e0d311` passed 118 archive/change/status-repair tests. |
| AC8 | acceptance_criterion | pass | test | Tool surface/warrant/spec alignment verified by `tr_mr2yr1uv_66f86882` (185 spec/asset/archive tests) and schemas:check `tr_mr2yrbak_3a9e76cc`; Epic tool surface included in source tests. |
| AC9 | acceptance_criterion | pass | test | Each closed bug issue received an evidence comment naming tests/source proof before closure; gh open bug list is empty. |
| AC10 | acceptance_criterion | pass | test | Roadmap regeneration committed and pushed on trunk as `1bb7b053`; `adv_roadmap` readback shows fresh snapshot generated 2026-07-02T03:57:54Z with bugs=0. |
| C1 | constraint | respected | static_check | Each bug was validated during discovery or reproduced via failing/targeted regression before fix/closure; no unvalidated bug closure without evidence. |
| C2 | constraint | respected | static_check | Origin repair implementation rejects archived/closed changes and is scoped active/open only; covered by origin repair tests. |
| C3 | constraint | respected | static_check | Feature backlog untouched except roadmap readback; no feature issues were closed, rescored, or reprioritized. |
| C4 | constraint | respected | static_check | Target-path trust rules and worktree isolation preserved; tests cover target_confirmed/confirmationEvidence routing and work performed in ADV worktree. |
| C5 | constraint | respected | static_check | Acceptance proof uses public read paths (`adv_roadmap`, gh issue list, listSummary regression) and structural tests, not private cached reads. |
| C6 | constraint | respected | static_check | Live/source warrant drift was treated as bug; tool surface/warrant tests updated for Epic tools and target_path surfaces. |
| DONT1 | avoidance | respected | review | All issue closures included evidence comments; `gh issue close` output confirms closure after comments. |
| DONT2 | avoidance | respected | review | New/changed tool surfaces have schema/preflight/warrant/docs/tests; spec-citation and surface tests pass. |
| DONT3 | avoidance | respected | review | Status repair parity fix specifically moved acceptance proof to public listSummary path; regression passes. |
| DONT4 | avoidance | respected | review | No unrelated feature backlog cleanup performed; roadmap feature list only regenerated from project state. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Feature backlog scoring changes were not attempted. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Archived/closed origin repair intentionally not implemented; tests enforce active/open-only origin repair. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No broad unrelated refactors beyond touched bug-fix surfaces. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d8a4b634d33c | AC1, AC8 | AC1, AC8 | C1, C5, C6, DONT2, DONT3 |  |
| tk-175b85e6978d | AC2 | AC2 | C1, C2, C4, C5, DONT1, DONT2, OOS2 |  |
| tk-e2e3fb1cbd2c | AC3 | AC3 | C1, C5, DONT3 |  |
| tk-6253bd38be39 | AC4 | AC4 | C1, C4, C5, DONT2, DONT3 |  |
| tk-42fed1549d89 | AC5 | AC5 | C1, C4, C5, DONT2, DONT3 |  |
| tk-43bd2b136217 | AC6, AC8 | AC6, AC8 | C1, C4, C5, DONT2, DONT3 |  |
| tk-22caf2ca2d3d | AC7 | AC7 | C1, C4, C5, DONT1, DONT2, DONT3 |  |
| tk-bf5c5febcbe3 | AC8 | AC8 | C3, C4, C5, C6, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-919e4d29d889 |  | SC2, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C5, DONT3 |  |
| tk-4439e98ea2e5 | SC1, SC2, SC3, AC9, AC10 | SC1, SC2, SC3, AC9, AC10 | C1, C3, DONT1, DONT4, OOS1 |  |
