# Agent Workflow Evidence Audit — 2026-07-03 through 2026-07-13

- **Change:** `auditAgentWorkflowEvidence` (task `tk-01870dea3e22`, evidence policy `source_audit`)
- **Audit read window:** 2026-07-13 ~01:30–02:00 UTC
- **Mode:** read-only. No code, spec, configuration, or runtime-state behavior is changed or proposed as changed by this document. Follow-ups are bounded measurement proposals only.
- **Source hierarchy (approved design):** (1) ADV MCP lifecycle state and typed sub-agent reports; (2) repository source/spec/tests for required and enforced behavior; (3) reflections/wisdom/agenda as operational signal bounded by their recording/truncation behavior; (4) agent prose as supporting evidence only.

## 0. Evidence baseline and read-surface drift

Denominators below come from the approved agreement evidence baseline (discovery snapshot) and were re-read at audit time. Where the re-read differs, both values are reported — drift is disclosed, not silently reconciled.

| Surface | Approved baseline | Audit re-read | Source of re-read | Note |
|---|---|---|---|---|
| Retrievable changes | 45, plus 1 terminal candidate omitted by the read surface | not independently re-verified | `adv_change_list includeArchived+includeClosed` timed out twice (>10 s each); active-only read returned 8 active changes with `hydrationStats.totalIds: 24` | The timeout is itself evidence: in-flight change `fixChangeListTimeouts` (draft, 1/5 tasks) already tracks this defect, and agenda items `ag-NSrBaHhr`, `ag-EdG3Ayhz`, `ag-Rr-UeUdn`, `ag-23qGxeIV` plan bounded archived-inclusive reads. The 45+1 baseline is cited from the approved agreement; the 24-ID index uses a different read surface and is not reconciled here. |
| Reflection records | 19 | 20 | `adv_reflection_list maxEntries:25` → `total: 20` | +1 since baseline (`rf-zO_TzDKl`, `fixShallowRepoIdentity`, archived 2026-07-13T01:03:56Z). Aggregate friction/suggestion counts cover all 20; per-entry detail is readable for 14 of 20 (6 display-truncated; the tool exposes no offset). |
| Agenda items | 286 | 291 total; 273 pending (93.8%) | `adv_agenda_list includeCompleted` → `count: 291`; `adv_agenda_list status:pending` → `count: 273` | +5 since baseline. Readable pending sample is dominated by category `subagent-followup`. |
| Change-scoped wisdom | 13 | 3 visible in aggregate read | `adv_wisdom_list` (no changeId) → `count: 12` = 3 change-scoped + 9 project | The aggregate read covers active changes + project-level wisdom only; change-scoped wisdom on archived changes is not surfaced by this read path. The 13-entry baseline is not contradicted — it is unreachable through the default aggregate surface. |
| Promoted project wisdom | 8 | 9 | same read | +1 since baseline (`pw-cYbIYYwU`, recorded 2026-07-13T01:02:06Z). |

**Evidence classes used throughout:** *observed presence* (artifact/record exists in a sample), *contract-required consumption* (a command/agent contract requires the artifact to be read or produced), *uninstrumented adoption* (no durable counter exists; absence of telemetry is treated as unknown, never as non-use).

---

## Q1. What are the most frequent agent issues?

Ranked by recorded evidence. Low recorded retry counts are not treated as low true friction (approved constraint DONT1; silent evidence-integrity warnings are counted separately).

