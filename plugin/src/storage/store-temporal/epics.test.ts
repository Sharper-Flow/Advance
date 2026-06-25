/**
 * Unit tests for the Temporal-backed Epic store adapter.
 *
 * Mocks the Temporal workflow handle so create/show/list/update/reorder/
 * add-shell/promote/link/unlink behavior can be tested without spinning up
 * a test server.
 */

import { describe, expect, test, vi } from "vitest";
import { createEpicOps } from "./epics";
import type { StoreDeps } from "./shared";
import {
  epicCreatedSignal,
  epicUpdatedSignal,
  shellAddedSignal,
  shellPromotedSignal,
  changeLinkedSignal,
  changeUnlinkedSignal,
  entriesReorderedSignal,
  getEpicQuery,
} from "../../temporal/messages";
import type { Epic, EpicWorkflowState } from "../../types";

function makeEpic(overrides?: Partial<Epic>): Epic {
  const now = new Date().toISOString();
  return {
    id: "addAuthEpic",
    title: "Add Auth Epic",
    narrative: "Auth initiative.",
    entries: [],
    progress: {
      status: "active",
      total_entries: 0,
      completed_entries: 0,
      active_entries: 0,
      next_entry_id: null,
      updated_at: now,
    },
    created_at: now,
    updated_at: now,
    version: 0,
    ...overrides,
  };
}

function makeState(epic: Epic): EpicWorkflowState {
  return {
    projectId: "project-id",
    epicId: epic.id,
    title: epic.title,
    narrative: epic.narrative,
    initializedAt: epic.created_at,
    id: epic.id,
    status: "active",
    epic,
    idempotencyLedger: {},
  } as EpicWorkflowState;
}

function setup() {
  const signalMock = vi.fn();
  const queryMock = vi.fn(async () => makeState(makeEpic()));
  const handle = { signal: signalMock, query: queryMock };
  const startMock = vi.fn(async () => handle);
  const getHandleMock = vi.fn(() => handle);
  const client = {
    workflow: { start: startMock, getHandle: getHandleMock, list: vi.fn() },
  };

  const deps = {
    input: {
      legacy: {},
      temporal: client,
      projectId: "project-id",
    },
    getTemporalWorkflowClient: () =>
      client as ReturnType<StoreDeps["getTemporalWorkflowClient"]>,
  } as unknown as StoreDeps;

  return { deps, handle, signalMock, queryMock, startMock, getHandleMock };
}

