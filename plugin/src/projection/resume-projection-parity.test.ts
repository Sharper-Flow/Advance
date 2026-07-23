/**
 * next_entry_id ↔ resume projection parity tests (AC11, AC12).
 *
 * Verifies that the existing `next_entry_id` advisory hint (computed in
 * epic-state.ts recomputeProgress) is consistent with the resume projection's
 * `ordered_next` for standard Epic cases. Also verifies the projection
 * correctly identifies the first actionable entry.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase F2
 */
import { describe, test, expect } from "vitest";
import { buildResumeProjection } from "../projection/resume-projection";
import type { WorkNodeRef } from "../types/work-graph";

const PID = "bdf259aa162ae192af5b18899ccdc653b085528d";

function changeRef(id: string): WorkNodeRef {
  return { kind: "change", project_id: PID, change_id: id };
}

function shellRef(epicId: string, entryId: string): WorkNodeRef {
  return { kind: "epic_entry", epic_id: epicId, entry_id: entryId };
}

/**
 * Mirrors the existing `next_entry_id` heuristic from epic-state.ts:
 * first entry (by order) that is a shell or doesn't have a terminal_summary.
 */
function legacyNextEntryId(
  entries: Array<{
    entry_id: string;
    order: number;
    kind: string;
    isTerminal: boolean;
  }>,
): string | null {
  for (const entry of entries) {
    if (entry.kind === "shell" || !entry.isTerminal) {
      return entry.entry_id;
    }
  }
  return null;
}

describe("AC11 — next_entry_id parity with projection ordered_next", () => {
  test("single shell entry: both return the shell", () => {
    const epicEntries = [
      { entry_id: "sh-1", order: 0, kind: "shell", isTerminal: false },
    ];
    const legacyNext = legacyNextEntryId(epicEntries);

    const epic = {
      id: "epicA",
      title: "Epic A",
      entries: [
        {
          kind: "shell" as const,
          entry_id: "sh-1",
          order: 0,
          title: "Future",
          blocked_by: [],
        },
      ],
    };
    const projection = buildResumeProjection([], [epic], { project_id: PID });

    expect(legacyNext).toBe("sh-1");
    expect(projection.ordered_next).not.toBeNull();
    expect(projection.ordered_next!.node).toEqual(shellRef("epicA", "sh-1"));
  });

  test("completed change then shell: both return the shell", () => {
    const epicEntries = [
      { entry_id: "en-1", order: 0, kind: "change", isTerminal: true },
      { entry_id: "sh-2", order: 1, kind: "shell", isTerminal: false },
    ];
    const legacyNext = legacyNextEntryId(epicEntries);

    const completedChange = {
      id: "addCompleted",
      title: "Done",
      status: "archived" as const,
      lifecycleState: "archived" as const,
      same_project_dependencies: [],
      hasInProgressTasks: false,
      epic_membership: { epic_id: "epicA", entry_id: "en-1", order: 0 },
    };
    const epic = {
      id: "epicA",
      title: "Epic A",
      entries: [
        {
          kind: "change" as const,
          entry_id: "en-1",
          order: 0,
          title: "Done",
          change_id: "addCompleted",
        },
        {
          kind: "shell" as const,
          entry_id: "sh-2",
          order: 1,
          title: "Next",
          blocked_by: [],
        },
      ],
    };
    const projection = buildResumeProjection([completedChange], [epic], {
      project_id: PID,
    });

    expect(legacyNext).toBe("sh-2");
    expect(projection.ordered_next).not.toBeNull();
    expect(projection.ordered_next!.node).toEqual(shellRef("epicA", "sh-2"));
  });

  test("all entries terminal: both return null/none", () => {
    const epicEntries = [
      { entry_id: "en-1", order: 0, kind: "change", isTerminal: true },
      { entry_id: "en-2", order: 1, kind: "change", isTerminal: true },
    ];
    const legacyNext = legacyNextEntryId(epicEntries);

    const changes = [
      {
        id: "addA",
        title: "A",
        status: "archived" as const,
        lifecycleState: "archived" as const,
        same_project_dependencies: [],
        hasInProgressTasks: false,
        epic_membership: { epic_id: "epicA", entry_id: "en-1", order: 0 },
      },
      {
        id: "addB",
        title: "B",
        status: "archived" as const,
        lifecycleState: "archived" as const,
        same_project_dependencies: [],
        hasInProgressTasks: false,
        epic_membership: { epic_id: "epicA", entry_id: "en-2", order: 1 },
      },
    ];
    const epic = {
      id: "epicA",
      title: "Epic A",
      entries: [
        {
          kind: "change" as const,
          entry_id: "en-1",
          order: 0,
          title: "A",
          change_id: "addA",
        },
        {
          kind: "change" as const,
          entry_id: "en-2",
          order: 1,
          title: "B",
          change_id: "addB",
        },
      ],
    };
    const projection = buildResumeProjection(changes, [epic], {
      project_id: PID,
    });

    expect(legacyNext).toBeNull();
    expect(projection.ordered_next).toBeNull();
  });

  test("active change: both return the active change entry", () => {
    const epicEntries = [
      { entry_id: "en-1", order: 0, kind: "change", isTerminal: false },
    ];
    const legacyNext = legacyNextEntryId(epicEntries);

    const activeChange = {
      id: "addActive",
      title: "Active",
      status: "draft" as const,
      lifecycleState: "open" as const,
      same_project_dependencies: [],
      hasInProgressTasks: true,
      epic_membership: { epic_id: "epicA", entry_id: "en-1", order: 0 },
    };
    const epic = {
      id: "epicA",
      title: "Epic A",
      entries: [
        {
          kind: "change" as const,
          entry_id: "en-1",
          order: 0,
          title: "Active",
          change_id: "addActive",
        },
      ],
    };
    const projection = buildResumeProjection([activeChange], [epic], {
      project_id: PID,
    });

    expect(legacyNext).toBe("en-1");
    expect(projection.ordered_next).not.toBeNull();
    expect(projection.ordered_next!.node).toEqual(changeRef("addActive"));
  });
});

