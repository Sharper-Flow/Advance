# Archive Briefing Digest

**Change ID:** auditAgentWorkflowEvidence
**Title:** Audit agent workflow evidence
**Status:** archived
**Generated:** 2026-07-13T03:00:11.961Z

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

Showing 40 of 40 durable facts.

- **[unresolved_action]** required_main_agent_actions: Run the verification task tk-597abeba534b (rubric_review) against the published audit document
- **[unresolved_action]** required_main_agent_actions: Optionally surface the read-surface drift (reflections 20 vs baseline 19, agenda 291 vs 286) when presenting the audit
- **[archive_only_evidence]** decisions: Reported baseline-vs-re-read drift (reflections 19->20, agenda 286->291, project wisdom 8->9) in a dedicated section instead of silently adopting either number — Agreement baseline was a discovery-time snapshot; disclosing both values preserves AC1 coverage while keeping every conclusion tied to a verifiable denominator
- **[archive_only_evidence]** decisions: Per-gate friction analysis computed over the 14 of 20 reflections with readable per-entry detail, with the 6 display-truncated entries disclosed as a limitation — adv_reflection_list exposes no offset; aggregate friction/suggestion counts cover all 20 but per_gate_ms does not — claiming full coverage would violate SC3
- **[archive_only_evidence]** decisions: Cited the 45+1 change baseline from the approved agreement and reported the two adv_change_list includeArchived timeouts as an audit finding (P5) rather than retrying indefinitely — The timeout is a known tracked defect (fixChangeListTimeouts in flight); it is evidence for the audit, and P37 forbids polling-style retry loops
- **[archive_only_evidence]** decisions: Included a fifth follow-up (P5, bounded archived-inclusive listing) beyond the design's four candidates — Directly observed during the audit and corroborated by existing agenda items (ag-NSrBaHhr et al.); AC6 requires at least three, and each of the five has a measurable completion signal
- **[archive_only_evidence]** verification: test -s docs/audits/agent-workflow-evidence-2026-07.md && for a in AC1..DONT3, Q1..Q6, Confidence, uninstrumented, denominator; grep -qF ... ; echo PASS (0) — adv_run_test tr_mrik4y4w_04333a8f: document exists (158 lines) and contains all required anchors — six question sections, AC1-AC6, SC1-SC3, C1-C3, DONT1-DONT3, confidence/denominator/uninstrumented vocabulary
- **[archive_only_evidence]** verification: git status --short && git diff --stat (0) — Only new untracked path docs/audits/ present; zero modifications to code, specs, config, or other docs (C1 read-only boundary respected)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: test -s docs/audits/agent-workflow-evidence-2026-07.md && for a in AC1..DONT3, Q1..Q6, Confidence, uninstrumented, denominator; grep -qF ... ; echo PASS
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git status --short && git diff --stat
- **[agenda]** follow_ups: Packet anchors TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION were not provided verbatim in briefing-packet form; proceeded with the prompt scope per policy.
- **[agenda]** follow_ups: No adv-engineer briefing-packet sample was inspected directly (adv_change_show include.briefingPacket not run); adv-engineer context-adequacy is inferred from persisted engineer reports (context_update_for_adv, scope_drift=null, blockers=[]) rather than from a rendered packet — a follow-up could render one packet to confirm.
- **[agenda]** follow_ups: Full 286-item agenda body was truncated (72 shown); category dominance (subagent-followup) is confirmed from the visible slice and _meta, but exact pending/done split per category was not fully enumerated.
- **[archive_only_evidence]** sources: adv_change_list (recency, incl archived/closed, limit 100): Denominator: 45 changes in window. ~30 archived, ~13 draft/in-flight. Recurring titles: timeout/listing, phase9 PR-merge redetect, epic projection/repair, target_path routing. Fast-follow lineage present (fixShallowRepoIdentity->runPokeedgeConsolidation, addLoopLedger->fixLoopLedgerRegressions, fixPhase9SquashMergeRedetect->autoDrivePrArchiveCompletion).
- **[archive_only_evidence]** sources: adv_reflection_list (19 reflections): Only 8 of 19 reflections carry any friction_item (11 zero-friction). Friction denominator small: missing_capability 4, tool_gap 2, docs_gap 1. retry_total>0 in only 3/19 (addEpicRetirement 1, fixPhase9PrDetection 2). Per-gate timing shows planning + acceptance as largest elapsed sinks (planning 27.9M ms addEpicRetirement; acceptance 23.4M ms fixPhase9PrDetection).
- **[archive_only_evidence]** sources: Persisted sub-agent reports (_subagentReportsMeta + report bodies): MOST-FREQUENT observed agent problem: consumer_warnings kind=verification_missing on adv-engineer reports — 'No adv_run_test evidence found for reported command'. Present on EVERY sampled adv-engineer report in addRepoBacklog (5/5 tasks) and fixChangeListTimeouts tk-14b7d32f4775 (4 commands flagged). Engineers ran pnpm/grep/vitest directly instead of adv_run_test, so verification is asserted but not durably backed.
- **[archive_only_evidence]** sources: adv_agenda_list (286 items): 286 agenda items; vast majority category=subagent-followup and status=pending, generated from sub-agent report follow_ups/required_main_agent_actions. Large pending backlog indicates follow-up capture works but drain/triage lags. Also captures planning-gate open questions (spec-id pinning, line-drift, deploy/restart boundary).
- **[archive_only_evidence]** sources: adv_wisdom_list / adv_project_wisdom_list: Recurring durable gotchas: (1) source-vs-dist reload boundary (branch build vs live tool) — 3 distinct entries; (2) targeted-vitest vs broad-suite RED/GREEN pollution; (3) PR-mode squash-merge release proof; (4) branch-deploy hazard from post-commit hook. Wisdom_reuse_hits=0 across all 19 reflections — captured wisdom is not measurably reused.
- **[archive_only_evidence]** sources: Research-pack / adv-researcher usage evidence: adv-researcher validator/leverage-scout invoked at design gate in most sampled changes (diagnoseArchivedListingTimeout2 'independent validator clean pass'; fixShallowRepoIdentity 'validated independently by adv-researcher: PASS'; addAdvVerifier 'leverage scout + validator pass inline'). BUT persistence frequently degraded: addAdvVerifier notes 'report persistence degraded in subagents due workflow reachability but source-backed findings incorporated'. Research packs ARE used at design; their typed reports are inconsistently persisted.
- **[archive_only_evidence]** architecture_assessment: Durable ADV evidence for the last 10 days shows a healthy prep/gate pipeline (100% TDD compliance flag, 0.857 gate completion rate is the standard 6/7 pre-release measure, low retry density) but three concrete, source-backed instrumentation/context gaps. (1) The single most frequent AGENT problem is not a task failure but an EVIDENCE-INTEGRITY gap: adv-engineer sub-agent reports consistently claim verification commands (pnpm run typecheck, pnpm run schemas:check, grep, vitest) that carry no adv_run_test evidence, surfaced as consumer_warnings kind=verification_missing on essentially every sampled engineer report. Verification is asserted in prose, not durably captured, so acceptance leans on self-reported strings. (2) adv-researcher research packs ARE used at the design gate (validator + leverage scout), but their typed reports are frequently 'persistence degraded' due to workflow reachability, so research coverage is real while its durable trace is lossy. (3) Follow-up capture is over-productive relative to drain: 286 agenda items, dominated by pending subagent-followup, versus 13 wisdom entries with wisdom_reuse_hits=0 in all 19 reflections — the system captures learnings but does not measurably reuse them. Phase friction, by per_gate elapsed, concentrates in planning (human HITL approval latency) and acceptance (review + full-suite verification), not execution. MOST-USED artifacts: proposal, agreement, design, contract (present in every sampled change). LEAST-USED / least-durable: executiveSummary (only on archived changes), problem-statement (problemStatementExists=false widely; folded into proposal), and durable per-command verification evidence. Prep-to-implementation alignment is structurally strong (contract_refs implements/verifies/respects on tasks; briefing packets consumed) but the engineer's ACTUAL verification is under-instrumented. Separating observed fact from missing instrumentation: retry/friction counts are LOW but that is partly because friction is only recorded when a retry or blocker fires — silent verification_missing warnings are NOT counted as friction, so reflection friction metrics understate the real evidence gap.
- **[archive_only_evidence]** findings: test
- **[archive_only_evidence]** hotspots: test
- **[archive_only_evidence]** risks: test
- **[unresolved_action]** open_questions: test
- **[agenda]** follow_ups: Execution should capture run-time denominators alongside the 45-change / 19-reflection design-time baseline to keep AC1 verifiable under read-surface drift.
- **[agenda]** follow_ups: Report should note that CLARIFY_UNCLEAR_SCOPE (proposal lacked a Scope section) is materially resolved by the problem-statement Scope block.
- **[archive_only_evidence]** sources: Persisted agreement/design/contract (adv_change_show include flags): Standard-rigor typed contract with 6 ACs, 3 SCs, 3 constraints (C1-C3), 3 avoidances (DONT1-3). Design maps AC1-AC4 to evidence-model+procedure 1-3, AC5 to procedure 4-5, AC6 to follow-up signals, SC/C to source hierarchy + read-only boundary, DONT to key decisions/risks. Full contract-coverage table present.
- **[archive_only_evidence]** sources: verification_missing is a subagent-report consumer-warning kind, not a reflection friction category: verification_missing exists only as a consumer_warnings.kind emitted when engineer reports list verification commands without matching adv_run_test evidence. Confirms design claim that it is an evidence-integrity defect NOT currently surfaced as a reflection friction category.
- **[archive_only_evidence]** sources: Briefing-packet renderer enforcement tier (warn-first vs hard gate): Missing sections (scope/verification/affected_files/durable_facts) are collected as advisory unavailable_markers, not hard failures; renderer never throws on omission. Validates design/agreement claim that scope/stop/verification anchors are warn-first and packet freshness is not a hard gate; identity anchors are enforced separately.
- **[archive_only_evidence]** architecture_assessment: This is a read-only, self-referential evidence audit of ADV's own workflow. The design is well-constructed for its scope. Contract coverage is complete: all AC1-AC6, SC1-SC3, C1-C3, DONT1-3 have an explicit mapping in the design's Contract Coverage section and are traceable to procedure steps and key decisions. The evidence-class model (observed presence / contract-required consumption / uninstrumented adoption) is the correct structural defense against false-negative inference from missing telemetry (P33 structural-correctness alignment) and is reinforced by C3, DONT2, DONT3, and risk mitigations. The 'treat missing telemetry as unknown, not non-use' guardrail is stated in problem statement Boundaries, agreement Constraints (C3), design Key Decisions, and AC3 — consistent and non-contradictory across all four artifacts. Prep->packet trace accuracy is source-verified: the design's claim that prep does NOT consume docs/*-prep.md directly and that engineer packets split strict identity anchors from warn-first contextual anchors is backed by the actual renderer (advisory markers, no hard gate) and by the verification_missing consumer-warning path. Follow-ups are measurable: each of the 5 candidates carries an observable completion signal (zero-count query, per-change queryable count, non-null reuse count, pending/age distribution, end-to-end pack-citation test) and each is explicitly held out of this audit's scope (DONT + O4 + AC6 'no unapproved runtime change'). No blockers. Two minor notes: (1) the recorded clarify finding CLARIFY_UNCLEAR_SCOPE (no Scope section in proposal) is materially resolved downstream by the problem statement's explicit Scope block and the design's evidence model, so it is non-blocking. (2) AC1's fixed denominators (45 changes / 19 reflections) are point-in-time snapshot facts; measurement drift between design time and execution is a mild reproducibility risk already mitigated by the design's 'retain denominator/limitation in every conclusion' rule.
- **[archive_only_evidence]** findings: [info] Baseline drift and omitted-terminal disclosure pass.
- **[archive_only_evidence]** findings: [info] Issue, artifact, and research-pack treatment pass.
- **[archive_only_evidence]** findings: [info] Prep-to-packet enforcement tiers pass.
- **[archive_only_evidence]** findings: [info] Follow-ups and read-only constraints pass.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When auditing research-pack use, distinguish high-level proposal/discovery consumption permission from direct per-command enforcement; do not label discovery as the only contract path when ADV_INSTRUCTIONS.md names both.
- **[archive_only_evidence]** changes_made: docs/audits/agent-workflow-evidence-2026-07.md: Corrected Q4 research-pack wording: proposal/discovery consumption is contract-permitted, direct command enforcement is documented for discovery, and uninstrumented adoption now covers proposal/discovery runs.
- **[archive_only_evidence]** verification: tests_run=test -s docs/audits/agent-workflow-evidence-2026-07.md && grep -qF 'contract-required for proposal/discovery' docs/audits/agent-workflow-evidence-2026-07.md && grep -qF 'proposal/discovery runs cited which pack' docs/audits/agent-workflow-evidence-2026-07.md && grep -qF 'Baseline vs re-read drift' docs/audits/agent-workflow-evidence-2026-07.md && git diff --check results=pass — tr_mrikdrqc_d898e246 exit 0. Review confirmed agreement/contract coverage; baseline-vs-reread drift is disclosed in §0 and limitations; Q4 separates production, citation contracts, validator use, and uninstrumented consumption; Q5/Q6 distinguish strict identity, warn-first anchors, and unmeasured packet consumption. Task evidence records independent rubric review PASS/high confidence.
- **[unresolved_action]** required_main_agent_actions: Proceed with normal release/archive handoff; no scoped hardening remediation is required.
- **[unresolved_action]** required_main_agent_actions: Do not treat the Markdown-path targeted-test discovery exit as a product failure: the document-only deliverable has no matching test suite; preserve source-audit and acceptance-matrix evidence as release proof.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Docs-only release-hardening analysis. Worktree is clean (`git status --porcelain=v1` empty; `git diff --check` and `git diff --quiet` pass). HEAD 31ca6419 contains only docs/audits/agent-workflow-evidence-2026-07.md. Targeted test discovery for that Markdown path correctly found no test files (exit 1), so no code test applies. Source spot checks confirm bounded claims: adv-discover requires cited research-pack consultation/citations (.opencode/command/adv-discover.md:314-365); adv-prep maps contract/evidence policy without direct pack consumption (.opencode/command/adv-prep.md:109-163,251-261); verification_missing warnings are advisory merge-only (plugin/src/tools/subagent-report.ts:388-471). Acceptance gate evidence shows 15/15 contract-review rows pass/respected, all tasks done, executive summary present; release is next gate with no listed blockers.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- Run the verification task tk-597abeba534b (rubric_review) against the published audit document
- Optionally surface the read-surface drift (reflections 20 vs baseline 19, agenda 291 vs 286) when presenting the audit
- verification_missing: No adv_run_test evidence found for reported command: test -s docs/audits/agent-workflow-evidence-2026-07.md && for a in AC1..DONT3, Q1..Q6, Confidence, uninstrumented, denominator; grep -qF ... ; echo PASS
- verification_missing: No adv_run_test evidence found for reported command: git status --short && git diff --stat
- test
- Proceed with normal release/archive handoff; no scoped hardening remediation is required.
- Do not treat the Markdown-path targeted-test discovery exit as a product failure: the document-only deliverable has no matching test suite; preserve source-audit and acceptance-matrix evidence as release proof.
