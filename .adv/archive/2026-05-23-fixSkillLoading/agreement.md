# Agreement

## Success Criteria

- SC1: Define a command/skill loading taxonomy that distinguishes orchestrator-only, worker-only, split, and inlined-agent-methodology patterns.
- SC2: Inventory and classify every command `skill(...)` reference, including dynamic skill discovery and missing/external skill references.
- SC3: Preserve orchestrator-owned authority for ADV state, gates, user checkpoints, adoption/routing, and mutation.
- SC4: Move or route worker-only methodology to worker context only when skill-tool availability and fallback behavior are machine-checkable.
- SC5: Add asset/spec tests for taxonomy compliance, phantom skill references, fallback/degradation requirements, and worker skill-availability assumptions.
- SC6: Preserve existing opportunity-scout semantics while reducing main-context load for worker-only prompt content.

## Acceptance Criteria

- AC1: `ADV_INSTRUCTIONS.md` documents taxonomy: main-only, worker-only, split, and `inlined-agent-methodology` when optimal.
- AC2: All `.opencode/command/*.md` `skill(...)` references are inventoried and classified.
- AC3: Stale or missing skill refs are removed if unused; otherwise they are fixed or explicitly allowlisted with rationale.
- AC4: Worker self-load is allowed only when tests verify no explicit deny and fallback behavior exists.
- AC5: Orchestrator retains state, gate, user-checkpoint, adoption/routing, and mutation authority.
- AC6: Existing scout semantics remain: ≤5 candidates, evidence required, strict schema, narrow auto-adopt only, and INCONCLUSIVE degradation.
- AC7: Asset/spec tests fail on taxonomy violations, phantom skill refs, missing fallback, or unsafe worker-load assumptions.

## Constraints

- C1: Do not change the seven-gate lifecycle.
- C2: Do not replace or rename existing ADV sub-agents.
- C3: Do not weaken structured output or report requirements.
- C4: Do not remove fallback or degradation paths for skill-backed commands.
- C5: Do not allow nested sub-agent delegation.
- C6: Keep skills read-only guidance; skills do not own ADV mutations.

## Avoidances

- DONT1: Do not let sub-agents own ADV gate completion, state mutation, or user checkpoint routing.
- DONT2: Do not auto-adopt sub-agent recommendations without orchestrator-owned routing rules.
- DONT3: Do not rely on prose-only policy without asset/spec tests where machine checks are possible.
- DONT4: Do not leave stale or missing skill references unclassified.
- DONT5: Do not preserve duplicate skill-vs-agent-prompt methodology without a classification or drift-control decision.

## Out of Scope

- OOS1: Replacing or renaming existing ADV sub-agents.
- OOS2: Changing the seven-gate lifecycle.
- OOS3: Global prompt optimization unrelated to command/skill loading boundaries.
- OOS4: Runtime token accounting or context-window measurement.

## Decisions

### User Decisions

- Taxonomy shape: add a fourth `inlined-agent-methodology` category if optimal.
- Missing skill refs: remove references if the skill is not needed; otherwise fix or explicitly classify/allowlist.
- Worker self-load strictness: choose the more permissive, easier-to-verify invariant that is least likely to be wrong. Default allowed is acceptable when tests verify no explicit deny and fallback exists.

### Agent Decisions (LBP)

- Use split taxonomy as the default for fan-out workflows where main needs schema/routing/degradation but worker needs large methodology.
- Use sub-agent self-load only when permission/tool availability is machine-verified or fallback is included in the prompt packet.
- Keep orchestrator-owned adoption/routing rules for scout candidates.

## Deferred Questions

None.

## Sign-Off

User approved acceptance criteria with reply `approve`.
