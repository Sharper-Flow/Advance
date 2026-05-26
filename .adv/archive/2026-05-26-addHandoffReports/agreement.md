# Agreement

## Objectives
1. Make optimized sub-agent handoffs durable for `adv-researcher`, `adv-tron`/recon, and scanner-bundle lanes.
2. Preserve existing `adv-engineer` and `adv-reviewer` task-scoped report behavior.
3. Add taskless report readback with explicit source metadata and deterministic identity.
4. Keep individual scanners non-persisted and without ADV tool access; persist only orchestrator-synthesized scanner bundles.
5. Generalize bounded follow-up handling for all persisted report variants.
6. Ensure harden inspects report-created agenda items and fixes those that are safe, adjacent, and campsite/touched-scope applicable.
7. Correct all `enforceTaskPolicy` and stale `guards/` references, not only active prompts.

## Acceptance Criteria
1. `adv_subagent_report_submit` accepts strict persisted optimized handoff reports for `adv-researcher`, `adv-tron`, and scanner-bundle lanes.
2. Existing `adv-engineer` / `adv-reviewer` report behavior stays backward-compatible.
3. Taskless reports are queryable with explicit source metadata; final readback shape is chosen by design for cleanest stack fit.
4. Scanner persistence uses orchestrator-submitted aggregate bundles; individual scanners keep no ADV tool access.
5. Persisted report `follow_ups[]` create bounded, source-tagged agenda items.
6. Harden inspects report-created agenda items and fixes those that are safe, adjacent, and campsite/touched-scope applicable; non-applicable items get rationale.
7. All `enforceTaskPolicy` / stale `guards/` references are corrected, removed, or explicitly historical.
8. Specs, agent prompts, command packets, and tests lock schema variants, packet anchors, agenda behavior, readback shape, and malformed-report rejection.

## Constraints
- Preserve strict Zod validation at the ingest boundary.
- Preserve existing durable report semantics for `adv-engineer` and `adv-reviewer`.
- Keep the main ADV agent as orchestrator; sub-agents do not complete gates or mutate orchestration state.
- Do not claim runtime enforcement for built-in `task` dispatch unless it is actually implemented.
- Prefer compact optimized handoff payloads over raw transcript persistence.
- Keep agenda follow-up generation bounded and source-tagged.
- Harden inspection must remain limited to safe, adjacent, campsite/touched-scope-applicable items.

## Avoidances
- Do not weaken strict report validation or rely on LLM-parsed prose as the only persistence path.
- Do not allow sub-agents to complete gates, create changes, or own orchestration decisions.
- Do not introduce fake runtime enforcement claims without real implementation and tests.
- Do not make scanner persistence so verbose that it defeats context-purity goals.
- Do not create unbounded agenda noise.
- Do not require harden to fix non-adjacent or unrelated agenda items.
- Do not expand into broad ADV latency remediation beyond report readback needs.

## Preview Applicability
visual_surface: false

Rationale: this change affects TypeScript schemas, ADV tool behavior, Temporal workflow state, specs, command docs, and agent prompts. It does not affect browser-visible UI or visual output.

## Decisions

### User Decisions
- Follow-up routing: use bounded auto-agenda for explicit report `follow_ups[]`.
- Harden agenda handling: during harden, report-created agenda items must be inspected and fixed when campsite/touched-scope criteria apply; non-applicable items require rationale.
- Readback shape: user deferred to agent judgment; design should choose the cleanest shape for this stack.
- Enforcement-doc cleanup: clean all `enforceTaskPolicy` and stale `guards/` references, not only active prompts.

### Agent Decisions (LBP)
- Scanner persistence should be orchestrator-aggregated, not direct scanner submission.
- Individual `explore` scanners should remain non-persisted and without ADV tool access.
- Report architecture should extend the existing strict Zod/discriminated-union pattern rather than introduce raw transcript persistence.
- Passive researcher/tron/scanner findings should not automatically update task `error_recovery` unless an actual task-scoped blocker exists.
- Asset tests should guard against recurrence of false runtime-enforcement language.

## Deferred Questions
- Final taskless report identity/readback implementation shape is deferred to `/adv-design`; user has no preference and wants the stack-cleanest design.

## Sign-Off
User approved acceptance criteria with reply: `approve`.
