import { describe, expect, it } from "vitest";
import {
  addAgendaItemToProjectState,
  addProjectWisdomToProjectState,
  applyChangeSummaryToProjectState,
  createProjectWorkflowState,
  listAgendaItemsFromProjectState,
  listProjectWisdomFromProjectState,
  purgeChangeSummaryFromProjectState,
  recordMigrationEntryInProjectState,
  updateAgendaItemInProjectState,
} from "./project-state";
import {
  DEFAULT_CHANGE_SUMMARIES_CAP,
  PROJECT_WORKFLOW_QUERY_NAMES,
  PROJECT_WORKFLOW_UPDATE_NAMES,
  resolveChangeSummariesCap,
} from "./contracts";
import type { ChangeStatus } from "../types";

describe("project workflow state", () => {
  it("creates project state with empty agenda, wisdom, and migration ledger", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-18T00:00:00.000Z",
    });

    expect(state.projectId).toBe("proj1");
    expect(state.agenda).toEqual([]);
    expect(state.project_wisdom).toEqual([]);
    expect(state.migration_ledger).toEqual([]);
    expect(state.change_summaries).toEqual({});
    expect(state.source_versions).toEqual({});
  });

  it("hydrates change summary indexes from continue-as-new seed", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-18T00:00:00.000Z",
      changeSummaries: {
        "chg-001": {
          changeId: "chg-001",
          title: "Seeded change",
          status: "active",
          gateProgress: {
            proposal: "done",
            discovery: "done",
            design: "pending",
            planning: "pending",
            execution: "pending",
            acceptance: "pending",
            release: "pending",
          },
          taskCounts: { total: 3, done: 2, pending: 1 },
          lastActivityAt: "2026-04-18T01:00:00.000Z",
          sourceVersion: 4,
        },
      },
      sourceVersions: { "chg-001": 4 },
    } as any);

    expect(state.change_summaries["chg-001"]?.title).toBe("Seeded change");
    expect(state.source_versions["chg-001"]).toBe(4);
  });

  it("adds agenda items and sorts by priority then created_at", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-18T00:00:00.000Z",
    });

    addAgendaItemToProjectState(
      state,
      { title: "medium item", priority: "medium" },
      { now: "2026-04-18T00:01:00.000Z", uuid: () => "ag-1" },
    );
    addAgendaItemToProjectState(
      state,
      { title: "critical item", priority: "critical" },
      { now: "2026-04-18T00:02:00.000Z", uuid: () => "ag-2" },
    );

    const items = listAgendaItemsFromProjectState(state);
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe("critical item");
    expect(items[1]?.title).toBe("medium item");
  });

  it("updates agenda item status and completion notes", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-18T00:00:00.000Z",
    });

    const item = addAgendaItemToProjectState(
      state,
      { title: "follow-up work" },
      { now: "2026-04-18T00:01:00.000Z", uuid: () => "ag-1" },
    );

    updateAgendaItemInProjectState(state, item.id, {
      status: "done",
      now: "2026-04-18T00:02:00.000Z",
      completion_notes: "Verified",
    });

    const updated = listAgendaItemsFromProjectState(state)[0];
    expect(updated?.status).toBe("done");
    expect(updated?.completed_at).toBe("2026-04-18T00:02:00.000Z");
    expect(updated?.completion_notes).toBe("Verified");
  });

  it("adds project wisdom entries newest first", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-18T00:00:00.000Z",
    });

    addProjectWisdomToProjectState(
      state,
      { type: "pattern", content: "first", sourceChange: "c1" },
      { now: "2026-04-18T00:01:00.000Z", uuid: () => "pw-1" },
    );
    addProjectWisdomToProjectState(
      state,
      { type: "gotcha", content: "second", sourceTask: "tk-1" },
      { now: "2026-04-18T00:02:00.000Z", uuid: () => "pw-2" },
    );

    const entries = listProjectWisdomFromProjectState(state);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.content).toBe("second");
    expect(entries[1]?.content).toBe("first");
  });

  it("records migration ledger entries idempotently by key", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-18T00:00:00.000Z",
    });

    recordMigrationEntryInProjectState(state, {
      key: "changes-import",
      source: "json",
      status: "done",
      recordedAt: "2026-04-18T00:01:00.000Z",
      detail: "imported 5 changes",
    });
    recordMigrationEntryInProjectState(state, {
      key: "changes-import",
      source: "json",
      status: "done",
      recordedAt: "2026-04-18T00:02:00.000Z",
      detail: "replayed import",
    });

    expect(state.migration_ledger).toHaveLength(1);
    expect(state.migration_ledger[0]?.recordedAt).toBe(
      "2026-04-18T00:02:00.000Z",
    );
    expect(state.migration_ledger[0]?.detail).toBe("replayed import");
  });

  it("exports project query/update names for agenda, wisdom, and migration state", () => {
    expect(PROJECT_WORKFLOW_QUERY_NAMES.bootstrap).toBe(
      "adv.project.bootstrap",
    );
    expect(PROJECT_WORKFLOW_QUERY_NAMES.state).toBe("adv.project.state");
    expect(PROJECT_WORKFLOW_QUERY_NAMES.agenda).toBe("adv.project.agenda");
    expect(PROJECT_WORKFLOW_QUERY_NAMES.wisdom).toBe("adv.project.wisdom");
    expect(PROJECT_WORKFLOW_QUERY_NAMES.migrationLedger).toBe(
      "adv.project.migrationLedger",
    );

    expect(PROJECT_WORKFLOW_UPDATE_NAMES.addAgendaItem).toBe(
      "adv.project.addAgendaItem",
    );
    expect(PROJECT_WORKFLOW_UPDATE_NAMES.updateAgendaItem).toBe(
      "adv.project.updateAgendaItem",
    );
    expect(PROJECT_WORKFLOW_UPDATE_NAMES.addWisdom).toBe(
      "adv.project.addWisdom",
    );
    expect(PROJECT_WORKFLOW_UPDATE_NAMES.recordMigrationEntry).toBe(
      "adv.project.recordMigrationEntry",
    );
  });
});

