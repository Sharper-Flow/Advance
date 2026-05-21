---
name: adv-opportunity-scout
description: "Bounded opportunity scouting for ADV discovery and design phases — identifies missed opportunities and leverage points using existing adv-researcher"
keywords:
  [
    "adv",
    "scout",
    "opportunity",
    "discovery",
    "design",
    "leverage",
    "bounded-research",
    "contract-tie",
  ]
metadata:
  priority: medium
  source: adv-scout-command
---

# ADV Opportunity Scout Skill

## Purpose

Bounded opportunity-scout methodology for `/adv-discover` Phase 3.5 (Discovery Opportunity Scout) and `/adv-design` Phase 2.5 (Design Leverage Scout). Provides the scout protocol, output schema, routing taxonomy, prompt templates, and degradation rules. Commands own workflow/state/gate completion; this skill owns the reusable methodology.

## Modes

| Mode | Phase | Trigger | Focus |
|------|-------|---------|-------|
| `discovery` | `/adv-discover` Phase 3.5 | After current-state research, before agreement formation | Missed opportunities: alternative approaches, overlooked patterns, unconsidered edge cases, gaps in objectives/AC |
| `design` | `/adv-design` Phase 2.5 | After draft design, before independent validator | Leverage points: shortcuts, reusable components, parallelism opportunities, simplification paths, cross-cutting improvements |

## Execution Protocol

1. **Load context** — orchestrator passes: proposal summary, agreement (objectives, AC, constraints, avoidances), current-state findings (discovery mode) or draft design (design mode), conflict scan results (for prior_consideration), change ID.
2. **Spawn adv-researcher** — orchestrator spawns the existing `adv-researcher` sub-agent with the mode-specific prompt template. The prompt includes all loaded context.
3. **Collect candidates** — adv-researcher returns structured candidates following the output schema below. Hard cap: ≤5 candidates per mode.
4. **Sort by payoff/risk** — candidates are sorted by payoff/risk ratio (high payoff + low risk first).
5. **Route adoption** — orchestrator applies the routing taxonomy (§ Routing).

## Output Schema

Each candidate returned by the scout has 8 fields:

```typescript
interface ScoutCandidate {
  candidate: string;           // What the opportunity is (1-2 sentences)
  evidence: string;            // Source/evidence supporting this (URL, file:line, or spec ref)
  payoff: 'high' | 'medium' | 'low';  // Expected payoff if adopted
  risk: 'high' | 'medium' | 'low';    // Risk of adoption
  contract_tie: string;        // Which AC/constraint/objective this ties to, or "untied"
  prior_consideration: string; // Was this considered before? (new | archived:{id} | rejected:{reason} | conflict:{id})
  recommended_fate: 'adopt_now' | 'design_around' | 'surface_to_user' | 'follow_up' | 'reject';
  fate_rationale: string;      // Why this fate is recommended (1-2 sentences)
}
```

### Field Notes

- **contract_tie**: Must reference a specific acceptance criterion (e.g., "AC1"), constraint, objective, or avoidance from the agreement. Use "untied" when the candidate doesn't directly tie to any contract item but is still potentially valuable.
- **prior_consideration**: Populated by the orchestrator from Phase 1.6 conflict scan results and archived change history before the prompt is sent to adv-researcher. The scout receives this data in its prompt context; it does not re-query archived changes. Values:
  - `new` — not previously considered
  - `archived:{change-id}` — previously attempted in an archived change
  - `rejected:{reason}` — previously considered and rejected with reason
  - `conflict:{change-id}` — conflicts with an active change
- **recommended_fate**: Advisory — the orchestrator makes the final routing decision.

## Routing Taxonomy

| Fate | Condition | Orchestrator Action |
|------|-----------|-------------------|
| `adopt_now` | contract_tied AND low risk AND no user-value tradeoff | Auto-adopt: integrate into agreement (discovery) or design (design) without user pause |
| `design_around` | Contract-tied AND low risk but needs design adjustment | Auto-adopt with note: adjust design to accommodate; integrate and proceed |
| `surface_to_user` | Untied OR medium+ risk OR involves user-value tradeoff | Present to user inline; do not auto-adopt |
| `follow_up` | Valuable but not blocking | Record as wisdom or agenda item; proceed without adoption |
| `reject` | Conflicts with constraints/avoidances or insufficient evidence | Skip; record rationale in phase output |

### Auto-Adopt Policy (Narrow Only)

The orchestrator auto-adopts a candidate ONLY when ALL of:
1. `contract_tie` references a specific contract item (not "untied")
2. `risk` is `low`
3. `recommended_fate` is `adopt_now` or `design_around`
4. The adoption requires no user-value tradeoff

All other candidates are surfaced to the user. The orchestrator MUST NOT auto-adopt untied ideas regardless of payoff.

## Prompt Templates

### Discovery Mode Prompt

