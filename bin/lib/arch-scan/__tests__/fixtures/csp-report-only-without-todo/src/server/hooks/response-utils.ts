/**
 * Response header utilities for the demo fixture (NEGATIVE).
 *
 * Used by `rule-report-only.test.ts` to verify the
 * `report-only-header-with-deferred-todo` capability-consistency rule
 * fires at its original `severity_hint` (no escalation) when NO debt
 * marker is present near the Report-Only security header.
 */
import type { ServerResponse } from "http";

export function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'",
  );
}
