# csp-report-only-with-todo (POSITIVE fixture)

Positive fixture for the `report-only-header-with-deferred-todo` arch-scan rule
(Rule 3 — escalate semantics).

## What this proves

When a Report-Only security header is set with NO enforced equivalent and NO
reporting endpoint, AND a nearby TODO/FIXME debt marker references enforcement,
the rule MUST:

- Fire (escalate semantics do not suppress).
- Escalate severity from `major` → `blocker` (one level, capped at blocker).
- Emit `confidence: "medium"` (Rev #9).
- Attach `exception` evidence with file:line:matchedSignal pointing at the
  nearby TODO.

## File map

| File                                       | Purpose                                             |
|--------------------------------------------|-----------------------------------------------------|
| `src/server/hooks/response-utils.ts`       | Sets `Content-Security-Policy-Report-Only` header. |

## Line map (1-indexed) of `src/server/hooks/response-utils.ts`

| Line | Content (key only)                                       |
|------|----------------------------------------------------------|
| 12   | `// TODO: enforce CSP once the report-only phase completes` |
| 14   | `"Content-Security-Policy-Report-Only",` (trigger)       |

The TODO is within 5 lines of the trigger (diff = 2) and well inside the
debt-marker helper's default 20-line window.

## Absence proofs

- No enforced `Content-Security-Policy` header (without `-Report-Only`).
- No `report-to` or `report-uri` reporting endpoint configured.
