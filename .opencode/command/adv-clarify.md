---
name: adv-clarify
description: Ask clarifying questions to resolve ambiguous requirements
---
<!-- manifest: adv-clarify · requiresChangeId: false · prereqs: [adv-proposal] -->
# ADV Clarify — Cross-Stage Requirements Clarification

Resolve hidden assumptions, edge cases, acceptance criteria, and decision gaps across proposal, discovery, agreement, and design.

## Phase 0: Load Skill

`skill("adv-clarify")` → Socratic types, ambiguity categories, funnel technique, findings-driven mode, resolution log, output summary. If unavailable, use fallback below.

Fallback: analyze context, summarize understanding, ask 1-2 neutral questions via `question`, update proposal only when findings-driven, then emit REQUIREMENTS DISCOVERY SUMMARY.

## Stage Coverage

Use when ambiguity blocks:

- `proposal` — problem framing and scope
- `discovery` — current-state assumptions and objectives
- `agree` — constraints, avoidances, acceptance criteria
- `design` — architecture choices and operational implications

## Findings-Driven Mode

When invoked from `/adv-discover` Phase 2.5 mandatory trigger (CRITICAL ≥ 1 or HIGH ≥ 2), input is structured findings list in conversation context.

Findings may also originate from `/adv-audit` ambiguity detection (Phase 3 inline scan). When the source is a spec audit, each finding includes `specCapability` context.

Finding shape:

```json
[{"id":"B1","severity":"CRITICAL","category":"Boundaries","finding":"...","evidence":"...","reason":"...","specCapability":"advance-workflow"}]
```

Protocol:

1. Convert each finding to Socratic question seeded by `reason`.
2. Resolve by writing proposal.md section (for change findings) or spec file (for spec-law findings) via appropriate update tool.
3. Add `## Clarify Resolution Log` to proposal.md or spec comments:
   ```markdown
   - B1 (resolved {ISO timestamp}): {resolution text}
   ```
4. Emit REQUIREMENTS DISCOVERY SUMMARY with cleared findings.
5. End with `Next: rerun /adv-discover {change-id}` or `Next: rerun /adv-audit {capability}`.

Return path same as `/adv-discover` AC Checkpoint Phase 4.5.1. `/adv-clarify` MUST NOT write `agreement.md` or call `adv_gate_complete`.

## Phase 1: Context Analysis

Silently analyze stated/unstated assumptions, contradictions, knowledge gaps, specs, proposals, code, constraints.

## Phase 2: Question Loop

Use skill question categories and funnel. Max 2-3 questions per response; lead open, add 1-2 clarifiers; summarize before asking; watch overwhelm signals.

**ALWAYS use `question` tool** — never plain text questions.

Flow: analyze → summarize → ask via `question` → process response → repeat until sufficient.

## Phase 3: Output

Emit REQUIREMENTS DISCOVERY SUMMARY:

- confirmed requirements with acceptance criteria
- assumptions to validate
- edge cases identified
- remaining questions
- suggested next steps

If invoked from `/adv-discover` Phase 2.5 or Phase 4.5.1, final line MUST be `Next: rerun /adv-discover {change-id}`.

## Constraints

- MUST use `question` tool for questions.
- MUST NOT write `agreement.md`.
- MUST NOT call `adv_gate_complete`.
- Max 2-3 questions per response.
- Neutral framing; no leading questions.

## Anti-Patterns

| × Anti-Pattern | ✓ Fix |
|---|---|
| Plain text questions | Use `question` tool |
| Leading questions | Neutral framing |
| Rapid-fire (>3) | Max 2-3, pause |
| Closed-only | Lead with open |
| No summarization | Regular playback |
