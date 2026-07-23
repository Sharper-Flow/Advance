/**
 * Resume projection kernel tests.
 *
 * Pins: lifecycle classification, actionable/blocked/active partitioning,
 * cross-Epic redirects, ordered_next, diagnostics (cycles + unresolved),
 * pure-read invariant, advisory rank sorting.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase E
 */
import { describe, test, expect } from "vitest";
import {
  buildResumeProjection,
  nodeRefKey,
  type ChangeNodeInput,
  type EpicNodeInput,
} from "./resume-projection";
import type { WorkNodeRef } from "../types/work-graph";

const PID = "bdf259aa162ae192af5b18899ccdc653b085528d";

function changeRef(id: string): WorkNodeRef {
  return { kind: "change", project_id: PID, change_id: id };
}

function shellRef(epicId: string, entryId: string): WorkNodeRef {
  return { kind: "epic_entry", epic_id: epicId, entry_id: entryId };
}

function makeChange(
  id: string,
  opts: Partial<ChangeNodeInput> = {},
): ChangeNodeInput {
  return {
    id,
    title: opts.title ?? id,
    status: opts.status ?? "draft",
    lifecycleState: opts.lifecycleState ?? "open",
    same_project_dependencies: opts.same_project_dependencies ?? [],
    hasInProgressTasks: opts.hasInProgressTasks ?? false,
    epic_membership: opts.epic_membership,
  };
}

function makeEpic(
  id: string,
  entries: EpicNodeInput["entries"] = [],
  title = id,
): EpicNodeInput {
  return { id, title, entries };
}

describe("buildResumeProjection — structure (AC8)", () => {
  test("empty input → well-formed empty projection", () => {
    const result = buildResumeProjection([], [], { project_id: PID });
    expect(result.generated_at).toBeTruthy();
    expect(result.scope.project_id).toBe(PID);
    expect(result.ordered_next).toBeNull();
    expect(result.actionable).toEqual([]);
    expect(result.blocked).toEqual([]);
    expect(result.active).toEqual([]);
    expect(result.redirects).toEqual([]);
    expect(result.diagnostics.cycles).toEqual([]);
    expect(result.diagnostics.unresolved_refs).toEqual([]);
  });

  test("does not mutate inputs (pure-read invariant)", () => {
    const change = makeChange("a");
    const original = JSON.parse(JSON.stringify(change));
    buildResumeProjection([change], [], { project_id: PID });
    expect(change).toEqual(original);
  });
});

describe("buildResumeProjection — lifecycle classification (AC6)", () => {
  test("draft change, no deps → actionable ready_to_start", () => {
    const result = buildResumeProjection(
      [makeChange("addFoo")],
      [],
      { project_id: PID },
    );
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].lifecycle).toBe("ready_to_start");
    expect(result.actionable[0].node).toEqual(changeRef("addFoo"));
  });

  test("shell entry, no deps → actionable ready_to_promote", () => {
    const epic = makeEpic("epicA", [
      { kind: "shell", entry_id: "sh-1", order: 0, title: "Future", blocked_by: [] },
    ]);
    const result = buildResumeProjection([], [epic], { project_id: PID });
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].lifecycle).toBe("ready_to_promote");
    expect(result.actionable[0].node).toEqual(shellRef("epicA", "sh-1"));
  });

  test("active change (in_progress tasks) → active list, not actionable", () => {
    const result = buildResumeProjection(
      [makeChange("addFoo", { hasInProgressTasks: true })],
      [],
      { project_id: PID },
    );
    expect(result.active).toHaveLength(1);
    expect(result.active[0].lifecycle).toBe("active");
    expect(result.actionable).toHaveLength(0);
  });

  test("terminal change (archived) → excluded from all lists", () => {
    const result = buildResumeProjection(
      [makeChange("addFoo", { status: "archived", lifecycleState: "archived" })],
      [],
      { project_id: PID },
    );
    expect(result.actionable).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
    expect(result.active).toHaveLength(0);
  });

  test("terminal change (closed) → excluded from all lists", () => {
    const result = buildResumeProjection(
      [makeChange("addFoo", { status: "closed", lifecycleState: "closed" })],
      [],
      { project_id: PID },
    );
    expect(result.actionable).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
    expect(result.active).toHaveLength(0);
  });
});

