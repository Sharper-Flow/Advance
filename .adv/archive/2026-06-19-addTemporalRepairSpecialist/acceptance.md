# Acceptance

Reviewed at: 2026-06-19T01:59:32Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Agents classify false phantom-pointer reports using ADV tools before recommending Temporal repair. | pass | adv-reviewer verdict READY; agent/routing docs require `adv_change_show` + `adv_gate_status` before phantom classification; asset tests passed. |
| SC2 | success_criterion | Missing artifact sidecars no longer cause “workflow unreachable” conclusions when ADV tool state loads. | pass | `include.artifactOnly` returns Temporal-backed artifact content and suppresses unreadable sidecar paths; `src/tools/change.test.ts` bounded artifact-only test passed. |
| SC3 | success_criterion | Repair guidance separates real Temporal failure, session pointer mismatch, target-path confusion, and artifact readability mismatch. | pass | `docs/temporal-recovery.md` decision tree separates real Temporal failure, pointer mismatch, target-path confusion, artifact readability mismatch; docs asset test passed. |
| SC4 | success_criterion | Approval-gated repair actions still require explicit primary-agent/user approval. | pass | Agent instructions preserve primary ADV ownership for lifecycle, user checkpoints, cancellation, destructive and approval-gated repair tools; review found no silent repair path. |
| AC1 | acceptance_criterion | `adv-temporal-repair` exists as hidden `mode: subagent`, with no nested delegation. | pass | `.opencode/agents/adv-temporal-repair.md` added as hidden `mode: subagent`; `adv-temporal-repair-assets.test.ts` validates mode and no nested delegation. Targeted tests passed. |
| AC2 | acceptance_criterion | Specialist instructions require `adv_change_show` and `adv_gate_status` before declaring change/artifact state lost. | pass | Specialist instructions and tests require `adv_change_show` and `adv_gate_status` before declaring state lost; targeted asset tests passed. |
| AC3 | acceptance_criterion | Specialist forbids direct reads of ADV state paths; tests anchor this policy. | pass | State-access asset tests include new specialist and forbid direct ADV state path reads; targeted tests passed. |
| AC4 | acceptance_criterion | `adv_change_forget` guidance is limited to matching current-session phantom pointers and never persistent state repair. | pass | Specialist/docs limit `adv_change_forget` to exact current-session phantom pointer cleanup; asset/docs tests passed. |
| AC5 | acceptance_criterion | V1 reuses existing change-scoped `adv-researcher` report transport; no bespoke schema unless design proves need. | pass | Specialist reuses change-scoped `adv-researcher` report transport; no bespoke report schema added. Asset tests and reviewer report submission passed. |
| AC6 | acceptance_criterion | `adv_temporal_diagnose` description/output drift is fixed or narrowed with tests. | pass | `adv_temporal_diagnose` description narrowed and output adds `serverServiceable`; `src/tools/temporal-ops.test.ts` passed. |
| AC7 | acceptance_criterion | Docs include phantom-pointer decision tree and OpenCode restart vs worker-restart distinction. | pass | `docs/temporal-recovery.md` includes phantom-pointer decision tree plus OpenCode restart vs worker restart distinction; docs asset test passed. |
| AC8 | acceptance_criterion | If small/low-risk, artifact-only bounded read support is included; otherwise recorded as follow-up. | pass | Low-risk bounded `include.artifactOnly` support implemented in `adv_change_show`; targeted `change.test.ts` passed. |
| C1 | constraint | Repair correctness must be structural before heuristic. | respected | Tool-first state classification, schema-backed report submission, asset tests, and typed matrix enforce structural correctness over heuristic file reads. |
| C2 | constraint | Full repairs require available tool arguments/evidence. | respected | Specialist has read/classifier/report scope only; full repair tools remain primary ADV actions requiring evidence and arguments. |
| C3 | constraint | Approval evidence must remain tool-enforced. | respected | No mutation tool approvals were bypassed; instructions route destructive/approval-gated work to primary ADV/user approval. |
| C4 | constraint | `adv-temporal-repair` is context offload, not new gate authority. | respected | Specialist is hidden subagent context offload; no new gate authority or lifecycle mutation role added. |
| C5 | constraint | ADV tool state is authoritative for artifacts; sidecar file presence is not. | respected | Docs and agent instructions define ADV tool state as authoritative and sidecar presence as non-authoritative. |
| C6 | constraint | Artifact paths may be read only when an ADV tool exposes `readable:true` for that path. | respected | Agent instructions forbid dereferencing artifact paths unless metadata says `readable:true`; `artifactOnly` suppresses unreadable paths. |
| C7 | constraint | Running OpenCode sessions do not gain new specialist behavior until deployment and restart. | respected | Docs/acceptance note: live sessions need build/deploy plus OpenCode restart. Preview URL not_applicable: agreement declares `visual_surface:false` and changed files are agent/tool/docs/tests, not browser-visible output. |
| DONT1 | avoidance | Do not create a new lifecycle gate. | respected | No new lifecycle gate added; acceptance/release gates unchanged. |
| DONT2 | avoidance | Do not make shell-script/manual runbooks the primary repair mechanism. | respected | Primary mechanism is ADV tool-driven triage/specialist guidance, not shell scripts or manual runbooks. |
| DONT3 | avoidance | Do not make sidecar artifact files the source of truth. | respected | Sidecar files remain non-authoritative; ADV tools expose artifact state/content metadata. |
| DONT4 | avoidance | Do not spawn nested subagents from `adv-temporal-repair`. | respected | Specialist forbids nested subagents; asset tests anchor no delegation. |
| DONT5 | avoidance | Do not silently perform destructive or approval-gated repairs. | respected | No silent destructive or approval-gated repair path added; primary/user approval remains required. |
| DONT6 | avoidance | Do not add a bespoke repair report schema in v1 unless design proves existing report transport insufficient. | respected | No bespoke repair report schema added; v1 reuses `adv-researcher` report transport. |

