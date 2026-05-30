# Design

## Architecture Overview

`adv-designer` is added as an apply-phase, task-scoped, typed-persisted ADV worker that mirrors `adv-engineer` structurally but owns frontend/component implementation only. It is not a review/harden owner. ADV chooses `adv-designer` during `/adv-apply` delegation routing based on structural task metadata set during `/adv-prep`.

```
            /adv-apply Delegation Routing
                       │
        ┌──────────────┴──────────────┐
        │                             │
  task.metadata.frontend == "true"   else
        │                             │
        ▼                             ▼
   adv-designer                  adv-engineer
   (UI/component code)        (backend/state/API code)
        │                             │
        └────── reports via ──────────┘
               adv_subagent_report_submit
                       │
                       ▼
             persisted sidecar reports
```

Reviews continue to be owned by `adv-reviewer` (no change). When review scope includes design/frontend work, the orchestrator passes a frontend/design skill or checklist into the review packet so the existing reviewer can evaluate the design dimensions; designer never enters the review/harden gate.

## Key Decisions

### D1: New apply-phase worker `adv-designer`, modeled on `adv-engineer`

- Path: `.opencode/agents/adv-designer.md`.
- Frontmatter: `mode: subagent`, `hidden: true`, `temperature: 0.1`, `task: false`.
- Tool allowlist mirrors `adv-engineer.md`:
  - Allowed: `read`, `write`, `edit`, `patch`, `morph_edit`, `bash`, `todowrite`, `question`, `glob`, `grep`, all `lgrep_*` tools, web research stack, `adv_spec`, `adv_status`, `adv_project_context`, `adv_change_show`, `adv_task_show`/`_list`/`_ready`, `adv_wisdom_list`, `adv_gate_status`, `adv_snapshot_health`, `adv_run_test`, `adv_wisdom_add`, `adv_subagent_report_submit`.
  - Blocked: every `adv_change_*` mutation, every `adv_task_*` mutation, `adv_gate_complete`, every `adv_agenda_*`, `adv_investment_report`, `adv_temporal_worker_restart`, `adv_worktree_*`, `task` (nested delegation).
- Body sections required (asset test will pin them): Scope Lock, Working Directory Lock, Iteration Loop, Prune-First Heuristic, Related Issue Scanning, Drift Guardrails (with neighboring recommendation surfacing), Exit Protocol, ADV State Access Policy, DESIGNER_REPORT Payload.
- Body rules pinned:
  - × NEVER invoke `/adv-*` slash commands.
  - × NEVER spawn additional sub-agents (nesting depth 1).
  - × NEVER perform ADV orchestration mutations.
  - × NEVER expand into backend logic (storage, APIs, Temporal, business rules).
  - × NEVER take review/harden ownership.
  - Backend-blocker behavior: if a UI task requires a backend change, set `scope_drift.recommendation` to `stop_and_report` and populate `required_main_agent_actions` for ADV to hand back to `adv-engineer`.
  - Neighboring-recommendation behavior: finish owned UI scope if safe, then record neighboring UI inconsistencies in `neighboring_recommendations[]` and `required_main_agent_actions`. Do not silently broaden scope.

### D2: Bundled-global deploy

- `scripts/deploy-local.sh` already iterates `$REPO_AGENTS/*.md` and copies anything not in `REPO_LOCAL_ONLY` or `SHARED_OVERLAY_ONLY`. `adv-designer.md` requires no script edit; it must NOT be added to either exclusion list.
- New deploy assertions added to `plugin/src/deploy-local-exclusion.test.ts`:
  - `REPO_LOCAL_ONLY` does not contain `adv-designer.md`.
  - `SHARED_OVERLAY_ONLY` does not contain `adv-designer.md`.

### D3: New typed report variant `DesignerSubagentReportSchema`

In `plugin/src/types/subagent-reports.ts`:

