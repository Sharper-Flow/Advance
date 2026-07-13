# Archive Briefing Digest

**Change ID:** addArchiveDeployCallout
**Title:** Add archive deploy callout
**Status:** archived
**Generated:** 2026-07-10T23:39:43.437Z

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

Showing 81 of 81 durable facts.

- **[archive_only_evidence]** decisions: Inserted the local runtime activation guidance as a blockquote callout under the existing Step 5.0 numbered gate list instead of rewriting the gate steps. — Preserves every existing assertion (Deploy visibility heading, deploy-local.sh" --fix, nonblocking advisory, Phase 8 footer lines) while adding the build→deploy→restart steps; wording mirrors the AGENTS.md Source-vs-Dist Reload Gotcha so the command and dev docs agree.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (1) — RED: new 'adv-archive.md Local Deploy Gate includes local runtime activation callout' test fails — 'expected ... to match /pnpm run build/' (runId tr_mrfhskk1_ce0e5d19; named run tr_mrfht415_f796b2d0 also fails). Proves pre-edit Step 5.0 lacked the build/deploy-from-root/restart/reload-proof callout.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (0) — GREEN: 32 passed (32) — new callout test plus existing local-deploy evidence test both pass (runId tr_mrfhuizp_0ba70c2f).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[archive_only_evidence]** changes_made: .opencode/command/adv-archive.md: Named the standalone Temporal worker process in local-runtime restart guidance and changed Phase 8 activation wording to append an advisory line to the existing report.
- **[archive_only_evidence]** changes_made: plugin/src/adv-autonomy-quality-assets.test.ts: Restored case-insensitive finalization-report regex and added assertions for worker-process and advisory-line guidance.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin test -- src/adv-autonomy-quality-assets.test.ts, git diff --check results=pass — Focused asset suite exited 0 (84.9s); git diff --check emitted no errors. Related scan found the finalization regex only in the updated asset assertion and no stale Phase 8 activation-status wording.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin test -- src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check
- **[agenda]** follow_ups: Extend docs/command-voice-standard.md (lines 356, 384) `Local deploy` row with `ran; OpenCode activation pending restart` for consistency with adv-archive.md, in a separate scope.
- **[archive_only_evidence]** decisions: Made `./scripts/deploy-local.sh --fix` from the repo root the single primary deploy in the callout and stated it rebuilds a stale distribution before sync; dropped the separate manual `pnpm run build` step. — AC1 + deploy-local.sh:233-259 (ensure_plugin_dist_fresh) already rebuilds stale dist before sync, so a separate manual build step was inaccurate and redundant.
- **[archive_only_evidence]** decisions: Documented that the same command attempts the deployed-worker SIGTERM bounce automatically, forbade manual worker termination, and routed a failed bounce to `adv_temporal_worker_restart`. — AC2 + deploy-local.sh:1169-1233 (refresh_deployed_temporal_workers) bounces workers automatically; manual termination contradicts the tool and temporal-recovery.md (C3).
- **[archive_only_evidence]** decisions: Kept OpenCode session/plugin-host restart plus tool re-invocation and added an explicit `does not auto-restart or live-reload` denial. — AC3 + temporal-recovery.md:570-586 and AGENTS.md:89-104 require restart + re-invoke for host-loaded tool code; no auto-reload exists.
- **[archive_only_evidence]** decisions: Extended the existing Phase 8 `Local deploy` row with `ran; OpenCode activation pending restart` (no new row) and aligned the release-evidence asset assertion to the extended row. — AC4 single-row constraint; AC5 requires the test to fail if the state disappears.
- **[archive_only_evidence]** decisions: Did NOT edit docs/command-voice-standard.md (lines 356/384), which also carries the base `Local deploy` row. — Out of scope (TASK_SCOPE: correct only the archive activation documentation and its static asset regression test); surfaced as a follow-up for the orchestrator.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: adv-archive.md Phase 8 now extends the Local deploy row with an activation-pending state, but the Gate Handoff Voice spine reference (docs/command-voice-standard.md, lines 356 and 384) still lists only the base value set. Editing it is outside this task's scope; no test couples the voice-standard row, so verification is unaffected.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (1) — RED (phase red): focused asset test failed against the pre-fix callout/row as expected — new behavior-level assertions (rebuild-before-sync, automatic worker bounce, no manual termination, adv_temporal_worker_restart, no-auto-restart, extended Phase 8 state) did not match the old text.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (0) — GREEN (phase green): 32/32 tests passed after the docs/test correction.
- **[archive_only_evidence]** verification: git diff --check (0) — Clean: no whitespace errors in the diff.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check
- **[agenda]** follow_ups: Extend docs/command-voice-standard.md (lines 356, 384) `Local deploy` row with `ran; OpenCode activation pending restart` for consistency with adv-archive.md, in a separate scope.
- **[archive_only_evidence]** decisions: Replaced the callout's `append an activation advisory line to the existing Phase 8 report` guidance with existing-row-only activation reporting. — AC4 forbids an unstructured appended line and requires activation status to flow through the existing `Local deploy` field; the attempt-1 sentence contradicted that.
- **[archive_only_evidence]** decisions: New callout wording directs: when `deploy_action: ran` is recorded but the rebuilt bundle is not yet loaded by a restarted host, set the existing `Local deploy` field to `ran; OpenCode activation pending restart`; do not append a separate activation line. — Keeps AC4 single-row semantics, preserves the `ran; OpenCode activation pending restart` state, and makes the no-appended-line constraint explicit.
- **[archive_only_evidence]** decisions: Asset test now asserts `activation ... through the existing Phase 8 `Local deploy` row` and `not.toMatch(/append an activation advisory line/i)`; kept the `Deploy completion is not reload proof` assertion. — RED fails while the contradictory phrase remains; GREEN passes once reporting is routed through the existing row (AC4/AC5).
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: adv-archive.md Phase 8 extends the Local deploy row with an activation-pending state, while docs/command-voice-standard.md (lines 356/384) still lists only the base value set. Editing it is outside this task's scope; no test couples the voice-standard row, so verification is unaffected.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (1) — RED (phase red, runId tr_mrfjxkd3_f6857dff): test failed while `append an activation advisory line` remained and existing-row routing was absent.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (0) — GREEN (phase green, runId tr_mrfjycml_b05f78f9): 32/32 tests passed after routing activation reporting through the existing Local deploy row and removing the advisory-line guidance.
- **[archive_only_evidence]** verification: git diff --check (0) — Clean: no whitespace errors; only the two in-scope files modified.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check
- **[wisdom_candidate]** wisdom_candidates: [convention] Archive activation guidance should distinguish asset sync, automatic deployed-worker bounce, and host-module reload; regression tests should assert both required statements and prohibited legacy advisory wording.
- **[archive_only_evidence]** verification: tests_run=git diff --check trunk...HEAD, bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts results=pass — Diff is limited to the scoped archive command and asset test and passes whitespace checks. Source inspection confirms stale dist rebuild before sync (scripts/deploy-local.sh:233-259), automatic SIGTERM worker bounce after sync (scripts/deploy-local.sh:1169-1233, 1261-1271), and host restart/re-invocation boundary (docs/temporal-recovery.md:570-586; AGENTS.md:89-104). Targeted Vitest passed: 1 file, 32/32 tests, exit 0.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check trunk...HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[wisdom_candidate]** wisdom_candidates: [convention] When archive Phase 8 gains a Local deploy status, keep both Shipped and Merged locally terminal-template enumerations synchronized and protect each with bounded static coverage.
- **[archive_only_evidence]** changes_made: docs/command-voice-standard.md: Retained approved mirror update: Shipped and Merged locally `Local deploy` enumerations now include `ran; OpenCode activation pending restart`.
- **[archive_only_evidence]** changes_made: plugin/src/adv-autonomy-quality-assets.test.ts: Retained focused static regression test checking both bounded terminal templates contain the activation-pending deploy value.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts, git diff --check results=pass — Retained prior GREEN evidence: focused asset suite passed 33 tests with exit 0. Current attempt rechecked `git diff --check`: exit 0, no output. Current diff is limited to the two approved documentation rows and their focused regression assertion.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** required_main_agent_actions: Do not revisit the spec-enumeration finding within this task; route it through a separate scope decision if needed.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Archive-report grammar assertions must enumerate activation-state variants when a deploy completes but the running OpenCode host still requires restart.
- **[archive_only_evidence]** changes_made: plugin/src/workflow-noise-reduction-assets.test.ts: Extended the Local deploy report grammar assertion with the approved `ran; OpenCode activation pending restart` alternative.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/workflow-noise-reduction-assets.test.ts, git diff --check results=pass — adv_run_test `tr_mrfkk1qc_27372a66` exited 0 (14/14 tests passed). `git diff --check` exited 0 with no output.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/workflow-noise-reduction-assets.test.ts
- **[wisdom_candidate]** wisdom_candidates: [convention] When archive reporting adds a bounded Local deploy activation state, synchronize both terminal templates and every static grammar assertion before release hardening.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts, bin/oc-test targeted -- src/workflow-noise-reduction-assets.test.ts, /usr/bin/git diff --check origin/trunk...HEAD, /usr/bin/git merge-base --is-ancestor origin/trunk HEAD results=pass — Current focused checks passed: archive autonomy 33/33 via tr_mrfkre3d_77ce4923 and workflow-noise 14/14 via tr_mrfkrimk_3e38c301. Current worktree is clean; diff check passed; origin/trunk is an ancestor of HEAD. Reviewed current four-file diff: Step 5.0 matches AC1–AC3, existing Phase 8 Local deploy row and both terminal templates match AC4, behavior-level regression coverage matches AC5, and no C1–C3 violation is present. Durable task evidence records stale workflow-noise assertion fixed and spec enumeration explicitly split to updateArchiveVisibilitySpec after user selection.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/workflow-noise-reduction-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: /usr/bin/git diff --check origin/trunk...HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: /usr/bin/git merge-base --is-ancestor origin/trunk HEAD
- **[agenda]** follow_ups: Prep should reconcile the proposal's `pnpm --dir plugin run build` against canonical AGENTS.md `pnpm run build` (from plugin/) and pick the canonical form.
- **[agenda]** follow_ups: Confirm with operator whether the callout must be durable spec law (extend spec.json:934-959) or instruction-only; default recommendation is instruction-only.
- **[archive_only_evidence]** sources: Archive command — Step 5.0 Local Deploy Gate (canonical instruction surface): Step 5.0 already runs `"$MAIN/scripts/deploy-local.sh" --fix` and records deploy_action ran/failed/not available/not needed. GAP: it does NOT mention (a) prerequisite plugin build, nor (b) session/worker restart before runtime activation. Minimal canonical location for the callout.
- **[archive_only_evidence]** sources: Best existing asset-test anchor for deploy-gate wording: Test 'adv-archive.md surfaces local deploy as visible release evidence' already asserts /Step 5\.0: Local Deploy Gate/, deploy-local.sh --fix, Deploy visibility. Correct anchor to extend with build + restart assertions — no new test file needed.
- **[archive_only_evidence]** sources: Deploy-worker-bounce spec law (restart semantics already in law for the script): rq-deployWorkerBounce01 [MUST]: deploy-local.sh SIGTERM-bounces exact-path dist/temporal/worker.js workers; on failure exits non-zero and prints multi-line [ADV:ACTION_REQUIRED] block with worker path, PID evidence, restart/session instructions. Worker restart already spec-governed at SCRIPT layer; archive callout gap is operator-facing session-restart wording, not script behavior.
- **[archive_only_evidence]** sources: Deploy-worker-bounce test coverage: Existing tests assert [ADV:ACTION_REQUIRED], SIGTERM, and rq-deployWorkerBounce01/02 scenario counts. Restart semantics structurally enforced; no change needed there for a docs-only callout.
- **[archive_only_evidence]** sources: Canonical build + deploy + restart command spelling (source of truth): Canonical 4-step: (1) `pnpm run build` from plugin/ [NOT `pnpm --dir plugin run build` as proposal states], (2) `./scripts/deploy-local.sh --fix`, (3) Restart the OpenCode session (or restart the plugin host), (4) re-invoke. Build command must be cited as run from plugin/.
- **[archive_only_evidence]** sources: Release finalization spec law (does NOT own the callout wording): rq-releaseFinalization01 governs Phase 9 merge/push proof (origin/{default-branch} reachability or merged PR), Shipped./Merged locally./Pending auto-merge./Blocked. terminals. Does NOT mandate build/deploy/restart callout wording. Wrong domain for this change.
- **[archive_only_evidence]** sources: Archive advisory-visibility spec law (closest workflow-law home if Modify is chosen): Workflow requirement governing /adv-archive terminal output already mandates deploy status be 'shown as ran, not available, not needed, or failed with reason and nonblocking marker'. A restart/build callout extends this same requirement minimally, IF spec-law Modify is warranted.
- **[archive_only_evidence]** architecture_assessment: Proposal user outcome (operators get explicit post-archive build/deploy/restart checklist; runtime never silently lags archived source) is best satisfied by a DOCS-ONLY extension of the EXISTING Step 5.0 Local Deploy Gate in .opencode/command/adv-archive.md plus the matching assertion extension in plugin/src/adv-autonomy-quality-assets.test.ts. Two of the three required behaviors are already law/structure: (1) worker restart is enforced by rq-deployWorkerBounce01 at the deploy-local.sh layer (SIGTERM + [ADV:ACTION_REQUIRED] on failure); (2) deploy visibility is required by the workflow archive-advisory requirement. Genuine gap = operator-facing wording: Step 5.0 says '--fix' but never states build is a prerequisite or that active OpenCode sessions/plugin host must restart before the new bundle loads (Source-vs-Dist reload gotcha). Note: proposal cites `pnpm --dir plugin run build`; canonical AGENTS.md spelling is `pnpm run build` from plugin/. Callout should cite the canonical sequence to avoid a divergent command form.
- **[archive_only_evidence]** verification: tests_run=git diff --check origin/trunk...HEAD, bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts results=pass — Two-file diff is whitespace-clean. Targeted asset suite passed: 1 file, 32 tests. Callout documents canonical build → sync → restart commands, explicitly denies automatic/live reload, and test assertions cover each required callout phrase; removal of the callout would fail those assertions. Diff changes only archive command guidance and its asset test, with no spec/law or runtime implementation change.
- **[agenda]** follow_ups: Editorial: consider conditioning the 'OpenCode activation pending restart' suffix on host-loaded tool-code touch (plugin/src/tools/*.ts) so asset/spec-only archives report plain 'ran'.
- **[agenda]** follow_ups: When implementing, cross-link the extended Step 5.0 callout to docs/temporal-recovery.md:582 reload matrix so the restart boundary stays single-sourced.
- **[archive_only_evidence]** sources: deploy-local.sh ensure_plugin_dist_fresh: ensure_plugin_dist_fresh detects stale dist via plugin_dist_stale_reason, rebuilds with `pnpm run build`, and hard-exits (exit 1) if build fails or dist still stale. Confirms --fix rebuilds stale dist as primary deploy path.
- **[archive_only_evidence]** sources: deploy-local.sh runtime sync + worker refresh call site: In fix mode: ensure_plugin_dist_fresh runs, rsync -a --delete syncs source plugin to ADV_RUNTIME_PLUGIN_PATH, then refresh_deployed_temporal_workers 'after-sync' runs. Confirms --fix both syncs runtime assets AND attempts worker bounce automatically.
- **[archive_only_evidence]** sources: deploy-local.sh refresh_deployed_temporal_workers: after-sync mode: enumerates matching deployed worker.js PIDs via /proc, sends SIGTERM, waits 2s grace, and on failed bounce (survivors/kill failures) calls print_worker_action_required and returns 1. Confirms automatic bounce attempt + failure surfacing; no manual worker termination required in the happy path.
- **[archive_only_evidence]** sources: docs/temporal-recovery.md external restart boundary + reload matrix: Canonical reload matrix: plugin/src/tools/*.ts tool code requires `pnpm run build` + OpenCode restart; adv_temporal_worker_restart does NOT reload host-loaded tool modules. Confirms restart-required boundary for host-loaded tool code and the worker-restart limitation.
- **[archive_only_evidence]** sources: AGENTS.md Source-vs-Dist Reload Gotcha: OpenCode caches deployed dist/index.js in process memory; source edits require build + deploy-local.sh --fix + session/plugin-host restart + affected-tool re-invocation to take effect on live tool calls. Confirms restart + re-invocation requirement before claiming host-loaded tool code active.
- **[archive_only_evidence]** sources: adv-archive.md Phase 8 report template Local deploy row: Existing Phase 8 report has a single `Local deploy: {ran | not available | not needed | failed: <reason>; nonblocking}` row. Confirms design intent to extend this existing state rather than add a new report row.
- **[archive_only_evidence]** sources: adv-archive.md Step 5.0 Local Deploy Gate: Step 5.0 already requires clean main, runs deploy-local.sh --fix, records deploy_action ran/failed (nonblocking advisory). Confirms Step 5.0 is the correct insertion point and that --fix is already the invoked command.
- **[archive_only_evidence]** sources: change/recovery.ts host-loaded reload guidance: Runtime recovery guidance already states 'Restart OpenCode for plugin tool-code drift; worker restart does not reload plugin/src/tools/*.ts.' Confirms the failed-bounce → worker-restart routing plus restart-for-tool-code boundary is consistent with existing runtime prose.
- **[archive_only_evidence]** architecture_assessment: Every proposed-design claim is directly backed by current repository sources with zero contradictions. (1) deploy-local.sh --fix IS the correct primary deploy command: ensure_plugin_dist_fresh (scripts/deploy-local.sh:233-259) rebuilds stale dist and hard-fails on build error; the fix-mode call site (1261-1271) syncs runtime assets via rsync. (2) --fix DOES attempt to bounce matching deployed Temporal workers automatically (refresh_deployed_temporal_workers 'after-sync', 1169-1233 → SIGTERM + 2s grace), so requiring manual worker termination would be redundant; on failed bounce the script surfaces action-required, and routing to adv_temporal_worker_restart is the documented recovery for wedged/exhausted workers (temporal-recovery.md:584). (3) The restart-before-active requirement is canonical: AGENTS.md:89-104 and temporal-recovery.md:582 both state host-loaded tool code (plugin/src/tools/*.ts) needs an OpenCode session/plugin-host restart + tool re-invocation and that worker restart does NOT reload it — recovery.ts:49 repeats this. (4) Extending the existing single Local deploy row (adv-archive.md:228) rather than adding a report row matches the current template shape. (5) Keeping docs/temporal-recovery.md as the canonical external-restart boundary with no runtime/tool/spec behavior change is consistent — the design is documentation-only guidance layered over unchanged runtime behavior. The proposed 'ran; OpenCode activation pending restart' state is a strict, accurate refinement of the existing 'ran' terminal that closes a real correctness gap: 'ran' alone implies activation, but host-loaded tool code is not live until restart.
- **[agenda]** follow_ups: Fast-follow child updateArchiveVisibilitySpec owns rq-archiveVisibility01.1 enumeration alignment and generated spec projection; it does not block this parent release.
- **[archive_only_evidence]** findings: [info] documentation_hygiene: Resolved stale workflow-noise-reduction asset assertion now includes `ran; OpenCode activation pending restart`; GREEN 14/14 recorded as tr_mrfkkxsz_dadc5951.
- **[archive_only_evidence]** findings: [info] documentation_hygiene: Spec enumeration alignment is intentionally split to child change updateArchiveVisibilitySpec after user-selected Split follow-up; parent retains no spec-file changes per C2.
- **[archive_only_evidence]** findings: [info] test_coverage: Current changed command and terminal templates have static regression coverage; focused suites pass 33/33 and 14/14.
- **[archive_only_evidence]** findings: [info] cleanup: No temp, marked, debug, dead-import, orphan-test, or dev-directory cleanup candidates.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin test -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: git diff --check
- finish_owned_scope_then_report: adv-archive.md Phase 8 now extends the Local deploy row with an activation-pending state, but the Gate Handoff Voice spine reference (docs/command-voice-standard.md, lines 356 and 384) still lists only the base value set. Editing it is outside this task's scope; no test couples the voice-standard row, so verification is unaffected.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: git diff --check
- finish_owned_scope_then_report: adv-archive.md Phase 8 extends the Local deploy row with an activation-pending state, while docs/command-voice-standard.md (lines 356/384) still lists only the base value set. Editing it is outside this task's scope; no test couples the voice-standard row, so verification is unaffected.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: git diff --check
- verification_missing: No adv_run_test evidence found for reported command: git diff --check trunk...HEAD
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- Do not revisit the spec-enumeration finding within this task; route it through a separate scope decision if needed.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/workflow-noise-reduction-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/workflow-noise-reduction-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: /usr/bin/git diff --check origin/trunk...HEAD
- verification_missing: No adv_run_test evidence found for reported command: /usr/bin/git merge-base --is-ancestor origin/trunk HEAD
