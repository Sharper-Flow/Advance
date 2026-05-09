/**
 * Tests for sanitizeRoadmapOrigin (rq-roadmapOriginSanitize01).
 *
 * Verifies the contract that strips ADV-emitted scoring fields from
 * roadmap-origin issue bodies before proposal synthesis. Coordinates
 * with `enforcescoreblindproposaldesig` which defines the contract.
 */

import { describe, test, expect } from "vitest";
import { sanitizeRoadmapOrigin } from "./roadmap-origin-sanitize";

describe("sanitizeRoadmapOrigin", () => {
  describe("strips known scoring patterns", () => {
    test("removes <!-- adv-triage:scoring v1 ... --> block (multiline)", () => {
      const body = `## Issue

This is a real bug.

<!-- adv-triage:scoring v1
TimeCriticality=5: blocks /adv-discover for new users; user growth-aware
RROE=8: enables Phase 5 roadmap auto-update without manual edits
Effort=3: contained in single command + manifest entry
WSJF=5.3 = (8 + 5 + 8) / 3
scored_by=agent
scored_at=2026-05-08T12:34:56Z
-->

More body content here.`;

      const result = sanitizeRoadmapOrigin(body);

      expect(result.sanitized).not.toContain("adv-triage:scoring");
      expect(result.sanitized).not.toContain("TimeCriticality=");
      expect(result.sanitized).not.toContain("scored_by=");
      expect(result.sanitized).toContain("This is a real bug.");
      expect(result.sanitized).toContain("More body content here.");
    });

    test("removes single-line score-field lines (column 0)", () => {
      const body = `## Issue

WSJF=5.3 = (8 + 5 + 8) / 3
Value=8: core differentiator
TimeCriticality=5: user-blocking
RROE=8: unblocks roadmap stream
Effort=3: single-file mechanical

The actual problem statement.`;

      const result = sanitizeRoadmapOrigin(body);

      expect(result.sanitized).not.toMatch(/^WSJF=/m);
      expect(result.sanitized).not.toMatch(/^Value=/m);
      expect(result.sanitized).not.toMatch(/^TimeCriticality=/m);
      expect(result.sanitized).not.toMatch(/^RROE=/m);
      expect(result.sanitized).not.toMatch(/^Effort=/m);
      expect(result.sanitized).toContain("The actual problem statement.");
    });

    test("removes colon-separated score-field lines", () => {
      const body = `## Issue

WSJF: 8.0
Value: 13

The body.`;

      const result = sanitizeRoadmapOrigin(body);

      expect(result.sanitized).not.toMatch(/^WSJF:/m);
      expect(result.sanitized).not.toMatch(/^Value:/m);
      expect(result.sanitized).toContain("The body.");
    });

    test("removes trailing scoring-summary lines", () => {
      const body = `Issue body.

WSJF score: 5.3
Value score: 8`;

      const result = sanitizeRoadmapOrigin(body);

      expect(result.sanitized).not.toContain("WSJF score:");
      expect(result.sanitized).not.toContain("Value score:");
      expect(result.sanitized).toContain("Issue body.");
    });
  });

  describe("preserves legitimate user prose", () => {
    test("does not strip 'value' inside a sentence", () => {
      const body = `The value of this feature is the broader user impact it unlocks.`;
      const result = sanitizeRoadmapOrigin(body);
      expect(result.sanitized).toBe(body);
    });

    test("does not strip 'WSJF' when discussed mid-sentence", () => {
      const body = `We rank with WSJF here because it's the SAFe-recommended approach.`;
      const result = sanitizeRoadmapOrigin(body);
      expect(result.sanitized).toBe(body);
    });

    test("does not strip 'effort' in lowercase prose", () => {
      const body = `The effort to implement this is significant but worthwhile.`;
      const result = sanitizeRoadmapOrigin(body);
      expect(result.sanitized).toBe(body);
    });

    test("does not strip indented score-shaped lines (off column 0)", () => {
      // Indented match — the regex requires column-0 anchor.
      // A user might quote scoring patterns inside a code block or
      // bullet item. Don't strip those.
      const body = `Example:
  WSJF=5.3
  Value=8`;
      const result = sanitizeRoadmapOrigin(body);
      expect(result.sanitized).toContain("WSJF=5.3");
      expect(result.sanitized).toContain("Value=8");
    });
  });

  describe("warnings for unrecognized scoring-shaped markers", () => {
    test("warns but does not strip unknown score-shaped lines", () => {
      // A future ADV scoring metric (e.g., Risk=) we don't currently
      // recognize. Don't auto-strip, but warn for human review.
      const body = `## Issue

Risk=high
Confidence=low

The body.`;

      const result = sanitizeRoadmapOrigin(body);

      // Unknown markers stay in the body
      expect(result.sanitized).toContain("Risk=high");
      expect(result.sanitized).toContain("Confidence=low");
      // Warnings surface them for human review
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
      expect(result.warnings.join("\n")).toMatch(/Risk=/);
      expect(result.warnings.join("\n")).toMatch(/Confidence=/);
    });

    test("no warnings on clean body", () => {
      const body = `## Issue

Just a normal issue body with no scoring markers.

Best wishes.`;
      const result = sanitizeRoadmapOrigin(body);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("idempotent + edge cases", () => {
    test("idempotent: sanitizing twice gives the same result", () => {
      const body = `## Issue

Real content.

<!-- adv-triage:scoring v1
WSJF=5.3
-->

WSJF=5.3
Value=8

End.`;

      const once = sanitizeRoadmapOrigin(body).sanitized;
      const twice = sanitizeRoadmapOrigin(once).sanitized;
      expect(twice).toBe(once);
    });

    test("empty input returns empty sanitized", () => {
      const result = sanitizeRoadmapOrigin("");
      expect(result.sanitized).toBe("");
      expect(result.warnings).toEqual([]);
    });

    test("body that is ONLY scoring trailers becomes near-empty", () => {
      const body = `<!-- adv-triage:scoring v1
WSJF=5.3
-->

WSJF=5.3
Value=8`;

      const result = sanitizeRoadmapOrigin(body);
      // Whitespace-only result is acceptable
      expect(result.sanitized.trim()).toBe("");
    });
  });
});
