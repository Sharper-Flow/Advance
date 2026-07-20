# Archive Briefing Digest

**Change ID:** fixSubAgentMcpRouting
**Title:** Fix sub-agent MCP routing
**Status:** archived
**Generated:** 2026-07-19T22:51:28.773Z

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

Showing 22 of 22 durable facts.

- **[report_follow_up]** follow_ups: lgrep namespace was unavailable on active CodeMode tool surface; known-file reads and exact-text grep supplied local evidence instead.
- **[report_follow_up]** follow_ups: Episode advisory recall returned no relevant project decision; no recalled text was used as authority.
- **[report_follow_up]** follow_ups: After contract correction, verify Stage 3 ownership against global config backup policy and ensure OpenCode restart/deployment evidence remains explicit.
- **[research_citation]** sources: Current ADV design: Design mandates a nonexistent prompt-corpus.test.ts extension, a blanket every-overlay contract test, three-stage rollout, and only an explore live check. (adv://change/fixSubAgentMcpRouting/design)
- **[research_citation]** sources: Current ADV agreement: Agreement requires all four named agents, both CodeMode routes, every overlay contract presence, unchanged permissions, and no ADV-owned agent-file changes. (adv://change/fixSubAgentMcpRouting/agreement)
- **[research_citation]** sources: Overlay deployment implementation: apply_overlay_block already provides bounded marker replacement/insertion and preserves content outside the managed block. (file:///home/jon/dev/advance/scripts/deploy-local.sh#L395-L491)
- **[research_citation]** sources.omitted: 16 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing overlay primitive is correct and simple: deploy-local.sh already preserves user-owned content while replacing bounded ADV_SYNC blocks. New explore overlay plus one deploy invocation is a sound extension. Design cannot pass as written, however. It names plugin/src/prompt-corpus.test.ts, which does not exist; relevant tests live in plugin/src/tool-name-assets.test.ts. More importantly, its proposed assertion that every *.overlay.md contains the contract conflicts with current architecture: only general.overlay.md contains it, while build/plan contracts live outside their marker blocks and adv also carries the contract outside adv.overlay.md. Adding the contract to those overlays without coordinated relocation would violate the existing exactly-once effective-prompt invariant; coordinated relocation would add omitted files and collide with the agreement's no-ADV-owned-agent-file boundary. Design also treats all four named surfaces as sub-agents, while delegation-defaults explicitly classifies build and plan as primary and only explore/general as spawnable global workers. Finally, verification checks one spawned explore route, not SC1/SC3 across the four surfaces and both runtime modes, and provides no deterministic AC4 check for all four rewritten user files. Deviation: MAJOR until agreement/design reconcile overlay scope, agent roles, and verification ownership.
- **[unresolved_action]** validation.blockers: Contract/design conflict: AC5 and AD4 require every .opencode/overlays/*.overlay.md to contain the contract, but adv/build/plan overlays do not; moving the contract into them requires omitted coordinated canonical-agent edits and conflicts with the no-ADV-owned-agent-file boundary.
- **[unresolved_action]** validation.blockers: Implementation target is invalid: plugin/src/prompt-corpus.test.ts does not exist; relevant tests are in plugin/src/tool-name-assets.test.ts, and existing exactly-once effective-prompt coverage must be preserved.
- **[unresolved_action]** validation.blockers: SC1/SC3 verification is not achievable as designed: build and plan are primary agents by rq-delDefaults03, not spawnable sub-agents, while Stage 14 checks only explore and only whichever one runtime mode is active.
- **[unresolved_action]** validation.blockers: AC4 lacks deterministic evidence: design rewrites four user files but specifies no bounded check proving all four bodies are free of stale direct-callable routing prose.
- **[report_follow_up]** follow_ups: OOS5 future cleanup: either (a) add routing contract to build/plan overlays coordinated with source body removal per C7/DONT5, or (b) soften the 'See ADV_SYNC block for routing' reference in user build.md:161 and plan.md:158,162 to 'See routing contract (ADV_SYNC block when present, else global lgrep-tools.md instruction)'
- **[archive_only_evidence]** findings: [suggestion] inline-orchestrator: User build.md:161 and plan.md:158,162 added 'See the ADV_SYNC block at the top of this prompt for routing guidance' references during AC4 rewrite, but build/plan ADV_SYNC overlay blocks lack the canonical contract line per design AD8/OOS5 preserved asymmetry. Functionally harmless — routing contract reaches build/plan agents via global always-on ~/.config/opencode/instructions/lgrep-tools.md instruction. Technically the cross-reference is misleading for these 2 files.
- **[archive_only_evidence]** findings: [info] inline-orchestrator: Praise: new test 'overlay-only sources each carry the canonical contract exactly once' is structurally well-designed — filters to overlay-only sources via existsSync check on .opencode/agents/{name}.md, avoiding the validator-flagged every-overlay conflict with C7/DONT5 exactly-once invariant for source-backed agents (adv/build/plan). Clean resolution of design tension.
- **[report_follow_up]** follow_ups: REJECTED_WITH_EVIDENCE: Original review suggestion 'build/plan user files misleading ADV_SYNC cross-reference' (fixSubAgentMcpRouting|change:scanner-bundle:review|adv-scanner-bundle|1 finding 1). Rejection rationale: (1) OOS5 explicitly preserved the asymmetry at design time and was user-approved at planning; (2) AC4 task verification documented this state as intentional ('DONT5 was based on incorrect premise; deployed files have no contract line'); (3) User accepted at acceptance with this suggestion noted as non-blocking; (4) Functional behavior preserved via always-on global ~/.config/opencode/instructions/lgrep-tools.md instruction loaded into every OpenCode agent; (5) Implementing would either expand scope per OOS5 (add contract to build/plan overlays coordinated with C7/DONT5 source-body removal) or modify delivered/accepted work post-acceptance. Fast-follow recommendation: separate future change for OOS5 architectural cleanup if/when prioritized.
- **[archive_only_evidence]** findings: [info] inline-orchestrator: Test coverage PASS. Files: (1) .opencode/overlays/explore.overlay.md — no direct test file (overlay content tested indirectly via tool-name-assets.test.ts new test). (2) scripts/deploy-local.sh — bash script, behavior spot-checked in tk-b0bc8a964818 (idempotent deploy confirmed). (3) plugin/src/tool-name-assets.test.ts — IS the test, +32 lines. (4) 4 user base files — agent prompt content, not testable. TDD evidence: RED-GREEN-VERIFY cycle evidenced in tk-04ac4d218892 (RED: new test failed as expected with explore.overlay.md absent; GREEN: 14/14 pass after creating file + deploy line). Re-ran 25/25 PASS post-merge (trunk + worktree). Coverage appropriate for change scope.
- **[archive_only_evidence]** findings: [info] inline-orchestrator: AI-Slop PASS. explore.overlay.md byte-identical to general.overlay.md (no AI-generated boilerplate). New test has thorough rationale comments and specific assertion; no placeholders or copy-paste. Deploy line follows existing 3-arg/2-arg pattern. User base file rewrites substantive.
- **[archive_only_evidence]** findings: [info] inline-orchestrator: Documentation Hygiene PASS. Overlays match existing style; canonical contract text single-sourced. Test comments cite rq tag. User base file rewrites preserve frontmatter and replace stale prose. Known doc-gap: build/plan user files have misleading 'See ADV_SYNC block for routing' reference per AD8/OOS5 (functionally covered by global lgrep-tools.md always-on instruction); rejected_with_evidence as OOS5 out-of-scope.
- **[archive_only_evidence]** findings: [info] inline-orchestrator: Production Readiness PASS. No security surface (pure prompt content; no auth/secrets/input/persistence). No reliability surface. No performance surface (overlays read at deploy time only). Maintainability: drift-detection test serves as regression guard. Complexity: 0 hotspots; largest unit is 32-line test.
- **[archive_only_evidence]** findings: [info] inline-orchestrator: Deployment Readiness PASS. No new env vars. No migrations. No external services. CI/CD: PR #250 CI 6/6 green (Gitleaks/OSV/Semgrep/Trivy/Test 24.x); deploy via existing scripts/deploy-local.sh mechanism. No infrastructure changes. No feature flags. Documentation: C1 requires OpenCode restart for user base file edits (operational step, not deploy blocker).
- **[archive_only_evidence]** findings: [info] inline-orchestrator: Cleanup PASS. No temp files (.bak/.tmp/.orig) created during this change. No debug code (console.log/debugger/print). No dead imports. No orphaned tests. No cleanup candidates.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
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
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |
| DONT9 | avoidance | not_applicable |
| DONT10 | avoidance | not_applicable |
| DONT11 | avoidance | not_applicable |
| DONT12 | avoidance | not_applicable |
| DONT13 | avoidance | not_applicable |

## Unresolved Actions

- Contract/design conflict: AC5 and AD4 require every .opencode/overlays/*.overlay.md to contain the contract, but adv/build/plan overlays do not; moving the contract into them requires omitted coordinated canonical-agent edits and conflicts with the no-ADV-owned-agent-file boundary.
- Implementation target is invalid: plugin/src/prompt-corpus.test.ts does not exist; relevant tests are in plugin/src/tool-name-assets.test.ts, and existing exactly-once effective-prompt coverage must be preserved.
- SC1/SC3 verification is not achievable as designed: build and plan are primary agents by rq-delDefaults03, not spawnable sub-agents, while Stage 14 checks only explore and only whichever one runtime mode is active.
- AC4 lacks deterministic evidence: design rewrites four user files but specifies no bounded check proving all four bodies are free of stale direct-callable routing prose.