| # | Issue | Count / denominator | Evidence source | Confidence |
|---|---|---|---|---|
| 1 | **Evidence-integrity warnings (`verification_missing`)** — engineer/reviewer reports list verification commands with no matching `adv_run_test` structured evidence or recorded-text mention | Approved baseline finding 1 (persisted reports sampled across six representative changes); independently re-confirmed in 1 of 3 changes re-sampled at audit time: `fixPhase9PrDetection` task `tk-6b5a512d2bd4` engineer report carries **5** `verification_missing` consumer warnings | Persisted sub-agent report (`adv_change_show include.subagentReports`); emission mechanism `plugin/src/tools/subagent-report.ts:388-459`; warnings are merged advisory-only (`subagent-report.ts:461-471`) and are **not** a reflection friction category | High that it recurs; medium on rank (bounded sample) |
| 2 | **Capability/knowledge gaps surfaced as friction** — `missing_capability` is the largest reflection friction category | 5 of 11 friction items across 20 reflections (`byFrictionCategory`: missing_capability 5, docs_gap 2, ux_friction 2, tool_gap 2) | `adv_reflection_list` aggregate counts | High |
| 3 | **Recorded retry events** — genuinely low | 3 retry events across 2 of 20 reflections: `rf-sjxw_pmR` (`addEpicRetirement`, 1 retry), `rf-BydJmrcN` (`fixPhase9PrDetection`, 2 retries). "Retry events detected" suggestion count: 2 | `adv_reflection_list` | High for what is recorded; low as a proxy for true friction (silent warnings are not retries) |
| 4 | **Sub-agent report persistence degradation** — worker-side submit can fail and require orchestrator re-submission | 1 concrete instance in 3 re-sampled changes: `fixShallowRepoIdentity` design validator report blockers: "Worker-side report persistence failed with WorkflowNotFoundError … re-submitted by orchestrator via target_path"; same report: "design.md artifact was unfetchable from worker context" | Persisted researcher report on `fixShallowRepoIdentity`; corroborated by approved baseline finding 5 | High (instance); medium (frequency) |
| 5 | **Read-surface timeouts on archived-inclusive listing** | 2 of 2 `adv_change_list includeArchived+includeClosed` attempts during this audit timed out (>10 s) | Direct audit observation; tracked in-flight change `fixChangeListTimeouts`; planned regression tests in agenda items `ag-NSrBaHhr` et al. | High |

**Conclusion:** the strongest *recorded* recurring issue is not task retries (3 events) but verification-evidence integrity (`verification_missing`), which is currently advisory-only and invisible to reflection friction categorization. Denominator caveat: the six-change sample is approved-baseline; the audit re-sample is 3 changes.

## Q2. Which artifacts/documents are most-used and least-used?

Artifact classes below separate observed presence from consumption. Missing telemetry is never read as non-use (constraint C3).

