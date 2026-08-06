/**
 * Tests for adv_change_repair_origin (AC2).
 *
 * Verifies the audited, claim-safe active/open origin repair path:
 *   - audit fields are required
 *   - origin linkage matrix is enforced
 *   - archived/closed changes are rejected (OOS2)
 *   - conflicting open issue claims are rejected with existing claimant evidence
 *   - same-change idempotent repair is allowed
 *   - originRepairedSignal is fired with audit payload
 *   - dryRun previews without mutation
 *   - target_path routes through the target store
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { changeTools } from "./change";
import { originRepairedSignal } from "../temporal/messages";
import type { Change, Store } from "../types";
import type { ChangeState } from "../types/change-state";
import { parseToolOutput } from "../__tests__/setup";

const mocks = vi.hoisted(() => ({
  getService: vi.fn(() => temporalBundle),
  getProjectId: vi.fn(async () => "test-project-id"),
  fireSignalAndRefresh: vi.fn(async () => {}),
  getChangeHandle: vi.fn(() => handleMock),
  withTargetPathStore: vi.fn(),
  signalMock: vi.fn(),
  queryMock: vi.fn(),
}));

const handleMock = {
  signal: mocks.signalMock,
  query: mocks.queryMock,
};
const temporalBundle = {
  client: { workflow: { getHandle: vi.fn(() => handleMock) } },
};

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return { ...actual, getProjectId: mocks.getProjectId };
});

vi.mock("./_adapters", () => ({
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  getChangeHandle: mocks.getChangeHandle,
}));

vi.mock("./target-project", async () => {
  const actual =
    await vi.importActual<typeof import("./target-project")>(
      "./target-project",
    );
  return { ...actual, withTargetPathStore: mocks.withTargetPathStore };
});

function createMockStore(change: Change): Store {
  return {
    paths: {
      root: "/tmp/main",
      changes: "/tmp/main/.adv/changes",
      archive: "/tmp/main/.adv/archive",
    } as Store["paths"],
    config: { name: "test", features: {} } as Store["config"],
    changes: {
      get: vi.fn(async (_changeId: string) => ({
        success: true,
        data: change,
      })),
      list: vi.fn(async () => ({ changes: [change] })),
      save: vi.fn(),
      refresh: vi.fn(),
    } as unknown as Store["changes"],
  } as unknown as Store;
}

function activeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "repairMe",
    title: "Repair origin change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    } as Change["gates"],
    ...overrides,
  } as Change;
}

const REPAIR_EVIDENCE = "operator approved origin repair in chat";
const REPAIR_REASON = "origin was missing issue number at create time";

describe("adv_change_repair_origin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockReturnValue(temporalBundle);
    mocks.fireSignalAndRefresh.mockImplementation(async () => {});
  });

  test("requires approvalEvidence and reason", async () => {
    const store = createMockStore(activeChange());

    const missingEvidence = await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "triage",
        origin_issue_number: 42,
        approvedByUser: true,
        reason: REPAIR_REASON,
      } as any,
      store,
    );
    expect(parseToolOutput(missingEvidence).error).toContain(
      "approvalEvidence is required",
    );

    const missingReason = await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "triage",
        origin_issue_number: 42,
        approvalEvidence: REPAIR_EVIDENCE,
        approvedByUser: true,
      } as any,
      store,
    );
    expect(parseToolOutput(missingReason).error).toContain(
      "reason is required",
    );
  });

  test("enforces origin linkage matrix", async () => {
    const store = createMockStore(activeChange());

    const retiredRoadmap = await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "roadmap",
        origin_issue_number: 42,
        approvalEvidence: REPAIR_EVIDENCE,
        approvedByUser: true,
        reason: REPAIR_REASON,
      },
      store,
    );
    expect(parseToolOutput(retiredRoadmap).error).toContain(
      "ORIGIN_KIND_ROADMAP_RETIRED",
    );

    const discoveryWithIssue =
      await changeTools.adv_change_repair_origin.execute(
        {
          changeId: "repairMe",
          origin_kind: "discovery",
          origin_issue_number: 42,
          approvalEvidence: REPAIR_EVIDENCE,
          approvedByUser: true,
          reason: REPAIR_REASON,
        },
        store,
      );
    expect(parseToolOutput(discoveryWithIssue).error).toMatch(
      /origin_issue_number is only allowed/,
    );

    const adhocWithArtifact =
      await changeTools.adv_change_repair_origin.execute(
        {
          changeId: "repairMe",
          origin_kind: "adhoc",
          origin_source_artifact: "ag-1",
          approvalEvidence: REPAIR_EVIDENCE,
          approvedByUser: true,
          reason: REPAIR_REASON,
        },
        store,
      );
    expect(parseToolOutput(adhocWithArtifact).error).toMatch(
      /origin linkage fields are not allowed/,
    );
  });

  test("rejects archived and closed changes (OOS2)", async () => {
    for (const status of ["archived", "closed"] as const) {
      const store = createMockStore(activeChange({ status }));
      const result = await changeTools.adv_change_repair_origin.execute(
        {
          changeId: "repairMe",
          origin_kind: "discovery",
          approvalEvidence: REPAIR_EVIDENCE,
          approvedByUser: true,
          reason: REPAIR_REASON,
        },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.error).toContain(`Cannot repair origin of ${status}`);
      expect(parsed.error).toContain("active/open changes only");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    }
  });

  test("rejects conflicting open issue claims with existing claimant evidence", async () => {
    const store = createMockStore(activeChange());
    const claimChecker = vi
      .fn()
      .mockResolvedValue([{ changeId: "otherChange", status: "active" }]);

    const result = await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "triage",
        origin_issue_number: 99,
        approvalEvidence: REPAIR_EVIDENCE,
        approvedByUser: true,
        reason: REPAIR_REASON,
      },
      store,
      undefined,
      { claimChecker },
    );

    const parsed = parseToolOutput(result);
    expect(parsed.error).toContain("already claimed by change otherChange");
    expect(parsed.code).toBe("ORIGIN_CLAIM_CONFLICT");
    expect(parsed.existing_change_id).toBe("otherChange");
    expect(parsed.existing_change_status).toBe("active");
    expect(parsed.issue_number).toBe(99);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("allows idempotent repair when this change already holds the claim", async () => {
    const store = createMockStore(activeChange());
    const claimChecker = vi
      .fn()
      .mockResolvedValue([{ changeId: "repairMe", status: "active" }]);

    const result = await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "triage",
        origin_issue_number: 99,
        approvalEvidence: REPAIR_EVIDENCE,
        approvedByUser: true,
        reason: REPAIR_REASON,
      },
      store,
      undefined,
      { claimChecker },
    );

    const parsed = parseToolOutput(result);
    expect(parsed.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });

  test("fires originRepairedSignal with audit payload and origin", async () => {
    const change = activeChange();
    const store = createMockStore(change);

    await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "triage",
        origin_issue_number: 7,
        origin_source_artifact: "ag-abc",
        approvalEvidence: REPAIR_EVIDENCE,
        approvedByUser: true,
        reason: REPAIR_REASON,
      },
      store,
    );

    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    const [handle, calledStore, changeId, signal, payload] =
      mocks.fireSignalAndRefresh.mock.calls[0];
    expect(handle).toBe(handleMock);
    expect(calledStore).toBe(store);
    expect(changeId).toBe("repairMe");
    expect(signal).toBe(originRepairedSignal);
    expect(payload.origin).toEqual({
      kind: "triage",
      issue_number: 7,
      source_artifact: "ag-abc",
    });
    expect(payload.approvalEvidence).toBe(REPAIR_EVIDENCE);
    expect(payload.reason).toBe(REPAIR_REASON);
    expect(payload.repairedBy).toBe("agent");
    expect(typeof payload.repairedAt).toBe("string");
    expect(payload.previousOrigin).toBeUndefined();
  });

  test("captures previous origin in signal payload when present", async () => {
    const previous = { kind: "adhoc" } as const;
    const store = createMockStore(activeChange({ origin: previous }));

    await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "triage",
        origin_issue_number: 55,
        approvalEvidence: REPAIR_EVIDENCE,
        approvedByUser: true,
        reason: REPAIR_REASON,
      },
      store,
    );

    const payload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      previousOrigin: ChangeState["origin"];
    };
    expect(payload.previousOrigin).toEqual(previous);
  });

  test("dryRun previews without firing a signal", async () => {
    const previous = { kind: "adhoc" } as const;
    const store = createMockStore(activeChange({ origin: previous }));

    const result = await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "triage",
        origin_issue_number: 55,
        approvalEvidence: REPAIR_EVIDENCE,
        approvedByUser: true,
        reason: REPAIR_REASON,
        dryRun: true,
      },
      store,
    );

    const parsed = parseToolOutput(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.previousOrigin).toEqual(previous);
    expect(parsed.origin).toEqual({ kind: "triage", issue_number: 55 });
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("target_path routes through target store with trust rules", async () => {
    const targetStore = createMockStore(activeChange({ status: "draft" }));
    mocks.withTargetPathStore.mockImplementation(async (_input, fn) =>
      fn({
        context: {
          root: "/target/project",
          projectId: "target-project-id",
          externalRoot: "/target/external",
          trusted: true,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    );

    const result = await changeTools.adv_change_repair_origin.execute(
      {
        changeId: "repairMe",
        origin_kind: "triage",
        origin_issue_number: 55,
        approvalEvidence: REPAIR_EVIDENCE,
        approvedByUser: true,
        reason: REPAIR_REASON,
        target_path: "/target/project",
        target_confirmed: true,
        confirmationEvidence: "user approved target repair",
      },
      createMockStore(activeChange()),
    );

    const parsed = parseToolOutput(result);
    expect(parsed.success).toBe(true);
    expect(mocks.withTargetPathStore).toHaveBeenCalledTimes(1);
    const call = mocks.withTargetPathStore.mock.calls[0][0];
    expect(call.target_path).toBe("/target/project");
    expect(call.target_confirmed).toBe(true);
    expect(call.stateRequirement).toBe("authoritative");
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fireSignalAndRefresh.mock.calls[0][1]).toBe(targetStore);
  });
});
