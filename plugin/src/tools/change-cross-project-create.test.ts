import { beforeEach, describe, expect, test, vi } from "vitest";
import { tmpdir } from "node:os";

import { changeTools } from "./change";
import { parseToolOutput } from "../__tests__/setup";
import type { Change, Epic } from "../types";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  withTargetPathStore: vi.fn(),
}));

const SOURCE_ROOT = `${tmpdir()}/adv-cross-project-create-source`;
const TARGET_ROOT = `${tmpdir()}/adv-cross-project-create-target`;

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
    paths: { root: SOURCE_ROOT, changes: "/state/source/changes" },
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

  test("routes target_path creation through a authoritative target store without target get", async () => {
    const targetCreate = vi.fn(async () => ({
      changeId: "addTargetFollowup",
      path: "/state/target/changes/addTargetFollowup/proposal.md",
    }));
    const targetGet = vi.fn(async () => {
      throw new Error("target getState/get must not be called after create");
    });
    const targetStore = {
      changes: {
        create: targetCreate,
        get: targetGet,
        list: vi.fn(async () => ({ changes: [] })),
      },
    } as unknown as Store;
    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: TARGET_ROOT,
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
        target_path: TARGET_ROOT,
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
        source_change_id: "sourceChange",
      } as never,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProjectPath: SOURCE_ROOT,
        target_path: TARGET_ROOT,
        stateRequirement: "authoritative",
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
            source_path: SOURCE_ROOT,
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
      target_path: TARGET_ROOT,
      _projectContext: { stateMode: "temporal" },
    });
  });

  test("rejects target_path create when target project already has an active same-summary change", async () => {
    const targetStore = {
      changes: {
        create: vi.fn(),
        get: vi.fn(),
        list: vi.fn(async () => ({
          changes: [
            {
              id: "addTargetFollowup",
              title: "Add target followup",
              status: "active",
            },
          ],
        })),
      },
    } as unknown as Store;
    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: TARGET_ROOT,
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
        target_path: TARGET_ROOT,
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
        source_change_id: "sourceChange",
      } as never,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("DUPLICATE_ACTIVE_CHANGE");
    expect(parsed.existing_change_id).toBe("addTargetFollowup");
    expect(targetStore.changes.create).not.toHaveBeenCalled();
    expect(sourceStore.changes.save).not.toHaveBeenCalled();
  });

  test("reports target Temporal create failure after readiness without writing source link", async () => {
    const targetCreate = vi.fn(async () => {
      throw new Error("Temporal workflow start failed");
    });
    const targetStore = {
      changes: {
        create: targetCreate,
        get: vi.fn(),
        list: vi.fn(async () => ({ changes: [] })),
      },
    } as unknown as Store;
    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: TARGET_ROOT,
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
        target_path: TARGET_ROOT,
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
        source_change_id: "sourceChange",
      } as never,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: TARGET_ROOT,
        stateRequirement: "authoritative",
      }),
      expect.any(Function),
    );
    expect(targetCreate).toHaveBeenCalledWith(
      "Add failing target",
      expect.objectContaining({
        initialMetadata: {
          cross_project_origin: expect.objectContaining({
            source_change_id: "sourceChange",
          }),
        },
      }),
    );
    expect(targetStore.changes.get).not.toHaveBeenCalled();
    expect(parsed.error).toContain("Temporal workflow start failed");
    expect(sourceStore.changes.save).not.toHaveBeenCalled();
  });

  test("forwards complete create-time epic seed to target project after validating parent Epic", async () => {
    const epic: Epic = {
      id: "addAuthEpic",
      title: "Add OAuth",
      narrative: "OAuth epic.",
      entries: [
        {
          kind: "change",
          entry_id: "entry-1",
          order: 7,
          title: "Authoritative Epic Entry",
          change_id: "existingChange",
          linked_at: "2026-06-06T20:00:00.000Z",
          membership_status: "active",
        },
      ],
      progress: {
        status: "active",
        total_entries: 1,
        completed_entries: 0,
        active_entries: 1,
        next_entry_id: null,
        updated_at: "2026-06-06T20:00:00.000Z",
      },
      created_at: "2026-06-06T20:00:00.000Z",
      updated_at: "2026-06-06T20:00:00.000Z",
      version: 0,
    };
    const targetCreate = vi.fn(async () => ({
      changeId: "epicChild",
      path: "/state/target/changes/epicChild/proposal.md",
    }));
    const targetStore = {
      changes: {
        create: targetCreate,
        get: vi.fn(),
        list: vi.fn(async () => ({ changes: [] })),
      },
      epics: {
        get: vi.fn(async () => ({ success: true, data: epic })),
      },
    } as unknown as Store;
    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: TARGET_ROOT,
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
        summary: "Epic child followup",
        capability: "advance-meta",
        target_path: TARGET_ROOT,
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
        source_change_id: "sourceChange",
        epic_id: "addAuthEpic",
        entry_id: "entry-1",
        epic_order: 99,
        epic_title: "Caller supplied title",
      } as never,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(targetCreate).toHaveBeenCalledWith(
      "Epic child followup",
      expect.objectContaining({
        initialMetadata: {
          cross_project_origin: expect.objectContaining({
            source_project: "source-project",
            source_path: SOURCE_ROOT,
            source_change_id: "sourceChange",
          }),
          epic_membership: expect.objectContaining({
            epic_id: "addAuthEpic",
            entry_id: "entry-1",
            order: 7,
            title: "Authoritative Epic Entry",
            epic_project_id: "target-project-id",
            linked_at: "2026-06-06T20:00:00.000Z",
            source: "create",
          }),
        },
      }),
    );
    expect(parsed.epic_membership).toMatchObject({
      epic_id: "addAuthEpic",
      entry_id: "entry-1",
      order: 7,
      title: "Authoritative Epic Entry",
      linked_at: "2026-06-06T20:00:00.000Z",
      epic_project_id: "target-project-id",
      source: "create",
    });
  });

  test("rejects cross-project create when parent Epic is missing", async () => {
    const targetCreate = vi.fn();
    const targetStore = {
      changes: {
        create: targetCreate,
        get: vi.fn(),
        list: vi.fn(async () => ({ changes: [] })),
      },
      epics: {
        get: vi.fn(async () => ({ success: false, error: "not found" })),
      },
    } as unknown as Store;
    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: TARGET_ROOT,
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
        summary: "Orphan epic child",
        target_path: TARGET_ROOT,
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
        source_change_id: "sourceChange",
        epic_id: "missingEpic",
        entry_id: "entry-1",
        epic_title: "Missing Epic Entry",
      } as never,
      sourceStore,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("EPIC_NOT_FOUND");
    expect(targetCreate).not.toHaveBeenCalled();
    expect(sourceStore.changes.save).not.toHaveBeenCalled();
  });

  test("rejects partial create-time epic seed before cross-project create", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Partial epic child",
        target_path: TARGET_ROOT,
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
        source_change_id: "sourceChange",
        epic_id: "addAuthEpic",
      } as never,
      makeSourceStore(),
    );
    const parsed = parseToolOutput(output);

    expect(parsed.code).toBe("INVALID_EPIC_MEMBERSHIP_SEED");
    expect(parsed.fields).toEqual(["entry_id", "epic_title"]);
    expect(mocks.withTargetPathStore).not.toHaveBeenCalled();
  });
});