describe("createEpicOps", () => {
  test("create starts workflow and fires epicCreated signal", async () => {
    const { deps, signalMock } = setup();
    const ops = createEpicOps(deps);

    const epic = await ops.create("addAuthEpic", "Add Auth", "Narrative");
    expect(epic.id).toBe("addAuthEpic");
    expect(signalMock).toHaveBeenCalledWith(
      epicCreatedSignal,
      expect.objectContaining({ id: "addAuthEpic" }),
    );
  });

  test("get returns Epic from workflow query", async () => {
    const { deps, queryMock } = setup();
    const epic = makeEpic();
    queryMock.mockResolvedValue(makeState(epic));

    const ops = createEpicOps(deps);
    const result = await ops.get("addAuthEpic");
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Add Auth Epic");
    expect(queryMock).toHaveBeenCalledWith(getEpicQuery);
  });

  test("update fires epicUpdated with expected version", async () => {
    const { deps, queryMock, signalMock } = setup();
    const epic = makeEpic({ version: 1 });
    queryMock.mockResolvedValue(makeState(epic));

    const ops = createEpicOps(deps);
    await ops.update("addAuthEpic", {
      title: "Updated",
      expectedVersion: 1,
    });

    const call = signalMock.mock.calls.find((c) => c[0] === epicUpdatedSignal);
    expect(call?.[1]).toMatchObject({
      title: "Updated",
      expectedVersion: 1,
    });
  });

  test("update throws typed stale_version when workflow records rejection", async () => {
    const { deps, queryMock, signalMock } = setup();
    const epic = makeEpic({ version: 2 });
    queryMock.mockResolvedValue({
      ...makeState(epic),
      rejections: [
        {
          signalName: "epicUpdated",
          errorMessage: "Expected Epic version 1, found 2",
          rejectedAt: new Date().toISOString(),
        },
      ],
    });

    const ops = createEpicOps(deps);
    await expect(
      ops.update("addAuthEpic", {
        title: "Updated",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "stale_version" });
    expect(signalMock).toHaveBeenCalledWith(
      epicUpdatedSignal,
      expect.anything(),
    );
  });

  test("addShell fires shellAdded signal and returns entry", async () => {
    const { deps, queryMock, signalMock } = setup();
    const epic = makeEpic({
      entries: [
        {
          kind: "shell",
          entry_id: "shell-1",
          order: 0,
          title: "Shell One",
          success_hint: "hint",
        },
      ],
    });
    queryMock.mockResolvedValue(makeState(epic));

    const ops = createEpicOps(deps);
    const entry = await ops.addShell("addAuthEpic", {
      entryId: "shell-1",
      title: "Shell One",
      successHint: "hint",
    });
    expect(entry.kind).toBe("shell");
    expect(signalMock).toHaveBeenCalledWith(
      shellAddedSignal,
      expect.objectContaining({ entryId: "shell-1" }),
    );
  });

  test("promoteShell fires shellPromoted signal", async () => {
    const { deps, signalMock } = setup();
    const ops = createEpicOps(deps);

    const result = await ops.promoteShell(
      "addAuthEpic",
      "shell-1",
      "change-1",
      "agent",
    );
    expect(result).toEqual({ entryId: "shell-1", changeId: "change-1" });
    expect(signalMock).toHaveBeenCalledWith(
      shellPromotedSignal,
      expect.objectContaining({ entryId: "shell-1", changeId: "change-1" }),
    );
  });

  test("linkChange fires changeLinked signal and returns entry", async () => {
    const { deps, queryMock, signalMock } = setup();
    const epic = makeEpic({
      entries: [
        {
          kind: "change",
          entry_id: "entry-1",
          order: 0,
          change_id: "change-1",
        },
      ],
    });
    queryMock.mockResolvedValue(makeState(epic));

    const ops = createEpicOps(deps);
    const entry = await ops.linkChange("addAuthEpic", {
      entryId: "entry-1",
      changeId: "change-1",
      title: "Linked",
    });
    expect(entry.kind).toBe("change");
    expect(signalMock).toHaveBeenCalledWith(
      changeLinkedSignal,
      expect.objectContaining({ changeId: "change-1" }),
    );
  });

  test("unlinkChange fires changeUnlinked signal", async () => {
    const { deps, signalMock } = setup();
    const ops = createEpicOps(deps);
    await ops.unlinkChange("addAuthEpic", "entry-1");
    expect(signalMock).toHaveBeenCalledWith(
      changeUnlinkedSignal,
      expect.objectContaining({ entryId: "entry-1" }),
    );
  });

  test("reorder fires entriesReordered signal and returns updated epic", async () => {
    const { deps, queryMock, signalMock } = setup();
    const epic = makeEpic({ version: 2 });
    queryMock.mockResolvedValue(makeState(epic));

    const ops = createEpicOps(deps);
    await ops.reorder("addAuthEpic", ["entry-1"], 2);
    expect(signalMock).toHaveBeenCalledWith(
      entriesReorderedSignal,
      expect.objectContaining({ entryIds: ["entry-1"], expectedVersion: 2 }),
    );
  });

  describe("missing-Epic recovery", () => {
    function setupMissing(epicId = "missingEpic") {
      const { deps, handle, queryMock, signalMock, getHandleMock } = setup();
      queryMock.mockImplementation(async () => {
        throw new Error(`Workflow not found: adv/epic/project-id/${epicId}`);
      });
      return { deps, handle, queryMock, signalMock, getHandleMock };
    }

    test("get returns null when Epic workflow does not exist", async () => {
      const { deps } = setupMissing();
      const ops = createEpicOps(deps);
      const result = await ops.get("missingEpic");
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    test("get returns read_error for non-not-found query failures", async () => {
      const { deps, queryMock } = setup();
      queryMock.mockRejectedValue(new Error("Temporal connection refused"));

      const ops = createEpicOps(deps);
      const result = await ops.get("addAuthEpic");
      expect(result.success).toBe(false);
      expect(result.type).toBe("read_error");
    });

    test("update throws epic_not_found when Epic workflow does not exist", async () => {
      const { deps } = setupMissing();
      const ops = createEpicOps(deps);
      await expect(
        ops.update("missingEpic", { title: "Updated", expectedVersion: 0 }),
      ).rejects.toMatchObject({ code: "epic_not_found" });
    });

    test("addShell throws epic_not_found when Epic workflow does not exist", async () => {
      const { deps } = setupMissing();
      const ops = createEpicOps(deps);
      await expect(
        ops.addShell("missingEpic", {
          title: "Shell",
          successHint: "hint",
        }),
      ).rejects.toMatchObject({ code: "epic_not_found" });
    });

    test("promoteShell throws epic_not_found when Epic workflow does not exist", async () => {
      const { deps } = setupMissing();
      const ops = createEpicOps(deps);
      await expect(
        ops.promoteShell("missingEpic", "shell-1", "change-1", "agent"),
      ).rejects.toMatchObject({ code: "epic_not_found" });
    });

    test("linkChange throws epic_not_found when Epic workflow does not exist", async () => {
      const { deps } = setupMissing();
      const ops = createEpicOps(deps);
      await expect(
        ops.linkChange("missingEpic", {
          changeId: "change-1",
          title: "Linked",
        }),
      ).rejects.toMatchObject({ code: "epic_not_found" });
    });

    test("unlinkChange throws epic_not_found when Epic workflow does not exist", async () => {
      const { deps } = setupMissing();
      const ops = createEpicOps(deps);
      await expect(
        ops.unlinkChange("missingEpic", "entry-1"),
      ).rejects.toMatchObject({ code: "epic_not_found" });
    });

    test("reorder throws epic_not_found when Epic workflow does not exist", async () => {
      const { deps } = setupMissing();
      const ops = createEpicOps(deps);
      await expect(
        ops.reorder("missingEpic", ["entry-1"], 0),
      ).rejects.toMatchObject({ code: "epic_not_found" });
    });

    test("list skips Epics that disappear between enumeration and query", async () => {
      const { deps, queryMock } = setup();
      const client = deps.input.temporal as {
        workflow: { list: ReturnType<typeof vi.fn> };
      };
      client.workflow.list = vi.fn(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield { workflowId: "adv/epic/project-id/presentEpic" };
          yield { workflowId: "adv/epic/project-id/vanishedEpic" };
        },
      })) as unknown as typeof client.workflow.list;

      let callCount = 0;
      queryMock.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error(
            "Workflow not found: adv/epic/project-id/vanishedEpic",
          );
        }
        return makeState(makeEpic({ id: "presentEpic" }));
      });

      const ops = createEpicOps(deps);
      const epics = await ops.list();
      expect(epics).toHaveLength(1);
      expect(epics[0].id).toBe("presentEpic");
    });
  });
});
