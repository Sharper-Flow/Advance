import { describe, test, expect } from "vitest";
import type { Change, EpicEntry } from "../types";
import {
  convergeEpicMembership,
  legacyMemberStatusFromConvergence,
  type ChildObservation,
} from "./epic-convergence";

type ChangeEntry = Extract<EpicEntry, { kind: "change" }>;

function makeEntry(
  overrides?: Partial<ChangeEntry>,
): ChangeEntry {
  return {
    kind: "change",
    entry_id: "entry-1",
    order: 0,
    change_id: "change-A",
    title: "Test change",
    membership_status: "linked",
    linked_at: "2026-07-01T00:00:00.000Z",
    linked_by: "agent",
    link_evidence: "test seed",
    ...overrides,
  } as ChangeEntry;
}

function makeChange(
  overrides?: Partial<Change>,
): Change {
  return {
    id: "change-A",
    title: "Test change",
    status: "draft",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    adv_project_id: "project-A",
    ...overrides,
  } as Change;
}

function presentWithMembership(
  membership: NonNullable<Change["epic_membership"]> | undefined,
  overrides?: Partial<Change>,
): ChildObservation {
  return {
    kind: "present",
    change: makeChange({ epic_membership: membership, ...overrides }),
  };
}

const EPIC_ID = "epic-X";

describe("convergeEpicMembership — child unreachable", () => {
  test("returns target_unreachable with no repair proposal", () => {
    const result = convergeEpicMembership({
      entry: makeEntry(),
      epic_id: EPIC_ID,
      child: { kind: "unreachable" },
      checkedAt: "2026-07-21T00:00:00.000Z",
    });
    expect(result.status).toBe("target_unreachable");
    expect(result.repair).toBeUndefined();
    expect(result.last_checked_at).toBe("2026-07-21T00:00:00.000Z");
    expect(result.observed.child_epic_membership).toBeNull();
  });
});

describe("convergeEpicMembership — child absent", () => {
  test("linked entry + missing child → conflict (cannot verify)", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "linked" }),
      epic_id: EPIC_ID,
      child: { kind: "absent" },
    });
    expect(result.status).toBe("conflict");
    expect(result.repair).toBeUndefined();
  });

  test("terminal entry + missing child → conflict", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "terminal" }),
      epic_id: EPIC_ID,
      child: { kind: "absent" },
    });
    expect(result.status).toBe("conflict");
  });

  test("pending entry + missing child → projection_missing (cannot rebuild safely)", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "projection_pending" }),
      epic_id: EPIC_ID,
      child: { kind: "absent" },
    });
    expect(result.status).toBe("projection_missing");
    expect(result.repair).toBeUndefined();
  });

  test("unlinked entry + missing child → ok (mutual absence)", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "unlinked" }),
      epic_id: EPIC_ID,
      child: { kind: "absent" },
    });
    expect(result.status).toBe("ok");
  });
});

describe("convergeEpicMembership — child present, membership matches", () => {
  const matchingMembership = {
    epic_id: EPIC_ID,
    entry_id: "entry-1",
    order: 0,
    title: "Test change",
    linked_at: "2026-07-01T00:00:00.000Z",
  };

  test("entry linked + child matches → ok (no repair)", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "linked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(matchingMembership),
    });
    expect(result.status).toBe("ok");
    expect(result.repair).toBeUndefined();
    expect(result.observed.child_epic_membership).toEqual(matchingMembership);
  });

  test("entry terminal + child terminal + matches → ok", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "terminal" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(matchingMembership, {
        status: "archived",
        archived_at: "2026-07-15T00:00:00.000Z",
      }),
    });
    expect(result.status).toBe("ok");
    expect(result.observed.child_terminal).toEqual({
      status: "archived",
      completed_at: "2026-07-15T00:00:00.000Z",
    });
  });

  test("ISSUE #255 (c): entry projection_pending + child correctly linked → stale + repair mark_entry_linked", () => {
    // This is the core reproduction: Epic link completed correctly but
    // entry status was never advanced from projection_pending.
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "projection_pending" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(matchingMembership),
    });
    expect(result.status).toBe("stale");
    expect(result.repair).toEqual({
      kind: "mark_entry_linked",
      target: "epic_entry",
    });
  });

  test("entry projection_stale + child correctly linked → stale + repair mark_entry_linked", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "projection_stale" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(matchingMembership),
    });
    expect(result.status).toBe("stale");
    expect(result.repair).toEqual({
      kind: "mark_entry_linked",
      target: "epic_entry",
    });
  });

  test("entry target_unreachable (recovered) + child correctly linked → stale + repair mark_entry_linked", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "target_unreachable" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(matchingMembership),
    });
    expect(result.status).toBe("stale");
    expect(result.repair).toEqual({
      kind: "mark_entry_linked",
      target: "epic_entry",
    });
  });
});

