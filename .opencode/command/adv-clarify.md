---
name: adv-clarify
description: Ask clarifying questions to resolve ambiguous requirements
---
# ADV Clarify — Cross-Stage Requirements Clarification

Resolve hidden assumptions, edge cases, acceptance criteria, and decision gaps across proposal, discovery, agreement, and design.

## Phase 0: Load Skill

`skill("adv-clarify")` → Socratic types, ambiguity categories, funnel technique, findings-driven mode, resolution log, output summary. Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).

## Stage Coverage

Use when ambiguity blocks:

- `proposal` — problem framing and scope
- `discovery` — current-state assumptions and objectives
- `agree` — constraints, avoidances, acceptance criteria
- `design` — architecture choices and operational implications

## Phase 1: Context Analysis

Silently analyze stated/unstated assumptions, contradictions, knowledge gaps, specs, proposals, code, constraints.

## Anti-Patterns

| × Anti-Pattern | ✓ Fix |
|---|---|
| Plain text questions | Use `question` tool |
| Leading questions | Neutral framing |
| Rapid-fire (>3) | Max 2-3, pause |
| Closed-only | Lead with open |
| No summarization | Regular playback |
