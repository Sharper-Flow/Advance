# Add adv designer

## Why

ADV lacks a frontend-focused worker. UI/component work currently routes through general `adv-engineer`, so frontend quality, component ownership, and delegation boundaries are less explicit than backend/implementation work.

## What Changes

Introduce `adv-designer` as a spawnable frontend specialist and teach ADV when to choose it instead of, or alongside, `adv-engineer`.

The intended routing shape is:

- Spawn `adv-designer` for work primarily involving frontend/view/component files, visual quality, layout, responsiveness, polish, HTML/CSS/JS/TSX components, or frontend design review.
- Keep `adv-engineer` responsible for backend logic, storage, APIs, Temporal behavior, business logic, and non-UI implementation.
- For mixed UI/backend work, split responsibility by concern: `adv-designer` owns UI/component concerns; `adv-engineer` owns state/API/backend concerns.
- Extend the `addDelegationMatrix` source-plane model instead of creating independent prompt-only routing prose.

## Scope

### In Scope

- Define `adv-designer` as a real spawnable ADV sub-agent, not a phantom name.
- Add or update the agent asset, deployment/sync coverage, and asset tests required for a bundled/global or repo-local worker decision.
- Update `delegation-defaults` matrix/spec law if frontend design routing changes allowed sub-agents or delegated sub-steps.
- Update `subagent-reports` law and report schemas if `adv-designer` submits persisted worker evidence.
- Update ADV routing guidance in command/agent surfaces so ADV can choose `adv-designer` vs `adv-engineer` structurally and consistently.
- Add tests that fail when `adv-designer` is referenced without a real agent asset, valid spawn mode, packet contract, and report contract where applicable.
- Preserve and build on the `addDelegationMatrix` contract: matrix is source/evaluation law; downstream field agents must not inspect repo-local spec during normal operation.

### Out of Scope

- Backend logic ownership by `adv-designer`.
- `adv-designer` ownership of review or harden gates; reviews remain handled by `adv-reviewer`.
- Broad design-system rebuilds or visual redesigns unrelated to worker routing.
- Product strategy or subjective UX direction beyond scoped task execution/review.
- Utility-command delegation matrix expansion unless discovery proves it is required for designer routing.
- Changing global sub-agent nesting depth, max parallelism, or Task tool runtime guards.
- Replacing `adv-engineer`, `adv-reviewer`, `adv-researcher`, `adv-tron`, `explore`, or `general`.

### Must Not

- Must not route work to a phantom/nonexistent sub-agent.
- Must not route primary agents as sub-agents.
- Must not duplicate delegation defaults as an independent source of truth across command files or prompts.
- Must not weaken typed report validation, packet identity anchors, gate ownership, human checkpoints, TDD evidence, worktree isolation, or ADV state mutation boundaries.
- Must not make `adv-designer` own backend logic, storage, APIs, Temporal, or business rules.
- Must not make `adv-designer` a review/harden gate owner; design-aware reviews should stay with `adv-reviewer`, with an appropriate frontend/design skill or checklist supplied.

## Success Criteria

- `adv-designer` has a real agent definition with explicit frontend/component ownership, backend exclusions, and no nested delegation.
- ADV apply-phase routing guidance can distinguish `adv-designer` vs `adv-engineer` for frontend, backend, and mixed UI/backend tasks.
- Review/harden guidance keeps `adv-reviewer` as owner and provides a frontend/design skill/checklist to reviewer when reviewing work that includes design/frontend scope.
- Delegation matrix/spec law is updated or explicitly deemed unchanged with evidence.
- Typed report and packet contracts are updated if `adv-designer` persists reports; missing required identity anchors remain `INVALID_REPORT` rather than inferred heuristically.
- Tests prevent phantom-agent routing and ensure `adv-designer` appears only in valid spawnable-worker guidance.
- Tests or static checks prove affected command/agent/deploy/docs surfaces are aligned with the chosen source of truth.
- Focused verification runs from `plugin/`; broader checks are selected during prep and must pass before release.

## Affected Code

Likely affected, subject to discovery:

