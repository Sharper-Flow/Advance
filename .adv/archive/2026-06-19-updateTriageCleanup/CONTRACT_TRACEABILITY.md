# Contract Traceability

**Change ID:** updateTriageCleanup
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-19T18:17:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | `.opencode/command/adv-triage.md` Phase 3.5 runs before Phase 4 issue creation/scoring; `plugin/src/adv-triage-relevance-assets.test.ts` asserts cleanup before issue creation, field assignment, and no-work skip. |
| SC2 | success_criterion | pass | review | Command Phase 3.5 and `skills/adv-triage/PROMPTS.md` require source, classification/reason, evidence, proposed action, and survivor/source for cleanup candidates. |
| SC3 | success_criterion | pass | review | Command Phase 3.5 and prompt template batch destructive/suppressive cleanup approvals by source/reason; anti-patterns forbid mutation from title similarity alone. |
| SC4 | success_criterion | pass | review | Command Phase 3.5 and `PROMPTS.md` map agenda duplicate/superseded/should-merge to `adv_agenda_complete` with survivor/source note; asset test checks prompt contains `adv_agenda_complete`. |
| SC5 | success_criterion | pass | review | `rq-backlogCoord09` added to backlog-coordination spec; `bin/oc-test targeted -- src/adv-triage-relevance-assets.test.ts` passed (tr_mql935o4_d2cd81a9, 7 tests). |
| AC1 | acceptance_criterion | pass | test | Asset test `command requires source cleanup before issue creation and field prompts` asserts Phase 3.5 after match and before `4a`/`4c`; reviewer added assertion that no-work skip follows cleanup. Test passed tr_mql935o4_d2cd81a9. |
| AC2 | acceptance_criterion | pass | test | `cleanup_decisions[]` schema defines source/ref/classification/evidence/proposedAction/approvalGroup; prompt template displays source, classification, evidence, proposed action, survivor/source. |
| AC3 | acceptance_criterion | pass | test | `PROMPTS.md` Source cleanup validation prompt groups by source/reason and requires exact Tier B approval options before applying actions; command says mutate/suppress only after explicit Tier B approval. |
| AC4 | acceptance_criterion | pass | test | Command Phase 3.5 states title similarity and agent inference are advisory only and never mutate/close/suppress/remove without structural evidence and approval; schema/anti-patterns repeat this boundary. |
| AC5 | acceptance_criterion | pass | test | Command Phase 3.5 and `PROMPTS.md` specify agenda duplicate/superseded/should-merge → `adv_agenda_complete` with survivor/source note after approval. |
| AC6 | acceptance_criterion | pass | test | Command and prompts require capability detection via `gh issue close --help`, native `--duplicate-of` only when present, and fallback `Duplicate of #N` comment semantics plus locally supported close reasons. |
| AC7 | acceptance_criterion | pass | test | `plugin/src/adv-triage-relevance-assets.test.ts` covers cleanup ordering, schema/prompt contract, GitHub duplicate capability detection, and advisory-only spec law; passed tr_mql935o4_d2cd81a9. |
| AC8 | acceptance_criterion | pass | test | Backlog-coordination spec includes `rq-backlogCoord09` with cleanup-before-creation/scoring behavior, advisory-only heuristics, and multiple scenarios; asset test passed. |
| C1 | constraint | respected | static_check | Reviewer verdict READY; command/schema/anti-patterns make heuristics advisory only and require structural evidence + approval for mutation/suppression. |
| C2 | constraint | respected | static_check | Command Phase 3.5 and skill core flow state bug Priority and feature Value prompts occur only after cleanup validation; no autonomous Value assignment added. |
| C3 | constraint | respected | static_check | Cleanup prompt and command require explicit Tier B approval for destructive/suppressive actions grouped by source/reason. |
| C4 | constraint | respected | static_check | Scope limited to `/adv-triage` command, adv-triage skill docs, backlog-coordination spec, and asset tests; no broad repo hygiene machinery added. |
| C5 | constraint | respected | static_check | ROADMAP generation flow remains Phase 6 deterministic from fresh GitHub Project read after cleanup decisions; no formula/generation implementation changed. |
| C6 | constraint | respected | static_check | Docs require `gh issue close --help` capability detection and fallback when `--duplicate-of` unavailable; no hard dependency on unavailable local CLI flags. |
| DONT1 | avoidance | respected | review | Command and anti-patterns forbid close/complete/cancel/remove/suppress/deprioritize from title similarity alone. |
| DONT2 | avoidance | respected | review | Asset test asserts cleanup validation before field assignments; command says MUST NOT prompt for Priority/Value before cleanup validation. |
| DONT3 | avoidance | respected | review | Command Phase 3.5 requires unclear items get focused clarification and stay visible; unresolved items are not silently suppressed. |
| DONT4 | avoidance | respected | review | Cleanup prompt uses Tier B exact whitelist for mutations; no new GitHub/project mutation path without approval added. |
| DONT5 | avoidance | respected | review | No `/adv-cleanup` files changed; `/adv-cleanup` only used as conceptual pattern reference in design, not replacement. |
| DONT6 | avoidance | respected | review | No WSJF formula or bug priority label semantics changed; triage skill formulas remain unchanged. |
| DONT7 | avoidance | respected | review | No Temporal/store access code added; changes are command/skill/spec/test documentation and asset assertions only. |
| OOS1 | out_of_scope | respected | not_applicable | No one-off cleanup of current project backlog was run; implementation only updates workflow docs/spec/tests. |
| OOS2 | out_of_scope | respected | not_applicable | WSJF formula and bug priority label semantics unchanged. |
| OOS3 | out_of_scope | respected | not_applicable | No automation of feature Value assignment added; Value remains user-owned unless user explicitly chooses autofill in existing prompt flow. |
| OOS4 | out_of_scope | respected | not_applicable | No `/adv-cleanup` replacement or behavior change introduced. |
| OOS5 | out_of_scope | respected | not_applicable | No broad repository hygiene beyond triage source-pool cleanup contract. |
| OOS6 | out_of_scope | respected | not_applicable | No `/adv-roadmap` or backlog read tool code changed; only spec/test awareness added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-07970a16318b |  | AC1, AC4, AC7, AC8 | C1, DONT1, DONT2, DONT3 |  |
| tk-1085271107bb | AC8, SC5 | AC8 | C1, C2, C4, DONT1, DONT2, DONT6 |  |
| tk-f7455998493b | AC1, AC2, AC3, AC4, SC1, SC2, SC3 | AC1, AC2, AC3, AC4 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
| tk-dfd36ea05cd8 | AC2, AC3, AC5, AC6, SC2, SC3, SC4 | AC2, AC3, AC5, AC6 | C1, C3, C4, C6, DONT1, DONT3, DONT4, DONT5, DONT7, OOS4, OOS5 |  |
| tk-b78de1e5d273 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
