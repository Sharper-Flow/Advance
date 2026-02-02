# ADV Question Tool Usage

Use the `question` tool for predefined choices: confirmations, selections, doom loop recovery.
Skip for: open-ended questions, debugging, free-form input.

## Schema

```typescript
{
  "questions": [{
    "header": string,      // Short label, max 30 chars (required)
    "question": string,    // Full question text (required)
    "multiple": boolean,   // Allow multiple selections (optional)
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
| `options` | 2-5 choices |

**Note:** Don't include "Other" - custom input is added automatically.

## Example

```json
{
  "questions": [{
    "header": "Confirm",
    "question": "Apply changes to spec?",
    "options": [
      { "label": "Apply (Recommended)", "description": "Merge deltas into spec" },
      { "label": "Review first", "description": "Show diff before applying" },
      { "label": "Cancel", "description": "Abort operation" }
    ]
  }]
}
```

## Best Practices

1. Put recommended option first with "(Recommended)" suffix
2. Custom input is automatic - don't add catch-all options
3. Answers returned as arrays of labels
4. Use `multiple: true` for multi-select