| Artifact | Observed presence | Consumption evidence | Class |
|---|---|---|---|
| Proposal, agreement, design | 4 of 4 sampled changes (`auditAgentWorkflowEvidence`, `fixShallowRepoIdentity`, `fixPhase9PrDetection`, `fixDirectArchiveMerge`) | Gate `artifact_evidence.content_hash` recorded at each gate completion on all sampled changes | Observed presence + gate-required production. **Most-used lifecycle artifacts.** |
| Typed ChangeContract | 4 of 4 sampled changes (standard or strict rigor minted at discovery) | Tasks carry `contract_refs` implements/verifies/respects on all sampled changes (e.g. `fixDirectArchiveMerge` review matrix 16/16 rows) | Contract-required consumption |
| Executive summary | 3 of 3 archived sampled changes; absent on the active change | Written at archive (`executiveSummary.updatedAt` ≈ `lastSignalAt` on archived samples) | Observed presence, **archive-weighted** — not an execution-time input |
| Problem statement | 2 of 4 sampled changes (`problemStatementExists: false` on the other 2) | Folded into proposal when absent | Observed presence, optional |
| Durable per-command verification evidence (`adv_run_test` records) | Partial: cited on some tasks (e.g. `fixShallowRepoIdentity tk-419ca51e73a3` cites `tr_mrgjbd47…` RED/GREEN/VERIFY triple; `fixPhase9PrDetection tk-6b5a512d2bd4` cites `tr_mrau8tih_3baf5226`) | 5 commands in that same engineer report lack matching evidence (Q1 #1) | **Least-durable artifact.** Presence is task-prose-dependent; no gate enforces per-command evidence |
| Wisdom entries | 7 captured in 14 readable reflections; baseline 13 change-scoped + 8 promoted | `wisdom_reuse_hits: 0` in 14 of 14 readable reflections; archived-change wisdom unreachable via aggregate read (§0) | **Least-consumed artifact.** Production is recorded; reuse is uninstrumented beyond a null/zero counter |
| Agenda items | 291 total, 273 pending (93.8%) | Done/cancelled = 18 in the same read | High production, low drain; drain rate unmeasured over time |

**Most-used:** proposal/agreement/design/contract chain (100% presence in sample, gate-enforced production, task-level consumption). **Least-durable:** per-command verification evidence. **Least-consumed:** wisdom (0 recorded reuse hits) and the pending agenda backlog. No artifact's *adoption* beyond these surfaces is instrumented.

## Q3. Which workflow phases create the most friction?

Per-gate elapsed time from the 14 of 20 reflections with readable detail (6 entries display-truncated — limitation). "Friction" = elapsed time; retry counts from Q1.

| Gate | Σ elapsed (14 reflections) | Longest-phase count | Note |
|---|---|---|---|
| Discovery | ≈149.6 M ms | 4 of 14 | Dominated by one outlier: `fixShallowRepoIdentity` discovery 118.3 M ms (≈32.9 h, awaiting incident/user input — 79% of the gate total). Excluding it: ≈31.2 M ms |
| Planning | ≈38.7 M ms | 2 of 14 | Includes the single largest non-discovery gate: `addEpicRetirement` planning 27.9 M ms (human approval checkpoint) |
| Acceptance | ≈38.3 M ms | 3 of 14 | Includes `fixPhase9PrDetection` acceptance 23.4 M ms (review/full-suite) |
| Execution | ≈35.0 M ms | 4 of 14 | Rarely the longest gate; `per_gate_work_ms` shows execution dominates *active work* time, while elapsed friction sits in approval/review waits |
| Proposal | ≈7.2 M ms | 1 of 14 | — |
| Design | ≈4.1 M ms | 0 of 14 | Never the longest gate in the sample |

**Conclusion (matches approved baseline finding 3):** planning (human approval) and acceptance (review/full-suite) carry the most elapsed friction; discovery spikes only with external waits; execution is rarely the longest phase. Confidence: high for the 14 readable reflections; medium for the full 20 (6 entries truncated, no read offset available).

## Q4. Are research packs (`docs/*-prep.md`) used?

Distinguish three things the approved design requires: pack production, design-stage researcher/validator work, and actual pack consumption.

- **Production — contract-required and observed.** `/adv-improve` persists packs under `docs/*-prep.md` (`.opencode/command/adv-improve.md:9,19,23,96-97,109`). Four packs exist in repo `docs/`: `adv-run-test-prep.md`, `adv-slop-scan-prep.md`, `non-coding-task-rigor-prep.md`, `repo-improve-prep.md` (observed presence).
- **Consumption path — contract-required for proposal/discovery, with direct command evidence at discovery.** ADV workflow guidance permits `docs/*-prep.md` packs to be consumed by `/adv-proposal` or `/adv-discover` (`ADV_INSTRUCTIONS.md:191`); `/adv-discover` directly requires consulting cited packs before new external searches and citing specific sections (`.opencode/command/adv-discover.md:48,317,323,326,360-365`). `/adv-prep` contains **no** reference to `docs/*-prep.md` (grep of `.opencode/command/adv-prep.md` for docs/research/pack: only evidence-policy and contract-trace content at lines 113, 259) — prep does not directly consume packs (matches approved baseline finding 6; DONT2 respected: no broad-adoption claim).
- **Design-stage researcher/validator use — observed and durable, with one persistence failure.** 4 of 4 sampled changes record an independent `adv-researcher` design validation (PASS) in gate approval evidence; persisted report counts: this change 3, `fixShallowRepoIdentity` 8, `fixPhase9PrDetection` 9, `fixDirectArchiveMerge` 10. One validator report required orchestrator re-submission after `WorkflowNotFoundError` (Q1 #4).
- **Actual pack consumption — uninstrumented adoption.** No durable counter records which proposal/discovery runs cited which pack, or whether a pack changed an agreement. Pack usefulness therefore cannot be confirmed or denied from durable state; only the production obligation, the proposal/discovery citation obligations, and 4 on-disk packs are observable.

**Conclusion:** research packs are *produced* and *citable-by-contract*; design-stage researcher/validator work is *observed in use*; pack *consumption impact* is uninstrumented and unknown. Confidence: high on production/citation contracts and validator use; the consumption question is answerable only as "unmeasured" (this is a telemetry gap, not evidence of non-use).

## Q5. Does prep align critical research/artifacts for implementers?

Trace: approved artifacts → typed contract → prep task graph → rendered engineer briefing packet.

| Link | Evidence | Enforcement tier |
|---|---|---|
| Agreement → typed contract | `adv_contract_mint` output present on all 4 sampled changes; contract `source.contentHash` matches agreement hash (e.g. `auditAgentWorkflowEvidence` contract source hash `34196aff…` = agreement hash) | Runtime-persisted state |
| Contract → tasks | Prep maps contract items into `contract_refs` (implements/verifies/respects) and typed `evidence_policy` per task (`.opencode/command/adv-prep.md:113,259`); observed on all sampled tasks (e.g. `tk-01870dea3e22` implements AC1–AC6/SC1–SC3, respects C1–C3/DONT1–DONT3, `evidence_policy: source_audit`) | Persisted task metadata; contract-coverage validation at planning gate (user-approved task graphs on all samples) |
| Research → implementation context | Research reaches implementers via agreement/design/contract content and the briefing packet — **not** via `docs/*-prep.md` (Q4). Researcher findings that matter must be folded into agreement/design before prep | Contract-required (discovery obligation); pack path uninstrumented |
| Tasks → engineer packet | `/adv-apply` mandates a generated lane briefing packet for every delegated packet (`.opencode/command/adv-apply.md:375`); renderer sections: identity_anchors, scope, contract, tasks, affected_files, epic_context, verification_expectations, durable_facts, unavailable_state (`plugin/src/utils/briefing-packet-renderer.ts`; `buildIdentitySection` at line 267; section-kind list lines 105-177) | Runtime-generated on read; injection is command-contract required |

**Conclusion:** prep *does* align approved artifacts into contract-linked, evidence-typed tasks, and apply renders them into a structured engineer packet. The one gap in the chain is research-pack provenance: nothing carries `docs/*-prep.md` citations into tasks or packets (uninstrumented; approved design defers bridging it). Confidence: high (source + sampled state).

## Q6. Do adv-engineer packets provide adequate implementation context?

Per DONT3, adequacy is reported by enforcement tier, not as a blanket claim.

| Packet element | Tier | Evidence |
|---|---|---|
| Identity anchors (`WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`) | **Strict / hard-enforced** | Missing `TASK`/`ATTEMPT` → structured `packet_defect` refusal, no guessing (`.opencode/agents/adv-engineer.md` Scope Lock / Working Directory Lock; asserted by `plugin/src/adv-engineer-assets.test.ts:274`, `adv-designer-assets.test.ts:356`, `adv-reviewer-asset.test.ts:371`) |
| Contract anchors (`TASK_SCOPE`, `IN_SCOPE`, `OUT_OF_SCOPE`, `DONE_WHEN`, `STOP_WHEN`, `VERIFICATION`) | **Warn-first** | Missing anchors warn and work proceeds (`plugin/src/adv-engineer-assets.test.ts:194-204`; `plugin/src/types/subagent-reports.test.ts:947` "keeps new scope/done/stop/verification packet anchors warn-first and separate from strict identity"; `subagent-reports-spec-assets.test.ts:239-250,527`). Observed instance: agenda `ag-oYdDkfDa` — anchors absent, worker proceeded with prompt scope and filed a follow-up (warn-first behaving as designed) |
| Briefing packet sections (contract, tasks, affected files, verification expectations) | **Contract-required generation; consumption unmeasured** | Generation mandated (`adv-apply.md:375`); renderer exists and is asset-tested (`briefing-packets-command-assets.test.ts`); no gate verifies a worker actually received a *current* packet — freshness is not a hard gate (approved design risk) |
| Verification-evidence durability | **Advisory only** | `verification_missing` warnings merge into reports without blocking (`subagent-report.ts:461-471`) |

**Conclusion:** identity context is adequate and strictly enforced; scope/stop/verification context is delivered but only warn-first; rendered-packet freshness and consumption are unmeasured. "Adequate" is therefore: strict for identity, best-effort for contract anchors, partially measured for packet delivery. Confidence: high (asset tests + command contracts + one observed warn-first instance).

---

## Ranked issue summary (AC2)

1. `verification_missing` evidence-integrity warnings — 5 warnings in one re-sampled engineer report (`fixPhase9PrDetection tk-6b5a512d2bd4`); baseline: strongest recurring issue across a six-change sample; source: persisted reports + `subagent-report.ts:388-459`; confidence: high recurrence / medium rank.
2. `missing_capability` friction — 5 of 11 friction items across 20 reflections; source: `adv_reflection_list`; confidence: high.
3. Approval/review wait friction — planning ≈38.7 M ms + acceptance ≈38.3 M ms elapsed across 14 readable reflections vs execution ≈35.0 M ms; confidence: high (14/20), medium (full set).
4. Agenda backlog growth — 273/291 pending (93.8%); source: `adv_agenda_list`; confidence: high (count), low (trend — no historical series).
5. Sub-agent report persistence degradation — 1 confirmed instance (`fixShallowRepoIdentity` validator, `WorkflowNotFoundError` + target_path resubmission); confidence: high (instance).
6. Archived-inclusive list timeouts — 2/2 audit attempts; tracked by `fixChangeListTimeouts`; confidence: high.
7. Wisdom never reused — 0 reuse hits in 14 readable reflections; confidence: high for readable set.
8. Recorded retries — 3 events / 2 of 20 reflections; low; confidence: high as recorded.

## Prioritized follow-ups (AC6 — measurement proposals only; no runtime change proposed here)

| # | Follow-up | Measurable completion signal |
|---|---|---|
| P1 | Make engineer verification evidence durable: route reported commands through `adv_run_test` or record structured evidence, and surface `verification_missing` as a reflection friction category | `verification_missing` warning count = 0 across a defined N-report sample (e.g. all engineer reports in a 10-day window); reflection output lists it as friction whenever nonzero |
| P2 | Make design research/validator report persistence reliable (fix worker-side submit routing that caused the `WorkflowNotFoundError` resubmission) | Per-change persisted-vs-degraded researcher/validator report count is queryable; 0 orchestrator resubmission workarounds in a 10-day window |
| P3 | Instrument wisdom reuse (today `wisdom_reuse_hits` is 0/14 readable and archived-change wisdom is unreachable via the aggregate read) | Reflection output reports a non-null reuse count with source references; aggregate wisdom read covers archived changes; baseline 0 → any measured reuse > 0 |
| P4 | Add agenda-drain measurement | `adv_status` (or equivalent) exposes pending `subagent-followup` count and age distribution; current reading: 273 pending of 291 |
| P5 | Bounded archived-inclusive change listing (already in flight as `fixChangeListTimeouts`) | `adv_change_list includeArchived+includeClosed` returns within the bounded budget or with an explicit degraded warning; regression tests per `ag-NSrBaHhr` pass |

Pack-provenance bridging (carrying `docs/*-prep.md` citations into tasks/briefing packets) is deliberately **not** recommended here: the approved design defers it to a later product decision, gated on an end-to-end test proving pack citation reaches task/briefing context.

## Limitations and telemetry gaps (SC2)

- **Baseline vs re-read drift:** reflections 19→20, agenda 286→291, project wisdom 8→9 between discovery snapshot and audit read (~hours). All deltas disclosed in §0; conclusions use the conservative readable denominators.
- **45+1 change baseline not independently re-verified:** the archived-inclusive read timed out twice; the 45+1 figure is cited from the approved agreement. The active-only read's `hydrationStats.totalIds: 24` uses a different surface and is left unreconciled — this is a measurement gap, not a contradiction.
- **6 of 20 reflections display-truncated** (no offset parameter on `adv_reflection_list`); aggregate friction/suggestion counts still cover all 20, but per-gate timing analysis covers 14.
- **Ambiguous baseline phrasing:** agreement finding 2 says "3 of 19 reflections" for retries; the re-read shows 3 retry *events* across 2 of 20 reflections. The audit reports events and reflections-with-retries separately.
- **Uninstrumented surfaces (treated as unknown, never as non-use):** research-pack consumption impact; briefing-packet freshness/consumption by workers; agenda drain rate over time; wisdom reuse; artifact adoption beyond gate-required production.
- **Read fallbacks:** archived sampled changes were read via `temporal_query_fallback` (missing workflow) — expected archive-bundle behavior, noted because artifact content for archived changes is `readable: false` through the artifact-metadata surface and was not dereferenced.

## Contract coverage map

| Item | Where satisfied |
|---|---|
| AC1 | §0 baseline table (45+1 cited from approved agreement; omission disclosed; re-verification failure reported as finding) |
| AC2 | "Ranked issue summary" — every row has count/denominator, source, confidence |
| AC3 | Q2 — presence vs contract-required consumption vs uninstrumented adoption; most-used and least-durable named; no missing-telemetry-as-non-use |
| AC4 | Q4 — design-stage researcher/validator use vs pack consumption; persistence limitation (WorkflowNotFoundError instance) |
| AC5 | Q5 — artifact inputs, task/contract mapping, packet contents, enforcement tier with source references |
| AC6 | "Prioritized follow-ups" — five items, each with a measurable signal; no unapproved runtime change proposed |
| SC1 | Q1–Q6 each answer one original question with cited state/source evidence |
| SC2 | "Limitations and telemetry gaps" — each gap is specific enough to become instrumentation work (P1–P5) |
| SC3 | Every conclusion cites ADV state (change/task/reflection/agenda/wisdom reads) or repo source (file:line); agent prose used only as supporting evidence |
| C1 | Read-only audit; single `docs/audits/` document written; no runtime behavior change |
| C2 | ADV MCP reads used for lifecycle state; repo source used for command/packet contracts |
| C3 | Uninstrumented surfaces explicitly labeled unknown; no non-use inferred from absent counters or truncated output |
| DONT1 | Q1 ranks silent evidence-integrity warnings above low retry counts; no redesign proposed |
| DONT2 | Q4 reports pack adoption as uninstrumented; no broad-adoption claim |
| DONT3 | Q6 separates strict identity anchors, warn-first anchors, and unmeasured packet consumption |