describe("buildResumeProjection — dependency resolution (AC6)", () => {
  test("change blocked by non-terminal prereq → blocked list", () => {
    const prereq = makeChange("addBar"); // draft (non-terminal)
    const dependent = makeChange("addFoo", {
      same_project_dependencies: [changeRef("addBar")],
    });
    const result = buildResumeProjection([prereq, dependent], [], {
      project_id: PID,
    });
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].node).toEqual(changeRef("addFoo"));
    expect(result.blocked[0].blockers).toContainEqual(changeRef("addBar"));
  });

  test("change with terminal prereq → actionable", () => {
    const prereq = makeChange("addBar", {
      status: "archived",
      lifecycleState: "archived",
    });
    const dependent = makeChange("addFoo", {
      same_project_dependencies: [changeRef("addBar")],
    });
    const result = buildResumeProjection([prereq, dependent], [], {
      project_id: PID,
    });
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].node).toEqual(changeRef("addFoo"));
    expect(result.actionable[0].blockers).toEqual([]);
  });

  test("shell blocked by non-terminal change → blocked list", () => {
    const blockingChange = makeChange("addBar");
    const epic = makeEpic("epicA", [
      {
        kind: "shell",
        entry_id: "sh-1",
        order: 0,
        title: "Dependent",
        blocked_by: [changeRef("addBar")],
      },
    ]);
    const result = buildResumeProjection([blockingChange], [epic], {
      project_id: PID,
    });
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].node).toEqual(shellRef("epicA", "sh-1"));
    expect(result.blocked[0].blockers).toContainEqual(changeRef("addBar"));
  });
});

describe("buildResumeProjection — cross-Epic redirects (AC7)", () => {
  test("shell in Epic A blocked by change in Epic B → redirect emitted", () => {
    const blockingChange = makeChange("addBar", {
      epic_membership: { epic_id: "epicB", entry_id: "en-b", order: 0 },
    });
    const epicA = makeEpic("epicA", [
      {
        kind: "shell",
        entry_id: "sh-1",
        order: 0,
        title: "Dependent",
        blocked_by: [changeRef("addBar")],
      },
    ]);
    const epicB = makeEpic("epicB", [
      { kind: "change", entry_id: "en-b", order: 0, title: "Blocker", change_id: "addBar" },
    ]);
    const result = buildResumeProjection(
      [blockingChange],
      [epicA, epicB],
      { project_id: PID },
    );
    expect(result.redirects).toHaveLength(1);
    expect(result.redirects[0].source_epic_id).toBe("epicA");
    expect(result.redirects[0].target_epic_id).toBe("epicB");
    expect(result.redirects[0].blocker_node).toEqual(changeRef("addBar"));
  });

  test("same-Epic blocker does NOT emit redirect", () => {
    const blockingChange = makeChange("addBar", {
      epic_membership: { epic_id: "epicA", entry_id: "en-b", order: 0 },
    });
    const epicA = makeEpic("epicA", [
      { kind: "change", entry_id: "en-b", order: 0, title: "Blocker", change_id: "addBar" },
      {
        kind: "shell",
        entry_id: "sh-1",
        order: 1,
        title: "Dependent",
        blocked_by: [changeRef("addBar")],
      },
    ]);
    const result = buildResumeProjection([blockingChange], [epicA], {
      project_id: PID,
    });
    expect(result.redirects).toHaveLength(0);
  });
});

describe("buildResumeProjection — ordered_next", () => {
  test("single non-done node → ordered_next points to it", () => {
    const result = buildResumeProjection([makeChange("addFoo")], [], {
      project_id: PID,
    });
    expect(result.ordered_next).not.toBeNull();
    expect(result.ordered_next!.node).toEqual(changeRef("addFoo"));
  });

  test("all terminal → ordered_next is null", () => {
    const result = buildResumeProjection(
      [makeChange("addFoo", { status: "archived", lifecycleState: "archived" })],
      [],
      { project_id: PID },
    );
    expect(result.ordered_next).toBeNull();
  });

  test("ordered_next picks lowest advisory_rank non-done node", () => {
    const lowRank = makeChange("addB", {
      epic_membership: { epic_id: "epicA", entry_id: "en-1", order: 0 },
    });
    const highRank = makeChange("addA"); // no epic → MAX_RANK
    const epicA = makeEpic("epicA", [
      { kind: "change", entry_id: "en-1", order: 0, title: "B", change_id: "addB" },
    ]);
    const result = buildResumeProjection([highRank, lowRank], [epicA], {
      project_id: PID,
    });
    expect(result.ordered_next!.node).toEqual(changeRef("addB"));
  });
});

