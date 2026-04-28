---
name: adv-idea
description: "Explore rough ideas before drafting a proposal"
---
<!-- manifest: adv-idea · requiresChangeId: false · scope: reads[specs, codebase] -->

# ADV Idea — Collaborative Ideation Before Proposal

Shape a vague idea into a proposal-ready problem statement. Fully collaborative. Read-only with respect to ADV state.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** clearer idea framing, constraints, open questions, and a proposal-ready summary when the idea becomes crisp enough.

**× MUST NOT:** create a change, create tasks, complete gates, or make implementation commitments.

**Gate:** None.

## Boundary vs Nearby Commands

- `/adv-idea` — use before a change exists.
- `/adv-proposal` — use once the problem statement is clear enough to create durable ADV artifacts.
- `/adv-clarify` — use when a change already exists and requirements inside that change need clarification.

## Exits

| Exit | Condition |
|------|-----------|
| ✅ Ready for proposal | Idea is clear enough to hand off to `/adv-proposal` |
| 🔄 Keep exploring | Useful progress made, but key questions remain |
| 🛑 Stop here | User decides not to pursue idea right now |

---

## Phase 1: Frame Starting Point

1. Restate the idea in one sentence.
2. Extract any stated goal, user, pain, constraint, rejected direction, and unknown.
3. If the user already has a crisp problem statement, say so and recommend `/adv-proposal` instead of forcing an ideation loop.

## Phase 2: Ideation Loop

Use `question` tool only.

- Ask 1-2 questions per turn.
- Prefer open-ended questions.
- Use Socratic prompts when helpful: clarification, assumptions, alternatives, implications, success signal.
- Summarize back what changed before asking the next question.
- Pull in targeted local or external research only when it will reduce uncertainty materially.

Good prompts:
- "What problem would this solve if it worked well?"
- "Who feels this pain first?"
- "What outcome would make this worth doing?"
- "What should this definitely not turn into?"

## Phase 3: Convergence Check

The idea is ready for `/adv-proposal` when all are true:

- problem is concrete enough to restate clearly
- intended outcome is specific enough to measure
- obvious out-of-scope or avoidances are named
- remaining unknowns can move into discovery instead of blocking the proposal

If not ready, keep the loop collaborative. Do not fabricate certainty.

## Phase 4: Proposal-Ready Summary

When ready, emit:

- Problem statement
- Desired outcome
- Constraints / avoidances
- Open questions to carry into discovery
- Suggested next command: `/adv-proposal`

If not ready, emit:

- Current idea framing
- What is still unclear
- 1-3 concrete next questions

## Output



## Anti-Patterns

- × jumping straight to implementation design
- × creating ADV artifacts before the idea is clear enough
- × asking rapid-fire closed questions
- × pretending uncertainty is resolved when it is not