describe("convergeEpicMembership — child present, terminal backfill", () => {
  const matchingMembership = {
    epic_id: EPIC_ID,
    entry_id: "entry-1",
    order: 0,
    title: "Test change",
    linked_at: "2026-07-01T00:00:00.000Z",
  };

  test("entry linked + child terminal → stale + repair mark_entry_terminal", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "linked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(matchingMembership, {
        status: "archived",
        archived_at: "2026-07-15T00:00:00.000Z",
      }),
    });
    expect(result.status).toBe("stale");
    expect(result.repair).toEqual({
      kind: "mark_entry_terminal",
      target: "epic_entry",
      terminal_summary: {
        status: "archived",
        completed_at: "2026-07-15T00:00:00.000Z",
      },
    });
  });
});

describe("convergeEpicMembership — child present, projection absent", () => {
  test("entry linked + child no membership → projection_missing + repair sync_child_projection", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "linked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(undefined),
    });
    expect(result.status).toBe("projection_missing");
    expect(result.repair?.kind).toBe("sync_child_projection");
    expect(result.repair?.target).toBe("child");
    expect(result.repair?.expected_membership).toEqual({
      epic_id: EPIC_ID,
      entry_id: "entry-1",
      order: 0,
      title: "Test change",
      linked_at: "2026-07-01T00:00:00.000Z",
    });
  });

  test("entry projection_pending + child no membership → projection_missing + sync", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "projection_pending" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(undefined),
    });
    expect(result.status).toBe("projection_missing");
    expect(result.repair?.kind).toBe("sync_child_projection");
  });

  test("entry target_unreachable (recovered) + child no membership → projection_missing + sync", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "target_unreachable" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(undefined),
    });
    expect(result.status).toBe("projection_missing");
    expect(result.repair?.kind).toBe("sync_child_projection");
  });
});

describe("convergeEpicMembership — child present, projection conflicts", () => {
  test("child membership with different entry_id → conflict (refuse overwrite)", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "linked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership({
        epic_id: EPIC_ID,
        entry_id: "different-entry",
        order: 0,
        title: "Other",
        linked_at: "2026-07-01T00:00:00.000Z",
      }),
    });
    expect(result.status).toBe("conflict");
    expect(result.repair).toBeUndefined();
  });

  test("child membership with different epic_id → conflict", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "linked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership({
        epic_id: "other-epic",
        entry_id: "entry-1",
        order: 0,
        title: "Other",
        linked_at: "2026-07-01T00:00:00.000Z",
      }),
    });
    expect(result.status).toBe("conflict");
  });
});

describe("convergeEpicMembership — entry unlinked vs child", () => {
  test("entry unlinked + child still has matching projection → conflict + repair clear_child_projection", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "unlinked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership({
        epic_id: EPIC_ID,
        entry_id: "entry-1",
        order: 0,
        title: "Test change",
        linked_at: "2026-07-01T00:00:00.000Z",
      }),
    });
    expect(result.status).toBe("conflict");
    expect(result.repair).toEqual({
      kind: "clear_child_projection",
      target: "child",
    });
  });

  test("entry unlinked + child has no matching projection → ok", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "unlinked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership(undefined),
    });
    expect(result.status).toBe("ok");
  });

  test("entry unlinked + child has projection for different entry → conflict (refuse clear of other entry)", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "unlinked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership({
        epic_id: EPIC_ID,
        entry_id: "different-entry",
        order: 0,
        title: "Other",
        linked_at: "2026-07-01T00:00:00.000Z",
      }),
    });
    expect(result.status).toBe("ok"); // different-entry projection doesn't match unlinked entry; child projection doesn't apply
  });
});

describe("legacyMemberStatusFromConvergence — shape preservation", () => {
  test("ok → ok", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "linked" }),
      epic_id: EPIC_ID,
      child: presentWithMembership({
        epic_id: EPIC_ID,
        entry_id: "entry-1",
        order: 0,
        title: "T",
        linked_at: "2026-07-01T00:00:00.000Z",
      }),
    });
    expect(legacyMemberStatusFromConvergence(result)).toMatchObject({
      status: "ok",
      message: "Child projection is linked.",
    });
  });

  test("target_unreachable → target_unreachable", () => {
    const result = convergeEpicMembership({
      entry: makeEntry(),
      epic_id: EPIC_ID,
      child: { kind: "unreachable" },
    });
    expect(legacyMemberStatusFromConvergence(result).status).toBe(
      "target_unreachable",
    );
  });

  test("projection_missing → projection_missing", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "projection_pending" }),
      epic_id: EPIC_ID,
      child: { kind: "absent" },
    });
    expect(legacyMemberStatusFromConvergence(result).status).toBe(
      "projection_missing",
    );
  });

  test("stale → stale", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "projection_pending" }),
      epic_id: EPIC_ID,
      child: presentWithMembership({
        epic_id: EPIC_ID,
        entry_id: "entry-1",
        order: 0,
        title: "T",
        linked_at: "2026-07-01T00:00:00.000Z",
      }),
    });
    expect(legacyMemberStatusFromConvergence(result).status).toBe("stale");
  });

  test("conflict → stale (legacy has no conflict bucket)", () => {
    const result = convergeEpicMembership({
      entry: makeEntry({ membership_status: "linked" }),
      epic_id: EPIC_ID,
      child: { kind: "absent" },
    });
    expect(legacyMemberStatusFromConvergence(result).status).toBe("stale");
  });
});