- `.opencode/agents/adv-designer.md`.
- `.opencode/agents/adv.md` and/or ADV routing guidance that decides worker routing.
- `.opencode/command/adv-prep.md` and `.opencode/command/adv-apply.md` routing/packet surfaces.
- `.opencode/command/adv-review.md` and/or `.opencode/command/adv-harden.md` only to pass frontend/design review skill/checklist to `adv-reviewer` for design-inclusive work, not to route reviews to `adv-designer`.
- `.adv/specs/delegation-defaults/spec.json`.
- `.adv/specs/subagent-reports/spec.json`.
- `plugin/src/types/subagent-reports.ts` and tests.
- `plugin/src/delegation-matrix.test.ts`.
- `plugin/src/phantom-subagent-roster.test.ts`.
- `plugin/src/subagent-reports-spec-assets.test.ts`.
- New `plugin/src/adv-designer-assets.test.ts` plus deploy-local tests as needed.
- Documentation surfaces such as `ADV_INSTRUCTIONS.md`, `SETUP.md`, `README.md`, and `project.md` if roster/routing descriptions change.

## Related Repositories

Current repo only: `advance`. No product-linked multi-repo scope detected in project context.

## Constraints

- Specs are laws. `delegation-defaults` and `subagent-reports` must drive correctness when affected.
- Follow `addDelegationMatrix` contract and wisdom:
  - matrix/spec is source-plane law and evaluation artifact;
  - deployed command/agent guidance carries runtime instructions without requiring downstream field-agent spec lookup;
  - scan command files, agent assets, overlays, docs, and plus-routing idioms for drift;
  - run package commands from `plugin/`.
- Follow `adv-agent-tool-contracts` checklist: schema, context packet, prompt, transport lane, tests, specs.
- New correctness must be structural: schemas/tests/specs over heuristic routing prose.
- TDD-first for logic-bearing implementation.

## Failure Handling

- If discovery finds `adv-designer` would require report-schema or packet-contract support that cannot be made structurally safe, do not add prompt-only routing. Carry the blocker into agreement/design.
- If `addDelegationMatrix` remains unarchived when implementation starts, coordinate basis/worktree state before changing the same specs/tests.
- If frontend/backend ownership cannot be tested or statically checked, narrow the routing rule until tests can enforce it.
- If the worker would need backend changes to finish a UI task, it must stop/report or hand back to ADV for `adv-engineer`; it must not silently expand into backend ownership.
- If deployment/sync tests show `adv-designer` is referenced but not installed as a spawnable agent, fail the change rather than shipping a phantom route.

## Discovery Findings

### Discovery Checklist

| Step | Status | Result |
| --- | --- | --- |
| Skill Discovery | PASS | Loaded `adv-agent-tool-contracts` and `customize-opencode`; both directly apply. |
| Prior Research Extension | PASS | `docs/repo-improve-prep.md` cited as adjacent orchestration research; new finding: deterministic routing and per-step structural state supports `metadata.frontend` over prompt-only classification. |
| Conflict & Related-Work Scan | PASS | Fast-follow parent `addDelegationMatrix` is acceptance-pending and overlaps same specs/tests. Own `adv_change_validate` passed after retry; no blocking errors. Pending agenda contains unrelated acceptance-evidence items plus designer scout follow-ups. |
| Edge Case Investigation | PASS | Edge cases recorded below. |
| Design Question Depth | PASS | Open questions classified with trust model, blast radius, and alternatives. |
| Draft Spec Delta Shapes | PASS | Draft `rq-*` deltas below. |
| Related Pattern Scan | PASS | Existing patterns found in `adv-engineer`, `adv-reviewer`, report schemas, delegation matrix, roster tests, deploy sync. |
| LBP Check | PASS | Long-term best practice is a real typed worker with structural apply routing + tests, not prompt-only naming. |

### Skills Considered

- `adv-agent-tool-contracts`: applied. Requires schema, packet, prompt, transport lane, tests, specs.
- `customize-opencode`: applied. Confirms file-based agents use `.opencode/agents/<name>.md`, `mode: subagent`, tool permissions, and restart/deploy awareness.
- No new skill created; existing skills cover the core domains.

### Extends

- `addDelegationMatrix`: fast-follow parent. Inherits source-plane delegation law, no downstream spec lookup burden, and routing drift tests.
- `docs/repo-improve-prep.md`: adjacent research validates deterministic orchestration over LLM-routed orchestration and structural per-step state. New applicability here: `metadata.frontend` (or equivalent) should carry frontend routing from prep into apply instead of relying on broad title heuristics.

### Current State

