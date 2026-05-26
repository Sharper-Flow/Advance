# Agreement

## Objectives

1. Add `adv-designer` as a real spawnable apply-phase sub-agent for scoped frontend/component implementation.
2. Make `adv-designer` write-only for UI/component code work; it is not a review/harden gate owner.
3. Route mixed UI/backend work by concern: `adv-designer` handles UI/component scope; `adv-engineer` handles backend/state/API/business logic.
4. Keep review/harden ownership with `adv-reviewer`; when review scope includes design/frontend work, pass a frontend/design skill or checklist to `adv-reviewer`.
5. Extend `addDelegationMatrix` source-plane law and tests instead of adding independent prompt-only routing prose.
6. Add structural routing and typed report contracts so `adv-designer` cannot become a phantom or heuristic-only worker.

## Success Criteria

- `adv-designer` is a real spawnable agent asset with explicit frontend/component ownership, backend exclusions, no nested delegation, and no `/adv-*` slash invocation.
- ADV apply routing can structurally choose `adv-designer` vs `adv-engineer` for frontend, backend, and mixed UI/backend tasks.
- Review/harden guidance keeps `adv-reviewer` as owner and supplies frontend/design skill/checklist context for design-inclusive review work.
- Delegation and report correctness are enforced by specs, schemas, packet contracts, and tests rather than prompt-only prose.

## Acceptance Criteria

1. `adv-designer` exists as real spawnable sub-agent asset with `mode: subagent`, no nested delegation, no `/adv-*` slash invocation, and ADV orchestration mutation tools blocked.
2. `adv-designer` is apply-phase only and write-only for scoped frontend/component implementation; it does not own review or harden gates.
3. Designer scope covers HTML/CSS/JS/TSX/component work, semantic HTML, accessibility, responsive behavior, visual polish, site-design consistency, finer details, and component correctness.
4. Mixed UI/backend work is split by concern: designer gets UI/component work; engineer gets backend/state/API/business logic.
5. Neighboring UI/design recommendations are surfaced to ADV/user for HITL instead of silently expanding scope.
6. `delegation-defaults` and `subagent-reports` specs are updated where affected; no prompt-only routing source of truth.
7. `adv-designer` has a strict task-scoped typed report contract if it writes code; missing packet identity anchors remain validation errors, not inferred values.
8. Prep/apply routing has structural frontend metadata or equivalent; title/path heuristics may assist but do not own correctness.
9. Tests fail if `adv-designer` is referenced without a real agent asset, valid spawn mode, allowed routing, packet contract, report schema, and deploy/sync coverage.
10. `addDelegationMatrix` contract is preserved: matrix is source/evaluation law; downstream field agents do not inspect repo-local spec during normal execution.
11. Reviews for work including frontend/design scope remain routed to `adv-reviewer` and include a frontend/design skill or checklist in the review packet/context.

## Constraints

1. Specs are laws: `delegation-defaults` and `subagent-reports` must be updated where affected before implementation claims conformance.
2. Follow `addDelegationMatrix` contract: matrix/spec is source-plane law and evaluation artifact; deployed command/agent guidance carries runtime instructions without requiring downstream field-agent spec lookup.
3. Follow `adv-agent-tool-contracts`: schema, context packet, prompt, transport lane, tests, specs all aligned.
4. `adv-designer` must use apply-phase worker boundaries like `adv-engineer`: no nested delegation, no ADV orchestration mutations, scoped workdir, typed report submission if persisted.
5. Package commands run from `plugin/`.
6. Coordinate basis with `addDelegationMatrix` before implementation if parent remains unarchived or changes the same specs/tests.

## Avoidances

1. Do not make `adv-designer` own backend logic, storage, APIs, Temporal, business rules, or non-UI implementation.
2. Do not make `adv-designer` a review/harden gate owner.
3. Do not route work to phantom/nonexistent agents or primary agents as sub-agents.
4. Do not duplicate delegation defaults as independent prompt prose across command files or agents.
5. Do not weaken typed report validation, packet identity anchors, gate ownership, human checkpoints, TDD evidence, worktree isolation, or ADV state mutation boundaries.
6. Do not rely on title/path heuristics as the sole authority for frontend routing correctness.
7. Do not silently expand a designer task into neighboring UI changes; surface recommendations to ADV/user for HITL.

## Out of Scope

1. Backend logic ownership by `adv-designer`.
2. Review/harden gate ownership by `adv-designer`.
3. Broad design-system rebuilds or visual redesigns unrelated to worker routing.
4. Product strategy or subjective UX direction beyond scoped task execution and recommendation surfacing.
5. Utility-command delegation matrix expansion unless design proves it is required for designer routing.
6. Changing global sub-agent nesting depth, max parallelism, or Task tool runtime guards.
7. Replacing `adv-engineer`, `adv-reviewer`, `adv-researcher`, `adv-tron`, `explore`, or `general`.

## Preview Applicability

visual_surface: false

Rationale: this change modifies ADV agent routing, specs, schemas, command packets, and agent assets. It does not directly alter browser-visible UI in this repository. It does, however, define quality expectations for future frontend/UI tasks delegated to `adv-designer`.

## Decisions

### User Decisions

- `adv-designer` is apply-phase only, just like `adv-engineer`.
- `adv-designer` is write-only for scoped frontend/component implementation.
- Reviews are handled by `adv-reviewer`; reviews involving design/frontend work should pass a frontend/design skill or checklist to `adv-reviewer`.
- Mixed UI/backend tasks should split by concern.
- Default designer quality bar includes component correctness, semantic HTML/accessibility, responsive behavior, visual polish, matching site design, finer details, and surfacing neighboring recommended changes for HITL.
- `wtc` was a typo; intended word was `etc`.

### Agent Decisions (LBP)

- Use a real typed worker lane rather than prompt-only routing.
- Model `adv-designer` primarily after `adv-engineer`, not `adv-reviewer`, because user selected apply-phase/write-only semantics.
- Add or design structural frontend routing metadata during prep/apply; heuristics may assist but not own correctness.
- Keep `adv-reviewer` as the review/harden owner to preserve existing gate responsibilities.

## Deferred Questions

- Exact `DESIGNER_REPORT` field shape is deferred to design, bounded by the agreement's task-scoped typed report requirement.
- Exact structural routing metadata name is deferred to design; candidate is `metadata.frontend` or an equivalent typed task metadata field.
- Exact frontend/design skill/checklist source for `adv-reviewer` is deferred to design.

## Sign-Off

User approved acceptance criteria with Tier A reply `approve` and clarified: `adv-designer` is really meant to just be used in the apply phase just like `adv-engineer`; reviews are handled by `adv-reviewer`; reviews for work including design work should have a skill passed to them.

Investment: 0 tasks / 0 retries / ~10 min elapsed / tier: auto.
