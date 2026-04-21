# User-Intuit Comparison Protocol

A behavior-first protocol for presenting structured pairwise or multi-candidate comparisons to users and capturing their preferences as actionable signal.

**Status:** Phase 1 — text-only, agent-interpreted guidance.
**Scope:** Agent-generic. Not ADV-owned. Any agent can use this protocol.

## When to Use

Use when you have **2+ concrete candidates** and need the user's intuition to choose between them.

**Use for:**
- Design/layout choices (dense vs spacious, dark vs light)
- Ranking preferences (search result A vs B, card layout X vs Y)
- Tradeoff resolution where options are concrete, not abstract criteria
- Any "which one?" decision where the agent can't infer the answer alone

**Skip when:**
- Only one reasonable approach exists
- The user gave explicit constraints that resolve the choice
- The decision is trivial or easily reversible
- You need criteria-based tradeoff analysis (use `prioritizer` skill instead)

## Candidate Shape

Each candidate has three fields:

```typescript
interface Candidate {
  id: string;          // Unique identifier for matching responses
  label: string;       // Short display text (1-5 words)
  description: string; // 1-2 sentence explanation of what this option offers
}
```

### Mapping to Question Tool

Each candidate maps directly to one option in the `question` tool:

```
Candidate { id: "dense", label: "Dense layout", description: "..." }
  → question option { label: "Dense layout", description: "..." }
```

The `id` is not shown to the user — it's for the agent to match the response label back to the candidate.

## Comparison Modes

### Pairwise (A vs B)

Best for: two alternatives with clear tradeoffs.

```md
Comparison:

| Aspect     | Option A        | Option B        |
|------------|-----------------|-----------------|
| Strength   | Faster scanning | Cleaner look    |
| Tradeoff   | Less whitespace | Fewer items     |
| Best for   | Data-dense work | Focused tasks   |
```

Then call `question` with 2 options + write-in:

```json
{
  "questions": [{
    "header": "Layout choice",
    "question": "Which layout should we use for this view?",
    "options": [
      { "label": "Option A (Recommended)", "description": "Faster scanning, denser information" },
      { "label": "Option B", "description": "Cleaner look, fewer items visible" },
      { "label": "Different approach", "description": "Describe a different layout" }
    ]
  }]
}
```

### Best-of-N (Pick from 3+)

Best for: multiple alternatives where the user picks one winner.

Use a markdown table or bullet comparison, then call `question` with N options + write-in. Respect the 5-option cap (including write-in from P26).

```json
{
  "questions": [{
    "header": "Search ranking",
    "question": "Which search result format should we ship?",
    "options": [
      { "label": "Card grid", "description": "Visual cards with images" },
      { "label": "Compact list", "description": "Dense text rows" },
      { "label": "Table view", "description": "Sortable columns" },
      { "label": "Different approach", "description": "Describe another format" }
    ]
  }]
}
```

## Response Parsing

The `question` tool returns an array of selected labels. Match back to candidates:

1. User selects a label from the options
2. Agent matches the label to the corresponding `Candidate.label`
3. Agent uses the `Candidate.id` as the chosen identifier for downstream logic
4. If the user selected the write-in option, treat it as a custom/unexpected choice

Example flow:
```
Candidates: [{id:"fast", label:"Fast approach"}, {id:"safe", label:"Safe approach"}]
Question response: ["Fast approach"]
Parsed: chosen_id = "fast"
```

## Presentation Patterns

### Markdown Table (default)

Best for: comparing features/attributes across candidates.

```md
| Aspect | Option A | Option B |
|--------|----------|----------|
| Speed  | Fast     | Moderate |
| Safety | Moderate | High     |
| Cost   | Low      | Medium   |
```

### Boxed Side-by-Side

Best for: layout/aesthetic/UX choices where visual structure matters.

```md
**Option A: Dense Dashboard**
┌─────────────────────┐
│ [card][card][card]   │
│ [card][card][card]   │
│ [card][card][card]   │
└─────────────────────┘

**Option B: Spacious Dashboard**
┌─────────────────────┐
│   [card]   [card]   │
│                     │
│   [card]   [card]   │
└─────────────────────┘
```

### Bullet Comparison

Best for: short-form pros/cons when a table feels heavy.

```md
**Option A (Dense)**
- ✓ More items visible per screen
- ✓ Faster visual scanning
- ✗ Less breathing room

**Option B (Spacious)**
- ✓ Cleaner aesthetic
- ✓ Easier focus on individual items
- ✗ More scrolling needed
```

## Rules

1. **Always use the `question` tool** for the actual choice — comparison blocks are context, not replacements
2. **Always include a write-in option** (P26 from `rules.yaml`) — contextual label like "Different approach" or "Custom layout"
3. **Keep the visualized option set aligned** with the final `question` options
4. **Respect the 2-5 choice cap** (including write-in) in the `question` call
5. **Match response labels back to candidate IDs** — don't assume ordering
6. **Don't ask for preferences you can derive** — if constraints already resolve the choice, skip the comparison
7. **Use `prioritizer` for criteria analysis, `user-intuit` for concrete candidate presentation** — they're complementary, not competing

## Phase 1 Scope Boundary

This protocol is **agent-interpreted guidance only** in Phase 1:

- No new MCP tools — reuses existing `question` tool
- No runtime type enforcement — candidates and responses are agent-internal structures
- No persistence or preference memory — choices are ephemeral to the current session
- No visual/image support — text-only presentation patterns
- No new plugin code — this is a docs + skill deliverable

## Future Extension Points (Phase 3+)

When the visual comparator service ships, the protocol will extend:

- **Candidate shape** may grow: `image_url`, `data` (binary/media), `confidence`, `metadata`
- **Response shape** may grow: `session_id`, `timestamp`, structured `PreferenceResponse` type
- **New mode**: `ranked` (order 3+ candidates) — deferred until visual comparator implements it
- **Persistence**: comparator service stores every comparison for learning/training
- **Learning**: comparator aggregates preferences to improve future suggestions

These extensions live in the comparator service (separate repo), not in ADV or this protocol. The protocol defines the contract boundary; the comparator implements the visual + learning side.

## Relationship to Other Documents

- **`docs/adv-question-tool.md`** — question tool usage patterns. This protocol builds on its "Visual Comparison Before Questions" section.
- **`skills/adv-user-intuit/SKILL.md`** — loadable skill with the 4-phase workflow for agents.
- **`skills/prioritizer/SKILL.md`** — tradeoff analysis (criteria → decision map). Use when you need to *analyze* tradeoffs, not *present* concrete candidates.
- **`ADV_INSTRUCTIONS.md`** — ADV command protocols. This protocol is agent-generic, not ADV-specific.
