/**
 * Unit tests for WisdomDraft helpers (rq-wisdomAutoSurfacing01).
 *
 * Covers:
 * - D4 trigger conditions (SEMANTIC + non-empty attempts + dedup)
 * - AC4 lifecycle transitions (suggested → promoted | dismissed)
 * - DDC3 id generation shape
 * - DDC4 idempotent dismiss
 * - DDC5 promote validation
 * - AC7 task-scoped (helpers operate on the task's drafts array)
 */
import { describe, expect, test } from "vitest";

import type { ErrorRecovery, Task, WisdomDraft } from "../types";
import {
  appendDraft,
  dismissAllSuggestedDrafts,
  dismissDraft,
  draftsByStatus,
  findDraft,
  generateWisdomDraftId,
  hasSuggestedDraft,
  maybeCreateWisdomDraftFromErrorRecovery,
  promoteDraft,
} from "./wisdom-draft";

const NOW = "2026-07-21T17:00:00.000Z";

function makeDraft(overrides: Partial<WisdomDraft> = {}): WisdomDraft {
  return {
    id: "dr-aaaaaaaa",
    suggested_type: "failure",
    suggested_content: "missing await → add await",
    source_attempts: [1],
    status: "suggested",
    created_at: NOW,
    ...overrides,
  };
}

function makeRecovery(overrides: Partial<ErrorRecovery> = {}): ErrorRecovery {
  return {
    last_error: "TypeError",
    retry_count: 1,
    max_retries: 3,
    error_class: "SEMANTIC",
    attempts: [
      {
        attempt_number: 1,
        error: "TypeError: x is not a function",
        diagnosis: "missing default export",
        fix_tried: "add default export",
        outcome: "failed",
        attempted_at: NOW,
      },
    ],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "tk-abc",
    title: "Sample",
    type: "code",
    status: "in_progress",
    priority: 0,
    created_at: NOW,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// ID generation
// -----------------------------------------------------------------------------

describe("generateWisdomDraftId", () => {
  test("returns dr-<8hex> shape", () => {
    const id = generateWisdomDraftId();
    expect(id).toMatch(/^dr-[0-9a-f]{8}$/);
  });

  test("returns unique values across calls (DDC3)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateWisdomDraftId());
    }
    expect(ids.size).toBe(100);
  });
});

// -----------------------------------------------------------------------------
// D4 trigger
// -----------------------------------------------------------------------------