- Extend `SubagentAgentSchema` enum to include `"adv-designer"`.
- Add `DesignerSubagentReportSchema = TaskScopedBaseSubagentReportSchema.extend({...})`:
  - Required core fields (mirror `EngineerSubagentReportSchema`):
    - `agent: z.literal("adv-designer")`, `status`, `files_touched`, `verification` (≥1 entry), `decisions`, `blockers`, `scope_drift` nullable, `follow_ups`, `required_main_agent_actions`, `related_scan`, `context_update_for_adv`.
  - New designer-specific fields:
    - `design_dimensions`: structured object capturing user-approved quality bar — `{ component_correctness: 'pass'|'concern'|'n/a', semantic_html_a11y, responsive_behavior, visual_polish, site_design_consistency, finer_details, notes }`.
    - `neighboring_recommendations`: array of `{ file?, line?, what, why }` — neighboring UI inconsistencies the designer surfaces for orchestrator/user HITL.
  - `consumer_warnings` optional, identical to engineer.
- Add to `TaskScopedSubagentReportSchema` discriminated union (alongside engineer + reviewer).
- Add to `ScopedSubagentReportSchema` discriminated union.
- Add `"adv-designer"` entry to `SUBAGENT_REPORT_FIELD_SOURCES` with identity anchors `change_id`, `task_id`, `attempt`, `workdir_used` → `packet_anchor`; all other fields `worker_derived` except `consumer_warnings` (`tool_enriched`).
- Tool description in `plugin/src/tools/subagent-report.ts` updated to include `adv-designer` in the supported-payload narrative.
- Blocker mapping in `subagent-report.ts` mirrors engineer flow (same `error_recovery` mapping path).

### D4: `delegation-defaults` spec law update

`.adv/specs/delegation-defaults/spec.json`:

- Extend `apply.allowed_subagents` to include `adv-designer` alongside `adv-engineer` and `general`.
- Add a new delegated substep to `apply.delegated_substeps`:
  ```
  {
    "name": "Frontend Implementation",
    "mode": "delegate_allowed",
    "allowed_subagents": ["adv-designer"],
    "packet_contracts": [{
      "agent": "adv-designer",
      "report_transport": "typed_persisted_worker",
      "required_packet_anchors": ["WORKING DIRECTORY", "CHANGE", "TASK", "ATTEMPT"],
      "warn_packet_anchors": ["TASK_SCOPE","IN_SCOPE","OUT_OF_SCOPE","DONE_WHEN","STOP_WHEN","VERIFICATION"]
    }]
  }
  ```
- Add `adv-designer` to `rq-delDefaults03.3` `allowed_subagents` allowlist enumeration narrative.
- Add `rq-delDefaults03.5` scenario: discovery-drafted assignment scenario for designer.
- Update `rq-delDefaults05` and `rq-delDefaults06` body to include designer in worker examples and routing tests.
- Backend exclusion remains structural via prompt and `scope_drift` semantics; specs document that designer must not own backend scope but no review/harden routing path is added.

### D5: `subagent-reports` spec law update

`.adv/specs/subagent-reports/spec.json`:

- Update `rq-subagentReports01.body` to list `adv-designer` among supported v1 task-scoped variants.
- Update `rq-subagentReports05.body` to include designer's required identity anchors (`WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`) and the same warn-first non-identity anchors.
- Update `rq-subagentReports06.body` to pair `adv-designer` with task scope (reject change-scoped designer payloads).
- New `rq-subagentReports01.3` scenario: designer report variant validates structurally and rejects malformed payloads.

### D6: Structural frontend routing signal

- Add task metadata key `frontend` with values `"true" | "false"` (mirror `tdd_intent` pattern). Mode: `string` for compatibility with existing `metadata: Record<string, string>` ADV typing.
- Prep workflow sets `metadata.frontend = "true"` when a task's owned scope is frontend/view/component UI work (`/adv-prep` Phase classification updates).
- Apply routing reads `metadata.frontend` first for designer routing.

### D7: `/adv-prep` update

`.opencode/command/adv-prep.md`:

- Document `metadata.frontend` as a recognized task metadata key.
- Add classification step: when task scope is frontend/component implementation, set `metadata.frontend = "true"`. When task is mixed UI/backend, split into separate tasks (UI task with `frontend: "true"`, backend task without).

### D8: `/adv-apply` Delegation Routing update

`.opencode/command/adv-apply.md`:

- Insert a new frontend branch into the Delegation Routing table at Priority 1.5 (analogous to the existing 4.5 sub-priority). `metadata.delegation_hint` keeps Priority 1 (explicit user override wins).
  - Priority 1.5: `metadata.frontend == "true"` → `delegate_allowed` to `adv-designer` if no risk signals force inline.
