import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpecDeltaOps } from "./spec-deltas";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../../temporal/contracts";
import { ChangeSchema, type Change } from "../../types";
import { SAMPLE_CHANGE } from "../../__tests__/setup";
import { saveChange } from "../json";

const ADD_DELTA = {
  id: "dl-AAA11111",
  operation: "add" as const,
  requirement: {
    id: "rq-specDelta01",
    title: "Spec delta writer",
    body: "Record change-scoped add deltas durably.",
    priority: "must" as const,
    scenarios: [
      {
        id: "rq-specDelta01.1",
        title: "Record add delta",
        given: ["a draft change exists"],
        when: "the writer is invoked",
        then: ["the delta persists under the capability"],
      },
    ],
  },
};

const signalMock = vi.fn();
const queryMock = vi.fn();

function makeHandle() {
  return {
    signal: signalMock,
    query: queryMock,
  };
}

async function makeDeps(
  tempDir: string,
  summariesDir: string,
  changeId: string,
) {
  const changesDir = join(tempDir, "changes");
  await mkdir(changesDir, { recursive: true });
  await mkdir(summariesDir, { recursive: true });
  const seed = ChangeSchema.parse({
    ...SAMPLE_CHANGE,
    id: changeId,
    title: `Change ${changeId}`,
    status: "draft",
    lifecycleState: "open",
    projection_revision: 0,
    state_revision: 0,
  } as Change);
  await saveChange(changesDir, seed);

  const handle = makeHandle();
  return {
    input: {
      projectId: "pid-delta-disk",
      legacy: {
        changes: {
          get: vi.fn().mockResolvedValue({ success: true, data: null }),
        },
      },
      temporal: {
        client: {
          workflow: {
            getHandle: vi.fn().mockReturnValue(handle),
          },
        },
      },
    },
    legacy: {
      specDeltas: {},
      paths: { changes: changesDir, summariesDir },
    },
    invalidateChange: vi.fn(),
    setCachedChange: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
    persistStateToDisk: vi.fn(),
  };
}

function mockQueries(stateAfterSignal: unknown) {
  queryMock.mockImplementation(async (queryDef, queryArg) => {
    if (
      queryDef.name === CHANGE_WORKFLOW_QUERY_NAMES.getOperationLedgerOutcome
    ) {
      const envelope = signalMock.mock.calls
        .slice()
        .reverse()
        .find((call) => {
          const payload = call[1] as Record<string, unknown> | undefined;
          return payload?.operation_id === queryArg;
        });
      const payload = (envelope?.[1] ?? {}) as Record<string, unknown>;
      return {
        operation_id: queryArg,
        command_kind: payload.command_kind ?? "specDeltaAdded",
        payload_hash: payload.payload_hash ?? "hash",
        outcome: "accepted",
        state_revision: 1,
        accepted_at: "2026-07-27T00:00:00.000Z",
        last_seen_at: "2026-07-27T00:00:00.000Z",
      };
    }
    return stateAfterSignal;
  });
}

beforeEach(() => {
  signalMock.mockReset();
  queryMock.mockReset();
  signalMock.mockResolvedValue(undefined);
});

describe("createSpecDeltaOps disk projection", () => {
  it("persists the appended delta in the on-disk change projection", async () => {
    const tempDir = join(tmpdir(), `spec-delta-disk-${Date.now()}`);
    const summariesDir = join(tempDir, "summaries");
    const changeId = "spec-delta-disk-test";
    const stateAfterSignal = {
      changeId,
      title: `Change ${changeId}`,
      status: "draft",
      lifecycleState: "open",
      createdAt: "2026-07-27T00:00:00.000Z",
      tasks: [],
      deltas: { "collection-dashboard": [ADD_DELTA] },
      wisdom: [],
      gates: {},
      state_revision: 1,
    };

    const deps = await makeDeps(tempDir, summariesDir, changeId);
    mockQueries(stateAfterSignal);

    const ops = createSpecDeltaOps(deps as never);
    await ops.add(changeId, "collection-dashboard", ADD_DELTA, {
      addedBy: "agent",
    });

    const changeJson = JSON.parse(
      await readFile(
        join(deps.legacy.paths.changes, changeId, "change.json"),
        "utf-8",
      ),
    );
    expect(changeJson.deltas["collection-dashboard"]).toEqual([ADD_DELTA]);

    const summaryFiles = await readFile(
      join(deps.legacy.paths.summariesDir, changeId, "current.json"),
      "utf-8",
    );
    const pointer = JSON.parse(summaryFiles);
    expect(pointer.change_id).toBe(changeId);
    expect(pointer.snapshot_path).toContain(changeId);
  });
});
