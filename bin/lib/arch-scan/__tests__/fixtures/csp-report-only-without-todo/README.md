# csp-report-only-without-todo (NEGATIVE fixture)

Negative fixture for the `report-only-header-with-deferred-todo` arch-scan rule
(Rule 3 — escalate semantics).

## What this proves

When a Report-Only security header is set with NO enforced equivalent and NO
reporting endpoint, AND NO TODO/FIXME debt marker is present anywhere in the
fixture, the rule MUST:

- Fire at its original `severity_hint: "major"` (no escalation).
- Emit `confidence: "medium"` (Rev #9).
- NOT attach any `exception` evidence.

## File map

| File                                       | Purpose                                             |
|--------------------------------------------|-----------------------------------------------------|
| `src/server/hooks/response-utils.ts`       | Sets `Content-Security-Policy-Report-Only` header. |

## Line map (1-indexed) of `src/server/hooks/response-utils.ts`

| Line | Content (key only)                                       |
|------|----------------------------------------------------------|
| 13   | `"Content-Security-Policy-Report-Only",` (trigger)       |

## Absence proofs

- No enforced `Content-Security-Policy` header (without `-Report-Only`).
- No `report-to` or `report-uri` reporting endpoint configured.
- No TODO/FIXME/HACK/XXX comment anywhere in the fixture.