- Routing summary line accepts new worker label `adv-designer`.
- Add a new fenced **Designer Apply Context Packet** block mirroring the Apply Context Packet but with:
  - Identity anchors (`WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`).
  - Warn-first anchors (`TASK_SCOPE`, `IN_SCOPE`, `OUT_OF_SCOPE`, `DONE_WHEN`, `STOP_WHEN`, `VERIFICATION`).
  - `DESIGN QUALITY BAR` line enumerating component correctness, semantic HTML/accessibility, responsive behavior, visual polish, matching site design, finer details.
  - `NEIGHBORING RECOMMENDATIONS` line instructing finish-owned-scope + surface neighboring UI inconsistencies.
  - `BACKEND BOUNDARY` line: if UI cannot be completed without backend changes, `stop_and_report` and populate `required_main_agent_actions` for orchestrator handoff to `adv-engineer`.
  - `EXPECTED OUTPUT: implement the UI/component task, run tests, call adv_subagent_report_submit with DESIGNER_REPORT per .opencode/agents/adv-designer.md`.

### D9: Design-aware review handoff (no review ownership change)

`.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md`:

- Keep review/harden routing exactly as today (`adv-reviewer` owner; `adv-engineer` for remediation when needed).
- Add: when the change's task graph contains any task with `metadata.frontend == "true"` (or the agreement has frontend/design implementation scope), the reviewer packet MUST include a `FRONTEND DESIGN REVIEW SKILL` anchor whose value is one of:
  1. `skill("adv-frontend-review")` if/when that skill exists in the trusted skills tree, OR
  2. An inline frontend/design review checklist block enumerating: semantic HTML/accessibility, responsive behavior, visual polish, site-design consistency, finer details, component correctness.
- Iteration 1 ships the inline checklist anchor; skill creation is deferred to a follow-up if needed. This avoids gate-blocking on a new skill while still enforcing design-aware reviews.

### D10: Tests (TDD-first sequencing)

- New `plugin/src/adv-designer-assets.test.ts` mirroring `adv-engineer-assets.test.ts`:
  - Existence, frontmatter (`mode: subagent`, `task: false`, `hidden: true`, `temperature 0.1`).
  - Tool allowlist (allowed + blocked sets).
  - Required body sections.
  - DESIGNER_REPORT schema field list including `design_dimensions` and `neighboring_recommendations`.
  - DESIGNER_REPORT example JSON parses through Zod schema.
  - Tool-call transport (not fenced JSON).
  - Scope Lock and Working Directory Lock anchors.
  - Backend boundary refusal text.
- Update `plugin/src/delegation-matrix.test.ts`:
  - Add `"adv-designer"` to `KNOWN_SPAWNABLE_SUBAGENTS`.
  - Update apply step assertions to allow designer in `allowed_subagents`.
  - Validate new packet contract entry for designer.
- Update `plugin/src/phantom-subagent-roster.test.ts`:
  - Add `adv-designer` to the regex roster (plus-routing pattern needs the new name).
  - Ensure designer routing in active surfaces does not trigger phantom/primary findings.
- Update `plugin/src/subagent-reports-spec-assets.test.ts`:
  - Assertions for `adv-designer` in `rq-subagentReports01` body and `rq-subagentReports05` body.
  - Designer packet contract validation in delegation matrix.
- Update `plugin/src/types/subagent-reports.test.ts`:
  - Add `adv-designer` schema + sample report to `reportSchemas` matrix.
  - Add scope pairing rejection test for change-scoped designer report.
  - Update `SubagentAgentSchema.options` expectation.
  - Add designer packet anchor expectations (`["ATTEMPT","CHANGE","TASK","WORKING DIRECTORY"]`).
- Update `plugin/src/deploy-local-exclusion.test.ts` to pin designer is NOT excluded.

### D11: Documentation surfaces

- `ADV_INSTRUCTIONS.md` — add `adv-designer` to spawnable bundled-global list, intent table, packet anchors note.
- `SETUP.md` — list `adv-designer` in bundled-global agents row and sub-agent purpose table.
- `README.md` — extend sub-agent system summary to include designer.
- `project.md` and `AGENTS.md` — extend roster comments in `.opencode/agents/` enumeration.

