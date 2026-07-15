# Archive Briefing Digest

**Change ID:** updateCodemodeMcpContracts
**Title:** Update CodeMode MCP contracts
**Status:** archived
**Generated:** 2026-07-15T17:59:46.438Z

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

Showing 100 of 113 durable facts (13 omitted).

- **[report_follow_up]** follow_ups: First `bin/oc-test full` run showed 3 timing-flaky failures in src/tools/worktree/index-delete.test.ts (delete time budget exhausted under throttle load); passed on two full-suite reruns and standalone. Unrelated to this change (no worktree code touched) but worth tracking if it recurs.
- **[report_follow_up]** follow_ups: Literal DONE_WHEN command form `bin/oc-test targeted -- plugin/src/tool-name-assets.test.ts` matches no files because oc-test runs vitest with plugin cwd; plugin-relative form `bin/oc-test targeted -- src/tool-name-assets.test.ts` is required. Runtime-matrix task tk-28cdd4fde0c4 should use the plugin-relative form.
- **[archive_only_evidence]** decisions: Canonical contract text (305 UTF-8 bytes) defined once in plugin/src/prompt-corpus.ts and carried verbatim by prompt assets; tests count exact occurrences — Single source of truth lets structural tests enforce exactly-once-per-effective-prompt without duplicating the string in test logic
- **[archive_only_evidence]** decisions: Effective-prompt model mirrors deploy apply_overlay_block semantics: build/plan = base file with ADV_SYNC region replaced by overlay source; general = overlay-only surface (host agent not repo-controlled) so the contract rides the overlay; adv-ci-waiter (no external MCP grants) carries zero contracts — Tests must assert against what deploy actually assembles, not repo file bytes; overlay-only surfaces are the sole Advance-authored surface for shared agents
- **[archive_only_evidence]** decisions: Frozen baseline stores per-prompt byte counts + sorted frontmatter grant sets, not full prompt content — Deterministic byte-budget (AC6) and permission-key-exact (DONE_WHEN) checks without 180KB of brittle full-text fixtures that would fail on any legitimate future prose edit
- **[archive_only_evidence]** decisions: Concrete spellings replaced with provider/capability wording across commands/skills/references; config citations preserved structurally as `key: true` backtick spans (SETUP.md Firecrawl grant list normalized to that shape) — DDC4 allows naming providers/capabilities but not unconditional concrete callable syntax; frontmatter/config keys must remain exact and structurally distinguishable from invocation prose
- **[archive_only_evidence]** decisions: Synced stale inline ADV_SYNC blocks in build.md/plan.md to canonical overlay sources (pre-existing drift) and added a parity test — AC7 requires canonical prompts and overlays synchronized; deploy replaces the region anyway, so effective-prompt byte deltas stayed within budget (build +135, plan +133)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-name-assets.test.ts (adv_run_test phase=red, runId tr_mrm576um_f1c2a925) (1) — RED: 3 intended failures — contract missing from applicable effective prompts, 173 one-mode/concrete-spelling offenders, build/plan overlay drift; 10 passed
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tool-name-assets.test.ts (adv_run_test phase=green, runId tr_mrm5gguv_8fb049d1) (0) — GREEN: 13/13 pass — corpus ownership, frontmatter separation, frozen baseline, exactly-one contract, 400-byte budget, no one-mode claims, no catalog duplication, exact permission keys, overlay parity
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tool-name-assets.test.ts (0) — 13/13 pass through repo test throttle (oc-test-gate). Note: plugin-relative path required; literal 'plugin/src/...' form matches no files under plugin cwd
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Full plugin suite 5273/5273 pass (356 files) on two consecutive runs; first run had 3 timing-flaky worktree-delete failures that pass standalone and on rerun — unrelated to prompt prose
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit && pnpm exec eslint src/prompt-corpus.ts src/tool-name-assets.test.ts && pnpm exec prettier --check src/ (0) — Typecheck, lint, and format checks all clean
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tool-name-assets.test.ts (adv_run_test phase=red, runId tr_mrm576um_f1c2a925)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tool-name-assets.test.ts (adv_run_test phase=green, runId tr_mrm5gguv_8fb049d1)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tool-name-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit && pnpm exec eslint src/prompt-corpus.ts src/tool-name-assets.test.ts && pnpm exec prettier --check src/
- **[report_follow_up]** follow_ups: Optional future evidence layer: a true orchestrator-spawned researcher probe (adv -> task tool -> adv-researcher) once a bounded way to capture child-session JSON events exists; current row-2 evidence is researcher-artifact live run + structuralized discovery observation.
- **[report_follow_up]** follow_ups: Infrastructure note (not this change): adv_task_show/adv_run_test on the default store cannot resolve this worktree's change/tasks (WorkflowNotFoundError); target_path routing with target_confirmed works. Same symptom prior engineer hit on tk-f8ef0c8aef3b.
- **[archive_only_evidence]** decisions: Pure routing model (resolveInvocation) keyed on machine-observed surface {executeExposed, catalog, directCallables} with unavailable verdict when neither exposes the capability — C3: correctness follows actually exposed capabilities, never environment flags or prose; gives every mandatory row deterministic row-selection proof without model-output heuristics
- **[archive_only_evidence]** decisions: Live evidence committed as bounded supplemental fixture (500-char excerpt cap); deterministic suite validates schema, exact observed invocations on pass, non-empty reason on skip, and FAILS the suite on any committed fail entry — Requirements: live probes are supplemental evidence, CI must not depend on network/model; fail-loud semantics prevent silently committing a real contract violation
- **[archive_only_evidence]** decisions: Row 2 (adv-researcher is hidden subagent) probed via verbatim worktree artifact with only the frontmatter mode bit promoted to primary; contract prose byte-identical — opencode run --agent refuses hidden subagents; the true spawned path was already observed in discovery and is structuralized verbatim in the static fixture, so the live probe confirms the researcher artifact's invocation behavior without orchestration variance
- **[archive_only_evidence]** decisions: Row 3 probe uses `env -u OPENCODE_EXPERIMENTAL_CODE_MODE OC_DISABLE_CODE_MODE=1 oc run` — Known toolbox defect: OC_DISABLE_CODE_MODE=1 alone cannot clear inherited CodeMode state until fixCodemodeDisableOverride ships (AC8, owned by tk-7bd956c74bf5); explicit unset is the documented discovery workaround and proves direct-mode routing today
- **[archive_only_evidence]** decisions: Row 4 isolation via XDG_CONFIG_HOME sandbox (no MCP servers) while keeping XDG_DATA_HOME for provider auth; verbatim worktree adv.md copied into isolated config — Faithful AC3 test of the real agent artifact with zero MCP exposure; opencode tolerates the adv_* frontmatter tool keys without the ADV plugin (verified empirically)
- **[archive_only_evidence]** decisions: All probes pinned to --model kimi-for-coding/k2p7 with --auto and 240s per-run timeout, sandboxes under /tmp/opencode — Credentials proven in shakedowns; invocation-path behavior is model-agnostic for contract compliance; bounds keep the harness operator-safe
- **[archive_only_evidence]** decisions: ESM-safe module root via fileURLToPath(import.meta.url) instead of __dirname — __dirname is undefined when tsx executes scripts importing src modules (probe harness); import.meta.url works under both vitest and tsx
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/mcp-runtime-matrix.test.ts src/tool-name-assets.test.ts (adv_run_test phase=verify, runId tr_mrm72wmv_5f493066) (0) — 23/23 pass — 10 runtime-matrix tests (row presence/no escape, byte-exact routing per case, unavailable never fabricates, no-normalization invariants, discovery-evidence binding, corpus binding, live-fixture schema + pass consistency) + 13 existing contract tests still green
- **[archive_only_evidence]** verification: bin/oc-test full (adv_run_test phase=verify, runId tr_mrm76axx_5015ec26) (0) — Full plugin suite 5283/5283 pass (357 files), no flakes; baseline 5273 + 10 new matrix tests
- **[archive_only_evidence]** verification: pnpm exec tsx scripts/mcp-runtime-probe.ts --timeout 240 (adv_run_test phase=verify, runId tr_mrm7943c_297a3177) (0) — Live probe 7/7 pass: codemode-primary tools.context7["resolve-library-id"] + tools.lgrep.search_semantic; codemode-spawned-researcher same catalog paths; direct-primary context7_resolve-library-id + lgrep_search_semantic; codemode-no-mcp zero context7 attempts, agent reported unavailable citing the contract. Third consecutive all-pass run (also ran clean twice during harness shakedown).
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit && pnpm exec eslint src/mcp-runtime-matrix.ts src/mcp-runtime-matrix.test.ts scripts/mcp-runtime-probe.ts && pnpm exec prettier --check (same files + fixtures) (0) — Typecheck, lint, and format checks all clean
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/mcp-runtime-matrix.test.ts src/tool-name-assets.test.ts (adv_run_test phase=verify, runId tr_mrm72wmv_5f493066)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full (adv_run_test phase=verify, runId tr_mrm76axx_5015ec26)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx scripts/mcp-runtime-probe.ts --timeout 240 (adv_run_test phase=verify, runId tr_mrm7943c_297a3177)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit && pnpm exec eslint src/mcp-runtime-matrix.ts src/mcp-runtime-matrix.test.ts scripts/mcp-runtime-probe.ts && pnpm exec prettier --check (same files + fixtures)
- **[report_follow_up]** follow_ups: Re-run live oc runtime probes only after this change is deployed; existing probes measure deployed rather than worktree state.
- **[report_follow_up]** follow_ups: Run bin/oc-test full before acceptance.
- **[unresolved_action]** required_main_agent_actions: Checkpoint the uncommitted baseline fixture remediation.
- **[unresolved_action]** required_main_agent_actions: Run bin/oc-test full on the branch before acceptance.
- **[archive_only_evidence]** decisions: Re-freeze the CodeMode MCP contract baseline from trunk after consolidateAdvToolSurface2 — The pre-peer baseline incorrectly charged peer role-policy frontmatter bytes to this change's 400-byte mode-guidance budget. External MCP grants are unchanged; merged deltas now peak at 334 bytes.
- **[archive_only_evidence]** decisions: Validate using a scratch merge-tree rather than rebase — Non-destructive proof of branch/trunk composition; rebase is orchestrator-owned.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tool-name-assets.test.ts src/mcp-runtime-matrix.test.ts (0) — Pass: 23/23 on branch after baseline migration.
- **[archive_only_evidence]** verification: git merge-tree --write-tree HEAD trunk (0) — Clean tree; no textual conflicts with trunk, which contains archived consolidateAdvToolSurface2.
- **[archive_only_evidence]** verification: vitest run src/tool-name-assets.test.ts src/mcp-runtime-matrix.test.ts in scratch merged tree (0) — Pass: 23/23 after migrated fixture.
- **[archive_only_evidence]** verification: vitest run 12 peer-guard test files in scratch merged tree (0) — Pass: 428/428.
- **[archive_only_evidence]** verification: Mandatory runtime-matrix coverage check (0) — All 5 required rows have committed pass evidence; no skipped rows.
- **[unresolved_action]** consumer_warnings: verification_missing: Live external-runtime probes were not rerun because this worktree is not deployed; committed matrix evidence remains the available proof.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tool-name-assets.test.ts src/mcp-runtime-matrix.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git merge-tree --write-tree HEAD trunk
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: vitest run src/tool-name-assets.test.ts src/mcp-runtime-matrix.test.ts in scratch merged tree
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: vitest run 12 peer-guard test files in scratch merged tree
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: Mandatory runtime-matrix coverage check
- **[report_follow_up]** follow_ups: Inspect Advance prompt/deploy assembly for a stable final-tool-visibility hook.
- **[report_follow_up]** follow_ups: Test CodeMode on/off across primary/spawned agents and MCP allowed/denied states.
- **[report_follow_up]** follow_ups: Measure prompt overhead and verify generated/deployed parity.
- **[archive_only_evidence]** consumer_warnings: consumer_failure: Worker-side report persistence failed with WorkflowNotFoundError; orchestrator resubmitted through target_path.
- **[archive_only_evidence]** sources: OpenCode session tool resolver: CodeMode substitutes execute for directly exposed MCP tools.
- **[archive_only_evidence]** sources: OpenCode CodeMode adapter: Flat MCP keys map to namespace/tool paths with bracket notation for non-identifiers.
- **[archive_only_evidence]** sources: OpenCode generated catalog instructions: OpenCode already owns exact signatures, discovery guidance, and bracket-notation rules.
- **[archive_only_evidence]** sources: OpenCode runtime flags: CodeMode remains experimental and process-flag controlled.
- **[archive_only_evidence]** sources: Advance direct-name contract: Advance currently hard-codes direct-schema MCP names.
- **[archive_only_evidence]** sources: Advance tool-name asset test: Current tests reinforce concrete direct names without a mode matrix.
- **[archive_only_evidence]** architecture_assessment: Advance duplicates exact external MCP invocation syntax in durable prompts, while OpenCode CodeMode generates the authoritative permission-filtered catalog at runtime. Exact CodeMode syntax should remain OpenCode-owned. Advance should describe capability selection and active-schema/catalog obedience, using runtime capability-derived guidance where a stable hook exists; otherwise use a thin concrete-name-free dual-mode bridge.
- **[unresolved_action]** validation.blockers: Unknown whether Advance has a stable public hook to inspect final permission-filtered tool visibility before prompt assembly.
- **[unresolved_action]** validation.blockers: Representative on/off, primary/spawned, and allowed/denied MCP experiments have not yet run.
- **[report_follow_up]** follow_ups: Packet omitted IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; research followed provided TASK_SCOPE and durable agreement anchors without inferring missing identity fields.
- **[report_follow_up]** follow_ups: Episode recall returned no relevant project decision; it was advisory only.
- **[report_follow_up]** follow_ups: Exa was unavailable because EXA_API_KEY was not configured; official OpenCode documentation was retrieved through Context7 instead.
- **[report_follow_up]** follow_ups: Confirm OpenCode agent-plus-command prompt composition before relying on agent-only contract inheritance; official command docs confirm command-body prompt ownership but not complete composition.
- **[archive_only_evidence]** sources: OpenCode CodeMode runtime README: CodeMode owns catalog(), instructions(), and execute() over the supplied tool set; supports keeping generated callable syntax outside Advance-authored prose.
- **[archive_only_evidence]** sources: OpenCode MCP server docs: Per-agent MCP enablement uses exact/wildcard tool keys in configuration, so executable frontmatter must not be treated as invocation prose.
- **[archive_only_evidence]** sources: OpenCode agent customization docs: Markdown frontmatter is metadata/configuration while the Markdown body becomes the agent prompt, supporting structural frontmatter/body separation in tests.
- **[archive_only_evidence]** sources: OpenCode command customization docs: Command Markdown body is the prompt OpenCode runs, making command bodies independent guidance surfaces that need capability wording or inherited contract coverage.
- **[archive_only_evidence]** sources: Advance tool-name asset test: Current structural test scans prompt assets and positively requires concrete external callable examples, the behavior this change replaces.
- **[archive_only_evidence]** sources: Advance researcher agent asset: Current file mixes exact external-tool permission keys in frontmatter with concrete imperative callable guidance in the prompt body.
- **[archive_only_evidence]** sources: Advance deployment and overlay ownership: Advance fully deploys bundled agents but applies managed blocks to shared build/general/plan agents, enabling parity checks against deployment ownership.
- **[archive_only_evidence]** architecture_assessment: Draft direction is sound but needs two structural refinements. Tests must parse Markdown frontmatter separately from prompt bodies: exact MCP permission keys are executable OpenCode configuration, while concrete invocation syntax in prose is the portability defect. Contract coverage and token-budget checks should follow deployed/assembled prompt ownership rather than require duplicate text in every raw command/agent/overlay file. OpenCode's CodeMode runtime already owns catalog and instruction generation, so Advance should remove the speculative runtime-hook/OpenCode-patch branch from the baseline design and reopen it only on reproducible validation failure. Candidates, sorted by payoff/risk: (1) auto-adopt — frontmatter/body-aware scanner; payoff high, risk low, ties dual-mode operation and no false availability, fate design_around; (2) auto-adopt — test deployment-owned effective prompt surfaces and <=100-token Advance guidance once per assembled surface, not raw-file duplication; payoff high, risk low, ties overhead and overlay/deploy parity, fate design_around; (3) auto-adopt — make no runtime hook/patch the closed baseline and require explicit failing dual-mode fixture before scope re-entry; payoff medium, risk low, ties OpenCode catalog ownership and avoidance, fate adopt_now; (4) surface — run toolbox wrapper fix in parallel and keep Advance acceptance evidence independent through clean-environment direct-schema and CodeMode fixtures, then add wrapper evidence when linked change lands; payoff medium, risk medium, ties cross-repo tracking and both modes, fate surface_to_user. Candidate 2 remains partly uncertain because official command documentation confirms command-body prompt ownership but does not explicitly document full agent-plus-command prompt composition; I don't know whether one agent-level contract is always inherited by every command path.
- **[report_follow_up]** follow_ups: Packet warning: explicit OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchor sections were absent. Validation followed the user's bounded four-item scope and did not infer missing anchors.
- **[report_follow_up]** follow_ups: Exa research was unavailable because EXA_API_KEY was not configured; official OpenCode docs and pinned official repository source were used instead.
- **[report_follow_up]** follow_ups: lgrep semantic search was unavailable because VOYAGE_API_KEY was not configured; exact lgrep text search, grep, and direct reads of known active source files were used instead.
- **[report_follow_up]** follow_ups: Target-routed adv_spec is not exposed by the available tool schema; spec-law assessment therefore uses the approved strict ChangeContract and persisted agreement returned by adv_change_show.
- **[archive_only_evidence]** sources: Approved agreement and strict typed contract: SC1-SC5, AC1-AC10, C1-C7, DONT1-DONT6, and OOS1-OOS4 establish equal CodeMode/direct compatibility, active-surface authority, 100-token overhead, parity, external-change tracking, and no catalog duplication.
- **[archive_only_evidence]** sources: OpenCode CodeMode registry source: CodeMode is feature-flagged; execute is only retained when a permission-filtered visible MCP catalog exists; catalog description is generated by OpenCode.
- **[archive_only_evidence]** sources: OpenCode direct-schema switch source: When experimental CodeMode is active, session tool assembly returns before adding direct MCP tools; when inactive, MCP tools are added directly under exact keys.
- **[archive_only_evidence]** sources: OpenCode catalog/runtime source: OpenCode derives namespaced CodeMode paths from exact MCP keys and renders instructions from the generated tool tree.
- **[archive_only_evidence]** sources: OpenCode MCP and agent docs: Official docs describe server-prefixed MCP tool names and glob-based enable/disable controls; agent docs document wildcard permission matching.
- **[archive_only_evidence]** sources: Advance current exact-name test: Current coverage scans only selected top-level Markdown sets and positively requires concrete direct-schema names in ADV_INSTRUCTIONS and adv-researcher.
- **[archive_only_evidence]** sources: Advance deployment source: Agents are copied or overlay-assembled; skills are copied as entire directories, including sibling reference docs and subdirectories.
- **[archive_only_evidence]** sources: Advance current budget test: Current budget enforcement measures advisory line ceilings only, not model-token deltas on assembled prompts.
- **[archive_only_evidence]** architecture_assessment: Core architecture is correct and least-coupled: OpenCode source proves CodeMode owns generated paths/catalog text, suppresses execute when no permission-visible MCP tools exist, and omits direct MCP tools when CodeMode is active; direct mode exposes exact MCP keys. Advance should therefore remove unconditional callable spellings and add one mode-neutral active-surface rule, without a translation hook or OpenCode patch (https://github.com/anomalyco/opencode/blob/05c3e40a4e641732b991499000ca479e5dad4b02/packages/opencode/src/tool/registry.ts#L277-L304; https://github.com/anomalyco/opencode/blob/05c3e40a4e641732b991499000ca479e5dad4b02/packages/opencode/src/session/tools.ts#L387-L439). Three design details need tightening: AC6 needs a deterministic assembled-prompt baseline and tokenizer/model-token policy because current Advance tests count lines only (file:///home/jon/dev/advance/plugin/src/adv-skill-backed-commands-assets.test.ts#L797-L858); active-prose scanning must recurse through all deployed prompt-bearing skill files because deployment copies whole skill directories (file:///home/jon/dev/advance/scripts/deploy-local.sh#L1488-L1515); and DDC5 must enumerate mandatory primary plus spawned researcher cases rather than qualify them as 'where applicable' (adv://updateCodemodeMcpContracts/agreement#AC1).
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; review remained bounded to user's explicit focused objective and this omission is recorded rather than inferred.
- **[report_follow_up]** follow_ups: ADV spec search could not be routed to target_path by available adv_spec schema; strict ChangeContract and amended design were validated through adv_change_show target-path reads. No spec conflict was visible in those authoritative change artifacts.
- **[archive_only_evidence]** sources: Approved agreement and strict ChangeContract: AC6 now binds prompt growth to frozen pre-change effective assembled-prompt fixtures, a 400 UTF-8-byte ceiling, one-copy rule, and no catalog-signature duplication; AC7 requires recursively deployed skill/reference coverage with separate frontmatter parsing; AC1-AC4 require explicit primary, spawned-researcher, direct-mode, no-MCP, and name-shape behavior.
- **[archive_only_evidence]** sources: Amended design: DDC1-DDC7 and implementation strategy make the byte baseline per applicable effective prompt, derive corpus from recursive deployment ownership, exclude archives, and list all mandatory runtime rows without a where-applicable escape.
- **[archive_only_evidence]** sources: Advance deployment ownership: Deployment copies adv-* commands, selectively owns/assembles agents and overlays, and recursively copies each complete adv-* skill directory including sibling reference files and subdirectories.
- **[archive_only_evidence]** sources: Existing Advance tool-name coverage: Current test coverage scans only top-level prompt groups and hard-codes direct MCP identifiers, confirming why deployment-derived recursive prompt-body coverage is needed.
- **[archive_only_evidence]** sources: Existing frontmatter/body parser precedent: Repository tests already separate YAML frontmatter from Markdown body and inspect tool-grant keys structurally.
- **[archive_only_evidence]** sources: Existing archive exclusion precedent: Repository coverage already distinguishes active surfaces from historical/archive paths.
- **[archive_only_evidence]** sources: Official OpenCode CodeMode design: OpenCode documents generated catalog/search paths, exact-path invocation, deferred grouped MCP tools behind execute, and direct Core tools remaining direct.
- **[archive_only_evidence]** architecture_assessment: All three prior cautions are resolved. (1) AC6 plus DDC1 supplies frozen pre-change effective assembled-prompt fixtures, a deterministic per-prompt UTF-8-byte ceiling, one-copy enforcement, and catalog-signature non-duplication; tokenizer counts are explicitly advisory (adv://change/updateCodemodeMcpContracts/agreement#AC6; adv://change/updateCodemodeMcpContracts/design#DDC1). (2) AC7/DDC2-DDC3 derive active corpus from deployment ownership, include recursively copied skill sibling/reference prose, parse frontmatter separately, and exclude archives; this matches actual whole-directory skill deployment and existing parser/archive precedents (file:///home/jon/dev/advance/scripts/deploy-local.sh#L1488-L1538; file:///home/jon/dev/advance/plugin/src/adv-reviewer-asset.test.ts#L32-L73; file:///home/jon/dev/advance/plugin/src/phantom-subagent-roster.test.ts#L125-L137). (3) AC1-AC4 and design runtime strategy enumerate mandatory primary, spawned researcher, direct-mode, no-MCP, identifier-safe, and punctuated-name coverage without a where-applicable escape (adv://change/updateCodemodeMcpContracts/agreement#AC1-AC4; adv://change/updateCodemodeMcpContracts/design#Implementation-Strategy). Mode-neutral active-surface guidance aligns with OpenCode ownership: CodeMode generates exact paths/signatures for deferred grouped MCP tools while direct Core tools remain direct (https://github.com/anomalyco/opencode/blob/dev/packages/codemode/codemode.md). No new approved-contract/spec conflict found: no runtime translation layer satisfies SC4/C2/DONT2, archive exclusion satisfies DONT4, and separately tracked toolbox acceptance evidence satisfies AC8/AC10/C6 (adv://change/updateCodemodeMcpContracts/agreement).
- **[unresolved_action]** required_main_agent_actions: Checkpoint review remediation and submit this report.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
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
| C6 | constraint | respected |
| C7 | constraint | respected |
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

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tool-name-assets.test.ts (adv_run_test phase=red, runId tr_mrm576um_f1c2a925)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tool-name-assets.test.ts (adv_run_test phase=green, runId tr_mrm5gguv_8fb049d1)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tool-name-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit && pnpm exec eslint src/prompt-corpus.ts src/tool-name-assets.test.ts && pnpm exec prettier --check src/
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/mcp-runtime-matrix.test.ts src/tool-name-assets.test.ts (adv_run_test phase=verify, runId tr_mrm72wmv_5f493066)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full (adv_run_test phase=verify, runId tr_mrm76axx_5015ec26)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx scripts/mcp-runtime-probe.ts --timeout 240 (adv_run_test phase=verify, runId tr_mrm7943c_297a3177)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit && pnpm exec eslint src/mcp-runtime-matrix.ts src/mcp-runtime-matrix.test.ts scripts/mcp-runtime-probe.ts && pnpm exec prettier --check (same files + fixtures)
- Checkpoint the uncommitted baseline fixture remediation.
- Run bin/oc-test full on the branch before acceptance.
- verification_missing: Live external-runtime probes were not rerun because this worktree is not deployed; committed matrix evidence remains the available proof.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tool-name-assets.test.ts src/mcp-runtime-matrix.test.ts
- verification_missing: No adv_run_test evidence found for reported command: git merge-tree --write-tree HEAD trunk
- verification_missing: No adv_run_test evidence found for reported command: vitest run src/tool-name-assets.test.ts src/mcp-runtime-matrix.test.ts in scratch merged tree
- verification_missing: No adv_run_test evidence found for reported command: vitest run 12 peer-guard test files in scratch merged tree
- verification_missing: No adv_run_test evidence found for reported command: Mandatory runtime-matrix coverage check
- Unknown whether Advance has a stable public hook to inspect final permission-filtered tool visibility before prompt assembly.
- Representative on/off, primary/spawned, and allowed/denied MCP experiments have not yet run.
- Checkpoint review remediation and submit this report.
