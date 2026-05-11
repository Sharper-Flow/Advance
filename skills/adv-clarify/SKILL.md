---
name: adv-clarify
description: "Socratic requirements clarification methodology for ADV proposal/discovery/design ambiguity"
keywords:
  [
    "adv",
    "clarify",
    "requirements",
    "ambiguity",
    "socratic",
    "questions",
    "acceptance-criteria",
  ]
metadata:
  priority: medium
  source: adv-clarify-command
---

# ADV Clarify Skill

## Purpose

Methodology for structured clarification. Convert ambiguous requirements into answerable questions, capture resolution, and hand user back to owning workflow. Command owns ADV updates and question tool calls; skill owns questioning rubric.

## Six Socratic Question Types

| Type | Purpose | Example |
|---|---|---|
| Clarification | Explore meaning | "What do you mean by 'fast'?" |
| Assumptions | Probe beliefs | "Why assume users will have accounts?" |
| Evidence | Demand proof | "What evidence supports that?" |
| Alternatives | Surface perspectives | "How would a power user see this?" |
| Implications | Explore downstream effects | "If this happened, what else results?" |
| Meta-questions | Question priority | "Which requirement is most critical?" |

## Findings-Driven Mode

Triggered from `/adv-discover` Phase 2.5 when ambiguity threshold hits CRITICAL ≥ 1 or HIGH ≥ 2.

Input findings follow `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy`:

```json
[
  {"id":"B1","severity":"CRITICAL","category":"Boundaries","finding":"...","evidence":"...","reason":"..."},
  {"id":"S1","severity":"HIGH","category":"Completion Signals","finding":"...","evidence":"...","reason":"..."}
]
```

Resolution procedure:

1. Group findings by category and severity.
2. Turn each `reason` into neutral Socratic question.
3. Ask no more than 2-3 questions per turn.
4. Write resolved content to right proposal.md section via command-owned update.
5. Append `## Clarify Resolution Log` entries:

```markdown
- B1 (resolved {ISO timestamp}): {resolution text}
- S1 (resolved {ISO timestamp}): {resolution text}
```

6. Emit REQUIREMENTS DISCOVERY SUMMARY and return instruction: `Next: rerun /adv-discover {change-id}`.

Do not write `agreement.md`; discovery owns agreement.

## Question Categories

| Category | Focus |
|---|---|
| Assumptions | "What if [assumption] were not true?" |
| Scope | explicit in/out boundaries |
| Users | affected roles and user classes |
| Happy path | exact success behavior |
| Edge cases | empty, max, invalid, duplicate, missing |
| Errors | failure communication and recovery |
| State | states and transitions |
| Data | inputs, outputs, ownership, shape |
| Performance | latency/throughput/scale thresholds |
| Security | access controls and trust boundaries |
| Integration | external/internal system touchpoints |
| Observability | production success/failure signals |
| Rollback | undo/recovery path |

Scale:

- Simple: 3-5 total questions
- Medium: 6-10
- Complex: 10-15

## Funnel Technique

Use a narrowing sequence:

1. Broad open question
2. Summarize answer
3. Ask 1-2 specific clarifiers
4. Challenge key assumption
5. Explore alternative
6. Check implications
7. Summarize and confirm
8. Probe remaining gaps

## Deep Probes

### Laddering

Keep asking why until user need is explicit.

Example: "dashboard" → "what problem?" → "see status" → "what decisions?" → "which items need attention?"

### Consequence Mapping

Ask: "If we did X, what else changes?", "What would break?", "Who's affected downstream?"

## Requirements Smells

| Smell | Response |
|---|---|
| Subjective: "user-friendly" | "What makes it user-friendly specifically?" |
| Ambiguous: "quickly" | "What target time or metric?" |
| Superlative: "best" | "Compared to what baseline?" |
| Totality: "all", "never" | "What exceptions exist?" |
| Vague scope: "handle errors" | "Which errors, and how?" |

## Output Summary

REQUIREMENTS DISCOVERY SUMMARY includes:

- Confirmed requirements
- Acceptance criteria
- Assumptions to validate
- Edge cases identified
- Remaining questions
- Suggested next steps

If invoked from `/adv-discover`, final line: `Next: rerun /adv-discover {change-id}`.

## Constraints

- Questions must use `question` tool.
- Max 2-3 questions per response.
- Start open, then clarify.
- Summarize before asking again.
- Neutral wording; no leading questions.
- No agreement write; no gate completion.