describe("applyChangeSummaryToProjectState", () => {
  it("applies a new summary", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-23T00:00:00.000Z",
    });

    applyChangeSummaryToProjectState(state, {
      changeId: "chg-001",
      title: "Test",
      status: "draft",
      gateProgress: {
        proposal: "done",
        discovery: "pending",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 3, done: 1, pending: 2 },
      lastActivityAt: "2026-04-23T12:00:00.000Z",
      sourceVersion: 1,
    });

    expect(state.change_summaries["chg-001"]).toBeDefined();
    expect(state.change_summaries["chg-001"].status).toBe("draft");
    expect(state.source_versions["chg-001"]).toBe(1);
  });

  it("updates when source version is higher", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-23T00:00:00.000Z",
    });

    applyChangeSummaryToProjectState(state, {
      changeId: "chg-001",
      title: "Test",
      status: "draft",
      gateProgress: {
        proposal: "done",
        discovery: "pending",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 3, done: 1, pending: 2 },
      lastActivityAt: "2026-04-23T12:00:00.000Z",
      sourceVersion: 1,
    });

    applyChangeSummaryToProjectState(state, {
      changeId: "chg-001",
      title: "Test",
      status: "active",
      gateProgress: {
        proposal: "done",
        discovery: "done",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 5, done: 3, pending: 2 },
      lastActivityAt: "2026-04-23T13:00:00.000Z",
      sourceVersion: 2,
    });

    expect(state.change_summaries["chg-001"].status).toBe("active");
    expect(state.source_versions["chg-001"]).toBe(2);
  });

  it("skips when source version is equal (duplicate)", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-23T00:00:00.000Z",
    });

    applyChangeSummaryToProjectState(state, {
      changeId: "chg-001",
      title: "First",
      status: "draft",
      gateProgress: {
        proposal: "done",
        discovery: "pending",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 1, done: 0, pending: 1 },
      lastActivityAt: "2026-04-23T12:00:00.000Z",
      sourceVersion: 1,
    });

    applyChangeSummaryToProjectState(state, {
      changeId: "chg-001",
      title: "Duplicate",
      status: "active",
      gateProgress: {
        proposal: "done",
        discovery: "done",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 2, done: 1, pending: 1 },
      lastActivityAt: "2026-04-23T13:00:00.000Z",
      sourceVersion: 1,
    });

    // Should keep the first write
    expect(state.change_summaries["chg-001"].title).toBe("First");
    expect(state.source_versions["chg-001"]).toBe(1);
  });

  it("skips when source version is lower (out-of-order)", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-23T00:00:00.000Z",
    });

    applyChangeSummaryToProjectState(state, {
      changeId: "chg-001",
      title: "Newer",
      status: "active",
      gateProgress: {
        proposal: "done",
        discovery: "done",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 5, done: 3, pending: 2 },
      lastActivityAt: "2026-04-23T13:00:00.000Z",
      sourceVersion: 3,
    });

    applyChangeSummaryToProjectState(state, {
      changeId: "chg-001",
      title: "Stale",
      status: "draft",
      gateProgress: {
        proposal: "done",
        discovery: "pending",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 1, done: 0, pending: 1 },
      lastActivityAt: "2026-04-23T12:00:00.000Z",
      sourceVersion: 1,
    });

    expect(state.change_summaries["chg-001"].title).toBe("Newer");
    expect(state.source_versions["chg-001"]).toBe(3);
  });

  it("handles multiple different changes independently", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-23T00:00:00.000Z",
    });

    const baseSummary = {
      title: "Test",
      gateProgress: {
        proposal: "pending",
        discovery: "pending",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 0, done: 0, pending: 0 },
      lastActivityAt: "2026-04-23T12:00:00.000Z",
    };

    applyChangeSummaryToProjectState(state, {
      ...baseSummary,
      changeId: "chg-a",
      status: "draft",
      sourceVersion: 1,
    });
    applyChangeSummaryToProjectState(state, {
      ...baseSummary,
      changeId: "chg-b",
      status: "active",
      sourceVersion: 1,
    });

    expect(Object.keys(state.change_summaries)).toHaveLength(2);
    expect(state.change_summaries["chg-a"].status).toBe("draft");
    expect(state.change_summaries["chg-b"].status).toBe("active");
  });
});

