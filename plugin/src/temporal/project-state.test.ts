import { describe, expect, it } from "vitest";
import {
  addAgendaItemToProjectState,
  addProjectWisdomToProjectState,
  createProjectWorkflowState,
  listAgendaItemsFromProjectState,
  listProjectWisdomFromProjectState,
  recordMigrationEntryInProjectState,
  updateAgendaItemInProjectState,
} from "./project-state";
import {
  PROJECT_WORKFLOW_QUERY_NAMES,
  PROJECT_WORKFLOW_UPDATE_NAMES,
} from "./contracts";

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
