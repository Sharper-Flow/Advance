---
name: adv-idea
description: "Explore rough ideas before drafting a proposal"
---

# ADV Idea — Collaborative Ideation Before Proposal

Shape a vague idea into a proposal-ready summary. Fully collaborative; read-only for ADV state.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** one proposal-ready summary — clearer framing, constraints, open questions, sizing assessment, and a recommended exit path.

**Reads:** specs, codebase, and sub-agent output.

**Creates nothing.** Does not mutate ADV state.

**Persistence:** Conversational shaping; analysis carries forward via exit recommendation, not disk artifact.

**× MUST NOT:** create change, create tasks, complete gates, or silently commit to implementation design. This command does not call `adv_change_create`, `adv_gate_complete`, or `adv_task_add` directly.

**Gate:** None.

## Exit Paths

| Exit                    | Condition                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| ✅ one-change → `/adv-proposal` | Idea is focused enough to fit a single change                             |
| ✅ initiative → `/adv-epic`     | Idea is initiative-sized (see Phase 4) and should be routed to `/adv-epic` |
| 🔄 iterate              | Useful progress, but key questions remain                                   |
| 🛑 stop                 | User chooses not to pursue the idea right now                               |

## Phase 0: Embedded Methodology

Sub-agent resilience follows the canonical retry + fallback chain in `adv-research.md:111-135`. If a dispatched sub-agent returns empty, failed, or inconclusive: retry once with the same prompt; if the retry also fails, fall back to inline research using Context7 for official docs, Exa web search for community guidance and current best practices, and searchcode code search for real-world implementation patterns. Emit findings with the same `VALIDATION:` / `RECOMMENDATION:` structure and never skip a research question.

---

## Phase 1: Frame

1. Restate the idea in one sentence.
2. Capture the topic, target outcome, and explicit avoidances.
3. Surface assumptions, constraints, and unknowns before moving on.

## Phase 2: Explore

Dispatch a Task-tool subagent for codebase or ecosystem context:

- Use the `task` tool with `subagent_type: general` for mixed or unclear topics.
- Use `subagent_type: explore` when the idea is mostly about code structure, hotspots, or existing patterns.

The subagent should return relevant context, not a final decision. Apply the resilience protocol from Phase 0 if the result is empty or failed.

## Phase 3: Synthesize

Invoke `adv-researcher` to validate the idea against architecture, patterns, simplicity, and security dimensions. Carry `validation.status` through to the summary:

- `pass` — findings support the idea as stated
- `caution` — idea is viable but carries noted risks or tradeoffs
- `fail` — findings contradict the idea or surface a blocker
- `unknown` — not enough evidence; mark as a research gap

Summarize sourced findings, alternatives considered, and any spec-law implications.

## Phase 4: Size

Apply an any-of initiative-sizing consensus test. The idea is initiative-sized if **any** of the following are true:

- ≥3 sub-problems
- ≥3 distinct regions of the codebase or product surface
- >1 repo touched

If initiative-sized, recommend `/adv-epic` as the exit path. Otherwise, treat it as a one-change idea and recommend `/adv-proposal`.

## Phase 5: Exit

Propose exactly one of the four exit paths:

- **one-change → `/adv-proposal`** — focused enough for a single change
- **initiative → `/adv-epic`** — initiative-sized; Epic-sized work should route to `/adv-epic`
- **iterate** — keep exploring; list the next 1–3 concrete questions
- **stop** — user chooses not to pursue

The exit is a handoff recommendation only. `/adv-idea` does not create changes, tasks, gates, or Epics directly.

## Output

Emit a compact summary:

- Restated idea
- Key constraints / avoidances
- Sourced findings and `validation.status`
- Sizing assessment with the consensus test result
- Recommended exit path and next command

## Anti-Patterns

- × no sub-agent dispatch — skipping Phase 2 and synthesizing without codebase or ecosystem context
- × silent state mutation — Phase 5 exits that invoke `adv_change_create`, `adv_gate_complete`, or `adv_task_add` directly
- × opaque scope decisions — Phase 4 sizing without surfacing the ≥3 sub-problems / ≥3 distinct regions / >1 repo touched consensus test
