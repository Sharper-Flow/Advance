# Archive Briefing Digest

**Change ID:** alignCoordinateProjects
**Title:** Align coordinate projects
**Status:** archived
**Generated:** 2026-07-13T02:32:06.494Z

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

Showing 71 of 71 durable facts.

- **[archive_only_evidence]** decisions: Added new requirement rq-epicCoordinateProjectInventory01 instead of modifying existing rq-epicCoordinateCommand01 or rq-epicCoordinateRepoFreshness01 — The new requirement covers distinct cross-project inventory behavior that is orthogonal to the existing read-first/approval-gated and repository-freshness requirements. A separate requirement keeps concerns isolated and makes the new behavior independently testable.
- **[archive_only_evidence]** decisions: Did not modify plugin/src/manifest.ts — The adv-coordinate scope already includes 'changes' in its reads array, so no manifest update was necessary for the new adv_change_list usage.
- **[archive_only_evidence]** decisions: Used JSON.stringify escaping for spec JSON test assertions (e.g., scope: \\"product\\") — JSON.stringify re-escapes quotes in string values, so tests against the parsed spec JSON must expect the escaped form. Docs and command file tests use unescaped strings since they read plain text.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts (1) — RED phase: 4/5 new tests fail as expected before implementation; pre-existing failure confirmed
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts (1) — GREEN phase: 63/64 tests pass; only pre-existing 'keeps initial entries optional' failure remains (unrelated to changes, confirmed via git stash)
- **[archive_only_evidence]** verification: pnpm run schemas:check && pnpm run typecheck (0) — Schema generation check and TypeScript typecheck both pass
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke test suite passes (formatting, schemas, typecheck, isolation, lockfile, lint, format checks)
- **[archive_only_evidence]** verification: pnpm test (1) — Full test suite: 4910/4915 pass; 5 pre-existing failures all unrelated to changes (adv-epic initial entries phrase, AGENTS.md content drift, spec-citation for rq-temporalTsDeterminismDocs01, conformance timeout)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check && pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test
- **[archive_only_evidence]** decisions: New description: 'Audit project changes, Epic alignment, sequencing, and membership health' (9 words) — Satisfies manifest voice standard enforcement: starts with strong verb 'Audit', word count 9 within 5–14 range, no banned phrases. Reflects 'project changes plus Epics' per finding.
- **[archive_only_evidence]** decisions: Updated README.md, ADV_INSTRUCTIONS.md, SETUP.md description tables — manifest-doc-drift.test.ts enforces doc tables match manifest description exactly; updates were required to keep drift tests green.
- **[archive_only_evidence]** decisions: Updated docs/cli-surface-matrix.md capability blurb to 'Project-change and Epic-set audit' — User-facing blurb described Epic-only; aligned per finding while preserving the agent-workflow-only classification.
- **[archive_only_evidence]** decisions: Did NOT modify .adv/specs/advance-epics/spec.json or docs/specs/advance-epics.md — Spec body for rq-epicCoordinateProjectInventory01 already lists all four AC3 inventory rows from prior attempt; this remediation covers command/manifest/doc surfaces only.
- **[archive_only_evidence]** decisions: Did NOT modify .adv/archive/2026-06-27-addAdvCoordinateCommand/ files — Historical change audit records — not live user-facing surfaces. Modifying them would falsify the archived audit trail.
- **[archive_only_evidence]** decisions: Preserved label spelling boundary (adv-backed-fact hyphen in command file, adv_backed_fact underscore in spec) — Prompt explicitly required keeping existing command/spec label spelling boundary.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts (1) — RED phase: 5 new tests fail as expected before fixes (Phase 7 rows, Final Report rows, manifest description, frontmatter description, user-facing title/body/boundary) plus 1 pre-existing failure
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts (1) — GREEN phase: 68/69 pass; only pre-existing unrelated '/adv-epic keeps initial entries optional' failure remains (confirmed at baseline via git stash)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts -t adv-coordinate (0) — All 16 adv-coordinate-focused tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/manifest.test.ts (0) — All 40 manifest tests pass including voice standard enforcement (strong verb, 5–14 words, no banned phrases)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/manifest-doc-drift.test.ts (0) — All 17 manifest-doc-drift tests pass after updating README.md and ADV_INSTRUCTIONS.md description tables
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/cli-surface-matrix.test.ts src/tool-name-assets.test.ts src/adv-stability-docs-assets.test.ts src/adv-instructions-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/adv-stability-crosscut.test.ts (0) — All 92 related asset/stability tests pass
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke suite passes: schemas:check, typecheck, test-isolation, lockfile-policy, lint, format, smoke tests (62/62)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts -t adv-coordinate
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/manifest.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/manifest-doc-drift.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/cli-surface-matrix.test.ts src/tool-name-assets.test.ts src/adv-stability-docs-assets.test.ts src/adv-instructions-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/adv-stability-crosscut.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[unresolved_action]** required_main_agent_actions: Classify and resolve the unrelated /adv-epic asset assertion separately before claiming a fully green focused suite.
- **[unresolved_action]** required_main_agent_actions: No corrective change is required for alignCoordinateProjects: reviewed contract paths cover the requested project pagination, explicit product/target-path rules, degraded labels, report inventory fields, no-active-Epics ordering, per-surface fact labels, public descriptions, and preserved no-mutation/advisory boundaries.
- **[wisdom_candidate]** wisdom_candidates: [convention] For command-only ADV contract changes, pair requirement/spec mirroring tests with command-section ordering assertions and manifest scope assertions; retain strict labels by surface (`adv_backed_fact` in spec/docs, `adv-backed-fact` in user command).
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- plugin/src/advance-epics-assets.test.ts, bin/oc-test targeted -- src/advance-epics-assets.test.ts, pnpm --dir plugin run check, git diff --check results=fail — First targeted invocation used a root-relative filter while oc-test runs Vitest from plugin/, yielding deterministic `No test files found`. Corrected filter ran 69 tests: 68 passed; one unrelated existing /adv-epic assertion failed at plugin/src/advance-epics-assets.test.ts:428. All newly added project-inventory tests passed. `pnpm --dir plugin run check` completed schemas, typecheck, isolation, lockfile, lint, and format checks successfully; `git diff --check` had no output.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- plugin/src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check
- **[archive_only_evidence]** verification: tests_run=git diff --check, bin/oc-test targeted -- src/advance-epics-assets.test.ts results=fail — git diff --check passed. Targeted suite: 68 passed, 1 failed. All change-scoped project-inventory and /adv-coordinate assertions passed, including spec JSON, mirrored docs, command inventory ordering, no-active-Epics reporting, Phase 7/final inventory rows, manifest description/scope, and user-facing contract. Sole failure is unrelated existing /adv-epic wording assertion at plugin/src/advance-epics-assets.test.ts:428.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[agenda]** follow_ups: Design phase: ensure the new inventory phase explicitly reports the no-active-Epics observation independently of change inventory (AC requires a complete report even with zero active Epics).
- **[agenda]** follow_ups: Confirm during design whether cross-project coordination should fan out adv_change_list per participating target_path or rely solely on scope:'product'; document which participating-project set the command enumerates and how it is discovered.
- **[archive_only_evidence]** sources: .opencode/command/adv-coordinate.md (command contract): Read-first, approval-gated Epic audit. Phase 1 inventory already lists adv_change_show for linked changes; manifest scope declares reads[specs,epics,changes]. No project-wide change inventory step yet; freshness/evidence classification (repo_backed_fact/adv-backed-fact/judgment_call/freshness_limited) already established.
- **[archive_only_evidence]** sources: plugin/src/tools/change.ts adv_change_list (lines 347-504): adv_change_list already supports status filter incl. 'in-flight' union, includeArchived/includeClosed (terminal), scope repo|product (filterChangesForProductScope), target_path (cross-project disk snapshot + _projectContext), sort recency|stalest, pagination, and per-change Epic annotation {id,title,entry_id} from epic_membership. Covers every stated constraint.
- **[archive_only_evidence]** sources: plugin/src/tools/backlog.ts adv_wip_state (lines 246-368): Existing single-call aggregator precedent: joins active changes + worktrees + peer sessions with per-source Promise.allSettled isolation and warnings[]. But it calls store.changes.list({}) with no product/target_path/status/Epic-join and no per-project fan-out; it is single-project WIP, not project+Epic coordination.
- **[archive_only_evidence]** sources: .adv/specs/advance-epics spec rq-epicCoordinateCommand01 / rq-epicCoordinateRepoFreshness01 / rq-epicOrderAdvisory01 / rq-epicChangeContext01: Coordination MUST be read-first, approval-gated, add no new planning primitive, no CLI mutation verb, no direct ADV-state edits. Order advisory. Change surfaces already carry compact Epic membership context. Freshness spec already mandates evidence classification labels.
- **[archive_only_evidence]** sources: plugin/src/advance-epics-assets.test.ts /adv-coordinate contract tests (lines 151-233, 722+): Asset tests are prose-anchor assertions over the command markdown (tool-name presence, freshness anchors, evidence labels, advisory-order guards). Adding a project-change inventory phase is provable by extending these string-anchor tests + manifest description parity — no new runtime tool test surface required for the reuse path.
- **[archive_only_evidence]** architecture_assessment: The proposal's per-project change inventory need is already fully served by the existing typed read tool adv_change_list, which supports status (incl. in-flight union), terminal inclusion, product scope, cross-project target_path with _projectContext, staleness/recency sort, and per-change Epic membership annotation. adv_change_show fills member-change/artifact detail on demand. The command manifest already declares reads[changes]; only the command prose lacks an explicit project-inventory phase. A new aggregation tool would duplicate adv_change_list + adv_epic_list join logic in TypeScript, add a schema/test/registry maintenance surface, and risk the spec's 'no new planning primitive' guardrail — without adding capability the two typed reads plus prose orchestration cannot already express. The existing adv_wip_state precedent is single-project WIP, not a project+Epic coordination join, so it is a pattern reference but not a drop-in.
- **[agenda]** follow_ups: Candidate 5 refinement: design should explicitly state the project-only/Epic-linked classification is derived from the adv_change_list epic projection (change.ts:452-458), not from per-change adv_change_show, to prevent unnecessary N+1 detail reads.
- **[agenda]** follow_ups: Candidate 2: AC4 label taxonomy should gain an explicit mapping for 'requested product scope but project is single_repo' → freshness_limited/judgment_call.
- **[archive_only_evidence]** sources: adv_change_list typed contract: adv_change_list already exposes target_path (disk-snapshot cross-project), scope: repo|product, in-flight status union, and compact epic membership projection (epic {id,title,entry_id} at 452-458). Confirms design reuse claim; no new aggregation tool needed.
- **[archive_only_evidence]** sources: product-scope silent degradation: filterChangesForProductScope returns changes unchanged when productContext is absent or mode==single_repo (line 864); productContextOutput returns undefined for single_repo (line 888). scope:'product' on a non-product-linked project silently yields repo-only results with NO _productContext marker.
- **[archive_only_evidence]** sources: current command no-Epic early exit: Existing Phase 1 says 'If no active Epics exist, report No active Epics. No coordination actions. and stop' — exits before any project-change inventory. This is the exact defect AC5 targets.
- **[archive_only_evidence]** sources: current report row coverage gap: Report inventory rows list only 'Epics scanned' and 'entries scanned' — no Projects scanned / Changes by project rows. Confirms AC3 gap and that DDC3 literal-anchor tests are needed to prevent drift.
- **[archive_only_evidence]** sources: Phase 1 typed-tool table: Phase 1 tool table lists adv_epic_list/show, adv_change_show, adv_spec but NOT adv_change_list. AC1 requires naming adv_change_list in the inventory; the table is the single insertion point.
- **[archive_only_evidence]** architecture_assessment: The draft design is architecturally sound and correctly boring: it composes existing typed read contracts (adv_change_list scope/target_path/epic_membership + adv_epic_list/show) at the command-report layer rather than minting a new aggregation tool. Every load-bearing reuse claim is source-verified. The LBP analysis and DONT1/DONT2 rejections are correct — adv_change_list genuinely owns cross-project/scope/epic-membership semantics, so a new aggregator would create a second coordination truth source with no unmet-behavior payoff. The design's main under-specified seam is evidence honesty when scope:'product' silently degrades to repo-only on non-product-linked projects (verified at create-clarify.ts:864/888): without an explicit label rule, an AC4 'adv-backed-fact' could overstate coverage. Leverage points are all low-risk, contract-tied refinements — not architecture revisions. No blockers.
- **[agenda]** follow_ups: Pin evidence-label hyphenation constraint (adv-backed-fact in command file; adv_backed_fact in spec law) into design or first task; tool-name-assets.test.ts enforces this and it is a documented recurring failure.
- **[agenda]** follow_ups: Resolve deferred cross-project fan-out: fixed bounded inventory vs full pagination — user decision before prep (design-flagged).
- **[archive_only_evidence]** sources: advance-epics spec law rq-epicCoordinateCommand01 + rq-epicCoordinateRepoFreshness01: Coordination command MUST be read-first, approval-gated, order advisory, no new planning primitive / CLI mutation verb / direct ADV state edits. Freshness law defines the four evidence labels and requires freshness before repo-dependent conclusions. Design's additive project-change inventory does not violate these; it extends scope without adding a mutation surface.
- **[archive_only_evidence]** sources: adv_change_list implementation: Confirms adv_change_list supports status in-flight (draft+pending+active union), scope repo|product, target_path snapshot read, and compact epic projection {id,title,entry_id}. Design's reuse claim (derive project-only vs Epic-linked from list membership projection to avoid N+1) is source-accurate.
- **[archive_only_evidence]** sources: manifest coordinate scope: adv-coordinate already declares reads:[specs,epics,changes]. Design's claim that manifest already includes changes read scope is accurate; only human-readable description needs updating.
- **[archive_only_evidence]** sources: current command Phase 1: Phase 1 currently inventories Epics only; if-no-Epics early exit at line 54 stops before any change reporting. Design's AC5 relocation of no-Epic exit after change inventory is required and correctly identified.
- **[archive_only_evidence]** sources: existing asset tests: Existing /adv-coordinate contract tests assert typed Epic reads, approval gating, advisory order, four evidence labels. Design's AC6 adds four project-change path anchors in the same file — correct extension point, no new test infra.
- **[archive_only_evidence]** sources: evidence-label hyphenation split (recurring hazard): Command file MUST use hyphenated adv-backed-fact because tool-name-assets.test.ts flags any adv_* token that is not a registered callable tool. Spec law text (spec.json + docs/specs mirror) uses underscored adv_backed_fact. This split has caused a documented recurring pre-existing test failure. Design edits BOTH the command and spec law but never names this constraint — an implementer writing fresh label text into spec.json risks introducing the same failure, or writing adv_backed_fact into the command file which tool-name-assets.test.ts will flag.
- **[archive_only_evidence]** architecture_assessment: Design is architecturally sound and simplicity-biased. It composes three existing typed read contracts (adv_change_list with scope/target_path/compact-epic projection + selective adv_change_show; adv_epic_list/show) and joins them only in command report prose, adding zero runtime tool/schema/CLI surface. This is the boring, proven pattern consistent with the existing coordinate command (prose orchestration + spec law + asset tests) and correctly rejects both aggregator alternatives (DONT1 adv_coordinate_state, DONT2 adv_wip_state) per rq-epicCoordinateCommand01.4 'adds no new planning primitive.' All six ACs map to verifiable command/manifest/spec/asset-test anchors. The AC5 no-Epic-exit relocation and the honest product-scope-degradation labeling (never adv-backed-fact when product context unavailable) are correct and source-grounded. The one gap: the design does not name the adv-backed-fact (command, hyphenated) vs adv_backed_fact (spec law, underscored) split enforced by tool-name-assets.test.ts. Because this change edits both surfaces and this exact split is a documented recurring failure across multiple archives, the omission is a real implementation hazard that should be pinned before prep. Not a design-shape defect; a missing constraint the implementer must carry.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check && pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: pnpm test
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts -t adv-coordinate
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/manifest.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/manifest-doc-drift.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/cli-surface-matrix.test.ts src/tool-name-assets.test.ts src/adv-stability-docs-assets.test.ts src/adv-instructions-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/adv-stability-crosscut.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- Classify and resolve the unrelated /adv-epic asset assertion separately before claiming a fully green focused suite.
- No corrective change is required for alignCoordinateProjects: reviewed contract paths cover the requested project pagination, explicit product/target-path rules, degraded labels, report inventory fields, no-active-Epics ordering, per-surface fact labels, public descriptions, and preserved no-mutation/advisory boundaries.
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- plugin/src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- verification_missing: No adv_run_test evidence found for reported command: git diff --check
- verification_missing: No adv_run_test evidence found for reported command: git diff --check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
