# Archive Briefing Digest

**Change ID:** consolidateCommandRepetitions
**Title:** Consolidate command repetitions
**Status:** archived
**Generated:** 2026-07-13T19:30:53.201Z

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

No Epic membership

## Durable Facts

Showing 47 of 47 durable facts.

- **[archive_only_evidence]** decisions: Skipped all optional compression edits — Target Resolution, skill-load fallback, worktree context, auto-continue rationale, and sub-agent context each contain command-specific behavior or frozen tokens (different steps, skill names, next commands, JSON vs direct findings). Compressing them would violate the 'command-specific behavior and frozen tokens stay explicit' constraint.
- **[archive_only_evidence]** decisions: Used a single-line same-file Markdown reference for the mandatory dedup — Preserves the Phase 0 table as the single source of truth, keeps the reference precise and minimal, and avoids introducing new anchors or protected-token drift.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-review-assets.test.ts src/commands-spine-assets.test.ts src/adv-skill-backed-commands-assets.test.ts (0) — 69 tests passed; token-budget warnings are pre-existing advisory baselines, not failures
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/briefing-packets-command-assets.test.ts src/command-requirement-citations.test.ts src/adv-reviewer-asset.test.ts (0) — 112 tests passed
- **[archive_only_evidence]** verification: grep -c '12-Dimension Review Framework' .opencode/command/adv-review.md (0) — 0 matches — standalone duplicate removed
- **[archive_only_evidence]** verification: grep -c '12-Dimension Framework' .opencode/command/adv-review.md (0) — 2 matches — Phase 0 heading and new same-file reference only
- **[archive_only_evidence]** verification: grep -n 'preExecutionRebase' .opencode/command/adv-apply.md (0) — 2 matches at L166/L180 — live marker intact
- **[archive_only_evidence]** verification: grep -n 'T28' .opencode/command/adv-archive.md (0) — 5 matches at L319/L320/L323/L327/L353 — live markers intact
- **[archive_only_evidence]** verification: grep -n 'Gate Handoff Voice' .opencode/command/adv-review.md (0) — 1 match — protected spine intact
- **[archive_only_evidence]** verification: grep -n 'SUB-AGENT CONTEXT' .opencode/command/adv-review.md (0) — 1 match — protected anchor intact
- **[archive_only_evidence]** verification: git diff --stat .opencode/command/adv-review.md (0) — 1 insertion, 16 deletions — only the duplicate table removed
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-review-assets.test.ts src/commands-spine-assets.test.ts src/adv-skill-backed-commands-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/briefing-packets-command-assets.test.ts src/command-requirement-citations.test.ts src/adv-reviewer-asset.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: grep -c '12-Dimension Review Framework' .opencode/command/adv-review.md
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: grep -c '12-Dimension Framework' .opencode/command/adv-review.md
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: grep -n 'preExecutionRebase' .opencode/command/adv-apply.md
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: grep -n 'T28' .opencode/command/adv-archive.md
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: grep -n 'Gate Handoff Voice' .opencode/command/adv-review.md
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: grep -n 'SUB-AGENT CONTEXT' .opencode/command/adv-review.md
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --stat .opencode/command/adv-review.md
- **[agenda]** follow_ups: Confirm no command besides adv-review carries a fully duplicated table/section instance before editing (grep repeated headings per file).
- **[agenda]** follow_ups: After dedup, consider a separate out-of-scope change to refresh advisory line baselines in .opencode/token-budgets.json downward to reflect new sizes.
- **[archive_only_evidence]** sources: commands-spine-assets.test.ts (gate handoff spine + banned retired headings): Spine-bearing commands MUST keep exact ## Problem / ## Chosen direction / ## Delivered ordering, --- separator, and **{change-id}** footer. Nine named commands MUST retain a spine. Bans ## Next / ## Next stage. Dedup must not collapse these anchors.
- **[archive_only_evidence]** sources: briefing-packets-command-assets.test.ts (packet anchors + banned manual sections): adv-apply/adv-review/adv-harden/adv-design/adv-discover packets MUST contain BRIEFING PACKET: plus lane-specific identity anchors (WORKING DIRECTORY/CHANGE/ATTEMPT + warn-first anchors) and MUST NOT re-add manual AFFECTED FILES:/ACCEPTANCE CRITERIA:/EPIC CONTEXT:/CONTRACT ITEMS: sections. Agent files MUST reference _briefingPacket. This is the pre-existing dedup mechanism: packet slices replace duplicated correctness prose.
- **[archive_only_evidence]** sources: adv-skill-backed-commands-assets.test.ts (embedded methodology + forbidden pointers + baselines): adv-discover/adv-prep/adv-apply/adv-review MUST keep inline ### *Methodology markers (folded, not skill-linked). adv-harden/adv-slop-scan MUST keep skill() load + inline fallback. Forbidden: pointing at docs/checklists/*.md or ~/.local/share/Advance paths. Many exact-substring assertions pin specific phrasing. Line baselines are ADVISORY warn-only (tests always pass).
- **[archive_only_evidence]** sources: command-requirement-citations.test.ts (rq-tag ownership already migrated): A prior removeCommandTraceTags change already stripped rq-{id} trace tags from command markdown and re-anchored 44 spec citations in plugin/src/. Command dedup does not need to preserve rq- tags in markdown; that ownership already lives in code/tests.
- **[archive_only_evidence]** sources: docs/command-voice-standard.md Prose-Load Reduction Rules + Caveman-full composition: Canonical compression contract: classify each section fully-enforced / partially-enforced / inherently-prose, then apply matching template (pointer line + constraint table). Caveman-full is a wording-density layer on top, NOT a competing method. Contract tokens (tool names, gate IDs, statuses, slash commands, enums, quoted errors, MUST/NEVER, approval/cancellation/archive prose, JSON/code) stay unchanged. Governed by rq-proseReduction01-04.
- **[archive_only_evidence]** sources: manifest-doc-drift.test.ts (exact frontmatter equality + structural caps): Command frontmatter description MUST exactly equal manifest.ts (single source of truth); MUST be single-line YAML scalar. Voice-standard Prose-Load Reduction section capped <=80 lines. Structural, not content-based.
- **[archive_only_evidence]** sources: .opencode/token-budgets.json (advisory baselines) vs measured current size: adv-apply baseline 404 lines; current adv-apply.md measured 730 lines (~81% over). adv-review baseline 324, measured >=493. Files grew past baselines since last compression pass, confirming genuine bloat — but ceiling test is warn-only, so it alone does not block or force any change.
- **[archive_only_evidence]** sources: Concrete within-command duplication evidence: adv-review.md renders the full 12-dimension review table twice: once inside Phase 0 embedded methodology (#### 12-Dimension Framework, line 37) and again as standalone ## 12-Dimension Review Framework (line 97). Exactly the proven within-command repetition the proposal targets; safe to consolidate to one canonical instance.
- **[archive_only_evidence]** sources: Anthropic prompt-eng interactive tutorial (clear/direct/structured): Canonical guidance: be clear and direct, give each instruction element one organized place, skip preamble/filler. Supports removing duplicated instruction blocks while preserving structured anchors — consistent with the enforcement-class templates already in this repo.
- **[archive_only_evidence]** architecture_assessment: The repo already has a mature, code-enforced compression architecture: (1) briefing-packet consumption replaces duplicated correctness prose with generated _briefingPacket slices; (2) the Prose-Load Reduction enforcement-class model (fully/partially/inherently-prose) + Caveman-full wording layer defines HOW to compress with contract tokens frozen; (3) drift tests pin spine anchors, packet anchors, embedded-methodology markers, exact frontmatter equality, and many exact phrasings. Against this backdrop, the alternative that matches approved proposal scope (within-command repetition only) AND preserves standalone execution, sub-agent packets, approval semantics, and asset tests is a targeted within-command dedup pass classified through the existing enforcement-class templates. Concrete proof it is real and safe: adv-review.md carries the 12-dimension table twice (embedded methodology + standalone) — one canonical instance + a same-file pointer satisfies every asset assertion. Cross-command abstraction (shared includes/partials) is a genuine alternative but is out of scope per the proposal and structurally hostile to standalone-command execution: each adv-*.md must be self-contained because OpenCode loads a single command file as the prompt; extracting shared blocks would break self-containment and force a loader/runtime change the proposal excludes. Advisory line baselines confirm bloat is real (adv-apply 730 vs 404) but are warn-only, so they neither block work nor justify aggressive compression that risks contract-token or anchor loss.
- **[agenda]** follow_ups: Minor internal inconsistency (out of scope, advisory): adv-review.md Phase 5.5 L394 says 'Do NOT re-run all 5 dimensions' while the review framework is 12-dimension; not part of this change's contract but worth a future cleanup note.
- **[agenda]** follow_ups: Episode recall returned only a global placeholder memory; no durable project wisdom was available to corroborate — findings rest entirely on direct tool verification.
- **[archive_only_evidence]** sources: adv-review.md Phase 0 canonical 12-dim table (L37-56): `#### 12-Dimension Framework` full table + 'All 12 must be checked' inside Phase 0 Embedded Methodology. Canonical local owner.
- **[archive_only_evidence]** sources: adv-review.md standalone duplicate table (L97-113): `## 12-Dimension Review Framework` second full table, standalone, before Sub-Agent Resilience. Redundant duplicate — the AC1 removal target. Focus wording differs slightly but the 12 dimension names are identical (no behavioral loss).
- **[archive_only_evidence]** sources: adv-review-assets.test.ts: Pins TASK EVIDENCE SUMMARY, non-code evidence policy, designer-concern prose — does NOT pin either 12-dim table's exact heading/text. Duplicate removal is safe from this suite.
- **[archive_only_evidence]** sources: No test pins the duplicate/resilience tables: Confirms AC1 same-file-reference replacement and AC2 resilience compaction will not break asset tests.
- **[archive_only_evidence]** sources: adv-apply rebase wiring is live, not stale: adv-apply.md L166 references preExecutionRebase from apply-helpers/pre-rebase.ts. Source symbol exists and is unit-tested on trunk => marker is CURRENT, not stale. AC3 => keep unchanged.
- **[archive_only_evidence]** sources: adv-archive T28 labels are live, not stale: T28d classifyConflict, T28c navigateConflicts, T28b applyResolveAction, T28 detectSkipDuplicate all exist and are test-backed. adv-archive.md L316-358 labels accurately describe live source => AC3 => keep unchanged.
- **[archive_only_evidence]** sources: AC4 anchors are structurally test-pinned: Gate Handoff spine, briefing packet, EPIC CONTEXT, frontend 6-dimension inline fallback, approval consequence context, embedded methodology are each pinned. Removing them would fail CI — AC4 'remain intact' is enforced structurally, not by prose goodwill.
- **[archive_only_evidence]** architecture_assessment: The design is a coherent standalone-safe local-consolidation approach that matches every current asset anchor. AC1: adv-review.md genuinely renders the 12-dimension framework twice (canonical Phase 0 `#### 12-Dimension Framework` at L37-56, and a redundant standalone `## 12-Dimension Review Framework` at L97-113); no test pins the later duplicate or the Sub-Agent Resilience table, so replacing the later copy with a precise same-file reference to Phase 0 is safe and loses no behavioral content (identical dimension names). AC3 is the decisive validation: both suspected stale markers are in fact CURRENT — `preExecutionRebase`/`pre-rebase.ts` and all four T28 archive symbols (classifyConflict/navigateConflicts/applyResolveAction/detectSkipDuplicate) exist and are unit-tested on trunk, so the source/history-proof gate the design mandates correctly resolves to a NO-EDIT outcome for those markers. AC4 protected anchors are enforced by dedicated asset tests, so the design's 'preserve unchanged' is machine-checkable (P33-aligned). AC2 compaction targets carry no exact-text pins beyond the structural anchors AC4 already protects. The design's mitigations (freeze tokens, delete duplicates rather than reword survivors, same-file references only, no cross-command include) directly counter the real risks. The change extends an existing repo compression pattern (briefing packets + asset tests) without introducing shared-include architecture, honoring C3/OOS2.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- "${files[@]#plugin/}" (with files=(plugin/src/*assets.test.ts)), pnpm --dir plugin run check results=pass — Reviewed the complete two-file branch diff against origin/trunk: the duplicate 12-dimension table is removed and replaced with a same-file canonical reference; matrix anchors, OWASP Top 10 scope, all-12/explicit-justification requirement, and scanner fallback framing remain. No live status-marker text appears in the diff. `git diff --check` passed; worktree remained clean. Asset suite passed: 49 files, 591 tests (including adv-review-assets: 13); pnpm check passed schemas, typecheck, isolation, lockfile, ESLint, and Prettier. The suite emitted pre-existing advisory command-token-budget warnings only.
- **[unresolved_action]** required_main_agent_actions: No remediation required. Release may proceed using this harden evidence.
- **[unresolved_action]** required_main_agent_actions: Leave unrelated pre-existing console/TODO occurrences outside the two-file diff unchanged.
- **[wisdom_candidate]** wisdom_candidates: [convention] For command-prose consolidation, retain one canonical definition and make later sections explicitly reference it; focused asset tests should protect both single-source count and retained mandatory semantics.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin run check, git diff --check 1faae6d7...HEAD, git merge-tree --messages 1faae6d7 HEAD results=pass — pnpm check passed schemas:check, typecheck, test-isolation, lockfile-policy, eslint, and Prettier. Diff hygiene passed with a bounded 34-insertion/15-deletion, two-file diff; final worktree status was clean. Non-destructive merge-tree compatibility against 1faae6d7 succeeded (tree d8e3bf919ca232b2a90889c907c301c2185c738d). Durable packet evidence states 129 focused assets already passed; no further targeted rerun needed.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-review-assets.test.ts src/commands-spine-assets.test.ts src/adv-skill-backed-commands-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/briefing-packets-command-assets.test.ts src/command-requirement-citations.test.ts src/adv-reviewer-asset.test.ts
- verification_missing: No adv_run_test evidence found for reported command: grep -c '12-Dimension Review Framework' .opencode/command/adv-review.md
- verification_missing: No adv_run_test evidence found for reported command: grep -c '12-Dimension Framework' .opencode/command/adv-review.md
- verification_missing: No adv_run_test evidence found for reported command: grep -n 'preExecutionRebase' .opencode/command/adv-apply.md
- verification_missing: No adv_run_test evidence found for reported command: grep -n 'T28' .opencode/command/adv-archive.md
- verification_missing: No adv_run_test evidence found for reported command: grep -n 'Gate Handoff Voice' .opencode/command/adv-review.md
- verification_missing: No adv_run_test evidence found for reported command: grep -n 'SUB-AGENT CONTEXT' .opencode/command/adv-review.md
- verification_missing: No adv_run_test evidence found for reported command: git diff --stat .opencode/command/adv-review.md
- No remediation required. Release may proceed using this harden evidence.
- Leave unrelated pre-existing console/TODO occurrences outside the two-file diff unchanged.
