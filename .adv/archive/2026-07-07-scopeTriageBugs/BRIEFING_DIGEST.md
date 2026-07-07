# Archive Briefing Digest

**Change ID:** scopeTriageBugs
**Title:** Scope triage to bugs
**Status:** archived
**Generated:** 2026-07-07T02:16:12.672Z

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

Showing 68 of 68 durable facts.

- **[archive_only_evidence]** decisions: Updated the JSDoc range from rq-backlogCoord01..07 to rq-backlogCoord01..05,07. — rq-backlogCoord06 was deleted in Task 5; the range must not cite a removed requirement.
- **[archive_only_evidence]** verification: git diff -- plugin/src/tools/backlog.ts | head -40 (0) — Header diff confirms only comment block changed; no executable code touched.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff -- plugin/src/tools/backlog.ts | head -40
- **[archive_only_evidence]** decisions: Removed scoring columns from roadmap CLI render while keeping the nullable snapshot fields and sort helper unchanged. — Backward compatibility with existing snapshots; new rendering only shows #/Title/Labels.
- **[archive_only_evidence]** verification: bun test bin/lib/roadmap.test.ts 2>&1 | tail -10 (0) — 22/22 bin/lib/roadmap tests pass after dropping scoring columns from render.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/lib/roadmap.test.ts 2>&1 | tail -10
- **[archive_only_evidence]** decisions: Did not fix the pre-existing tool-name-assets.test.ts failure referencing adv_backed_fact in adv-coordinate.md. — Archived changes updateCoordinateFreshness (2026-07-05) and autoDrivePrArchiveCompletion (2026-07-06) explicitly document this as an unrelated pre-existing failure. Fixing it would be scope creep.
- **[archive_only_evidence]** decisions: Verified GH Project field presence by inspecting BOOTSTRAP.md required custom fields table and the existing github-project-config.ts schema. — Pre-archive confirmation that required fields are still referenced; scoring field removal is a manual operator action per C6.
- **[archive_only_evidence]** verification: ./scripts/deploy-local.sh --fix 2>&1 | tail -10 (0) — deploy-local.sh --fix completed; 23 skills synced including adv-triage/.
- **[archive_only_evidence]** verification: pnpm run check 2>&1 | tail -5 (0) — Full check gate green: schemas:check, typecheck, test-isolation, lockfile-policy, lint, format:check.
- **[archive_only_evidence]** verification: pnpm test 2>&1 | tail -10 (1) — Plugin full suite: 316/317 files pass, 4624/4625 tests pass. Sole failure is pre-existing tool-name-assets (adv-coordinate.md: adv_backed_fact).
- **[archive_only_evidence]** verification: bun test bin/ 2>&1 | tail -8 (0) — Bin test suite green: 194 tests pass across 26 files.
- **[archive_only_evidence]** verification: grep -E "ADV Type|Priority|Status" skills/adv-triage/BOOTSTRAP.md (0) — Required GH Project fields ADV Type, Priority, Status still present in bootstrap docs.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ./scripts/deploy-local.sh --fix 2>&1 | tail -10
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check 2>&1 | tail -5
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test 2>&1 | tail -10
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/ 2>&1 | tail -8
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: grep -E "ADV Type|Priority|Status" skills/adv-triage/BOOTSTRAP.md
- **[archive_only_evidence]** decisions: Updated README.md, ADV_INSTRUCTIONS.md, plugin/src/manifest.ts, and plugin/src/tools/roadmap.ts to keep descriptions consistent with the new adv-triage command description. — manifest-doc-drift tests enforce exact frontmatter/description matching across command file, manifest, README, and ADV_INSTRUCTIONS.md.
- **[archive_only_evidence]** decisions: Created roadmap-render test in bin/lib/ using bun:test to exercise the actual CLI render function. — The rendering logic lives in bin/lib/roadmap.ts (Bun runtime); a plugin-only test would not catch regressions in the CLI table format.
- **[archive_only_evidence]** decisions: Left the unregistered adv_backed_fact reference in adv-coordinate.md untouched. — That file is outside the scopeTriageBugs change; modifying it would be scope creep.
- **[archive_only_evidence]** verification: cd plugin && pnpm test -- src/adv-triage-phase4c-agent.test.ts src/rq-backlogCoord09-spec-compliance.test.ts src/adv-triage-relevance-assets.test.ts src/manifest-doc-drift.test.ts 2>&1 | tail -10 (0) — Targeted plugin tests pass (316/317 files; only pre-existing tool-name-assets failure unrelated to this change).
- **[archive_only_evidence]** verification: bun test bin/lib/roadmap-render-no-scoring-cols.test.ts 2>&1 | tail -10 (0) — New bin/lib roadmap render test passes (4/4).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm test -- src/adv-triage-phase4c-agent.test.ts src/rq-backlogCoord09-spec-compliance.test.ts src/adv-triage-relevance-assets.test.ts src/manifest-doc-drift.test.ts 2>&1 | tail -10
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/lib/roadmap-render-no-scoring-cols.test.ts 2>&1 | tail -10
- **[archive_only_evidence]** decisions: Rewrote adv-triage.md as a full-file write because morph_edit rejected the worktree path and the edit touched most sections. — The file was 157 lines with scattered removals/renames; a single write was the cleanest way to preserve markdown table alignment and phase numbering.
- **[archive_only_evidence]** verification: git diff -- .opencode/command/adv-triage.md | head -120 (0) — Diff confirms removal of Phase 5, --rescore flag, GraphQL mutation rows; Phase 4c rewritten as agent-driven bug priority loop; H1/description updated.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff -- .opencode/command/adv-triage.md | head -120
- **[archive_only_evidence]** decisions: Used full-file writes for SKILL.md, WSJF.md, and SCHEMA.md because they required cross-section scoring removals. — Full writes avoided leaving stale fragments in coherently small files.
- **[archive_only_evidence]** decisions: Used targeted edits for BOOTSTRAP.md, PROMPTS.md, and ANTI-PATTERNS.md. — Those files mixed scoring and non-scoring content; edits preserved non-scoring rows.
- **[archive_only_evidence]** verification: git diff --stat -- skills/adv-triage/ (0) — All six skill files modified; net -105 lines; scoring references removed as specified.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --stat -- skills/adv-triage/
- **[archive_only_evidence]** decisions: Rewrote rq-backlogCoord09.1 and rq-backlogCoord09.4 in place; deleted entire rq-backlogCoord06 requirement object including trailing comma. — Precise JSON edits preserved surrounding requirement structure and kept the file valid.
- **[archive_only_evidence]** decisions: Removed the phrase about GitHub Project canonical ranking and Value from the capability purpose. — Matches the decision to drop scoring entirely and make bug priority labels the ordering source of truth.
- **[archive_only_evidence]** verification: python3 -m json.tool .adv/specs/backlog-coordination/spec.json > /dev/null && echo 'JSON valid' (0) — spec.json parses as valid JSON after edits; rq-backlogCoord06 absent; rq-backlogCoord09 body/title/scenarios rewritten.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: python3 -m json.tool .adv/specs/backlog-coordination/spec.json > /dev/null && echo 'JSON valid'
- **[agenda]** follow_ups: Verify rq-backlogCoord06.2's `.adv/github-project.json` field-set reference does not leave another dangling spec after AC8 GH Project field drop.
- **[agenda]** follow_ups: During planning, ensure new tests roadmap-render-no-scoring-cols.test.ts and adv-triage-phase4c-agent.test.ts assert AC5 guardrail-removal and DONT8 (no priority-confirmation question) as explicit negative tests.
- **[agenda]** follow_ups: Confirm bin/adv --rescore removal (AC2) has a corresponding help-text/CLI test so removal is verified, not just prose-deleted.
- **[archive_only_evidence]** sources: design.md (adv_change_show include.design): Design: bugs-only /adv-triage with agent-driven Phase 4c priority loop, max-2-question budget defaulting to medium, removed-phases table (Phase5/--rescore/GraphQL/guardrail), file-modification table, test strategy, risk table, spec-delta section (delete rq-backlogCoord06 + 06.1/06.2; update purpose; vaguely 'update rq-backlogCoord01-05,07-09 scoring->priority'). backlog.ts listed under 'Files kept unchanged'.
- **[archive_only_evidence]** sources: agreement.md (adv_change_show include.agreement): Contract source: 13 AC + 6 C + 8 DONT. AC5 removes user-only guardrail; AC11 requires backlog.ts WSJF comment updates; DONT7 forbids re-introducing bug-priority-is-user-only; DONT8 forbids question-tool priority confirmation; C1 backlog.ts read-only, no code removal.
- **[archive_only_evidence]** sources: proposal.md (adv_change_show include.proposal): Proposal explicitly lists backlog.ts under 'Files kept unchanged' (no WSJF write paths). Operator action = manual GH Project field-delete. Out of scope: automated field deletion, feature migration.
- **[archive_only_evidence]** sources: backlog.ts source (grep + read lines 1-30): Header comment lines 13-16 cite 'rq-backlogCoord06' as human-authority invariant and describe Value(V) user-mediated scoring semantics. Lines 416-417 describe WSJF-ranked feature top-filter. AC9 deletes rq-backlogCoord06, making the line-13 citation a dangling reference -> AC11 comment update is necessary, not cosmetic.
- **[archive_only_evidence]** sources: roadmap.ts source (grep): Confirms RoadmapFeature.wsjf is 'number | null' and sortFeaturesByWsjf tolerates null (wsjf ?? 0). Validates AC6 nullable-retention feasibility and design's issue#-fallback sort claim.
- **[archive_only_evidence]** sources: backlog-coordination/spec.json (read + grep): purpose (line5) contains 'GitHub Project remains canonical for ranking and Value (V)' = AC10 target. rq-backlogCoord06 (231-258) + 06.1/06.2 = AC9 delete target (matches design). CRITICAL: rq-backlogCoord09 asserts 'Bug Priority ... remain user-owned' in THREE places (body line370, scenario 09.1 line383, scenario 09.4 line422) contradicting AC5/DONT7. Reqs 01-04,07 have zero scoring references.
- **[archive_only_evidence]** architecture_assessment: Core pivot (strip autonomous feature scoring; make bug priority agent-driven with context-only question tool) is sound and boring in the right way: removes a noisy autonomous-write surface and collapses a dual-mode command to single-mode. The 'question tool for context only, never to confirm priority' distinction is well-modeled and consistent across AC4/DONT8. The max-2-questions-then-default-medium budget with a context_insufficient flag is a reasonable bounded-autonomy guardrail; no race risk because Phase 4c operates on a single triage run reading `gh issue list --state open` and skips already-labeled issues (idempotent-resume mitigation explicit). AC6 nullable-field retention verified feasible against roadmap.ts (wsjf number|null; null-tolerant sort). Removed-phases table cleanly maps AC1/AC2/AC3/AC5. HOWEVER two contract items are inadequately covered and one is a spec-as-laws contradiction. (1) rq-backlogCoord09 still legislates 'Bug Priority remains user-owned' in three locations; the design's spec-delta only deletes rq06 and vaguely says 'update 01-05,07-09', never identifying that rq09 must be rewritten. Left unfixed, this ships a spec law the new command violates. (2) AC11 requires updating backlog.ts WSJF comments (its line-13 comment cites rq-backlogCoord06 which AC9 deletes -> dangling reference), yet design + proposal both list backlog.ts under 'Files kept unchanged.' A comment-only edit does not violate C1 (read-only, no code/write-path removal), but the design must reconcile this and add backlog.ts to its modification surface. Minor: spec-delta overstates edit surface (reqs 01-04,07 contain no scoring references; only 05.1 incidental WSJF-staleness and rq09 actually reference it). CLARIFY_MISSING_ERROR_HANDLING (partial GH label-apply failure mid-loop) unaddressed.
- **[unresolved_action]** validation.blockers: rq-backlogCoord09 contradiction (spec-as-laws): rq-backlogCoord09 asserts 'Bug Priority and feature Value remain user-owned' in body (line 370), scenario 09.1 (line 383 'before any bug Priority prompt'), and scenario 09.4 (line 422). This directly contradicts AC5 (remove user-only guardrail) and DONT7 (do not re-introduce bug-priority-is-user-only). The design's spec-delta only deletes rq-backlogCoord06 and vaguely says 'update rq-backlogCoord01-05,07-09'; it never identifies rq09's user-owned-bug-priority invariant as needing rewrite. Design MUST explicitly specify the rq-backlogCoord09 rewrite: decouple bug-Priority from the user-owned model while keeping feature-Value user-owned (features are out of the agent-driven pivot) and preserving cleanup-before-prompt ordering.
- **[unresolved_action]** validation.blockers: AC11 has no design coverage and contradicts 'Files kept unchanged': AC11 requires updating backlog.ts WSJF-related comments. backlog.ts header comment (lines 13-16) cites 'rq-backlogCoord06' which AC9 deletes (dangling spec reference) and describes stripped Value(V) scoring semantics. Both design and proposal list backlog.ts under 'Files kept unchanged.' The design must add backlog.ts (comment-only edits) to its modification surface and clarify comment-only edits still respect C1 (no code/write-path removal). As written, the design is self-contradictory on this point.
- **[agenda]** follow_ups: At apply time, resolve rq-backlogCoord09 / 09.1 / 09.4 and rq-backlogCoord06 by rq-id (not the design's cited line numbers L370/L383/L422) to survive line drift.
- **[agenda]** follow_ups: Ensure the backlog.ts comment update and the rq-backlogCoord06 spec deletion land together so no dangling rq-backlogCoord06 reference exists mid-change.
- **[agenda]** follow_ups: Add the GH Project custom-field deletion (Value/TimeCriticality/RROE/Effort/WSJF) as an explicit pre-archive/operator checklist item since it is a manual, non-automated completion step.
- **[archive_only_evidence]** sources: design.md (revised, contentHash bcd57b5d): Revised design. Spec deltas now EXPLICITLY list rq-backlogCoord09 body (L370) + scenarios 09.1 (L383) + 09.4 (L422) as REWRITE targets with agent-driven semantics (bounded-autonomous, max 2 question-budget, default medium + context_insufficient, context-only questions never confirm priority). backlog.ts moved into Files modified table as COMMENT-ONLY edit, No code changes, C1 respected. Phase 4c loop covers idempotency, partial-apply log+continue, chat-only rationale trailer, default fallback. CI gate (AC13) explicit. Test strategy includes rq-backlogCoord09-spec-compliance.test.ts.
- **[archive_only_evidence]** sources: agreement.md (contentHash c2a8857): 27-item contract (13 AC + 6 C + 8 DONT). Objectives: strip autonomous feature scoring, pivot bug priority to agent-driven, drop V/TC/RROE/E/WSJF cols, delete rq-backlogCoord06, keep ROADMAP regen as read-only mirror. Constraints include C1 tool-layer read-only. DONTs include no re-intro of user-only priority and no using question to confirm priority.
- **[archive_only_evidence]** architecture_assessment: Revision 2 resolves both prior BLOCKED blockers. Blocker 1: spec-delta section now names rq-backlogCoord09 body + scenarios 09.1 and 09.4 as explicit REWRITE targets (was vague '01-05,07-09'), and the rewrite text preserves the agent-driven model verbatim: bounded-autonomous rationale, max 2 question-budget/bug, default medium + context_insufficient on exhaustion, context-only questions that never confirm priority. Blocker 2: backlog.ts moved from 'Files kept unchanged' into 'Files modified' as an explicit COMMENT-ONLY edit ('No code changes'), which satisfies AC11 while still respecting C1 (read-only tool layer). Full checklist verified: all 13 ACs mapped to concrete design sections; all 6 Cs respected (C1 read-only, C2 sanitizer kept, C3 labels source-of-truth, C4 adv_backlog_state reads untouched, C5 claim infra 01-05/07-09 kept, C6 GH field deletion one-time operator action); all 8 DONTs respected (priority flipped to agent-driven, question never confirms priority, no new scoring tooling, no autoscore migration, Epic/addRepoBacklog untouched). Phase 4c loop spec fully covers idempotency (skip already-labeled), partial-apply failure (log + continue), rationale trailer surface (chat only, never issue comments), and default medium + context_insufficient on budget exhaustion. CI gate AC13 section is explicit. Test strategy includes rq-backlogCoord09-spec-compliance test plus phase4c-agent and no-scoring-cols tests. The stale CLARIFY_MISSING_ERROR_HANDLING warning predates this revision and is now materially resolved by the design's explicit error-handling steps.
- **[unresolved_action]** required_main_agent_actions: Record acceptance evidence: all AC1-AC13, C1-C6, DONT1-DONT8 traced to implementing file/test/spec edits; verdict READY. Reviewer confirmed pnpm run check green and full suite 4624/4625 (single failure pre-existing, scope-unrelated).
- **[unresolved_action]** required_main_agent_actions: When synthesizing the contract review matrix, mark AC8 and C6 with evidence_policy source_audit / not_applicable-for-automation and cite the BOOTSTRAP.md required-custom-fields table (scoring fields dropped from required set) plus the agreement's explicit 'one-time operator action, manual GH Project UI' clause.
- **[unresolved_action]** required_main_agent_actions: Do NOT attempt to fix src/tool-name-assets.test.ts (adv-coordinate.md / adv_backed_fact) — out of scope for scopeTriageBugs; surface it as a separate follow-up/bug against adv-coordinate.md tool-name hygiene.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Deprecation-by-scoping done right: retaining nullable legacy fields (wsjf/value/rroe/effort/time_criticality) in the type + snapshot schema while stripping the WRITE/render/prompt surfaces preserves backward-compat with existing snapshot JSON without carrying the removed behavior. AC6 codified this explicitly; tests assert both the removal (render cols, --rescore, Phase 5) and the retention (nullable fields), giving a clean two-sided contract.
- **[wisdom_candidate]** wisdom_candidates: [convention] For prose/command/spec-only changes, binding each acceptance criterion to a filesystem-reading vitest (readFileSync + toContain/not.toMatch on the command/skill/spec artifacts) is the effective TDD surface. scopeTriageBugs added 3 such suites (phase4c-agent, roadmap-render-no-scoring-cols, rq-backlogCoord09-spec-compliance) covering AC1-AC12 with 20+26 assertions — no code logic to test, but the docs contract is now regression-guarded.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-triage-phase4c-agent.test.ts src/rq-backlogCoord09-spec-compliance.test.ts src/adv-triage-relevance-assets.test.ts, bun test bin/lib/roadmap-render-no-scoring-cols.test.ts bin/lib/roadmap.test.ts, pnpm run check, bin/oc-test full results=pass — Targeted triage suites: 20/20 pass (phase4c 6, rq09 7, relevance-assets 7). bin/lib bun: 26/26 pass (incl. render-no-scoring-cols 4 + roadmap 22). pnpm run check GREEN: schemas:check, typecheck, check-test-isolation, check-lockfile-policy, lint, format:check all pass. Full suite: 4624/4625 pass — the single failure is src/tool-name-assets.test.ts flagging '.opencode/command/adv-coordinate.md: adv_backed_fact', which is pre-existing and scope-unrelated (adv-coordinate.md NOT in this change's diff; token unrelated to WSJF/triage). Matches worker's reported 4624/4625.
- **[unresolved_action]** required_main_agent_actions: Before/at archive: ensure the 4 uncommitted accepted files (.opencode/command/adv-triage.md, plugin/src/tools/backlog.ts, plugin/src/tools/roadmap.ts, skills/adv-triage/SCHEMA.md) are committed to change/scopeTriageBugs. adv_change_archive stages+commits the worktree by default; verify the bundle includes them.
- **[unresolved_action]** required_main_agent_actions: Rebase/merge change/scopeTriageBugs onto current origin/trunk before PR merge (branch is behind trunk; merge-tree confirmed clean, no conflicts).
- **[unresolved_action]** required_main_agent_actions: Post-archive operator action (AC8, manual, C6): drop GH Project custom fields Value, TimeCriticality, RROE, Effort, WSJF via the GH Project UI. Record in archive notes.
- **[unresolved_action]** required_main_agent_actions: Do NOT absorb the pre-existing src/tool-name-assets.test.ts failure (adv-coordinate.md: adv_backed_fact) into this change — it is out-of-scope and unrelated. Route to a separate change per agenda ag-qfzDosa9 if desired.
- **[unresolved_action]** required_main_agent_actions: Proceed to release/archive: all 7 gate criteria for acceptance are done, contract matrix is 27/27 passing, and harden found no blockers.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Harden-phase merge-compat: `git merge-tree HEAD origin/<default>` prints the full merge delta (looks like conflict hunks for files like .gitleaks.toml) even on a clean merge. Use `git merge-tree --write-tree HEAD origin/<default>` and check exit code + grep for 'CONFLICT' lines instead — a clean tree SHA with exit 0 and no CONFLICT lines means no real conflict, regardless of how large the printed delta is.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Accepted-but-uncommitted worktree state is a valid harden posture for ADV changes: the acceptance review matrix is computed against live working-tree content (mtimes align with acceptance timestamp), and adv_change_archive commits the worktree during bundle creation. Verify by matching file mtimes against the acceptance gate completed_at and confirming content matches the review-matrix AC evidence, rather than assuming uncommitted == incomplete.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test full, cd plugin && npx tsc --noEmit, cd plugin && npx prettier --check src/tools/backlog.ts src/tools/roadmap.ts, bin/adv slop-scan --json, git merge-tree --write-tree HEAD origin/trunk results=pass — Full suite 4624/4625 (exit 1 solely from pre-existing out-of-scope src/tool-name-assets.test.ts on adv-coordinate.md; confirmed unrelated via git blame commit 51db1956 + 0 refs in change diff). typecheck exit 0. prettier: all files match style. slop-scan: total 0 findings across all severities (eslint detector failed on ERR_PNPM_NO_PKG_MANIFEST due to repo-root workdir vs plugin/, a tooling-path artifact, not a code finding). merge-compat: `git merge-tree --write-tree HEAD origin/trunk` exit 0, clean tree SHA b7251f82, zero CONFLICT lines (branch is behind trunk but merges cleanly). No debug artifacts, no untracked files.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| AC12 | acceptance_criterion | pass |
| AC13 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: git diff -- plugin/src/tools/backlog.ts | head -40
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/lib/roadmap.test.ts 2>&1 | tail -10
- verification_missing: No adv_run_test evidence found for reported command: ./scripts/deploy-local.sh --fix 2>&1 | tail -10
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check 2>&1 | tail -5
- verification_missing: No adv_run_test evidence found for reported command: pnpm test 2>&1 | tail -10
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/ 2>&1 | tail -8
- verification_missing: No adv_run_test evidence found for reported command: grep -E "ADV Type|Priority|Status" skills/adv-triage/BOOTSTRAP.md
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm test -- src/adv-triage-phase4c-agent.test.ts src/rq-backlogCoord09-spec-compliance.test.ts src/adv-triage-relevance-assets.test.ts src/manifest-doc-drift.test.ts 2>&1 | tail -10
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/lib/roadmap-render-no-scoring-cols.test.ts 2>&1 | tail -10
- verification_missing: No adv_run_test evidence found for reported command: git diff -- .opencode/command/adv-triage.md | head -120
- verification_missing: No adv_run_test evidence found for reported command: git diff --stat -- skills/adv-triage/
- verification_missing: No adv_run_test evidence found for reported command: python3 -m json.tool .adv/specs/backlog-coordination/spec.json > /dev/null && echo 'JSON valid'
- rq-backlogCoord09 contradiction (spec-as-laws): rq-backlogCoord09 asserts 'Bug Priority and feature Value remain user-owned' in body (line 370), scenario 09.1 (line 383 'before any bug Priority prompt'), and scenario 09.4 (line 422). This directly contradicts AC5 (remove user-only guardrail) and DONT7 (do not re-introduce bug-priority-is-user-only). The design's spec-delta only deletes rq-backlogCoord06 and vaguely says 'update rq-backlogCoord01-05,07-09'; it never identifies rq09's user-owned-bug-priority invariant as needing rewrite. Design MUST explicitly specify the rq-backlogCoord09 rewrite: decouple bug-Priority from the user-owned model while keeping feature-Value user-owned (features are out of the agent-driven pivot) and preserving cleanup-before-prompt ordering.
- AC11 has no design coverage and contradicts 'Files kept unchanged': AC11 requires updating backlog.ts WSJF-related comments. backlog.ts header comment (lines 13-16) cites 'rq-backlogCoord06' which AC9 deletes (dangling spec reference) and describes stripped Value(V) scoring semantics. Both design and proposal list backlog.ts under 'Files kept unchanged.' The design must add backlog.ts (comment-only edits) to its modification surface and clarify comment-only edits still respect C1 (no code/write-path removal). As written, the design is self-contradictory on this point.
- Record acceptance evidence: all AC1-AC13, C1-C6, DONT1-DONT8 traced to implementing file/test/spec edits; verdict READY. Reviewer confirmed pnpm run check green and full suite 4624/4625 (single failure pre-existing, scope-unrelated).
- When synthesizing the contract review matrix, mark AC8 and C6 with evidence_policy source_audit / not_applicable-for-automation and cite the BOOTSTRAP.md required-custom-fields table (scoring fields dropped from required set) plus the agreement's explicit 'one-time operator action, manual GH Project UI' clause.
- Do NOT attempt to fix src/tool-name-assets.test.ts (adv-coordinate.md / adv_backed_fact) — out of scope for scopeTriageBugs; surface it as a separate follow-up/bug against adv-coordinate.md tool-name hygiene.
- Before/at archive: ensure the 4 uncommitted accepted files (.opencode/command/adv-triage.md, plugin/src/tools/backlog.ts, plugin/src/tools/roadmap.ts, skills/adv-triage/SCHEMA.md) are committed to change/scopeTriageBugs. adv_change_archive stages+commits the worktree by default; verify the bundle includes them.
- Rebase/merge change/scopeTriageBugs onto current origin/trunk before PR merge (branch is behind trunk; merge-tree confirmed clean, no conflicts).
- Post-archive operator action (AC8, manual, C6): drop GH Project custom fields Value, TimeCriticality, RROE, Effort, WSJF via the GH Project UI. Record in archive notes.
- Do NOT absorb the pre-existing src/tool-name-assets.test.ts failure (adv-coordinate.md: adv_backed_fact) into this change — it is out-of-scope and unrelated. Route to a separate change per agenda ag-qfzDosa9 if desired.
- Proceed to release/archive: all 7 gate criteria for acceptance are done, contract matrix is 27/27 passing, and harden found no blockers.
