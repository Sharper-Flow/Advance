---
name: adv-clarify
description: Ask Socratic clarifying questions for acceptance criteria
agent: build
---

# ADV Clarify - Socratic Requirements Analysis

Use the Socratic method to uncover hidden assumptions, edge cases, and acceptance criteria through guided questioning.

## Approach

The Socratic method is iterative:
- **First round**: Start broad, challenge assumptions, explore the problem space
- **Follow-up rounds**: Probe deeper based on answers, clarify ambiguities

## Context Analysis

Before asking questions, identify:
1. **Stated assumptions** - What is being taken for granted?
2. **Unstated assumptions** - What implicit beliefs might be hiding?
3. **Potential contradictions** - Are there conflicting requirements?
4. **Knowledge gaps** - What critical information is missing?

Review conversation context:
- Specifications, proposals, or design documents discussed
- The work being requested or planned
- Existing code or architecture that may be affected
- Constraints (technical, business, timeline)

## Your Task

Ask **3-15 clarifying questions** based on complexity:
- Simple changes: 3-5 questions
- Medium features: 6-10 questions
- Complex systems: 10-15 questions

## Question Strategy

Structure questions to guide toward conclusions:

1. **Challenge assumptions first**: "What would happen if [assumption] weren't true?"
2. **Explore before narrowing**: Start with "how" and "why"
3. **Probe for depth**: "Can you elaborate on..."
4. **Reveal implications**: "If we do X, what effect on Y?"
5. **Test boundaries**: "What's the simplest version? Most complex?"

## Question Categories

| Category | Focus |
|----------|-------|
| **Assumptions** | What might not be true? |
| **Scope** | What's explicitly out of scope? |
| **Users** | Who are the different affected users? |
| **Happy path** | What does success look like? |
| **Edge cases** | Empty, max, invalid boundaries? |
| **Errors** | How should failures be communicated? |
| **State** | What states exist and how do they change? |
| **Data** | What inputs/outputs expected? |
| **Performance** | Latency, throughput, scale requirements? |
| **Security** | Access controls, data protections? |
| **Integration** | How does this interact with existing systems? |
| **Observability** | How will we know it's working? |
| **Rollback** | What if we need to undo? |

## Output Format

1. Brief statement of key assumptions/gaps identified (2-3 sentences)
2. Numbered questions, grouped by theme
3. For each question:
   - Ask clearly and specifically
   - Explain why it matters (in parentheses)
4. Invite user to answer and continue dialogue

Focus on questions that produce **concrete, testable acceptance criteria**. Prefer open-ended questions that reveal requirements.

---

## Completion Banner

```
============================================================
      /adv-clarify COMPLETE
============================================================
Result: {N} clarifying questions presented
============================================================
```
