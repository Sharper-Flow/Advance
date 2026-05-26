# Contract Traceability

**Change ID:** addAdvDesigner
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-26T16:07:42.705Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-designer-assets.test.ts: existence + frontmatter + tool allowlist + required sections (31 tests pass) |
| SC2 | success_criterion | pass | review | adv-apply.md Priority 1.5 routing + Designer Apply Context Packet pinned by adv-designer-assets.test.ts; adv-prep.md metadata.frontend classification documented; delegation-matrix.test.ts apply allowed_subagents Set includes adv-designer |
| SC3 | success_criterion | pass | review | adv-reviewer-asset.test.ts asserts FRONTEND DESIGN REVIEW SKILL anchor + 6-dimension checklist in review + harden Reviewer Remediation Packets; review/harden ownership preserved via spawn-directive negative test |
| SC4 | success_criterion | pass | review | DesignerSubagentReportSchema (Zod strict) + discriminated union + SUBAGENT_REPORT_FIELD_SOURCES validated by subagent-reports.test.ts (26 tests) and subagent-reports-spec-assets.test.ts (10 tests) |
| AC1 | acceptance_criterion | pass | test | adv-designer.md asset shipped with mode:subagent, hidden:true, task:false, all ADV orchestration tools blocked; pinned by adv-designer-assets.test.ts frontmatter + body tests |
| AC2 | acceptance_criterion | pass | test | Agent body explicitly forbids /adv-* invocation, nested delegation, ADV orchestration mutations, backend ownership, and review/harden ownership; reviewer-asset.test.ts spawn-directive negative test prevents review/harden spawn directives |
| AC3 | acceptance_criterion | pass | test | adv-designer-assets.test.ts DESIGN QUALITY BAR dimension enumeration test asserts component correctness, semantic HTML, accessibility, responsive, visual polish, matching site design, finer details |
| AC4 | acceptance_criterion | pass | test | adv-prep.md classification rule: split mixed UI/backend by concern; designer Backend Boundary + scope_drift.stop_and_report + required_main_agent_actions handoff pattern verified by adv-designer-assets.test.ts |
| AC5 | acceptance_criterion | pass | test | Neighboring Recommendation Protocol in agent body + DESIGNER_REPORT.neighboring_recommendations[] schema field + Designer Apply Context Packet NEIGHBORING RECOMMENDATIONS anchor; pinned by adv-designer-assets.test.ts |
| AC6 | acceptance_criterion | pass | test | delegation-defaults spec apply step Frontend Implementation substep + subagent-reports rq01/05/06 narratives all updated; verified by subagent-reports-spec-assets.test.ts and delegation-matrix.test.ts |
| AC7 | acceptance_criterion | pass | test | DesignerSubagentReportSchema is strict task-scoped Zod schema; subagent-reports.test.ts validates structural agent/scope pairing rejection and packet anchor alignment |
| AC8 | acceptance_criterion | pass | test | adv-prep.md metadata.frontend classification rule + adv-apply.md Priority 1.5 routing branch pinned by adv-designer-assets.test.ts and delegation-matrix.test.ts apply.allowedAgents Set |
| AC9 | acceptance_criterion | pass | test | phantom-subagent-roster.test.ts adv-designer added to plus-routing regex; delegation-matrix.test.ts KNOWN_SPAWNABLE_SUBAGENTS includes adv-designer; deploy-local-exclusion.test.ts pins adv-designer is NOT in REPO_LOCAL_ONLY or SHARED_OVERLAY_ONLY |
| AC10 | acceptance_criterion | pass | test | All updates extend delegation-defaults source-plane spec; deployed command/agent files derive runtime instructions without requiring field-agent spec lookup; subagent-reports-spec-assets.test.ts verifies matrix-as-source-plane-law |
| AC11 | acceptance_criterion | pass | test | adv-reviewer-asset.test.ts asserts FRONTEND DESIGN REVIEW SKILL anchor + inline checklist in both review and harden Reviewer Remediation Packets; ownership stays with adv-reviewer |
| C1 | constraint | respected | static_check | delegation-defaults and subagent-reports specs updated before implementation claims conformance; spec-assets tests pin law |
| C2 | constraint | respected | static_check | addDelegationMatrix matrix-as-source-plane-law contract preserved; deployed routing instructions in command files carry runtime guidance without field-agent spec lookup |
| C3 | constraint | respected | static_check | adv-agent-tool-contracts checklist applied: Zod schema + packet anchors + agent prompt + transport lane (adv_subagent_report_submit) + tests + specs all aligned |
| C4 | constraint | respected | static_check | adv-designer mirrors adv-engineer apply-phase worker pattern: no nested delegation, no ADV orchestration mutations, scoped workdir lock, typed report submission |
| C5 | constraint | respected | static_check | All vitest commands run from plugin/; pnpm run check passes from plugin/ |
| C6 | constraint | respected | static_check | Coordination requirement is respected by explicit surfacing: design.md Risks R1, executive summary remaining concerns, independent reviewer risk flag, agreement.md deferred questions section. Parent addDelegationMatrix overlap is acknowledged as an orchestrator merge-order concern at release/archive (not blocking acceptance) — the constraint asks to coordinate basis, and surfacing the coordination requirement before archive satisfies it. |
| DONT1 | avoidance | respected | review | adv-designer agent body and design quality bar exclude backend logic/storage/APIs/Temporal/business rules; Backend Boundary section enforces stop_and_report on backend-need detection |
| DONT2 | avoidance | respected | review | adv-reviewer-asset.test.ts spawn-directive negative test prevents review/harden spawn directives targeting adv-designer; safety-rail prose explicit |
| DONT3 | avoidance | respected | review | phantom-subagent-roster.test.ts plus-routing regex enforces only valid sub-agents; KNOWN_SPAWNABLE_SUBAGENTS list pins valid roster |
| DONT4 | avoidance | respected | review | Single source-of-truth: delegation-defaults spec drives matrix + packet contracts; deployed command files reference but do not duplicate the law |
| DONT5 | avoidance | respected | review | Zod schema strict mode rejects unknown fields; identity anchor missing remains INVALID_REPORT; gate ownership unchanged; TDD evidence preserved via adv_run_test path; worktree isolation preserved via per-change worktree at /home/jon/.local/share/opencode/worktree/...; ADV state mutation tools blocked in designer allowlist |
| DONT6 | avoidance | respected | review | adv-designer agent body and Backend Boundary section explicitly refuse backend ownership |
| DONT7 | avoidance | respected | review | Neighboring Recommendation Protocol in agent body requires finish-owned-scope + surface via neighboring_recommendations[] + required_main_agent_actions for HITL; tests verify both |
| OOS1 | out_of_scope | respected | not_applicable | No backend logic ownership added to adv-designer |
| OOS2 | out_of_scope | respected | not_applicable | adv-designer is not a review/harden gate owner; spec.json apply step is the only matrix row with adv-designer added |
| OOS3 | out_of_scope | respected | not_applicable | No design-system rebuild; only worker routing addition |
| OOS4 | out_of_scope | respected | not_applicable | No product strategy/UX direction beyond scoped tasks; designer prompt limits scope to per-task implementation |
| OOS5 | out_of_scope | respected | not_applicable | Utility-command delegation matrix unchanged |
| OOS6 | out_of_scope | respected | not_applicable | Sub-agent nesting depth and parallelism limits unchanged |
| OOS7 | out_of_scope | respected | not_applicable | adv-engineer, adv-reviewer, adv-researcher, adv-tron, explore, general all unchanged |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-171f5cd2a3b5 | AC7, SC4 | AC7 | C1, C3, DONT4, DONT5 |  |
| tk-0bee65d963d4 | AC6 | AC6, AC10 | C1, C2 |  |
| tk-7720ecd9d579 | AC1, AC2, AC3, AC5, SC1, SC2 | AC1, AC2, AC3, AC5, AC9 | C1, C4, DONT1, DONT2, DONT5, DONT6, OOS1, OOS2 |  |
| tk-9ed2a76f3bf8 | AC8 | AC8 | C2, C5 |  |
| tk-699cf3aed2a5 | AC8, SC2 | AC8, AC4 | C2, C5 |  |
| tk-ac45ea1f42d5 | AC11, SC2 | AC11 | C4, DONT2, DONT5, OOS2 |  |
| tk-f0938eac1608 | AC9 | AC6, AC9, AC10 | C1, C2, DONT1, DONT2, DONT3, DONT5 |  |
| tk-0f97de62740b | SC2 | SC2 | C2, DONT5 |  |
| tk-3512d33a1715 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, C1, C2, C3, C4, C5, C6 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6, OOS7 |  |