describe("buildResumeProjection — diagnostics (AC8)", () => {
  test("unresolved preref → diagnostics.unresolved_refs populated", () => {
    const change = makeChange("addFoo", {
      same_project_dependencies: [
        { kind: "change", project_id: PID, change_id: "nonExistent" },
      ],
    });
    const result = buildResumeProjection([change], [], { project_id: PID });
    expect(result.diagnostics.unresolved_refs).toHaveLength(1);
    expect(result.diagnostics.unresolved_refs[0]).toEqual(
      changeRef("nonExistent"),
    );
  });

  test("cycle in dependencies → diagnostics.cycles populated (closed path)", () => {
    const a = makeChange("addA", {
      same_project_dependencies: [changeRef("addB")],
    });
    const b = makeChange("addB", {
      same_project_dependencies: [changeRef("addA")],
    });
    const result = buildResumeProjection([a, b], [], { project_id: PID });
    expect(result.diagnostics.cycles.length).toBeGreaterThanOrEqual(1);
    const cycle = result.diagnostics.cycles[0];
    expect(cycle[0]).toBe(cycle[cycle.length - 1]); // closed
  });

  test("diagnostics never fail the read — graceful degradation", () => {
    // Even with bad data, the projection returns successfully.
    const result = buildResumeProjection(
      [makeChange("addFoo", { same_project_dependencies: [changeRef("ghost")] })],
      [],
      { project_id: PID },
    );
    expect(result.generated_at).toBeTruthy();
    expect(result.diagnostics.unresolved_refs).toHaveLength(1);
  });
});

describe("buildResumeProjection — advisory rank sorting", () => {
  test("actionable sorted by advisory_rank ascending", () => {
    const a = makeChange("addA", {
      epic_membership: { epic_id: "epic1", entry_id: "en-2", order: 1 },
    });
    const b = makeChange("addB", {
      epic_membership: { epic_id: "epic1", entry_id: "en-1", order: 0 },
    });
    const epic1 = makeEpic("epic1", [
      { kind: "change", entry_id: "en-1", order: 0, title: "B", change_id: "addB" },
      { kind: "change", entry_id: "en-2", order: 1, title: "A", change_id: "addA" },
    ]);
    const result = buildResumeProjection([a, b], [epic1], { project_id: PID });
    // B has order 0 (lower rank) → should come first.
    expect(result.actionable[0].node).toEqual(changeRef("addB"));
    expect(result.actionable[1].node).toEqual(changeRef("addA"));
  });
});

describe("buildResumeProjection — promoted shell deduplication", () => {
  test("shell promoted to change → only change node appears (no double-count)", () => {
    const change = makeChange("addFoo", {
      epic_membership: { epic_id: "epicA", entry_id: "sh-1", order: 0 },
    });
    const epic = makeEpic("epicA", [
      { kind: "change", entry_id: "sh-1", order: 0, title: "Promoted", change_id: "addFoo" },
    ]);
    const result = buildResumeProjection([change], [epic], { project_id: PID });
    // Only one node — the change, not a shell.
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].kind).toBe("change");
  });
});

describe("buildResumeProjection — scope filtering", () => {
  test("epic_ids filter → only matching Epic shells included", () => {
    const epicA = makeEpic("epicA", [
      { kind: "shell", entry_id: "sh-a", order: 0, title: "A shell", blocked_by: [] },
    ]);
    const epicB = makeEpic("epicB", [
      { kind: "shell", entry_id: "sh-b", order: 0, title: "B shell", blocked_by: [] },
    ]);
    const result = buildResumeProjection([], [epicA, epicB], {
      project_id: PID,
      epic_ids: ["epicA"],
    });
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].node).toEqual(shellRef("epicA", "sh-a"));
  });
});