// =============================================================================
// rq-changeSummariesCap01: bounded change_summaries registry
// =============================================================================

describe("DEFAULT_CHANGE_SUMMARIES_CAP + resolveChangeSummariesCap", () => {
  it("default is 50", () => {
    expect(DEFAULT_CHANGE_SUMMARIES_CAP).toBe(50);
  });

  it("resolves env var when set", () => {
    expect(resolveChangeSummariesCap({ ADV_CHANGE_SUMMARIES_CAP: "25" })).toBe(
      25,
    );
    expect(resolveChangeSummariesCap({ ADV_CHANGE_SUMMARIES_CAP: "100" })).toBe(
      100,
    );
  });

  it("falls back to default for missing/invalid env values", () => {
    expect(resolveChangeSummariesCap({})).toBe(DEFAULT_CHANGE_SUMMARIES_CAP);
    expect(resolveChangeSummariesCap({ ADV_CHANGE_SUMMARIES_CAP: "" })).toBe(
      DEFAULT_CHANGE_SUMMARIES_CAP,
    );
    expect(
      resolveChangeSummariesCap({ ADV_CHANGE_SUMMARIES_CAP: "not-a-number" }),
    ).toBe(DEFAULT_CHANGE_SUMMARIES_CAP);
    expect(resolveChangeSummariesCap({ ADV_CHANGE_SUMMARIES_CAP: "0" })).toBe(
      DEFAULT_CHANGE_SUMMARIES_CAP,
    );
    expect(resolveChangeSummariesCap({ ADV_CHANGE_SUMMARIES_CAP: "-5" })).toBe(
      DEFAULT_CHANGE_SUMMARIES_CAP,
    );
  });
});

describe("createProjectWorkflowState — change_summaries_cap propagation", () => {
  it("uses DEFAULT_CHANGE_SUMMARIES_CAP when changeSummariesCap not provided", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-18T00:00:00.000Z",
    });
    expect(state.change_summaries_cap).toBe(DEFAULT_CHANGE_SUMMARIES_CAP);
  });

  it("uses provided changeSummariesCap when valid", () => {
    const state = createProjectWorkflowState({
      projectId: "proj1",
      initializedAt: "2026-04-18T00:00:00.000Z",
      changeSummariesCap: 25,
    });
    expect(state.change_summaries_cap).toBe(25);
  });

  it("falls back to default for invalid changeSummariesCap (0, negative, NaN)", () => {
    expect(
      createProjectWorkflowState({
        projectId: "p",
        initializedAt: "2026-04-18T00:00:00.000Z",
        changeSummariesCap: 0,
      }).change_summaries_cap,
    ).toBe(DEFAULT_CHANGE_SUMMARIES_CAP);
    expect(
      createProjectWorkflowState({
        projectId: "p",
        initializedAt: "2026-04-18T00:00:00.000Z",
        changeSummariesCap: -5,
      }).change_summaries_cap,
    ).toBe(DEFAULT_CHANGE_SUMMARIES_CAP);
    expect(
      createProjectWorkflowState({
        projectId: "p",
        initializedAt: "2026-04-18T00:00:00.000Z",
        changeSummariesCap: NaN,
      }).change_summaries_cap,
    ).toBe(DEFAULT_CHANGE_SUMMARIES_CAP);
  });
});

