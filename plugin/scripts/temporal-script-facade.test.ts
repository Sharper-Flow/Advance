import { describe, expect, test, vi } from "vitest";
import { TemporalOperationsOwner } from "../src/temporal/operations";
import {
  createTemporalScriptFacade,
  createTemporalScriptFacadeFactory,
  TemporalScriptOutcomeError,
  type TemporalScriptFacade,
} from "./temporal-script-facade";

const PROJECT_ID = "0".repeat(40);
const OTHER_PROJECT_ID = "a".repeat(40);

function buildMockOwner(
  projectId: string,
): TemporalOperationsOwner {
  const bundle = {
    address: "127.0.0.1:7233",
    namespace: "default",
    connection: { close: vi.fn() } as unknown as ConstructorParameters<
      typeof TemporalOperationsOwner
    >[0]["connection"],
    client: {
      workflow: {
        getHandle: vi.fn(() => ({
          workflowId: "adv/change/0000000000000000000000000000000000000000/replayFixture",
        })),
      },
    } as unknown as ConstructorParameters<
      typeof TemporalOperationsOwner
    >[0]["client"],
  };
  return new TemporalOperationsOwner(bundle, projectId);
}

describe("createTemporalScriptFacade", () => {
  test("requires a non-empty projectId", async () => {
    await expect(
      createTemporalScriptFacade({ projectId: "" }),
    ).rejects.toThrow(/projectId is required/);
  });

  test("startWorkflow returns the workflow id on confirmed", async () => {
    const owner = buildMockOwner(PROJECT_ID);
    owner.start = vi.fn().mockResolvedValue({
      kind: "confirmed",
      value: { workflowId: "adv/change/0000000000000000000000000000000000000000/replayFixture" },
    });

    const facade = await createTemporalScriptFacade({
      projectId: PROJECT_ID,
      owner,
    });

    const result = await facade.startWorkflow({
      workflowType: "changeWorkflow",
      workflowId: "adv/change/0000000000000000000000000000000000000000/replayFixture",
      taskQueue: "replay-fixture",
      args: ["input"],
    });

    expect(result.workflowId).toBe(
      "adv/change/0000000000000000000000000000000000000000/replayFixture",
    );
  });

  test("startWorkflow throws typed TemporalScriptOutcomeError on timeout_unavailable", async () => {
    const owner = buildMockOwner(PROJECT_ID);
    owner.start = vi.fn().mockResolvedValue({
      kind: "timeout_unavailable",
      error: new Error("deadline exceeded"),
      diagnostic: { class: "deadline", reachable: true },
    });

    const facade = await createTemporalScriptFacade({
      projectId: PROJECT_ID,
      owner,
    });

    await expect(
      facade.startWorkflow({
        workflowType: "changeWorkflow",
        workflowId: "adv/change/0000000000000000000000000000000000000000/replayFixture",
        taskQueue: "replay-fixture",
        args: ["input"],
      }),
    ).rejects.toBeInstanceOf(TemporalScriptOutcomeError);
  });

  test("signalWorkflow throws typed TemporalScriptOutcomeError on confirmed_failure", async () => {
    const owner = buildMockOwner(PROJECT_ID);
    owner.signal = vi.fn().mockResolvedValue({
      kind: "confirmed_failure",
      error: new Error("signal rejected"),
      diagnostic: { class: "reachable", reachable: true },
    });

    const facade = await createTemporalScriptFacade({
      projectId: PROJECT_ID,
      owner,
    });

    await expect(
      facade.signalWorkflow(
        "adv/change/0000000000000000000000000000000000000000/replayFixture",
        { name: "testSignal" } as any,
        { payload: true },
      ),
    ).rejects.toMatchObject({
      name: "TemporalScriptOutcomeError",
      kind: "confirmed_failure",
    });
  });

  test("queryWorkflow throws typed TemporalScriptOutcomeError on degraded", async () => {
    const owner = buildMockOwner(PROJECT_ID);
    owner.query = vi.fn().mockResolvedValue({
      kind: "degraded",
      error: new Error("query stalled"),
      diagnostic: { class: "deadline", reachable: true },
    });

    const facade = await createTemporalScriptFacade({
      projectId: PROJECT_ID,
      owner,
    });

    await expect(
      facade.queryWorkflow(
        "adv/change/0000000000000000000000000000000000000000/replayFixture",
        { name: "testQuery" } as any,
      ),
    ).rejects.toMatchObject({
      name: "TemporalScriptOutcomeError",
      kind: "degraded",
    });
  });

  test("terminateWorkflow throws typed TemporalScriptOutcomeError on outcome_unknown", async () => {
    const owner = buildMockOwner(PROJECT_ID);
    owner.terminate = vi.fn().mockResolvedValue({
      kind: "outcome_unknown",
      error: new Error("terminate ack but readback failed"),
      diagnostic: { class: "unknown", reachable: true },
    });

    const facade = await createTemporalScriptFacade({
      projectId: PROJECT_ID,
      owner,
    });

    await expect(
      facade.terminateWorkflow(
        "adv/change/0000000000000000000000000000000000000000/replayFixture",
        "cleanup",
      ),
    ).rejects.toMatchObject({
      name: "TemporalScriptOutcomeError",
      kind: "outcome_unknown",
    });
  });

  test("listChangeWorkflowIds returns change ids scoped to the owner project", async () => {
    const owner = buildMockOwner(PROJECT_ID);
    owner.list = vi.fn().mockResolvedValue({
      kind: "complete",
      value: [
        { workflowId: "adv/change/0000000000000000000000000000000000000000/c1" },
        { workflowId: "adv/change/0000000000000000000000000000000000000000/c2" },
        { workflowId: "adv/change/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/c3" },
      ],
      truncated: false,
    });

    const facade = await createTemporalScriptFacade({
      projectId: PROJECT_ID,
      owner,
    });

    const ids = await facade.listChangeWorkflowIds();
    expect(ids).toEqual(["c1", "c2"]);
    expect(owner.list).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID }),
      'AdvAffectedProjects = "0000000000000000000000000000000000000000"',
      { limit: 1000 },
    );
  });

  test("listChangeWorkflowIds throws typed TemporalScriptOutcomeError on unavailable", async () => {
    const owner = buildMockOwner(PROJECT_ID);
    owner.list = vi.fn().mockResolvedValue({
      kind: "unavailable",
      error: new Error("visibility unavailable"),
      diagnostic: { class: "unknown", reachable: false },
    });

    const facade = await createTemporalScriptFacade({
      projectId: PROJECT_ID,
      owner,
    });

    await expect(facade.listChangeWorkflowIds()).rejects.toMatchObject({
      name: "TemporalScriptOutcomeError",
      kind: "unavailable",
    });
  });
});