describe("maybeCreateWisdomDraftFromErrorRecovery", () => {
  test("creates a draft for SEMANTIC recovery with one attempt", () => {
    const draft = maybeCreateWisdomDraftFromErrorRecovery(
      makeTask(),
      makeRecovery(),
      NOW,
    );
    expect(draft).not.toBeNull();
    expect(draft?.id).toMatch(/^dr-[0-9a-f]{8}$/);
    expect(draft?.suggested_type).toBe("failure");
    expect(draft?.suggested_content).toBe(
      "missing default export → add default export",
    );
    expect(draft?.source_attempts).toEqual([1]);
    expect(draft?.status).toBe("suggested");
    expect(draft?.created_at).toBe(NOW);
    expect(draft?.dismissed_at).toBeUndefined();
    expect(draft?.dismiss_reason).toBeUndefined();
    expect(draft?.promoted_wisdom_id).toBeUndefined();
  });

  test("concatenates multiple SEMANTIC attempts with '; '", () => {
    const recovery = makeRecovery({
      attempts: [
        {
          attempt_number: 1,
          error: "e1",
          diagnosis: "diag-one",
          fix_tried: "fix-one",
          outcome: "failed",
          attempted_at: NOW,
        },
        {
          attempt_number: 2,
          error: "e2",
          diagnosis: "diag-two",
          fix_tried: "fix-two",
          outcome: "failed",
          attempted_at: NOW,
        },
      ],
    });
    const draft = maybeCreateWisdomDraftFromErrorRecovery(
      makeTask(),
      recovery,
      NOW,
    );
    expect(draft?.suggested_content).toBe(
      "diag-one → fix-one; diag-two → fix-two",
    );
    expect(draft?.source_attempts).toEqual([1, 2]);
  });

  test("returns null when error_recovery is undefined", () => {
    expect(
      maybeCreateWisdomDraftFromErrorRecovery(makeTask(), undefined, NOW),
    ).toBeNull();
  });

  test("returns null when error_class is not SEMANTIC (DONT3)", () => {
    for (const cls of ["TRANSIENT", "ENVIRONMENTAL", "FATAL"] as const) {
      const recovery = makeRecovery({ error_class: cls });
      expect(
        maybeCreateWisdomDraftFromErrorRecovery(makeTask(), recovery, NOW),
      ).toBeNull();
    }
  });

  test("returns null when attempts[] is empty", () => {
    const recovery = makeRecovery({ attempts: [] });
    expect(
      maybeCreateWisdomDraftFromErrorRecovery(makeTask(), recovery, NOW),
    ).toBeNull();
  });

  test("returns null when attempts[] is undefined", () => {
    const recovery = makeRecovery({ attempts: undefined });
    expect(
      maybeCreateWisdomDraftFromErrorRecovery(makeTask(), recovery, NOW),
    ).toBeNull();
  });

  test("dedup: returns null when task already has a suggested draft (DDC3)", () => {
    const task = makeTask({ wisdom_drafts: [makeDraft()] });
    expect(
      maybeCreateWisdomDraftFromErrorRecovery(task, makeRecovery(), NOW),
    ).toBeNull();
  });

  test("does NOT dedup when existing drafts are all terminal (promoted/dismissed)", () => {
    const task = makeTask({
      wisdom_drafts: [
        makeDraft({
          id: "dr-promoted1",
          status: "promoted",
          promoted_wisdom_id: "w-1",
        }),
        makeDraft({
          id: "dr-dismissed1",
          status: "dismissed",
          dismissed_at: NOW,
          dismiss_reason: "auto_checkpoint",
        }),
      ],
    });
    const draft = maybeCreateWisdomDraftFromErrorRecovery(
      task,
      makeRecovery(),
      NOW,
    );
    expect(draft).not.toBeNull();
    expect(draft?.status).toBe("suggested");
  });

  test("idempotent: calling twice with the same task state produces at most one draft (no draft on second call)", () => {
    const task1 = makeTask();
    const draft1 = maybeCreateWisdomDraftFromErrorRecovery(
      task1,
      makeRecovery(),
      NOW,
    );
    expect(draft1).not.toBeNull();
    // After applying draft1 to the task state, second call dedups.
    const task2 = makeTask({ wisdom_drafts: [draft1!] });
    const draft2 = maybeCreateWisdomDraftFromErrorRecovery(
      task2,
      makeRecovery(),
      NOW,
    );
    expect(draft2).toBeNull();
  });

  test("tolerates undefined task (currentTask lookup miss)", () => {
    const draft = maybeCreateWisdomDraftFromErrorRecovery(
      undefined,
      makeRecovery(),
      NOW,
    );
    expect(draft).not.toBeNull();
  });
});

// -----------------------------------------------------------------------------
// hasSuggestedDraft
// -----------------------------------------------------------------------------