## ADR Drafts

None. 3-criteria rubric (hard-to-reverse, surprising-without-context, real-tradeoff) is only partially satisfied — agreement.md + this design.md already capture the decisions in proximate, discoverable form. ADR optional; skip to keep the change focused.

## Implementation Strategy

Sequence (each phase TDD-first where applicable):

1. **Phase A: Schema + spec law foundation**
   - Update `plugin/src/types/subagent-reports.ts` Zod schemas (RED via new test file).
   - Update `.adv/specs/subagent-reports/spec.json` and `.adv/specs/delegation-defaults/spec.json` to reflect designer law (RED via spec-assets tests).
   - Update `plugin/src/tools/subagent-report.ts` tool description text.
2. **Phase B: Agent asset**
   - Create `.opencode/agents/adv-designer.md` mirroring `adv-engineer.md` with frontend ownership, backend exclusion, design quality bar, neighboring-recommendation protocol, DESIGNER_REPORT payload (RED via new asset test).
3. **Phase C: Routing surfaces**
   - Update `.opencode/command/adv-prep.md` (metadata.frontend classification).
   - Update `.opencode/command/adv-apply.md` (delegation routing Priority 1.5 + Designer Apply Context Packet).
   - Update `.opencode/command/adv-review.md` + `adv-harden.md` (frontend design review skill/checklist anchor in reviewer packet, no review-ownership move).
4. **Phase D: Roster + matrix tests**
   - Update `delegation-matrix.test.ts`, `phantom-subagent-roster.test.ts`, `deploy-local-exclusion.test.ts`.
5. **Phase E: Documentation**
   - Update `ADV_INSTRUCTIONS.md`, `SETUP.md`, `README.md`, `project.md`, `AGENTS.md`.
6. **Phase F: Verification**
   - Focused suites first: `pnpm exec vitest run src/adv-designer-assets.test.ts src/delegation-matrix.test.ts src/phantom-subagent-roster.test.ts src/subagent-reports-spec-assets.test.ts src/types/subagent-reports.test.ts src/deploy-local-exclusion.test.ts src/adv-engineer-assets.test.ts src/adv-reviewer-asset.test.ts src/adv-instructions-assets.test.ts` from `plugin/`.
   - Selected broader: `pnpm run check` from `plugin/`.

Coordinate basis: if `addDelegationMatrix` has not archived when implementation begins, rebase onto its merged state (it modifies `delegation-defaults` spec and roster tests). Surface in the apply phase if needed.

## LBP Analysis

Validated against `addDelegationMatrix` contract and `repo-improve-prep.md`:

- Source of truth stays in `delegation-defaults` spec; new designer entry is structural law, not duplicated prompt prose.
- Typed Zod-validated report enforces correctness at the ingest boundary (P33 structural-before-heuristic).
- Routing decision is structural via `metadata.frontend`; title/path heuristics may assist but do not own correctness.
- Apply-phase-only worker (mirrors `adv-engineer`) preserves the existing review/harden ownership model and avoids a parallel review track.
- Backend boundary uses existing `scope_drift` `stop_and_report` semantics; no new boundary mechanism introduced.
- Tests pin every drift-prone surface (agent asset, spec, schema, roster, command files, deploy).
- Bundled-global default follows existing `adv-engineer` / `adv-reviewer` / `adv-researcher` precedent.

Alternatives considered and rejected:

- Reuse `ENGINEER_REPORT` for designer: rejected — quality dimensions and neighboring-recommendation surface are distinct; tests would lose ability to assert designer-specific fields.
- Prompt-only routing without `metadata.frontend`: rejected — violates P33 and addDelegationMatrix wisdom; would only depend on title heuristics.
- Make designer a review/harden owner: rejected by explicit user direction; reviews stay with `adv-reviewer` with a frontend/design checklist anchor.
- Unify designer + engineer: rejected by approved proposal; user wants separable worker identity.

## Affected Components