- Spawnable roster in `plugin/src/delegation-matrix.test.ts` currently lists `adv-engineer`, `adv-reviewer`, `adv-researcher`, `adv-tron`, `explore`, `general`; no `adv-designer` exists.
- `SubagentAgentSchema` in `plugin/src/types/subagent-reports.ts` supports `adv-engineer`, `adv-reviewer`, `adv-researcher`, `adv-tron`, and `adv-scanner-bundle`; no designer report variant exists.
- `adv_subagent_report_submit` advertises only those v1 report payloads.
- `adv-engineer` provides the closest task-scoped typed worker model: write-capable, no nested delegation, orchestration tools blocked, `ENGINEER_REPORT` submitted through `adv_subagent_report_submit`.
- `adv-reviewer` remains the review/harden owner. Design-inclusive review should pass frontend/design skill/checklist context to `adv-reviewer`, not spawn `adv-designer` for review.
- `adv-apply` currently delegates implementation only to `adv-engineer` for `delegate_allowed` / `delegate_preferred`; no frontend-specific routing branch exists.
- `scripts/deploy-local.sh` copies all `.opencode/agents/*.md` to global except `REPO_LOCAL_ONLY="adv-tron.md"` and overlay-managed shared agents. A new `adv-designer.md` should be bundled-global by default with tests proving it is not excluded.
- OpenCode agent docs/config support file-based agents with `mode: subagent`; no evidence found that another bundled sub-agent count is constrained.

### Edge Cases

1. Mixed UI/backend task:
   - UI files and API/state changes appear in one planned task.
   - Expected behavior: prep splits by concern; designer owns UI task; engineer owns backend/state/API task.
2. Neighboring visual inconsistency:
   - Designer notices an adjacent unstyled button or inconsistent page element outside task scope.
   - Expected behavior: finish owned UI scope if safe, then surface recommended neighboring change to orchestrator/HITL; do not silently broaden scope.
3. Frontend task requires backend change:
   - UI cannot be completed without changing storage/API/business logic.
   - Expected behavior: `adv-designer` stops/reports or hands back to ADV; no backend edits.
4. Visual quality subjective tradeoff:
   - Two acceptable UI choices exist with user-value tradeoff.
   - Expected behavior: designer recommends, orchestrator asks HITL if needed.
5. Report schema drift:
   - Agent prompt mentions a field not accepted by Zod, or Zod supports a field absent from packet/prompt.
   - Expected behavior: tests fail; missing identity anchors remain `INVALID_REPORT`.
6. Parent basis drift:
   - `addDelegationMatrix` modifies same law/tests and has not archived.
   - Expected behavior: design coordinates basis before implementation or waits/rebases.

### Open Design Questions

1. Report schema shape for `adv-designer`.
   - Trust model: agent-owned technical design within approved contract.
   - Blast radius: malformed reports or weak scope drift handling if wrong.
   - Alternatives: reuse `ENGINEER_REPORT`, add `DESIGNER_REPORT`, or make designer non-persisted. Recommendation: add `DESIGNER_REPORT` as task-scoped typed persisted worker because designer is a write-only implementation lane with different quality fields.
2. Structural frontend routing signal.
   - Trust model: agent-owned technical design.
   - Blast radius: designer routed by brittle title heuristics or receives backend tasks.
   - Alternatives: `metadata.frontend`, `metadata.delegation_hint` overload, path-based inference. Recommendation: add explicit `metadata.frontend` or similarly typed task metadata during prep; path/title inference can assist but not own correctness.
3. Review/harden participation.
   - Trust model: user-owned workflow boundary.
   - Decision: `adv-designer` is only for apply-phase implementation, like `adv-engineer`. Reviews stay with `adv-reviewer`; when review scope includes frontend/design work, pass a frontend/design skill/checklist to `adv-reviewer`.
4. Visual quality default bar.
   - Trust model: user-owned quality expectation.
   - User decision: all of component correctness, semantic/a11y, responsive behavior, visual polish, matching site design, finer details, and surfaced recommendations.

### Draft Spec Deltas

- `rq-delDefaults03.5` — Designer apply routing assignment.
  - Given the apply matrix includes delegated implementation substeps
  - When a task is structurally frontend/component/view scoped
  - Then `adv-designer` is an allowed apply-phase implementation worker for that frontend substep and backend/state/API logic remains outside designer scope
- `rq-delDefaults05.4` — Designer packet contract.
  - Given `adv-designer` is a typed persisted apply worker
  - When ADV spawns it
  - Then packet anchors include WORKING DIRECTORY, CHANGE, TASK, ATTEMPT plus warn-first TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, VERIFICATION