describe("applyChangeSummaryToProjectState — eviction at cap", () => {
  // Helper: build a synthetic summary payload for a given changeId / status /
  // lastActivityAt / sourceVersion. Other fields filled with stable defaults.
  function summary(input: {
    changeId: string;
    status: ChangeStatus;
    lastActivityAt: string;
    sourceVersion?: number;
  }) {
    return {
      changeId: input.changeId,
      title: input.changeId,
      status: input.status,
      gateProgress: {
        proposal: "pending",
        discovery: "pending",
        design: "pending",
        planning: "pending",
        execution: "pending",
        acceptance: "pending",
        release: "pending",
      },
      taskCounts: { total: 0, done: 0, pending: 0 },
      lastActivityAt: input.lastActivityAt,
      sourceVersion: input.sourceVersion ?? 1,
    };
  }

  it("insertion at cap does not evict (size === cap stays size === cap)", () => {
    const cap = 3;
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-04-18T00:00:00.000Z",
      changeSummariesCap: cap,
    });
    // Fill to exactly cap.
    for (let i = 0; i < cap; i++) {
      applyChangeSummaryToProjectState(
        state,
        summary({
          changeId: `chg-${i}`,
          status: "archived",
          lastActivityAt: `2026-04-18T00:00:0${i}.000Z`,
        }),
      );
    }
    expect(Object.keys(state.change_summaries)).toHaveLength(cap);

    // In-place update of an existing entry: size stays at cap, no eviction.
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-0",
        status: "archived",
        lastActivityAt: "2026-04-18T01:00:00.000Z",
        sourceVersion: 2,
      }),
    );
    expect(Object.keys(state.change_summaries)).toHaveLength(cap);
    expect(state.change_summaries["chg-0"]).toBeDefined();
  });

  it("insertion past cap evicts oldest archived entry by lastActivityAt", () => {
    const cap = 3;
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-04-18T00:00:00.000Z",
      changeSummariesCap: cap,
    });
    for (let i = 0; i < cap; i++) {
      applyChangeSummaryToProjectState(
        state,
        summary({
          changeId: `chg-${i}`,
          status: "archived",
          lastActivityAt: `2026-04-18T00:00:0${i}.000Z`,
        }),
      );
    }

    // Insert one more (4th) — chg-0 (oldest) should evict.
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-new",
        status: "archived",
        lastActivityAt: "2026-04-18T01:00:00.000Z",
      }),
    );

    expect(Object.keys(state.change_summaries)).toHaveLength(cap);
    expect(state.change_summaries["chg-0"]).toBeUndefined();
    expect(state.change_summaries["chg-new"]).toBeDefined();
    // source_versions also pruned for the evicted entry.
    expect(state.source_versions["chg-0"]).toBeUndefined();
  });

  it("active (non-archived) entries are never evicted", () => {
    const cap = 3;
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-04-18T00:00:00.000Z",
      changeSummariesCap: cap,
    });
    // Fill with 3 active changes (no archived → no eviction candidate).
    for (let i = 0; i < cap; i++) {
      applyChangeSummaryToProjectState(
        state,
        summary({
          changeId: `chg-${i}`,
          status: "active",
          lastActivityAt: `2026-04-18T00:00:0${i}.000Z`,
        }),
      );
    }
    // Insert a 4th active — eviction would have to remove one but cannot,
    // so registry exceeds cap. Active entries are never evicted.
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-new",
        status: "active",
        lastActivityAt: "2026-04-18T01:00:00.000Z",
      }),
    );
    expect(Object.keys(state.change_summaries)).toHaveLength(cap + 1);
    for (let i = 0; i < cap; i++) {
      expect(state.change_summaries[`chg-${i}`]).toBeDefined();
    }
    expect(state.change_summaries["chg-new"]).toBeDefined();
  });

  it("mixed registry: archived evicted first, active retained", () => {
    const cap = 3;
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-04-18T00:00:00.000Z",
      changeSummariesCap: cap,
    });
    // Fill with 2 archived (oldest) + 1 active.
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-arch-old",
        status: "archived",
        lastActivityAt: "2026-04-18T00:00:00.000Z",
      }),
    );
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-arch-new",
        status: "archived",
        lastActivityAt: "2026-04-18T00:00:01.000Z",
      }),
    );
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-active",
        status: "active",
        lastActivityAt: "2026-04-18T00:00:02.000Z",
      }),
    );

    // Push past cap with another archived. Oldest archived should evict.
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-arch-newer",
        status: "archived",
        lastActivityAt: "2026-04-18T00:00:03.000Z",
      }),
    );
    expect(Object.keys(state.change_summaries)).toHaveLength(cap);
    expect(state.change_summaries["chg-arch-old"]).toBeUndefined();
    expect(state.change_summaries["chg-active"]).toBeDefined();
    expect(state.change_summaries["chg-arch-new"]).toBeDefined();
    expect(state.change_summaries["chg-arch-newer"]).toBeDefined();
  });

  it("multiple over-cap inserts evict in oldest-first order (deterministic)", () => {
    const cap = 2;
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-04-18T00:00:00.000Z",
      changeSummariesCap: cap,
    });
    // Push 5 archived in order; final state should retain newest 2.
    for (let i = 0; i < 5; i++) {
      applyChangeSummaryToProjectState(
        state,
        summary({
          changeId: `chg-${i}`,
          status: "archived",
          lastActivityAt: `2026-04-18T00:00:0${i}.000Z`,
        }),
      );
    }
    expect(Object.keys(state.change_summaries).sort()).toEqual([
      "chg-3",
      "chg-4",
    ]);
  });

  it("eviction is replay-deterministic across two independent runs", () => {
    function build(): ReturnType<typeof createProjectWorkflowState> {
      const cap = 2;
      const state = createProjectWorkflowState({
        projectId: "p",
        initializedAt: "2026-04-18T00:00:00.000Z",
        changeSummariesCap: cap,
      });
      for (let i = 0; i < 5; i++) {
        applyChangeSummaryToProjectState(
          state,
          summary({
            changeId: `chg-${i}`,
            status: "archived",
            lastActivityAt: `2026-04-18T00:00:0${i}.000Z`,
          }),
        );
      }
      return state;
    }
    const a = build();
    const b = build();
    expect(Object.keys(a.change_summaries).sort()).toEqual(
      Object.keys(b.change_summaries).sort(),
    );
    expect(a.source_versions).toEqual(b.source_versions);
  });

  it("ties on lastActivityAt: insertion order tie-break is deterministic", () => {
    // When two archived entries share lastActivityAt, the ES2019+ stable
    // sort preserves insertion order. The first-inserted wins eviction.
    const cap = 1;
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-04-18T00:00:00.000Z",
      changeSummariesCap: cap,
    });
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-first",
        status: "archived",
        lastActivityAt: "2026-04-18T00:00:00.000Z",
      }),
    );
    applyChangeSummaryToProjectState(
      state,
      summary({
        changeId: "chg-second",
        status: "archived",
        lastActivityAt: "2026-04-18T00:00:00.000Z",
      }),
    );
    expect(Object.keys(state.change_summaries)).toEqual(["chg-second"]);
  });
});

