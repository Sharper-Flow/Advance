/**
 * Tests for Task / WisdomDraft schema types (rq-wisdomAutoSurfacing01).
 *
 * Covers AC4 (WisdomDraft lifecycle) and AC7 (task-scoped drafts), plus
 * DDC3 (unique IDs per task — schema shape), DDC6 (backward-compat — existing
 * callers unaffected when wisdom_drafts absent).
 */
import { describe, expect, it } from "vitest";

import {
  TaskSchema,
  WisdomDraftDismissReasonSchema,
  WisdomDraftSchema,
  WisdomDraftStatusSchema,
  WisdomDraftSuggestedTypeSchema,
} from "./tasks";

// -----------------------------------------------------------------------------
// WisdomDraft schema
// -----------------------------------------------------------------------------

describe("WisdomDraftSchema", () => {
  it("accepts a fully-populated draft", () => {
    const draft = {
      id: "dr-abcdef12",
      suggested_type: "failure",
      suggested_content: "missing import → add path alias",
      source_attempts: [1, 2],
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("accepts a minimal draft with only required fields", () => {
    const draft = {
      id: "dr-00000000",
      suggested_type: "gotcha",
      suggested_content: "zod passthrough swallows extras",
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("accepts a promoted draft with promoted_wisdom_id", () => {
    const draft = {
      id: "dr-11111111",
      suggested_type: "failure",
      suggested_content: "race on signal → atomic set",
      status: "promoted",
      created_at: "2026-07-21T17:00:00.000Z",
      promoted_wisdom_id: "w-xyz",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("accepts a dismissed draft with auto_checkpoint reason", () => {
    const draft = {
      id: "dr-22222222",
      suggested_type: "failure",
      suggested_content: "type mismatch → narrow union",
      status: "dismissed",
      created_at: "2026-07-21T17:00:00.000Z",
      dismissed_at: "2026-07-21T17:30:00.000Z",
      dismiss_reason: "auto_checkpoint",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("accepts a dismissed draft with user_dismissed reason", () => {
    const draft = {
      id: "dr-33333333",
      suggested_type: "failure",
      suggested_content: "wrong retry policy → use exponential",
      status: "dismissed",
      created_at: "2026-07-21T17:00:00.000Z",
      dismissed_at: "2026-07-21T17:30:00.000Z",
      dismiss_reason: "user_dismissed",
    };
    expect(WisdomDraftSchema.parse(draft)).toEqual(draft);
  });

  it("rejects an invalid status enum value", () => {
    const draft = {
      id: "dr-44444444",
      suggested_type: "failure",
      suggested_content: "x",
      status: "rejected", // not in enum — no rejected state per AC4
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("rejects an invalid dismiss_reason enum value", () => {
    const draft = {
      id: "dr-55555555",
      suggested_type: "failure",
      suggested_content: "x",
      status: "dismissed",
      created_at: "2026-07-21T17:00:00.000Z",
      dismiss_reason: "expired", // not in enum
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("rejects an invalid suggested_type enum value", () => {
    const draft = {
      id: "dr-66666666",
      suggested_type: "convention", // not in enum — WisdomDraft is failure|gotcha
      suggested_content: "x",
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("rejects a draft missing required id", () => {
    const draft = {
      suggested_type: "failure",
      suggested_content: "x",
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("rejects a draft missing required status", () => {
    const draft = {
      id: "dr-77777777",
      suggested_type: "failure",
      suggested_content: "x",
      created_at: "2026-07-21T17:00:00.000Z",
    };
    expect(() => WisdomDraftSchema.parse(draft)).toThrow();
  });

  it("enum schemas export the expected finite vocabularies", () => {
    // Lock the lifecycle vocabulary per AC4 / D3.
    expect(WisdomDraftStatusSchema.options).toEqual([
      "suggested",
      "promoted",
      "dismissed",
    ]);
    expect(WisdomDraftDismissReasonSchema.options).toEqual([
      "auto_checkpoint",
      "user_dismissed",
    ]);
    expect(WisdomDraftSuggestedTypeSchema.options).toEqual([
      "failure",
      "gotcha",
    ]);
  });
});

// -----------------------------------------------------------------------------
// TaskSchema backward-compat + wisdom_drafts extension (DDC6, AC7)
// -----------------------------------------------------------------------------

const baseTask = {
  id: "tk-abc123",
  title: "Sample task",
  status: "pending",
  created_at: "2026-07-21T17:00:00.000Z",
} as const;

describe("TaskSchema wisdom_drafts extension", () => {
  it("accepts a task without wisdom_drafts (DDC6 backward-compat)", () => {
    const parsed = TaskSchema.parse(baseTask);
    expect(parsed.wisdom_drafts).toBeUndefined();
  });

  it("accepts a task with an empty wisdom_drafts array", () => {
    const parsed = TaskSchema.parse({ ...baseTask, wisdom_drafts: [] });
    expect(parsed.wisdom_drafts).toEqual([]);
  });

  it("accepts a task with a valid wisdom_drafts entry", () => {
    const draft = {
      id: "dr-aaaaaaaa",
      suggested_type: "failure" as const,
      suggested_content: "missing await → add await",
      source_attempts: [1],
      status: "suggested" as const,
      created_at: "2026-07-21T17:00:00.000Z",
    };
    const parsed = TaskSchema.parse({ ...baseTask, wisdom_drafts: [draft] });
    expect(parsed.wisdom_drafts).toHaveLength(1);
    expect(parsed.wisdom_drafts?.[0].id).toBe("dr-aaaaaaaa");
  });

  it("accepts a task with multiple drafts (lifecycle coexistence)", () => {
    const drafts = [
      {
        id: "dr-bbbbbbbb1",
        suggested_type: "failure" as const,
        suggested_content: "draft 1",
        status: "suggested" as const,
        created_at: "2026-07-21T17:00:00.000Z",
      },
      {
        id: "dr-bbbbbbbb2",
        suggested_type: "failure" as const,
        suggested_content: "draft 2",
        status: "promoted" as const,
        created_at: "2026-07-21T17:00:00.000Z",
        promoted_wisdom_id: "w-1",
      },
      {
        id: "dr-bbbbbbbb3",
        suggested_type: "gotcha" as const,
        suggested_content: "draft 3",
        status: "dismissed" as const,
        created_at: "2026-07-21T17:00:00.000Z",
        dismissed_at: "2026-07-21T17:30:00.000Z",
        dismiss_reason: "auto_checkpoint" as const,
      },
    ];
    const parsed = TaskSchema.parse({ ...baseTask, wisdom_drafts: drafts });
    expect(parsed.wisdom_drafts).toHaveLength(3);
    expect(parsed.wisdom_drafts?.map((d) => d.status)).toEqual([
      "suggested",
      "promoted",
      "dismissed",
    ]);
  });

  it("rejects a task with an invalid wisdom_drafts entry", () => {
    const badDraft = {
      id: "dr-cccccccc",
      suggested_type: "failure",
      suggested_content: "x",
      status: "suggested",
      created_at: "2026-07-21T17:00:00.000Z",
      dismiss_reason: "auto_checkpoint", // invalid: only valid on dismissed status
    };
    // Schema doesn't enforce status/dismiss_reason cross-field invariant
    // (that's workflow logic), but it does enforce enum membership. Test the
    // stronger invalid case: bad status value.
    const worseDraft = { ...badDraft, status: "expired" };
    expect(() =>
      TaskSchema.parse({ ...baseTask, wisdom_drafts: [worseDraft] }),
    ).toThrow();
  });

  it("preserves other Task fields when wisdom_drafts is present", () => {
    const draft = {
      id: "dr-dddddddd",
      suggested_type: "failure" as const,
      suggested_content: "x",
      status: "suggested" as const,
      created_at: "2026-07-21T17:00:00.000Z",
    };
    const taskWithExtras = {
      ...baseTask,
      type: "code" as const,
      priority: 5,
      evidence_policy: "test",
      wisdom_drafts: [draft],
    };
    const parsed = TaskSchema.parse(taskWithExtras);
    expect(parsed.id).toBe("tk-abc123");
    expect(parsed.priority).toBe(5);
    expect(parsed.wisdom_drafts).toHaveLength(1);
  });
});