| Area | Files |
| --- | --- |
| Schema | `plugin/src/types/subagent-reports.ts` |
| Report tool | `plugin/src/tools/subagent-report.ts` (description text only) |
| Specs | `.adv/specs/delegation-defaults/spec.json`, `.adv/specs/subagent-reports/spec.json` |
| Agent asset | `.opencode/agents/adv-designer.md` (new) |
| Routing | `.opencode/command/adv-prep.md`, `.opencode/command/adv-apply.md` |
| Review handoff | `.opencode/command/adv-review.md`, `.opencode/command/adv-harden.md` |
| Tests | `plugin/src/adv-designer-assets.test.ts` (new), `delegation-matrix.test.ts`, `phantom-subagent-roster.test.ts`, `subagent-reports-spec-assets.test.ts`, `types/subagent-reports.test.ts`, `deploy-local-exclusion.test.ts` |
| Docs | `ADV_INSTRUCTIONS.md`, `SETUP.md`, `README.md`, `project.md`, `AGENTS.md` |
| Deploy | `scripts/deploy-local.sh` (no edit needed; verified via tests) |

## Design Leverage Scout

Scout: skipped — the discovery scout (`researcher:designer-discovery`) already covered the design alternatives surface and produced ScoutCandidate rows OPP1-OPP5. Adopted/deferred/rejected outcomes are reflected in agreement + design above. The opportunity surface for design itself is structurally bounded by:
- the `addDelegationMatrix` contract (matrix-as-source-of-truth, no field-agent spec lookup);
- the `adv-agent-tool-contracts` checklist (schema + packet + prompt + transport + tests + specs);
- the `subagent-reports` law (typed persistence + identity anchors).

Re-running a design scout here would not materially expand options.

## Risks / Mitigations

| Risk | Mitigation |
| --- | --- |
| R1: `addDelegationMatrix` still acceptance-pending; same specs/tests are touched. | Apply phase coordinates basis: rebase onto archived parent before implementation, or surface conflict during apply and pause. Documented in design and as planning concern. |
| R2: Reviewer needs frontend/design context but no `adv-frontend-review` skill exists yet. | Iteration 1 embeds an inline frontend design review checklist anchor in `adv-review.md`/`adv-harden.md` reviewer packet. Skill creation deferred and tracked as follow-up. Avoids gate-blocking on skill creation. |
| R3: `metadata.frontend` adds a new routing key. | Mirrors existing `metadata.tdd_intent` pattern; documented in `/adv-prep` and `/adv-apply`; tests assert routing behavior. |
| R4: Test suite cost grows with new asset test + roster updates. | Use focused suites during dev; defer `pnpm run check` to final verification (per `addDelegationMatrix` wisdom ws-q5I2I1 — package commands from `plugin/`). |
| R5: Agent prompt drift between asset and matrix/spec. | Asset test pins required sections, frontmatter, tool allowlist, packet anchors, and DESIGNER_REPORT schema example via Zod parse. Subagent-reports spec-assets test pins designer in the supported agents list. |
| R6: Backend leakage by designer. | Prompt + packet `BACKEND BOUNDARY` line + scope_drift `stop_and_report` semantics + tests for refusal text. |
| R7: Neighboring-recommendation creep into scope. | Prompt + Designer Apply Context Packet + DESIGNER_REPORT `neighboring_recommendations[]` channel + asset test pins surfacing protocol. |

## Validator Result

VALIDATED. Independent validator (`adv-researcher`, scope_key `researcher:design-validation`, attempt 1) confirmed:

- CORRECTNESS (info): All 11 ACs map structurally to D1–D11; backend boundary reuses `scope_drift.stop_and_report`.
- SIMPLICITY (info): Minimum structural increment; rejected alternatives cite P33 / user direction.
- SPEC-LAW COMPLIANCE (info): Satisfies `rq-delDefaults03.3 / 05.2 / 06`, `rq-subagentReports05.1 / 06`, and `addDelegationMatrix` matrix-as-source-plane-law contract. Scope pairing enforced via Zod discriminated union in `plugin/src/types/subagent-reports.ts:44–47,56–63`.
- KEY ALTERNATIVES (caution): D8 priority insertion must not displace explicit user override (`metadata.delegation_hint` at Priority 1, `.opencode/command/adv-apply.md:411`). Resolved inline in this design: D8 now places `metadata.frontend == "true"` at Priority 1.5 (analogous to existing 4.5).

Recommendation: proceed to planning. No user-value tradeoff, no unresolved CONFLICT, no contract-compromise risk.