- `rq-subagentReports01.3` — Designer report variant.
  - Given `adv-designer` submits a report
  - When `adv_subagent_report_submit` validates it
  - Then Zod accepts only the strict `DESIGNER_REPORT` payload with `agent: "adv-designer"` and rejects malformed/unsupported payloads before persistence
- `rq-subagentReports06.3` — Designer scope pairing.
  - Given a designer report
  - When schema validates scope
  - Then `adv-designer` is task-scoped and change-scoped pairings are rejected structurally
- `rq-reviewFrontendSkill01` — Design-aware review support.
  - Given a change includes frontend/design implementation scope
  - When `adv-reviewer` runs review/harden
  - Then review packets include a frontend/design skill or checklist context without routing review ownership to `adv-designer`
- `rq-frontendDelegation01` or an added delegation-defaults requirement — Frontend routing signal.
  - Given prep creates implementation tasks
  - When a task's owned scope is frontend/view/component UI work
  - Then the task carries structural routing metadata sufficient for apply to choose `adv-designer` without relying solely on title/path heuristics

### Related Pattern Scan

- `adv-engineer` pattern: task-scoped write worker with strict report and blocked orchestration tools.
- `adv-reviewer` pattern: scoped remediation, drift guardrails, no nested delegation, report examples parsed by tests; remains review/harden owner.
- `delegation-matrix.test.ts`: source-plane law reads `.adv/specs/delegation-defaults/spec.json`, validates allowed sub-agents, packet contracts, and command consistency.
- `phantom-subagent-roster.test.ts`: scans active guidance surfaces for forbidden routing to phantom or primary agents; must learn `adv-designer` as a known valid spawnable once added.
- `deploy-local.sh`: bundled globals are copied unless explicitly repo-local or overlay-managed.
- `subagent-reports-spec-assets.test.ts` and `types/subagent-reports.test.ts`: contract tests pin supported agents, strict packet anchors, scanner/worker separation, and scope pairings.

### LBP Check

Validated. Best long-term approach is a real, typed, test-pinned apply-phase sub-agent lane:

- not prompt-only routing;
- not a phantom name;
- not overloading `adv-engineer` with UI-specific behavior;
- not moving review/harden ownership away from `adv-reviewer` after user clarified designer is apply-phase only.

### Discovery Opportunity Scout

Attempted via `adv-researcher`; report submitted and follow-up agenda items created. Adopted into agreement draft:

- Use task-scoped typed persisted worker modeled on `adv-engineer`.
- Add structural frontend routing metadata during prep/apply.
- Coordinate with `addDelegationMatrix` basis before implementation.
- Do not make designer a review/harden participant; provide frontend/design review skill/checklist to reviewer instead.
- Explicitly reject unifying with `adv-engineer` because the approved proposal asks for a separate worker.

### User Decisions

- `adv-designer` is apply-phase only, just like `adv-engineer`; reviews are handled by `adv-reviewer`.
- `adv-designer` is write-only for scoped frontend/component implementation, not review/harden ownership.
- Reviews for work including design/frontend work should pass an appropriate skill/checklist to `adv-reviewer`.
- Mixed UI/backend work should split by concern.
- Quality bar includes component correctness, semantic HTML/accessibility, responsive behavior, visual polish, matching site design, finer details, and surfacing recommended neighboring changes for HITL.
- `wtc` was a typo; intended word was `etc`.

### AMBIGUITY ANALYSIS — no blocking ambiguity findings. Coverage: B:C F:C S:C M:C

- B: clear — scope, out-of-scope, and must-not boundaries exist.
- F: clear — designer lane, schema/spec/test/routing surfaces identified.
- S: clear — completion signals are testable.
- M: clear for discovery — remaining technical choices are design-owned, not proposal/discovery blockers.

## Recommended Objectives

1. Add `adv-designer` as a real spawnable apply-phase write-only frontend/component worker.
2. Make `adv-designer` task-scoped and typed-persisted if it writes code.
3. Add structural frontend routing metadata so ADV can choose designer vs engineer safely during apply.
4. Preserve backend ownership for `adv-engineer` and review/harden ownership for `adv-reviewer`.
5. Pass frontend/design skill/checklist context to `adv-reviewer` for reviews involving design/frontend work.
6. Extend `addDelegationMatrix` source-plane law and tests instead of duplicating routing prose.
7. Encode the user-approved frontend quality bar and neighboring-change HITL handoff.
