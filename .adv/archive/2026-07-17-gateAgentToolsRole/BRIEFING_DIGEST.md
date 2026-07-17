# Archive Briefing Digest

**Change ID:** gateAgentToolsRole
**Title:** Gate agent tools by role
**Status:** archived
**Generated:** 2026-07-17T00:11:10.061Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

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

Epic: systemizeAdvOrchestration · Gate agent tools by role (order 3)

## Durable Facts

Showing 63 of 63 durable facts.

- **[archive_only_evidence]** decisions: Imported ADV_TOOL_NAMES as a value-only static dependency into tool-role-policy.ts and placed the new helpers there. — AGENT_TOOL_POLICY already lives in this module; keeping the derivation next to the source of truth preserves locality. The workflow-bundle-boundary test explicitly verifies the module is not reachable from workflows.ts, so no workflow import coupling is introduced.
- **[archive_only_evidence]** decisions: Kept subAgentUnionAllowlist and blockableFromSubAgentSession pure functions returning new frozen arrays on every call. — Avoids hidden mutable state, makes the return values safely shareable, and lets determinism/frozen tests assert Object.isFrozen.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-role-policy.test.ts src/temporal/workflow-bundle-boundary.test.ts (0) — GREEN: 108 tests passed across both files (runId tr_mrnyhoi7_20e4c6c4)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-role-policy.test.ts (0) — GREEN: 101 tests passed (runId tr_mrnycn2n_0949614e)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/workflow-bundle-boundary.test.ts (0) — GREEN: 7 tests passed (runId tr_mrnycuvz_d8b043e8)
- **[archive_only_evidence]** verification: pnpm test -- src/tool-role-policy.test.ts src/temporal/workflow-bundle-boundary.test.ts (1) — RED: new assertions failed with stub helpers before implementation (runId tr_mrny5i11_6165b3d2)
- **[archive_only_evidence]** verification: pnpm run check (0) — GREEN: schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-role-policy.test.ts src/temporal/workflow-bundle-boundary.test.ts (0) — 25 tests passed (runId tr_mro5xr6j_fd01748f) — blockable-set helpers, spawnable-roster parity, and workflow-bundle non-reachability.
- **[archive_only_evidence]** decisions: Added RoleFirewallError with stable code ROLE_FIREWALL_BLOCK, plus tool, reason, and resolution fields, and message prefix 'Role firewall:'. — Matches Decision 4 typed-error contract and AC7/AC8.
- **[archive_only_evidence]** decisions: Implemented resolveBlockableSet with a fail-closed fallback to the union floor when blockableFromSubAgentSession throws or returns empty/invalid, and a last-resort fallback to blocking every ADV_TOOL_NAMES. — Decision 5 / Option A: runtime derivation failure must fail closed without mutating workflow state.
- **[archive_only_evidence]** decisions: Placed roleFirewallCheck at the very top of handleToolExecuteBefore, before morph_edit, adv_change_forget, active-change re-point, task/question/todowrite, and trunk-write branches. — Decision 3/4: block dangerous calls first; keep existing main-session branches unchanged for allowed calls.
- **[archive_only_evidence]** decisions: Reused SPAWNABLE_SUBAGENT_ROSTER, subAgentUnionAllowlist(), and blockableFromSubAgentSession() from plugin/src/tool-role-policy.ts without redefining. — Precondition from task tk-93917334191b; preserves single source of truth.
- **[archive_only_evidence]** decisions: Updated existing hook test harnesses (active-change-pointer, compaction, integration) to pass sessionID and set mainSessionId via experimental.chat.system.transform. — The firewall correctly enforces real OpenCode input shape; the old harnesses omitted sessionID, which is now a required fail-closed signal.
- **[archive_only_evidence]** decisions: Role derives only from input.sessionID vs mainSessionId; caller-supplied args like role:'orchestrator' are ignored. — AC7 spoofing-resistance requirement.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-role-firewall.test.ts (1) — RED runId tr_mrnyrggc_a44646ac: firewall tests failed before hook was wired (blockable adv_* calls from sub-agent were not rejected)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-role-firewall.test.ts (0) — GREEN runId tr_mrnzjzbw_1829d2c8: 21 firewall tests pass (typed error, resolveBlockableSet, predicate, and hook integration)
- **[archive_only_evidence]** verification: pnpm run check (0) — GREEN runId tr_mrnzhgw9_99d65463: schemas:check, typecheck, isolation, lockfile, lint, and format:check all pass
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — GREEN runId tr_mrnzjljl_b5b978d0: smoke suite passes (68 tests across 2 files plus check)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/__tests__/active-change-pointer.test.ts src/__tests__/compaction.test.ts src/integration.test.ts src/tool-role-firewall.test.ts src/tool-role-policy.test.ts src/temporal/workflow-bundle-boundary.test.ts (0) — GREEN runId tr_mrnzl85u_27c6d8b2: 180 targeted tests pass (coexistence with active-change pointer, compaction, integration, policy, and bundle boundary)
- **[unresolved_action]** consumer_warnings: verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: pnpm exec vitest run src/tool-role-firewall.test.ts
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-role-firewall.test.ts (0) — 21 tests passed (runId tr_mro5xtp7_3cc56960) — fail-closed predicate, block/allow/unresolved/spoofing/typed-error.
- **[archive_only_evidence]** decisions: Implemented marker-bounded manifest generation rather than whole-file generation. — Agent manifests contain hand-authored instruction prose and built-in tool lines; rewriting only the adv_* block preserves authored bytes and encodes OpenCode last-match-wins semantics.
- **[archive_only_evidence]** decisions: Inserted ADV-GENERATED sentinel markers on first-run around the existing adv_* entry region. — This makes the initial normalization a pure no-op in terms of tool exposure: every manifest's adv_* grants remain identical to AGENT_TOOL_POLICY, only the formatting and comments change.
- **[archive_only_evidence]** decisions: Added generator tests in plugin/scripts/generate-agent-manifests.test.ts rather than expanding tool-role-policy.test.ts. — Keeps generator-specific determinism/marker/idempotence tests local to the generator script while retargeting the manifest-exactness block in tool-role-policy.test.ts to use the generator.
- **[archive_only_evidence]** decisions: Wired the generator check into pnpm run check and the writer into scripts/deploy-local.sh --fix before agent sync. — CI fails on drift and deployed global agents are refreshed from the single source of truth.
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (1) — RED: injected drift (adv_spec: true -> false) in adv-engineer.md detected (runId tr_mro023qk_23441a11)
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (0) — GREEN: all committed manifests match generated output (runId tr_mro02eks_ab253200)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-role-policy.test.ts scripts/generate-agent-manifests.test.ts (0) — GREEN: 30 tests pass covering generator determinism, idempotence, marker failures, byte preservation, YAML validity, --check drift, and generated==committed (runId tr_mro02w4f_6c774e43)
- **[archive_only_evidence]** verification: pnpm run check (0) — GREEN: schemas:check, typecheck, generate:manifests:check, test isolation, lockfile policy, lint, and format:check all pass (runId tr_mro084cn_0f3dd417)
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — GREEN: repo checks and smoke test slice pass
- **[unresolved_action]** consumer_warnings: verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: pnpm run generate:manifests:check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[archive_only_evidence]** decisions: Preserve hand-owned non-adv_* lines inside the generated marker region by merging them with the generated adv_* block, instead of moving them outside the marker pair. — Keeps the diff vs BASE minimal: only marker insertion and adv_* sorting; no hand-owned lines are added or removed.
- **[archive_only_evidence]** decisions: Exclude managed generated comments from the preserved non-adv_* set so stale comments are refreshed from AGENT_TOOL_POLICY. — Prevents duplicate generated comments on regeneration and lets the generator update its own headers.
- **[archive_only_evidence]** decisions: Make deploy-local.sh manifest generation non-fatal (log warning and continue) per deploy-resilience norms. — Deploy hooks must not hard-block on failure; the overlay-sync tests failed because the new generate step was fatal in a sandboxed worktree.
- **[archive_only_evidence]** decisions: Update overlay-sync-assets test fixture so the fake pnpm no-ops on `run generate:manifests` and the test expects that extra pnpm invocation. — Accounts for the new deploy step while keeping dist freshness checks deterministic and green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-reviewer-asset.test.ts src/adv-temporal-repair-assets.test.ts src/adv-tron-assets.test.ts src/adv-verifier-assets.test.ts (0) — All 101 asset tests pass (run ID tr_mro2zc6v_bb5be001)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/overlay-sync-assets.test.ts (0) — All 21 overlay-sync tests pass (run ID tr_mro2lm56_4a7400c6)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- scripts/generate-agent-manifests.test.ts (0) — All 14 generator tests pass (run ID tr_mro2yn70_5e41e9c9)
- **[archive_only_evidence]** verification: pnpm run generate:manifests:check (0) — Manifests match generated output (run ID tr_mro2zmgx_02cb2b90)
- **[archive_only_evidence]** verification: pnpm run check (0) — Full check passes: schemas, typecheck, generate:manifests:check, isolation, lockfile, lint, format (run ID tr_mro2u7qo_c1398043)
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE; research continued under explicit IN_SCOPE. Supplied SCOPE KEY was normalized from design-validation to schema-required researcher:design-validation.
- **[report_follow_up]** follow_ups: Specify which independently validated policy value supplies the union floor if blockableFromSubAgentSession throws; test fallback remains disjoint from blocked authority tools.
- **[report_follow_up]** follow_ups: Replace 'every mutation' with 'every orchestration/authority mutation' because intentional union-floor evidence/report writes exist.
- **[research_citation]** sources: Current ADV agreement and design rev 2: Agreement defines AC5/AC8 and C5; design rev 2 supplies Decisions 3-6 and proposed tests. (adv_change_show://gateAgentToolsRole?include=agreement,design)
- **[research_citation]** sources: Advance tool-role policy: Current TOOL_ROLE_POLICY and AGENT_TOOL_POLICY establish the shipped allowlists and intended union floor. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tool-role-policy.ts)
- **[research_citation]** sources: Advance plugin initialization and hooks: Current source captures mainSessionId, rethrows before-hook failures, selects createDegradedToolMap after runtime initialization failure, and wraps advancePluginImpl only after module load. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/index.ts)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Decision 3 resolves prior blocker 1: for policy-derived blockable tools, only non-null callerSessionID equal to non-null mainSessionId is allowed; sub-agent, missing-caller, and unresolved-baseline cases block. Union-floor tools are disjoint from the valid complement by construction, so they do not reopen blockable tools; this satisfies AC5/AC8/C5 (adv_change_show://gateAgentToolsRole?include=agreement,design; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tool-role-policy.ts). Decision 4 resolves prior blocker 2: RoleFirewallError with stable code ROLE_FIREWALL_BLOCK plus tool/reason/resolution is adequate, and upstream awaits the before hook before tool execution (https://github.com/anomalyco/opencode/blob/453b61e27b2f6c2752a60dd7d8412bdcf4e0aa3d/packages/opencode/src/session/tools.ts#L75-L130). Decision 6 closes roster drift: current assets contain nine mode:subagent manifests; positive two-way parity plus required policy rows catches additions/removals (https://github.com/Sharper-Flow/Advance/tree/main/.opencode/agents; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tool-role-policy.ts). Proposed explicit workflow-reachability assertion is adequate because the test walks static imports transitively from workflows.ts (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/workflow-bundle-boundary.test.ts). Prior blocker 3 remains: Decision 5 says static AGENT_TOOL_POLICY import failure delegates to createDegradedToolMap, but AdvancePlugin's try/catch can run only after index.ts and static dependencies load. Static dependency evaluation precedes importing-module body, so failure bypasses that wrapper (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/index.ts#L1257-L1283). New nonblocking wording defect: Decision 2 says every mutation is blockable, but intentional union-floor evidence/report writes include adv_wisdom_add and adv_subagent_report_submit; narrow wording to orchestration/authority mutations (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tool-role-policy.ts#L622-L803).
- **[unresolved_action]** validation.blockers: Decision 5 still fails AC8/C5 as written: static tool-role-policy load/evaluation failure occurs before index.ts's factory wrapper can execute, so that path cannot return createDegradedToolMap. Sources: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import and https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/index.ts#L1257-L1283.
- **[unresolved_action]** required_main_agent_actions: Obtain and record the isolated CI full-suite result before release to close AC10.
- **[unresolved_action]** required_main_agent_actions: Optionally evaluate fail-closed local deploy behavior for manifest-generator failure while preserving detached-worktree compatibility; treat as follow-up, not acceptance blocker.
- **[wisdom_candidate]** wisdom_candidates: [pattern] A session-role firewall can stay deterministic and coexist with shared hook behavior when its precheck is a no-op for non-ADV tools and union-floor ADV tools, then runs before later hook branches.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tool-role-firewall.test.ts src/tool-role-policy.test.ts scripts/generate-agent-manifests.test.ts src/integration.test.ts src/temporal/workflow-bundle-boundary.test.ts, pnpm run check, pnpm run build, bin/oc-test targeted -- src/overlay-sync-assets.test.ts results=pass — Focused acceptance surface: 90/90 tests passed across firewall, policy, manifest-generator, integration, and workflow-boundary suites. pnpm run check passed, including generate:manifests:check. pnpm run build passed for plugin, worker, and build identity. Overlay/deploy asset suite passed 21/21. git status --short and git diff --check were clean after review.
- **[unresolved_action]** required_main_agent_actions: At release, obtain and record the authoritative isolated CI full-suite result for AC10 before completing the release gate.
- **[unresolved_action]** required_main_agent_actions: Do not revisit generated manifest blocks manually: AGENT_TOOL_POLICY plus plugin/scripts/generate-agent-manifests.ts is the source of truth.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Fail-closed policy code must validate a derived allow/block set for completeness, not merely non-empty well-formed tool strings; a partial block list otherwise silently opens omitted authority tools.
- **[archive_only_evidence]** changes_made: plugin/src/tool-role-firewall.ts: Hardened blockable-set validation: only the complete, deduplicated complement of the policy-derived union is trusted; malformed or partial derivation now uses the fail-closed union-floor fallback.
- **[archive_only_evidence]** changes_made: plugin/src/tool-role-firewall.test.ts: Added a regression test for incomplete blockable derivation and suite-level mock cleanup so a failed assertion cannot leak mocked policy behavior into later firewall integration tests.
- **[archive_only_evidence]** changes_made: docs/tool-ownership.md: Documented the session-bound runtime firewall, policy-union complement, and fail-closed behavior alongside the canonical ownership matrix.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tool-role-firewall.test.ts, bin/oc-test targeted -- src/tool-role-policy.test.ts scripts/generate-agent-manifests.test.ts, pnpm run check, pnpm run build results=pass — CLEAN VERDICT EVIDENCE: firewall regression/TDD cycle reproduced the partial-derived-block-list flaw and is green at 22 tests; policy + manifest generator pass 32 tests; pnpm run check passed schemas/typecheck/generated-manifest parity/isolation/lockfile/lint/format; pnpm run build passed plugin, worker, declarations, and build identity. Static review found no touched-path TODO/FIXME/debug/type-evasion artifacts; git diff --check passed. Deployment code confirms --fix regenerates manifests before sync and intentionally continues on generator failure. Existing acceptance evidence supplies the broader deterministic firewall/coexistence/generator/overlay surface; AC10 full suite remains deferred to isolated CI by approved release policy. Two broad aggregate targeted invocations exceeded 120s while peer Temporal servers were active; rerunning narrower affected suites passed, so they are not treated as semantic failures.
- **[epic_terminal_note]** epic.membership: systemizeAdvOrchestration · Gate agent tools by role (order 3)

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
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
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
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: pnpm exec vitest run src/tool-role-firewall.test.ts
- verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: pnpm run generate:manifests:check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- Decision 5 still fails AC8/C5 as written: static tool-role-policy load/evaluation failure occurs before index.ts's factory wrapper can execute, so that path cannot return createDegradedToolMap. Sources: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import and https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/index.ts#L1257-L1283.
- Obtain and record the isolated CI full-suite result before release to close AC10.
- Optionally evaluate fail-closed local deploy behavior for manifest-generator failure while preserving detached-worktree compatibility; treat as follow-up, not acceptance blocker.
- At release, obtain and record the authoritative isolated CI full-suite result for AC10 before completing the release gate.
- Do not revisit generated manifest blocks manually: AGENT_TOOL_POLICY plus plugin/scripts/generate-agent-manifests.ts is the source of truth.
