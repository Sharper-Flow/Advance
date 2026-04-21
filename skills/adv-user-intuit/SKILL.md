---
name: adv-user-intuit
description: "Structured comparison presentation protocol — format candidates, present side-by-side via question tool, capture preference. Use when facing concrete candidates where user intuition is needed."
keywords: ["comparison", "pairwise", "preference", "candidate", "tradeoff-presentation", "side-by-side", "which-one"]
license: MIT
metadata:
  priority: medium
  phase: 1
  see_also: "docs/user-intuit-protocol.md"
---

# User-Intuit Comparison Skill

## When to Load This Skill

Load when you have **2+ concrete candidates** and need the user's intuition to choose between them.

**Load when:**
- You've identified specific options and need the user to pick one
- Side-by-side comparison helps the user judge better than prose alone
- The choice depends on user preference, taste, or domain intuition

**Skip when:**
- Only one reasonable approach exists
- The user gave explicit constraints that resolve the choice
- You need criteria-based analysis first (use `prioritizer` skill, then come back here)
- The decision is trivial, reversible, or constrained by specs

## Workflow

### Phase 1: Prepare Candidates (30 seconds)

Define your candidates with the minimal shape:

```
{id: string, label: string, description: string}
```

Rules:
- `id`: stable identifier, never shown to the user
- `label`: 1-5 words, matches what appears in the question option
- `description`: 1-2 sentences explaining what this option offers
- Cap at 4 candidates (5th slot reserved for P26 write-in)

### Phase 2: Format Comparison Block (30 seconds)

Choose a presentation pattern and output it in your assistant text BEFORE the `question` call:

| Pattern | Best for | Example |
|---------|----------|---------|
| Markdown table | Feature/attribute comparison | `\| Aspect \| A \| B \|` |
| Boxed side-by-side | Layout/UX/aesthetic choices | `┌─ A ─┐  ┌─ B ─┐` |
| Bullet comparison | Quick pros/cons | `**A:** ✓ pro ✗ con` |

Keep it text-readable — terminal/plain-text clients must work.

### Phase 3: Present via Question Tool

Call `question` with options matching your candidate labels:

```json
{
  "questions": [{
    "header": "{Short choice description}",
    "question": "{Context-aware question about what the user should evaluate}",
    "options": [
      { "label": "{Candidate A label} (Recommended)", "description": "{Candidate A description}" },
      { "label": "{Candidate B label}", "description": "{Candidate B description}" },
      { "label": "Different approach", "description": "Describe a different option" }
    ]
  }]
}
```

**P26 compliance:** Always include a write-in option with a contextual label. The write-in counts toward the 5-option cap.

### Phase 4: Parse Response

The `question` tool returns an array of selected labels:

1. Match the returned label to your `Candidate.label`
2. Use the `Candidate.id` as the chosen identifier for downstream logic
3. If write-in was selected, treat as custom input

## Example: Pairwise Comparison

```
# Agent internal state
candidates = [
  {id: "pool", label: "Connection pooling", description: "Fast for concurrent requests, higher memory"},
  {id: "event", label: "Event loop", description: "Responsive per-request, slower batch throughput"}
]

# Agent output (comparison block)
Comparison:

| Aspect    | Connection pooling | Event loop       |
|-----------|-------------------|------------------|
| Throughput| High              | Moderate         |
| Latency   | Moderate          | Low              |
| Memory    | Higher            | Lower            |
| Complexity| Low               | Medium           |

# Agent action: question tool call
{
  "questions": [{
    "header": "Connection strategy",
    "question": "Which connection strategy for the API server?",
    "options": [
      {"label": "Connection pooling (Recommended)", "description": "High throughput, simple setup"},
      {"label": "Event loop", "description": "Low latency per request"},
      {"label": "Different approach", "description": "Describe another strategy"}
    ]
  }]
}

# Response parsing
response = ["Connection pooling (Recommended)"]
→ match label "Connection pooling (Recommended)" → candidate id "pool"
→ chosen: pool
```

## Example: Best-of-N

```
# Agent internal state
candidates = [
  {id: "grid", label: "Card grid", description: "Visual cards with thumbnails"},
  {id: "list", label: "Compact list", description: "Dense text rows"},
  {id: "table", label: "Table view", description: "Sortable columns"}
]

# Agent output + question call (comparison table + options)
# (follows same pattern as pairwise but with 3 candidates + write-in)
```

## Rules

1. Always use the `question` tool for the actual choice — comparison blocks are context only
2. Always include a contextual write-in option (P26)
3. Keep the visualized options aligned with the `question` options
4. Cap at 4 candidates + 1 write-in = 5 total
5. Put the recommended option first with "(Recommended)" suffix when one is clearly better
6. Don't ask for preferences you can derive from code/specs/constraints
7. If you need to analyze tradeoffs first, use `prioritizer` skill, then use this skill for presentation

## Phase 1 Scope Boundary

This skill is agent-interpreted guidance only:
- No runtime enforcement — candidates are agent-internal structures
- No persistence — choices don't survive the session
- No visual/image support — text-only patterns
- No new tools — reuses existing `question` tool

Future: Phase 3 visual comparator will extend this with image/media support, session tracking, and preference memory. That lives in a separate service, not here.
