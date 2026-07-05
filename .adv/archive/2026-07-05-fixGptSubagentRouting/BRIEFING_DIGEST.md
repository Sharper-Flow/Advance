# Archive Briefing Digest

**Change ID:** fixGptSubagentRouting
**Title:** Fix GPT subagent routing
**Status:** archived
**Generated:** 2026-07-05T01:13:07.754Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 69 of 69 durable facts.

- **[archive_only_evidence]** decisions: Added a new rq-delDefaults09 requirement for bounded ready-task routing metadata projection — No existing spec law covered the formatted adv_task_ready projection surface; advance-delivery covers adv_change_show include flags but not the task-ready formatter.
- **[archive_only_evidence]** decisions: Reused existing rq-delDefaults03/rq-delDefaults06 roster/boundary invariants for provider-hint parity instead of creating a duplicate roster law — The matrix already defines allowed sub-agents and the no-primary/no-phantom rule; provider-hint parity is anchored by amending rq-delDefaults06 and adding a provider-eval prompt regression test.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/delegation-matrix.test.ts src/subagent-reports-spec-assets.test.ts src/phantom-subagent-roster.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts (0) — All 139 tests passed (delegation-matrix 25, subagent-reports 20, phantom-roster 92, no-retired-refs 2)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, check-test-isolation, check-lockfile-policy, lint, format:check all passed
- **[archive_only_evidence]** verification: bun -e "Bun.YAML.parse(require('fs').readFileSync('scripts/provider-eval-prompts/gpt.yaml','utf8'))" (0) — Provider-eval prompt YAML parses successfully
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/delegation-matrix.test.ts src/subagent-reports-spec-assets.test.ts src/phantom-subagent-roster.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun -e "Bun.YAML.parse(require('fs').readFileSync('scripts/provider-eval-prompts/gpt.yaml','utf8'))"
- **[archive_only_evidence]** decisions: Projected only delegation_hint and frontend into readyList as key=value suffixes inside parentheses — Keeps chat output compact and bounded; omits cleanly when absent and ignores arbitrary metadata per rq-delDefaults09
- **[archive_only_evidence]** decisions: Passed full task metadata object into formatter input and let formatter select bounded keys — Preserves raw ready[] payload compatibility while centralizing bounded-projection policy in the formatter
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/tool-formatters.test.ts src/tools/task.test.ts (1) — RED: 3 failures — new formatter/task tests expected routing metadata annotations that were not yet implemented
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/tool-formatters.test.ts src/tools/task.test.ts (0) — GREEN: 77 passed — bounded routing metadata projected in readyList, arbitrary keys omitted, raw ready[] unchanged
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm run lint && pnpm run format:check (0) — typecheck, lint, and format:check pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/tool-formatters.test.ts src/tools/task.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/tool-formatters.test.ts src/tools/task.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck && pnpm run lint && pnpm run format:check
- **[archive_only_evidence]** decisions: Added GLM-parity cross-gate delegation lines adapted for GPT after the existing ADV apply-task line — Keeps ADV routing guidance together and preserves all existing GPT-specific rules (sequential deps, schema correctness, no general for code-writing)
- **[archive_only_evidence]** decisions: Wrote phantom-routing test that allows 'Do not spawn general' while rejecting positive general-routing instructions — Existing GPT rule already negates general routing; the test must not falsely flag that negation as a phantom route
- **[archive_only_evidence]** verification: npm test (RED after adding cross-gate/research assertion) (1) — 1 failure: GPT hint missing multi-gate/multi-file/cross-cutting scope mention
- **[archive_only_evidence]** verification: npm test (GREEN after hint update) (0) — All 21 tests pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npm test (RED after adding cross-gate/research assertion)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npm test (GREEN after hint update)
- **[agenda]** follow_ups: Confirm scope_repos includes /home/jon/toolbox/plugins/opencode-provider-hints before editing gpt.md and its test (cross-repo edit).
- **[agenda]** follow_ups: Orchestrator decision needed: is candidate #3 (task-ready metadata projection) inside the approved proposal scope, or a separate follow_up change?
- **[agenda]** follow_ups: If #3 adopted, pair with #4 (formatter metadata-projection test) and keep projection bounded to delegation_hint + frontend to avoid formatter scope creep.
- **[archive_only_evidence]** sources: gpt.md provider hint: GPT hint carries only apply/metadata-conditioned adv-engineer nudge (line 16) plus a general-not-for-code guard (line 22). No unconditional cross-gate/multi-file delegation wording; does not name adv-researcher/explore for cross-cutting work.
- **[archive_only_evidence]** sources: glm.md provider hint: GLM hint has unconditional cross-gate/multi-file delegation wording: prefer spawning adv-researcher/adv-engineer for multi-file/multi-gate/cross-cutting work (line 17), inline-edit ceiling (line 9), cross-cutting mapping (line 15), cross-gate invariant restatement (line 18).
- **[archive_only_evidence]** sources: claude.md provider hint: Claude hint is minimal (3 bullets) — act-directly + apply delegation nudge only. Establishes that per-provider hint depth is intentionally tuned to model weakness, not uniform; parity means addressing GPT's specific under-delegation, not copying GLM verbatim.
- **[archive_only_evidence]** sources: provider-hints plugin test: Tests assert marker emission ([ADV:PROVIDER_HINT:*]), provider switch detection, system-block append, and 6-file loading. No assertion locks delegation-content parity — a GPT hint could silently lose the adv-engineer bullet and tests stay green.
- **[archive_only_evidence]** sources: adv_task_ready formatting: formatTaskReadyOutput input maps ready[] to {id,content,status} (508-522); _todoProjection maps to {id,title,status} (531-538). Raw ready[] with full metadata is still returned (529-530), so delegation_hint/frontend are present as raw data but absent from both salience surfaces.
- **[archive_only_evidence]** sources: tool-formatters projection: buildTodoProjection and formatTaskReadyOutput carry no metadata fields; formatted lines are id + truncated title only. No delegation-hint/frontend passthrough.
- **[archive_only_evidence]** sources: tool-formatters tests: formatTaskReadyOutput and buildTodoProjection tests cover readyList/blockedList/nextSuggested/todoFormat and projection rows, but no test asserts delegation metadata projection — regression guard absent for any future passthrough.
- **[archive_only_evidence]** sources: adv-apply delegation routing: Delegation routing consumes metadata.delegation_hint (Priority 1) and metadata.frontend (Priority 1.5) at the exact decision point. These are the fields stripped from task-ready formatted output.
- **[archive_only_evidence]** sources: prep-readiness frontend metadata spec: rq-PR009frontendApplicability structurally requires metadata.frontend on relevant tasks before planning completes — confirms delegation_hint/frontend are first-class structural routing signals, not incidental.
- **[archive_only_evidence]** sources: delegation-defaults / context-shed spec: Context-shed (rq-contextShed) and orchestrator-ops-delegation (rq-orchestratorOpsDelegation) specs define delegate_allowed heuristics and worker-lane routing across gates; code-edit rows route to adv-engineer/adv-designer. Confirms discovery/design/apply/review/harden lanes exist.
- **[archive_only_evidence]** architecture_assessment: Two independent leverage points, both bounded to approved scope. (1) Provider-hint parity: GPT under-delegates because gpt.md lacks the unconditional cross-gate/multi-file delegation wording that glm.md carries (glm.md:17), and no test asserts delegation-content parity so drift is undetected. The fix is content addition to gpt.md plus a parity/content-presence test — boring, proven, mirrors the existing per-provider tuning model (each hint is tuned to model weakness, not uniform). (2) Task-ready delegation salience: delegation_hint and frontend metadata are the exact fields the apply routing table reads (adv-apply.md:433-460) and prep-readiness structurally enforces (prep-readiness.md:111), yet both formatted salience surfaces (formatTaskReadyOutput readyList, buildTodoProjection _todoProjection) strip them. This is a salience gap, not hard data loss — raw ready[] still carries metadata (task.ts:529-530) — but it forces the orchestrator to parse raw payload to make the delegation decision, which is precisely where a weaker-delegating model fails to look. Adding a bounded metadata projection (delegation_hint, frontend) to the formatted output, guarded by a formatter test, is a low-risk, high-payoff structural nudge. No novel abstraction required; both fixes are additive and reversible.
- **[agenda]** follow_ups: Planning must decide spec-law placement: amend rq-delDefaults03/06 vs add net-new provider-hint parity requirement (candidate 5, surface_to_user).
- **[agenda]** follow_ups: Confirm at planning that the GPT under-spawn eval prompt is added to the existing scripts/provider-eval-prompts/gpt.yaml rather than a new file.
- **[agenda]** follow_ups: Ensure GPT hint-content tests assert against the existing rq-delDefaults03.3 forbidden primary/phantom agent set to avoid a second competing agent-roster list.
- **[archive_only_evidence]** sources: plugin/src/utils/tool-formatters.ts formatTaskReadyOutput + buildTodoProjection: TaskReadyInput.ready types {id,content,status} only; both formatTaskReadyOutput and buildTodoProjection map Task->{id,content/title,status} and drop t.metadata. Salience gap is real and localized to two projections.
- **[archive_only_evidence]** sources: plugin/src/tools/task.ts adv_task_ready execute: Formatter/projection call sites strip metadata but raw result.ready:Task[] is spread verbatim via ...result, so AC4 raw backward-compat already holds; only formatted+_todoProjection lose keys.
- **[archive_only_evidence]** sources: plugin/src/types/tasks.ts Task.metadata schema: metadata: z.record(z.string(),z.string()).optional() — open string map. delegation_hint and frontend are already valid keys; formatter can read them off Task.metadata with NO schema change.
- **[archive_only_evidence]** sources: delegation_hint/frontend already first-class delegation signals: reflection.ts reads metadata.delegation_hint (delegate_allowed/delegate_preferred); adv-apply routing pins metadata.delegation_hint Priority 1 and metadata.frontend Priority 1.5; rq-delDefaults08 makes metadata.frontend true a designer trigger. Bounded key choice is already the canonical routing vocabulary.
- **[archive_only_evidence]** sources: scripts/provider-eval-prompts/gpt.yaml already exists: GPT provider-eval harness exists with 12+ prompts incl continuation_discipline categories, but NO delegation/under-spawn category. Design's 'add gpt.yaml if adopted' is really 'add one prompt to an existing file', lower risk than implied.
- **[archive_only_evidence]** sources: delegation-defaults spec rq-delDefaults03/06 warrants: rq-delDefaults03.3 already forbids primary(adv,plan,build)/phantom agents in sub-agent lists and pins the spawnable roster; rq-delDefaults06 anchors typed reports. AC1/AC2 warrants point at existing requirements — spec delta may be an amendment, not net-new law.
- **[archive_only_evidence]** architecture_assessment: The draft two-layer design is well-matched to the codebase. Layer 2 (bounded adv_task_ready metadata projection) is a genuine, tightly localized salience gap: two pure formatters strip Task.metadata while raw payload preserves it, so AC3/AC4 are satisfiable with a small typed extension and zero schema churn (metadata is already an open string map and delegation_hint/frontend are already the canonical routing keys used by reflection.ts, adv-apply routing, and rq-delDefaults08). Layer 1 (GPT provider-hint parity) is lower-blast-radius than the design implies: the GPT provider-eval file already exists, so the under-spawn eval is an added prompt not a new harness, and rq-delDefaults03.3 already encodes the no-primary/no-phantom invariant the design wants tests to guard. Main leverage: reuse existing routing vocabulary and existing eval/spec anchors rather than introducing parallel structures. Main risk to watch: spec-law placement (amend existing rq-delDefaults vs net-new requirement) to avoid duplicate/competing invariants.
- **[agenda]** follow_ups: Prep: verify whether any existing delegation-defaults requirement already covers formatted ready-task metadata projection before adding a new narrow requirement id, to avoid competing sources of truth.
- **[agenda]** follow_ups: Prep: encode the GPT hint-content test as semantic-token + forbidden-agent-name assertions (not exact GLM prose) to prevent brittleness while still catching under-delegation regression.
- **[agenda]** follow_ups: Prep: create separate repo-scoped tasks + verification steps for advance (plugin/ targeted tests) and toolbox (opencode-provider-hints npm test) with an explicit deploy/restart note (AC7/SC4).
- **[archive_only_evidence]** sources: delegation-defaults spec rq-delDefaults03 (allowed sub-agents / no-primary-no-phantom law): rq-delDefaults03.3 pins spawnable roster (explore, general, adv-researcher, adv-engineer, adv-reviewer, adv-designer, adv-tron) and forbids primary (adv/plan/build) and phantom (librarian/mechanic/prioritizer) in any allowed-subagents list. rq-delDefaults03.4 fixes per-step assignments. AC1 warrant confirmed: design reuses this law rather than duplicating a roster.
- **[archive_only_evidence]** sources: delegation-defaults spec rq-delDefaults06 (test coverage / no-primary-no-phantom routing tests): rq-delDefaults06.2 requires phantom-subagent-roster tests to detect forbidden primary+phantom routing on active guidance surfaces and pin PRIMARIES list. AC2 warrant confirmed: GPT hint-content parity test can attach to this existing invariant instead of inventing a new roster.
- **[archive_only_evidence]** sources: adv_task_ready formatter drop of metadata (task.ts): formatTaskReadyOutput is fed only {id,content:title,status}; raw result.ready[] (with Task.metadata) is still returned in formatToolOutput. Confirms design's salience-gap framing: metadata present in raw payload, absent in formatted/_todoProjection. AC3/AC4 target surface verified exactly.
- **[archive_only_evidence]** sources: TaskReadyInput + formatTaskReadyOutput shape (tool-formatters.ts): TaskReadyInput.ready is {id,content,status} only; formatter renders readyList/blockedList/nextSuggested/todoFormat with no metadata. Extending the interface with optional bounded keys is additive and preserves raw-payload compatibility (AC4).
- **[archive_only_evidence]** sources: delegation_hint is a canonical Task.metadata routing key: reflection routing keys off t.metadata.delegation_hint == delegate_allowed|delegate_preferred; designer-assets test pins metadata.delegation_hint as Priority 1 apply-routing override. Design's choice of delegation_hint as a projected key is source-backed, not invented.
- **[archive_only_evidence]** sources: frontend is a canonical Task.metadata routing key: prep-readiness validates structured metadata.frontend (true/false + rationale); designer-assets test pins metadata.frontend as Priority 1.5 adv-designer routing branch. Confirms delegation_hint+frontend are exactly the two structural worker-lane signals at task selection — bounded projection is well-targeted.
- **[archive_only_evidence]** sources: GPT provider hint current state (toolbox): GPT hint has only apply-task conditional delegate_allowed/delegate_preferred adv-engineer nudge (line 16) plus no-general-for-code rule (line 22). It lacks GLM's unconditional cross-gate/multi-file/cross-cutting spawn nudge. Confirms the under-spawn defect and GPT-only edit scope (AC5).
- **[archive_only_evidence]** sources: GLM provider hint parity baseline (toolbox): GLM line 17 gives the cross-gate/multi-file/cross-cutting nudge naming adv-researcher/adv-engineer while preserving orchestrator judgment (prefer spawning ... rather than doing inline). This is the concrete GLM-parity target; it names only allowed workers and asserts no primary/phantom routing — consistent with rq-delDefaults03.
- **[archive_only_evidence]** architecture_assessment: Design is a correct, minimal two-layer fix matching the verified defect. Layer 1 (toolbox gpt.md) raises GPT prompt salience to GLM parity for broad ADV work; the parity target (glm.md:17) already respects the no-primary/no-phantom roster, so lifting equivalent wording into gpt.md cannot by construction violate rq-delDefaults03 provided the test asserts forbidden agent names. Layer 2 (advance formatter) closes a real salience gap: task.ts:508-542 strips Task.metadata before formatting while returning it raw, so agents choosing next work from formatted output never see the routing signal. The two projected keys — delegation_hint (reflection.ts:741, Priority 1 apply override) and frontend (prep-readiness.ts:384, Priority 1.5 designer branch) — are the exact canonical structural routing keys, so the bounded projection is precisely scoped, not arbitrary. Spec-law placement (extend rq-delDefaults03/06 for the roster invariant, add a narrow projection requirement only if uncovered) avoids competing sources of truth and honors C1. Backward compatibility (AC4) holds because the raw result.ready[] path is untouched and the interface extension is optional. No new workers, no runtime auto-spawn, no primary/phantom routing, no adv-gpt variant — all avoidances respected.
- **[unresolved_action]** required_main_agent_actions: Review and checkpoint/commit the toolbox remediation edits in plugins/opencode-provider-hints/providers/gpt.md and plugins/opencode-provider-hints/test/plugin.test.js.
- **[unresolved_action]** required_main_agent_actions: Before any live-behavior claim, deploy provider hints and restart/open a fresh OpenCode session per delivered AC7.
- **[unresolved_action]** required_main_agent_actions: Proceed with acceptance evidence using rerun Advance targeted suite and toolbox npm test results; no remaining acceptance blockers found.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Provider-hint routing tests should assert both positive delegation cues and negative authority boundaries; otherwise hints can encourage subagent use while silently weakening orchestrator-only ADV mutations.
- **[archive_only_evidence]** changes_made: ../worktree-adhoc/toolbox/fix-gpt-subagent-routing/plugins/opencode-provider-hints/providers/gpt.md: Added explicit GPT provider-hint boundary preserving ADV orchestration authority with the main orchestrator while allowing scoped adv-researcher/adv-engineer delegation.
- **[archive_only_evidence]** changes_made: ../worktree-adhoc/toolbox/fix-gpt-subagent-routing/plugins/opencode-provider-hints/test/plugin.test.js: Strengthened GPT cross-gate/research delegation test to fail if the hint loses the orchestrator-authority boundary.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/delegation-matrix.test.ts src/utils/tool-formatters.test.ts src/tools/task.test.ts src/subagent-reports-spec-assets.test.ts src/phantom-subagent-roster.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts, npm test (workdir: /home/jon/.local/share/opencode/worktree-adhoc/toolbox/fix-gpt-subagent-routing/plugins/opencode-provider-hints) results=pass — Advance targeted suite passed 6 files / 216 tests. Toolbox provider-hints npm test passed 21/21 tests. Source inspection confirmed adv_task_ready formatted output projects only delegation_hint/frontend while preserving raw ready[] metadata, GPT provider-eval prompt forbids provider-specific phantom agents, and GPT provider hint now preserves main-orchestrator authority.
- **[unresolved_action]** required_main_agent_actions: Before claiming deployed runtime behavior changed, build/deploy provider hint assets and verify in a fresh OpenCode session after restart.
- **[unresolved_action]** required_main_agent_actions: Proceed with release/archive decision only from orchestrator; no unresolved reviewer blocker found in harden scope.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Provider-hint source changes cannot prove live OpenCode behavior in the current already-running session; source/tests can be release-ready, but runtime behavior must be claimed only after build/deploy and a fresh OpenCode session.
- **[archive_only_evidence]** verification: tests_run=Advance path preflight for 8 referenced files: all OK, Toolbox path preflight for 2 referenced files: all OK, git diff --name-status origin/trunk...HEAD (Advance), git diff --name-status origin/master...HEAD (Toolbox), bin/oc-test targeted -- src/delegation-matrix.test.ts src/tools/task.test.ts src/utils/tool-formatters.test.ts, npm --prefix plugins/opencode-provider-hints test, git status --short (Advance and Toolbox) results=pass — Inspected Advance diff: delegation-defaults spec/docs, delegation matrix tests, adv_task_ready routing metadata projection, GPT provider eval prompt. Inspected Toolbox diff: GPT provider hint plus provider-hints tests. Corrected initial verification command path/package-root mistakes, then Advance targeted tests passed: 3 files, 102 tests. Toolbox provider-hints npm test passed: 21 tests. Both worktrees reported clean git status after verification. Prior full evidence from context remains applicable: Advance targeted suite 216 passed plus pnpm run check passed; Toolbox npm test 21 passed; merge dry-runs clean. Scope key submitted as harden:release because report schema rejects harden:release-readiness.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/delegation-matrix.test.ts src/subagent-reports-spec-assets.test.ts src/phantom-subagent-roster.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bun -e "Bun.YAML.parse(require('fs').readFileSync('scripts/provider-eval-prompts/gpt.yaml','utf8'))"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/tool-formatters.test.ts src/tools/task.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/tool-formatters.test.ts src/tools/task.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck && pnpm run lint && pnpm run format:check
- verification_missing: No adv_run_test evidence found for reported command: npm test (RED after adding cross-gate/research assertion)
- verification_missing: No adv_run_test evidence found for reported command: npm test (GREEN after hint update)
- Review and checkpoint/commit the toolbox remediation edits in plugins/opencode-provider-hints/providers/gpt.md and plugins/opencode-provider-hints/test/plugin.test.js.
- Before any live-behavior claim, deploy provider hints and restart/open a fresh OpenCode session per delivered AC7.
- Proceed with acceptance evidence using rerun Advance targeted suite and toolbox npm test results; no remaining acceptance blockers found.
- Before claiming deployed runtime behavior changed, build/deploy provider hint assets and verify in a fresh OpenCode session after restart.
- Proceed with release/archive decision only from orchestrator; no unresolved reviewer blocker found in harden scope.