describe("createTemporalScriptFacadeFactory", () => {
  test("creates one facade per project id and closes all", async () => {
    const owner1 = buildMockOwner(PROJECT_ID);
    owner1.close = vi.fn().mockResolvedValue(undefined);
    owner1.list = vi.fn().mockResolvedValue({
      kind: "complete",
      value: [],
      truncated: false,
    });

    const owner2 = buildMockOwner(OTHER_PROJECT_ID);
    owner2.close = vi.fn().mockResolvedValue(undefined);
    owner2.list = vi.fn().mockResolvedValue({
      kind: "complete",
      value: [],
      truncated: false,
    });

    const createFacade = vi.fn(
      async (projectId: string): Promise<TemporalScriptFacade> => {
        const owner =
          projectId === PROJECT_ID
            ? owner1
            : projectId === OTHER_PROJECT_ID
              ? owner2
              : buildMockOwner(projectId);
        return createTemporalScriptFacade({ projectId, owner });
      },
    );

    const factory = createTemporalScriptFacadeFactory({ createFacade });

    const facade1 = await factory.get(PROJECT_ID);
    const facade2 = await factory.get(OTHER_PROJECT_ID);
    const facade1Again = await factory.get(PROJECT_ID);

    expect(facade1).toBe(facade1Again);
    expect(facade1.projectId).toBe(PROJECT_ID);
    expect(facade2.projectId).toBe(OTHER_PROJECT_ID);

    await facade1.listChangeWorkflowIds();
    await facade2.listChangeWorkflowIds();

    await factory.closeAll();

    expect(owner1.close).toHaveBeenCalled();
    expect(owner2.close).toHaveBeenCalled();
  });
});