// =============================================================================
// rq-archivePurge01: purge helper
// =============================================================================

describe("purgeChangeSummaryFromProjectState", () => {
  it("removes entry from both change_summaries and source_versions", () => {
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-04-18T00:00:00.000Z",
    });
    applyChangeSummaryToProjectState(state, {
      changeId: "chg-1",
      title: "T",
      status: "archived",
      gateProgress: {
        proposal: "done",
        discovery: "done",
        design: "done",
        planning: "done",
        execution: "done",
        acceptance: "done",
        release: "done",
      },
      taskCounts: { total: 0, done: 0, pending: 0 },
      lastActivityAt: "2026-04-18T00:00:00.000Z",
      sourceVersion: 1,
    });
    expect(state.change_summaries["chg-1"]).toBeDefined();
    expect(state.source_versions["chg-1"]).toBe(1);

    purgeChangeSummaryFromProjectState(state, "chg-1");

    expect(state.change_summaries["chg-1"]).toBeUndefined();
    expect(state.source_versions["chg-1"]).toBeUndefined();
  });

  it("is idempotent: purging unknown changeId is a no-op", () => {
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-04-18T00:00:00.000Z",
    });
    expect(() =>
      purgeChangeSummaryFromProjectState(state, "never-existed"),
    ).not.toThrow();
    expect(state.change_summaries).toEqual({});
    expect(state.source_versions).toEqual({});
  });
});
