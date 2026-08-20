/**
 * Archive passthrough regression tests for ChangeSchema.
 *
 * Verifies that fields removed from explicit schema declarations
 * (judgment_calls, batch_surfaced_at, release_notes) continue to survive parse
 * via the terminal `.passthrough()` on ChangeSchema.
 */

import { describe, expect, test } from "vitest";
import { ChangeSchema, Phase9FinalizationStatusSchema } from "./changes";

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

  test("parses legacy records carrying a removed release_notes block", () => {
    // release_notes was removed from ChangeSchema when curated release-notes
    // capture was deleted. The 28 archived bundles and any in-flight change
    // written before the removal still carry the block, so parse MUST succeed.
    // ChangeSchema terminates in `.passthrough()`, so the key is retained
    // rather than stripped — assert survival, never absence.
    const legacyReleaseNotes = {
      audience: "external",
      category: "added",
      headline_external: "Legacy curated release note",
      highlights: ["written before the field was removed"],
    };

    const parsed = ChangeSchema.parse({
      ...minimalValidChange,
      release_notes: legacyReleaseNotes,
    });

    expect(parsed.id).toBe("test-change");
    // Direct (cast-free) access: the passthrough index signature types this
    // as unknown. If ChangeSchema ever loses .passthrough(), this line
    // becomes a compile error — a stronger guard than a runtime assertion.
    expect(parsed.release_notes).toEqual(legacyReleaseNotes);
  });

  test("preserves batch_surfaced_at via passthrough", () => {
    const result = ChangeSchema.parse({
      ...minimalValidChange,
      batch_surfaced_at: "2026-04-01T12:00:00Z",
    });
    expect(result.batch_surfaced_at).toBe("2026-04-01T12:00:00Z");
  });
});

describe("Phase9FinalizationStatusSchema changeTipSha", () => {
  const baseStatus = {
    status: "pending" as const,
    startedAt: "2026-01-01T00:00:00.000Z",
  };

  test("accepts only a 40-hex Git SHA", () => {
    expect(
      Phase9FinalizationStatusSchema.safeParse({
        ...baseStatus,
        changeTipSha: "a".repeat(40),
      }).success,
    ).toBe(true);
    expect(
      Phase9FinalizationStatusSchema.safeParse({
        ...baseStatus,
        changeTipSha: "tip-abc-123",
      }).success,
    ).toBe(false);
    expect(
      Phase9FinalizationStatusSchema.safeParse({
        ...baseStatus,
        changeTipSha: "A".repeat(40),
      }).success,
    ).toBe(false);
  });

  test("preserves the exact merged PR commit OID", () => {
    expect(
      Phase9FinalizationStatusSchema.parse({
        ...baseStatus,
        mergeCommitSha: "b".repeat(40),
      }).mergeCommitSha,
    ).toBe("b".repeat(40));
  });

  test("round-trips the pre-archive branch tip", () => {
    const parsed = Phase9FinalizationStatusSchema.parse({
      ...baseStatus,
      preArchiveTipSha: "c".repeat(40),
    });
    expect(parsed.preArchiveTipSha).toBe("c".repeat(40));
  });
});
