/**
 * Archive passthrough regression tests for ChangeSchema.
 *
 * Verifies that fields removed from explicit schema declarations
 * (judgment_calls, batch_surfaced_at) continue to survive parse
 * via the terminal `.passthrough()` on ChangeSchema.
 */

import { describe, expect, test } from "vitest";
import { ChangeSchema } from "./changes";

describe("ChangeSchema archive passthrough", () => {
  const minimalValidChange = {
    id: "test-change",
    title: "Test",
    status: "draft",
    created_at: "2026-01-01T00:00:00.000Z",
    tasks: [],
    deltas: {},
  };

  test("preserves judgment_calls via passthrough", () => {
    const judgmentCall = {
      id: "jc-test",
      category: "extensibility",
      question: "q",
      agent_recommendation: "r",
      rationale: "why",
      options: [],
    };
    const result = ChangeSchema.parse({
      ...minimalValidChange,
      judgment_calls: [judgmentCall],
    });
    expect(result.judgment_calls).toEqual([judgmentCall]);
  });

  test("preserves batch_surfaced_at via passthrough", () => {
    const result = ChangeSchema.parse({
      ...minimalValidChange,
      batch_surfaced_at: "2026-04-01T12:00:00Z",
    });
    expect(result.batch_surfaced_at).toBe("2026-04-01T12:00:00Z");
  });
});