describe("hasSuggestedDraft", () => {
  test("true when at least one suggested draft", () => {
    expect(hasSuggestedDraft(makeTask({ wisdom_drafts: [makeDraft()] }))).toBe(
      true,
    );
  });

  test("false when drafts contain only terminal states", () => {
    expect(
      hasSuggestedDraft(
        makeTask({
          wisdom_drafts: [
            makeDraft({ status: "promoted" }),
            makeDraft({ status: "dismissed" }),
          ],
        }),
      ),
    ).toBe(false);
  });

  test("false when wisdom_drafts is undefined", () => {
    expect(hasSuggestedDraft(makeTask())).toBe(false);
  });

  test("false when task is undefined", () => {
    expect(hasSuggestedDraft(undefined)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// appendDraft
// -----------------------------------------------------------------------------

describe("appendDraft", () => {
  test("appends to existing array (returns new array)", () => {
    const existing = [makeDraft({ id: "dr-1" })];
    const next = appendDraft(existing, makeDraft({ id: "dr-2" }));
    expect(next).toHaveLength(2);
    expect(existing).toHaveLength(1); // immutable
  });

  test("creates a new array when existing is undefined", () => {
    const next = appendDraft(undefined, makeDraft());
    expect(next).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// dismissDraft (single)
// -----------------------------------------------------------------------------

describe("dismissDraft", () => {
  test("transitions a suggested draft to dismissed", () => {
    const drafts = [makeDraft({ id: "dr-x" })];
    const next = dismissDraft(drafts, "dr-x", "auto_checkpoint", NOW);
    expect(next[0].status).toBe("dismissed");
    expect(next[0].dismissed_at).toBe(NOW);
    expect(next[0].dismiss_reason).toBe("auto_checkpoint");
  });

  test("preserves other drafts", () => {
    const drafts = [makeDraft({ id: "dr-x" }), makeDraft({ id: "dr-y" })];
    const next = dismissDraft(drafts, "dr-x", "user_dismissed", NOW);
    expect(next[0].id).toBe("dr-x");
    expect(next[0].status).toBe("dismissed");
    expect(next[1].id).toBe("dr-y");
    expect(next[1].status).toBe("suggested");
  });

  test("DDC4 idempotent: dismissing an already-dismissed draft is a no-op", () => {
    const drafts = [
      makeDraft({
        id: "dr-x",
        status: "dismissed",
        dismissed_at: "2026-07-21T16:00:00.000Z",
        dismiss_reason: "user_dismissed",
      }),
    ];
    const next = dismissDraft(drafts, "dr-x", "auto_checkpoint", NOW);
    // unchanged: dismiss_at and dismiss_reason stay as the original values
    expect(next[0].status).toBe("dismissed");
    expect(next[0].dismissed_at).toBe("2026-07-21T16:00:00.000Z");
    expect(next[0].dismiss_reason).toBe("user_dismissed");
  });

  test("idempotent: promoting-dismissed draft leaves array unchanged", () => {
    const drafts = [
      makeDraft({ id: "dr-x", status: "promoted", promoted_wisdom_id: "w-1" }),
    ];
    const next = dismissDraft(drafts, "dr-x", "auto_checkpoint", NOW);
    expect(next[0].status).toBe("promoted");
    expect(next[0].dismissed_at).toBeUndefined();
  });

  test("unknown draftId leaves array unchanged", () => {
    const drafts = [makeDraft({ id: "dr-x" })];
    const next = dismissDraft(drafts, "dr-missing", "auto_checkpoint", NOW);
    expect(next).toEqual(drafts);
  });

  test("handles undefined drafts input", () => {
    const next = dismissDraft(undefined, "dr-x", "auto_checkpoint", NOW);
    expect(next).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// dismissAllSuggestedDrafts (used by checkpoint auto-dismiss — AC5)
// -----------------------------------------------------------------------------

describe("dismissAllSuggestedDrafts", () => {
  test("dismisses all suggested drafts; preserves terminal drafts", () => {
    const drafts = [
      makeDraft({ id: "dr-a" }), // suggested
      makeDraft({ id: "dr-b", status: "promoted", promoted_wisdom_id: "w-1" }),
      makeDraft({ id: "dr-c" }), // suggested
      makeDraft({
        id: "dr-d",
        status: "dismissed",
        dismissed_at: NOW,
        dismiss_reason: "user_dismissed",
      }),
    ];
    const result = dismissAllSuggestedDrafts(drafts, "auto_checkpoint", NOW);
    expect(result.dismissedCount).toBe(2);
    expect(result.pendingReviewCount).toBe(2);
    const a = result.drafts.find((d) => d.id === "dr-a");
    const c = result.drafts.find((d) => d.id === "dr-c");
    expect(a?.status).toBe("dismissed");
    expect(a?.dismiss_reason).toBe("auto_checkpoint");
    expect(c?.status).toBe("dismissed");
    expect(c?.dismiss_reason).toBe("auto_checkpoint");
    const b = result.drafts.find((d) => d.id === "dr-b");
    expect(b?.status).toBe("promoted"); // untouched
  });

  test("no suggested drafts → zero counts and unchanged array", () => {
    const drafts = [
      makeDraft({ id: "dr-a", status: "promoted", promoted_wisdom_id: "w-1" }),
    ];
    const result = dismissAllSuggestedDrafts(drafts, "auto_checkpoint", NOW);
    expect(result.dismissedCount).toBe(0);
    expect(result.pendingReviewCount).toBe(0);
    expect(result.drafts).toEqual(drafts);
  });

  test("handles undefined drafts", () => {
    const result = dismissAllSuggestedDrafts(undefined, "auto_checkpoint", NOW);
    expect(result.dismissedCount).toBe(0);
    expect(result.pendingReviewCount).toBe(0);
    expect(result.drafts).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// promoteDraft (used by adv_wisdom_add from_draft_id — DDC5)
// -----------------------------------------------------------------------------

describe("promoteDraft", () => {
  test("transitions suggested draft to promoted with wisdom id", () => {
    const drafts = [makeDraft({ id: "dr-x" })];
    const next = promoteDraft(drafts, "dr-x", "w-100");
    expect(next).not.toBeNull();
    expect(next?.[0].status).toBe("promoted");
    expect(next?.[0].promoted_wisdom_id).toBe("w-100");
  });

  test("returns null when draft not found (caller surfaces DRAFT_NOT_FOUND)", () => {
    const drafts = [makeDraft({ id: "dr-x" })];
    expect(promoteDraft(drafts, "dr-missing", "w-1")).toBeNull();
  });

  test("leaves draft unchanged when already promoted (caller detects DRAFT_ALREADY_PROMOTED)", () => {
    const drafts = [
      makeDraft({
        id: "dr-x",
        status: "promoted",
        promoted_wisdom_id: "w-old",
      }),
    ];
    const next = promoteDraft(drafts, "dr-x", "w-new");
    expect(next).not.toBeNull();
    // promoteDraft does not overwrite; caller validates via findDraft that the
    // source status was not "suggested" and surfaces DRAFT_ALREADY_PROMOTED.
    expect(next?.[0].status).toBe("promoted");
    expect(next?.[0].promoted_wisdom_id).toBe("w-old");
  });

  test("leaves draft unchanged when dismissed (caller detects DRAFT_DISMISSED)", () => {
    const drafts = [
      makeDraft({
        id: "dr-x",
        status: "dismissed",
        dismissed_at: NOW,
        dismiss_reason: "auto_checkpoint",
      }),
    ];
    const next = promoteDraft(drafts, "dr-x", "w-1");
    expect(next).not.toBeNull();
    expect(next?.[0].status).toBe("dismissed");
    expect(next?.[0].promoted_wisdom_id).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// findDraft / draftsByStatus (AC7 read-path helpers)
// -----------------------------------------------------------------------------

describe("findDraft", () => {
  test("finds by id", () => {
    const drafts = [
      makeDraft({ id: "dr-target" }),
      makeDraft({ id: "dr-other" }),
    ];
    expect(findDraft(drafts, "dr-target")?.id).toBe("dr-target");
  });

  test("returns undefined when not present", () => {
    expect(findDraft([makeDraft()], "dr-missing")).toBeUndefined();
  });

  test("returns undefined when drafts is undefined", () => {
    expect(findDraft(undefined, "dr-x")).toBeUndefined();
  });
});

describe("draftsByStatus", () => {
  test("filters by status", () => {
    const drafts = [
      makeDraft({ id: "dr-1", status: "suggested" }),
      makeDraft({ id: "dr-2", status: "promoted" }),
      makeDraft({ id: "dr-3", status: "suggested" }),
      makeDraft({ id: "dr-4", status: "dismissed" }),
    ];
    expect(draftsByStatus(drafts, "suggested").map((d) => d.id)).toEqual([
      "dr-1",
      "dr-3",
    ]);
    expect(draftsByStatus(drafts, "promoted").map((d) => d.id)).toEqual([
      "dr-2",
    ]);
  });

  test("empty array input", () => {
    expect(draftsByStatus([], "suggested")).toEqual([]);
  });

  test("undefined input", () => {
    expect(draftsByStatus(undefined, "suggested")).toEqual([]);
  });
});
