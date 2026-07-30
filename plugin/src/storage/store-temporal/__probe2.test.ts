import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDiskStore } from "../store-disk";
import { createDefaultGates, type Change } from "../../types";
import { createTemporalStoreBackend } from "./index";
import { createTemporalReadDeadline } from "../../temporal/retry-wrapper";
import { TEMPORAL_READ_DEADLINE_BUDGET_MS } from "./shared";

vi.mock("../json", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../json")>();
  return {
    ...actual,
    loadChange: async (root: string, id: string) => {
      if (id === "active-01") {
        return { success: false as const, error: "forced", type: "not_found" as const };
      }
      return actual.loadChange(root, id);
    },
  };
});

function activeChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "draft",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: Object.fromEntries([["cap-" + id, []]]),
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  };
}

describe("probe2", () => {
  let tempDir: string | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });
  afterEach(async () => {
    vi.useRealTimers();
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("fallback with store", async () => {
    console.log("A");
    tempDir = await createTempDir();
    console.log("B");
    const legacy = await createDiskStore(tempDir);
    console.log("C");
    const temporal = {
      client: {
        workflow: {
          list: async function* () {
            console.log("list yield");
            yield { workflowId: `adv/change/project-1/active-01` };
          },
          getHandle: (workflowId: string) => {
            console.log("getHandle");
            const id = workflowId.replace("adv/change/project-1/", "");
            return {
              query: async () => {
                console.log("query start");
                await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 300));
                console.log("query end");
                return {
                  id,
                  changeId: id,
                  title: "Active " + id,
                  status: "draft",
                  createdAt: "2026-05-07T00:00:00.000Z",
                  initializedAt: "2026-05-07T00:00:00.000Z",
                  projectId: "project-1",
                  tasks: [],
                  deltas: Object.fromEntries([["cap-" + id, []]]),
                  wisdom: [],
                  gates: createDefaultGates(),
                  reentry_history: [],
                  artifacts: {},
                  documents: {},
                  reflections: [],
                  worktrees: {},
                  conformance: { lockedSpecs: [], overrides: [] },
                  worktree_auto_managed: false,
                };
              },
              start: async () => { throw new Error("no start"); },
            };
          },
        },
      },
    };
    console.log("D");
    const store = createTemporalStoreBackend({ legacy, temporal, projectId: "project-1" });
    console.log("E");
    const pending = store.changes.listConflictAuthority!({
      deadline: createTemporalReadDeadline(TEMPORAL_READ_DEADLINE_BUDGET_MS),
    });
    console.log("F");
    await vi.advanceTimersByTimeAsync(500);
    console.log("G");
    const result = await pending;
    console.log("H", result.completeness);
    expect(result.completeness).toBe("complete");
  });
});
