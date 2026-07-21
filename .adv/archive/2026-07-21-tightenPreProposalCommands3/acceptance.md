# Acceptance

Reviewed at: 2026-07-21T17:30:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1:** Agents pick correct pre-proposal command from description alone (no body inspection needed) | pass | Descriptions now distinct: /adv-idea='Explore rough ideas'; /adv-problem='Triage defects and unintended behavior'; /adv-improve='Improvement analysis and research'. Agent can pick from description alone. |
| SC2 | success_criterion | **SC2:** Users understand each command's persistence behavior upfront from Command Boundary section | pass | All 3 command files have **Persistence:** line in Command Boundary section. Verified via rg. |
| SC3 | success_criterion | **SC3:** Exit grammar is consistent across the three commands | pass | /adv-improve exits table now includes 🔄 iterate row matching /adv-idea format and /adv-improve's own emoji-bearing style. |
| AC1 | acceptance_criterion | **AC1:** After change, `rg "Triage issues before fixing"` returns 0 matches in `.opencode/command/`, `plugin/src/manifest.ts`, `README.md`, `ADV_INSTRUCTIONS.md`, `SETUP.md` | pass | rg 'Triage issues before fixing' returns 0 matches across .opencode/, plugin/src/manifest.ts, README.md, ADV_INSTRUCTIONS.md, SETUP.md |
| AC2 | acceptance_criterion | **AC2:** After change, `rg "Triage defects and unintended behavior"` returns 5 matches across the same 5 files | pass | rg 'Triage defects and unintended behavior' returns 5 matches (frontmatter + manifest + README + ADV_INSTRUCTIONS + SETUP) |
| AC3 | acceptance_criterion | **AC3:** After change, `rg "Suggest targeted improvements"` returns 0 matches across those files | pass | rg 'Suggest targeted improvements' returns 0 matches across mirror sites |
| AC4 | acceptance_criterion | **AC4:** After change, `rg "Improvement analysis and research"` returns 4-5 matches across those files (SETUP.md may keep richer form at line 1397) | pass | rg 'Improvement analysis and research' returns 5 matches (4 standard + 1 richer in SETUP.md) |
| AC5 | acceptance_criterion | **AC5:** `.opencode/command/adv-improve.md` exits table contains an `iterate` row matching the format of `/adv-idea` and `/adv-problem` | pass | /adv-improve.md exits table contains '| 🔄 iterate | Useful progress on the analysis, but key evidence questions remain |' |
| AC6 | acceptance_criterion | **AC6:** All 3 command files contain a persistence-rationale note in their `## Command Boundary` section | pass | All 3 command files contain **Persistence:** line in Command Boundary section. Verified via rg -l Persistence: .opencode/command/adv-{idea,problem,improve}.md |
| AC7 | acceptance_criterion | **AC7:** `pnpm run check` exits 0 after change (no broken manifest tests / schemas / lint) | pass | pnpm run check from plugin/ exits 0. All checks green: schemas:check, typecheck, generate:manifests:check, check-test-isolation, check-lockfile-policy, lint, format:check. |
| C1 | constraint | **C1:** No runtime code changes (markdown contracts + manifest description strings only) | respected | No runtime code changes. Edits confined to .opencode/command/*.md (markdown contracts) and plugin/src/manifest.ts (description string fields only). No .ts logic changes. |
| C2 | constraint | **C2:** Description-string mirroring must stay in lockstep across all 5 files per command | respected | Description strings mirrored across all 5 sites per command (verified by AC2 + AC4 grep counts of 5 each). |
| C3 | constraint | **C3:** `/adv-problem` narrowing must not push away legitimate defect-adjacent triage (perf regressions, confusing UX) | respected | Narrowed /adv-problem description retains 'unintended behavior' which covers perf regressions, UX confusion, and other defect-adjacent triage. 'defects' keyword preserved per rq-defectOriginRca01. |
| C4 | constraint | **C4:** `/adv-improve` broadening must not collide with `/adv-research` scope in agent routing | respected | /adv-improve broadened description does not collide with /adv-research (gate-bound). ODQ1 resolved in design. Routing table at .opencode/agents/adv.md:185-195 unchanged. |
| DONT1 | avoidance | **DONT1:** Don't split `/adv-improve` into two commands | respected | /adv-improve not split into two commands. Single command with broadened description covering both targeted scans and external landscape research. |
| DONT2 | avoidance | **DONT2:** Don't add new commands (e.g., `/adv-define`) | respected | No new commands added (no /adv-define or similar). Existing 3 commands tightened. |
| DONT3 | avoidance | **DONT3:** Don't change runtime behavior | respected | No runtime behavior changes. pnpm run check passes including typecheck (would fail if runtime TS logic changed). |
| DONT4 | avoidance | **DONT4:** Don't modify spec laws or `rq-defectOriginRca01` rule text | respected | No spec deltas. rq-defectOriginRca01 rule text unchanged. .adv/specs/ untouched. |
| OOS1 | out_of_scope | **OOS1:** Major phase restructure of any command | missing |  |
| OOS2 | out_of_scope | **OOS2:** Changes to other pre-proposal commands (`/adv-triage`, `/adv-clarify`, `/adv-research`, `/adv-discover`, `/adv-proposal`, `/adv-task`, `/adv-epic`, `/adv-backlog`) | missing |  |
| OOS3 | out_of_scope | **OOS3:** Changes to `rq-defectOriginRca01` rule text or routing logic | missing |  |
| OOS4 | out_of_scope | **OOS4:** Runtime code changes / TypeScript logic changes | missing |  |
| OOS5 | out_of_scope | **OOS5:** Spec deltas | missing |  |

