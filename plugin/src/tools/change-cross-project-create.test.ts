import { beforeEach, describe, expect, test, vi } from "vitest";

import { changeTools } from "./change";
import { parseToolOutput } from "../__tests__/setup";
import type { Change } from "../types";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  withTargetPathStore: vi.fn(),
}));

vi.mock("./target-project", async () => {
  const actual =
    await vi.importActual<typeof import("./target-project")>(
      "./target-project",
    );
  return {
    ...actual,
    withTargetPathStore: mocks.withTargetPathStore,
  };
});

function makeSourceStore(): Store {
  const sourceChange: Change = {
    id: "sourceChange",
    title: "Source change",
    status: "active",
    created_at: "2026-06-06T20:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
  };

  return {
    paths: { root: "/repo/source", changes: "/state/source/changes" },
    config: { name: "source-project" } as never,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      get: vi.fn(async (changeId: string) =>
        changeId === sourceChange.id
          ? { success: true, data: sourceChange }
          : { success: false, error: "not found" },
      ),
      save: vi.fn(async () => {}),
    } as unknown as Store["changes"],
    tasks: {} as Store["tasks"],
    gates: {} as Store["gates"],
    wisdom: {} as Store["wisdom"],
    agenda: {} as Store["agenda"],
  } as Store;
}

describe("adv_change_create cross-project Temporal routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("routes target_path creation through a temporal-required target store without target get", async () => {
    const targetCreate = vi.fn(async () => ({
      changeId: "addTargetFollowup",
      path: "/state/target/changes/addTargetFollowup/proposal.md",
    }));
    const targetGet = vi.fn(async () => {
      throw new Error("target getState/get must not be called after create");
    });
    const targetStore = {
      changes: { create: targetCreate, get: targetGet },
    } as unknown as Store;
    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/repo/target",
          projectId: "target-project-id",
          externalRoot: "/state/target",
          trusted: false,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    );

    const sourceStore = makeSourceStore();
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Add target followup",
        capability: "advance-meta",
        proposal: "Implement target work.",
        target_path: "/repo/target",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
        source_change_id: "sourceChange",
      } as never,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProjectPath: "/repo/source",
        target_path: "/repo/target",
        stateRequirement: "temporal-required",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      }),
      expect.any(Function),
    );
    expect(targetCreate).toHaveBeenCalledWith(
      "Add target followup",
      expect.objectContaining({
        capability: "advance-meta",
        initialMetadata: {
          cross_project_origin: expect.objectContaining({
            source_project: "source-project",
            source_path: "/repo/source",
            source_change_id: "sourceChange",
          }),
        },
      }),
    );
    expect(targetGet).not.toHaveBeenCalled();
    expect(sourceStore.changes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        cross_project_links: [
          expect.objectContaining({
            target_project_id: "target-project-id",
            changeId: "addTargetFollowup",
            relationship: "follow_up",
          }),
        ],
      }),
    );
    expect(parsed).toMatchObject({
      changeId: "addTargetFollowup",
      target_path: "/repo/target",
      _projectContext: { stateMode: "temporal" },
    });
  });

  test("reports target Temporal create failure without writing source link", async () => {
    const targetCreate = vi.fn(async () => {
      throw new Error("Temporal workflow start failed");
    });
    const targetStore = {
      changes: { create: targetCreate, get: vi.fn() },
    } as unknown as Store;
    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/repo/target",
          projectId: "target-project-id",
          externalRoot: "/state/target",
          trusted: false,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    );

    const sourceStore = makeSourceStore();
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Add failing target",
        capability: "advance-meta",
        target_path: "/repo/target",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
        source_change_id: "sourceChange",
      } as never,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.error).toContain("Temporal workflow start failed");
    expect(sourceStore.changes.save).not.toHaveBeenCalled();
  });
});
