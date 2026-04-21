# ADV Question Tool Usage

See also: [docs/adv-autonomy-compliance-matrix.md](adv-autonomy-compliance-matrix.md) for the command-by-command autonomy audit.

Use the `question` tool for predefined choices when the user must provide intent, approval, or preference: confirmations, subjective tradeoffs, acceptance, and doom loop recovery.
Skip for: open-ended questions, debugging, free-form input, and deterministic classifications the agent can derive from code/specs/context.

## Schema

```typescript
{
  "questions": [{
    "header": string,      // Short label, max 30 chars (required)
    "question": string,    // Full question text (required)
    "multiple": boolean,   // Allow multiple selections (optional)
    "custom": boolean,     // Allow custom text entry (optional, default true)
    "options": [{          // 2-5 choices (required)
      "label": string,     // Display text, 1-5 words (required)
      "description": string // Explanation of choice (required)
    }]
  }]
}
```

## Constraints

| Field | Limit |
|-------|-------|
| `header` | max 30 chars |
| `label` | 1-5 words |
| `options` | 2-5 choices (including write-in) |

**Note:** Global rule **P26** (`rules.yaml`) requires a write-in option in every question block. Use a contextual label (for example `Other`, `Different approach`, `Custom value`). The write-in option counts toward the 5-option cap. If adding it would exceed 5, remove the lowest-priority predefined option.

Formatted text/WYSIWYG input is best effort and depends on the client UI. Always keep `custom` enabled so text entry remains available.

## Visual Comparison Before Questions

Use a visual comparison block in normal assistant output **before** the `question` tool when side-by-side context materially helps the user judge options:

- layout / aesthetic choices
- UX workflow tradeoffs
- multi-option comparisons where prose alone is hard to scan

Skip visual comparison blocks for routine confirmations, cancellations, and other simple questions where a flat option list is already clear.

**For structured pairwise or multi-candidate comparisons**, see [docs/user-intuit-protocol.md](user-intuit-protocol.md) and load `skill("adv-user-intuit")` for a reusable presentation workflow (prepare candidates → format comparison → present via question tool → parse response).

### Rules

1. Treat the visual block as context, not as a replacement for the `question` tool
2. Use text-first formats that remain readable in terminal/plain-text clients
3. Screenshots are optional; when used, include a text summary / fallback
4. Keep the visualized option set aligned with the final `question` options
5. Respect the 2-5 choice cap (including write-in) in the actual `question` call

### Suggested Formats

- markdown table
- boxed side-by-side comparison
- lightweight text wireframe/card

### Example Pattern

```md
Comparison:

| Option | Best for | Tradeoff |
|---|---|---|
| A | Dense dashboard view | Faster scanning, less breathing room |
| B | Spacious dashboard view | Cleaner look, fewer items visible |

Then call `question` with the same choice set:

{
  "questions": [{
    "header": "Layout choice",
    "question": "Which layout should ADV prefer for this flow?",
    "options": [
      { "label": "Option A (Recommended)", "description": "Dense dashboard view" },
      { "label": "Option B", "description": "Spacious dashboard view" },
      { "label": "Different approach", "description": "Use custom text to describe another layout" }
    ]
  }]
}
```

## Example

```json
{
  "questions": [{
    "header": "Confirm",
    "question": "Apply changes to spec?",
    "custom": true,
    "options": [
      { "label": "Apply (Recommended)", "description": "Merge deltas into spec" },
      { "label": "Review first", "description": "Show diff before applying" },
      { "label": "Cancel", "description": "Abort operation" },
      { "label": "Other", "description": "Use custom text to provide a different response" }
    ]
  }]
}
```

## Best Practices

1. Put recommended option first with "(Recommended)" suffix
2. Include an explicit contextual write-in option in every question block
3. Keep `custom: true` (or omit it to use default true)
4. Answers are returned as arrays of labels
5. Use `multiple: true` for multi-select
6. Do not ask the user to classify things the agent can infer (change type, affected specs, obvious target selection, cross-repo scope)
7. In `/adv-discover` during the agreement phase, triage open questions before asking: technical/implementation questions are resolved via LBP research; only user-facing questions (priorities, behavior, downsides, AC boundaries) go to the user. If a technical question has user-value tradeoffs, reframe it as the downstream outcome question.
