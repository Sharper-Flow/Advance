/**
 * Response header utilities for the demo fixture (POSITIVE).
 *
 * Used by `rule-report-only.test.ts` to verify the
 * `report-only-header-with-deferred-todo` capability-consistency rule
 * ESCALATES severity when a TODO/FIXME debt marker appears near the
 * Report-Only security header.
 */
import type { ServerResponse } from "http";

export function applySecurityHeaders(res: ServerResponse): void {
  // TODO: enforce CSP once the report-only phase completes
  res.setHeader(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'",
  );
}