describe("AC12 — projection actionable list parity with roadmap semantics", () => {
  test("projection actionable matches 'what to promote/start' roadmap rows", () => {
    // Simulate a roadmap: Epic with one completed change, one active change,
    // and two shells ready to promote.
    const changes = [
      {
        id: "addDone",
        title: "Completed",
        status: "archived" as const,
        lifecycleState: "archived" as const,
        same_project_dependencies: [],
        hasInProgressTasks: false,
        epic_membership: { epic_id: "epicA", entry_id: "en-1", order: 0 },
      },
      {
        id: "addActive",
        title: "Active",
        status: "draft" as const,
        lifecycleState: "open" as const,
        same_project_dependencies: [],
        hasInProgressTasks: true,
        epic_membership: { epic_id: "epicA", entry_id: "en-2", order: 1 },
      },
    ];
    const epic = {
      id: "epicA",
      title: "Epic A",
      entries: [
        {
          kind: "change" as const,
          entry_id: "en-1",
          order: 0,
          title: "Done",
          change_id: "addDone",
        },
        {
          kind: "change" as const,
          entry_id: "en-2",
          order: 1,
          title: "Active",
          change_id: "addActive",
        },
        {
          kind: "shell" as const,
          entry_id: "sh-3",
          order: 2,
          title: "Ready A",
          blocked_by: [],
        },
        {
          kind: "shell" as const,
          entry_id: "sh-4",
          order: 3,
          title: "Ready B",
          blocked_by: [],
        },
      ],
    };
    const projection = buildResumeProjection(changes, [epic], {
      project_id: PID,
    });

    // Actionable should contain the two shells (ready_to_promote).
    const actionableIds = projection.actionable.map((r) => r.node);
    expect(actionableIds).toHaveLength(2);
    expect(actionableIds).toContainEqual(shellRef("epicA", "sh-3"));
    expect(actionableIds).toContainEqual(shellRef("epicA", "sh-4"));

    // Active should contain the active change.
    expect(projection.active).toHaveLength(1);
    expect(projection.active[0].node).toEqual(changeRef("addActive"));

    // ordered_next should be the active change (lower rank than shells).
    expect(projection.ordered_next!.node).toEqual(changeRef("addActive"));
  });
});
