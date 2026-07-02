# Contract Traceability

**Change ID:** strengthenResearcherJudgement
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-02T19:44:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | src/types/subagent-reports.ts lines 379-429 — ResearcherSubagentReportSchema requires architecture_judgement via ResearcherArchitectureJudgementSchema. Targeted RED: missing architecture_judgement raises. GREEN: present architecture_judgement validates. Bin/oc-test targeted sweep 225/225 across 6 test files. |
| SC2 | success_criterion | pass | review | .opencode/agents/adv-researcher.md — Architecture Judgement Contract section appended; Research Protocol + Citation Principles + Local Code Discovery unchanged; tools grants unchanged. C2 respected. |
| SC3 | success_criterion | pass | review | .opencode/command/adv-design.md Phase 3.5 prompt + Phase 3.6 verdict table + Phase 4 Validator Result; .opencode/command/adv-research.md Command Boundary crosswalk + Architecture Judgement section + verdict crosswalk table. |
| SC4 | success_criterion | pass | review | src/types/subagent-reports.ts normalizeLegacySubagentReportRow function (lines ~600-700) + src/temporal/change-state.test.ts legacy readback fixture. Bin/oc-test targeted 225/225 includes legacy normalization paths. |
| AC1 | acceptance_criterion | pass | test | src/types/subagent-reports.ts ResearcherSubagentReportSchema.superRefine enforces pass requires non-low confidence and design-validation scope requires applicable judgement; src/tools/subagent-report.test.ts covers accept/reject cases; src/types/subagent-reports.test.ts 49 tests; 225/225 pass across contract sweep. |
| AC2 | acceptance_criterion | pass | test | src/temporal/change-state.test.ts + src/tools/change.test.ts include legacy researcher fixture without architecture_judgement; readback preserves source metadata. Targeted sweep 76+42 tests pass. |
| AC3 | acceptance_criterion | pass | test | .opencode/agents/adv-researcher.md Architecture Judgement Contract section + updated RESEARCHER_REPORT JSON example; src/optimized-handoff-assets.test.ts asserts Architecture Judgement contract + report shape; 6/6 tests pass. |
| AC4 | acceptance_criterion | pass | test | .opencode/command/adv-design.md ARCHITECTURE JUDGEMENT DIMENSIONS mapping (CORRECTNESS→risk, SIMPLICITY→tradeoffs[], SPEC-LAW COMPLIANCE→spec_law_implications, KEY ALTERNATIVES→alternatives_considered[]); src/subagent-reports-spec-assets.test.ts research command + design command assertions; 20/20 tests pass. |
| AC5 | acceptance_criterion | pass | test | .adv/specs/subagent-reports/spec.json rq-subagentReports20 body: 'architecture_judgement object is advisory-only: it MUST NOT complete gates'; .opencode/command/adv-design.md Phase 3.6 fail row marked advisory-only NEVER auto-block; .opencode/command/adv-research.md crosswalk table fail→ANTI-PATTERN advisory-only yes. |
| AC6 | acceptance_criterion | pass | test | .adv/specs/subagent-reports/spec.json rq-subagentReports01 references rq-subagentReports20; rq-subagentReports20 scenarios; .adv/specs/delegation-defaults/spec.json Independent Design Validator declares typed_persisted_worker packet contract for adv-researcher. Spec/command tests pin via src/subagent-reports-spec-assets.test.ts (20 tests including the four new Architecture Judgement assertions); bin/oc-test targeted 225/225; pnpm run check (schemas:check, typecheck, lint, format:check) passes. |
| C1 | constraint | respected | static_check | .opencode/agents/adv-researcher.md unchanged name; no adv-architect alias introduced; .adv/specs/delegation-defaults/spec.json researcher rows use adv-researcher agent. |
| C2 | constraint | respected | static_check | .opencode/agents/adv-researcher.md tool grants unchanged (Context7, Exa, searchcode, arxiv, lgrep, firecrawl, webfetch); Research Protocol + Citation + Local Code Discovery sections unchanged; Architecture Judgement Contract adds structure without narrowing responsibility. |
| C3 | constraint | respected | static_check | src/types/subagent-reports.ts ResearcherSubagentReportSchema uses .strict() and ChangeScopedBaseSubagentReportSchema superset; architecture_judgement required (not inferred); superRefine throws on missing/inconsistent fields; 49 schema tests cover reject paths. |
| C4 | constraint | respected | static_check | src/types/subagent-reports.ts normalizeLegacySubagentReportRow is deterministic (pure function over already-loaded data, no IO); src/types/subagent-reports.test.ts + src/temporal/change-state.test.ts + src/tools/change.test.ts cover legacy readback; 225/225 targeted pass. |
| C5 | constraint | respected | static_check | No addBriefingPackets references; scope is limited to architecture_judgement typed payload + prompt + command + spec; no packet renderer or lane-slice work introduced. |
| C6 | constraint | respected | static_check | .adv/specs/subagent-reports/spec.json rq-subagentReports20 body explicitly states MUST NOT complete gates; .opencode/command/adv-design.md Phase 3.6 fail row marked advisory-only NEVER auto-block; no new gate machinery added to plugin runtime. |
| DONT1 | avoidance | respected | review | .opencode/agents/adv-researcher.md tool grants unchanged; Research Protocol unchanged. |
| DONT2 | avoidance | respected | review | schema ResearcherValidationSchema.status is the only verdict source; ResearcherArchitectureJudgementSchema does not introduce a verdict field; adv-design/adv-research commands derive legacy labels via crosswalk only; adv-researcher prompt explicitly forbids a second judgement verdict field. |
| DONT3 | avoidance | respected | review | No new machine-enforced gate blocker; checkUnresolvedDesignConcerns evaluator unaffected (researcher reports do not raise DESIGN_CONCERN_UNRESOLVED); /adv-design Phase 3.6 explicitly marks fail advisory-only; spec rq-subagentReports20 body + .opencode/command/adv-design.md 'Researcher `fail` / anti-pattern judgement is advisory-only in this change'. |
| DONT4 | avoidance | respected | review | .adv/specs/delegation-defaults/spec.json Independent Design Validator row uses agent adv-researcher; no phantom routing; .opencode/agents/adv-researcher.md unchanged; no primary-agent routing drift introduced. |
| DONT5 | avoidance | respected | review | researcher judgement enforced by Zod schema ResearcherArchitectureJudgementSchema, not prose; prompt/report guidance requires typed JSON via adv_subagent_report_submit. |
| DONT6 | avoidance | respected | review | No addBriefingPackets references; no packet renderer or briefing-packet delivery/lane-slice implementation introduced; change limited to researcher architecture_judgement + command spec contract. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-17ebaad76d74 | SC1, SC4, AC1, AC2 | AC1, AC2 | C3, C4, C6, DONT2, DONT3, DONT5 |  |
| tk-2f0fd93c8398 | SC2, SC3, AC3 | AC3 | C1, C2, DONT1, DONT4 |  |
| tk-f8b8ee3d062d | SC3, AC4, AC5, AC6 | AC4, AC5, AC6 | C1, C5, C6, DONT2, DONT3, DONT4, DONT6 |  |
| tk-2f5759b354af |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