```
ROLE: Discovery Opportunity Scout for ADV change {change-id}.
WORKING DIRECTORY: {workdir}

MODE: discovery — identify missed opportunities in the current discovery findings.

CONTEXT:
Proposal: {proposal summary}
Agreement Objectives: {numbered objectives}
Acceptance Criteria: {numbered AC}
Constraints: {constraints}
Avoidances: {avoidances}
Current-State Findings: {summary of Phase 3 findings}
Prior Considerations: {prior_consideration data from conflict scan}

SCOUT BRIEF:
Search for opportunities the current discovery may have missed:
1. Alternative approaches that achieve the same objectives with less risk or effort
2. Overlooked patterns in the codebase that could accelerate implementation
3. Gaps in the acceptance criteria that would leave the change incomplete
4. Edge cases or failure modes not yet considered

CONSTRAINTS:
- Hard cap: return at most 5 candidates
- Each candidate must follow the 8-field ScoutCandidate schema
- Sort by payoff/risk ratio (highest first)
- Do not propose changes to the agreement's constraints or avoidances
- Do not propose scope expansion beyond the stated objectives
- Evidence must be specific (file:line, URL, spec ref) — no vague claims

OUTPUT: Return a JSON array of ScoutCandidate objects. Each object must have: candidate, evidence, payoff, risk, contract_tie, prior_consideration, recommended_fate, fate_rationale.
```

### Design Mode Prompt

```
ROLE: Design Leverage Scout for ADV change {change-id}.
WORKING DIRECTORY: {workdir}

MODE: design — identify leverage points in the current design.

CONTEXT:
Proposal: {proposal summary}
Agreement Objectives: {numbered objectives}
Acceptance Criteria: {numbered AC}
Constraints: {constraints}
Avoidances: {avoidances}
Draft Design: {design.md summary or full content}
Prior Considerations: {prior_consideration data from conflict scan}

SCOUT BRIEF:
Search for leverage opportunities in the current design:
1. Shortcuts: can any implementation step be simplified or skipped?
2. Reusable components: existing code, patterns, or libraries that reduce work
3. Parallelism: tasks that could run concurrently instead of sequentially
4. Simplification: design decisions that could be replaced with simpler alternatives
5. Cross-cutting improvements: changes that benefit multiple objectives at once

CONSTRAINTS:
- Hard cap: return at most 5 candidates
- Each candidate must follow the 8-field ScoutCandidate schema
- Sort by payoff/risk ratio (highest first)
- Do not propose changes to the agreement's constraints or avoidances
- Do not propose replacing the core architecture (that's a design revision, not a leverage point)
- Evidence must be specific (file:line, URL, spec ref) — no vague claims

OUTPUT: Return a JSON array of ScoutCandidate objects. Each object must have: candidate, evidence, payoff, risk, contract_tie, prior_consideration, recommended_fate, fate_rationale.
```

## Degradation Path

When the scout cannot execute or returns no useful output:

| Condition | Handling |
|-----------|----------|
| Skill file missing | Orchestrator skips with note: "Scout skill unavailable; skipping opportunity scan." Proceed without blocking. |
| adv-researcher spawn fails | Orchestrator records "Scout: inconclusive (researcher unavailable)." Proceed without blocking. |
| adv-researcher returns empty/malformed output | Orchestrator records "Scout: inconclusive (no candidates returned)." Proceed without blocking. |
| adv-researcher times out | Orchestrator records "Scout: inconclusive (timeout)." Proceed without blocking. |

Mandatory means "must attempt," not "must succeed." The scout never blocks the workflow.

## Opt-Out for Trivially Scoped Changes

The scout phase may be skipped with documented rationale when:
- The change is a narrow bug fix or local refactor with no viable opportunity surface
- The change has a single, well-understood implementation path
- The scope is so small that opportunity scouting would add latency without value

To opt out, the orchestrator records: "Scout: skipped — {rationale}" in the phase output.

Analogous to rq-disc10.3 (External-Solution Check opt-out for purely internal changes).

## Differentiation from Existing Mechanisms

| Mechanism | Purpose | Output | Routing |
|-----------|---------|--------|---------|
| **Opportunity Scout** (this skill) | Identify contract-tied opportunities and leverage points | 8-field candidates with fate routing | Auto-adopt narrow only; surface untied to user |
| **adv-improve** | Find evidence-backed improvement opportunities across the codebase | Severity-scored findings (CRITICAL→LOW) with applicability scoring | Advisory report; no auto-adoption |
| **External-Solution Check** (rq-disc10) | Check for viable alternative directions when ecosystem unknowns exist | Direction alternatives with source citations | Influences LBP check; no auto-adoption |
| **Conflict Scan** (rq-disc04) | Identify overlapping/conflicting work with active/archived changes | Conflict findings | Coordination warning; no auto-adoption |

The scout's unique contributions are `contract_tie` (grounding in the agreement) and `recommended_fate` (structured adoption routing). Other mechanisms do not produce fate-routed candidates.

## Constraints

- **Read-only** — never write, edit, or create files
- **No ADV mutations** — never call `adv_change_create`, `adv_task_add`, `adv_gate_complete`, or any state-modifying ADV tool
- **Bounded output** — cap at 5 candidates per mode
- **Evidence required** — no candidate without a source citation
- **Contract-grounded** — every candidate ties to an agreement item or is explicitly marked "untied"
- **Single pass** — one bounded execution per mode; no iterative research loops
- **Commands own workflow** — this skill defines methodology only; commands decide when and how to invoke it

## Anti-Patterns

- Do NOT run unbounded research — stick to the hard cap and single pass
- Do NOT auto-adopt untied ideas regardless of payoff — surface to user instead
- Do NOT replace the design validator — the scout identifies opportunities, the validator checks correctness
- Do NOT use the scout to re-propose previously rejected approaches — check prior_consideration before surfacing
- Do NOT make the scout a hard dependency — INCONCLUSIVE is always a valid outcome
