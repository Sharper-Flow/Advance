# ADV Question Tool Usage

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
