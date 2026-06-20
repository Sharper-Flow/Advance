import { beforeEach, describe, expect, test, vi } from "vitest";
import { opsEvidenceTools } from "./ops-evidence";
import { parseToolOutput } from "../__tests__/setup";
import { opsEvidenceAppendedSignal } from "../temporal/messages";
import type { Store } from "../storage/store";
import type { Change, OpsFollowupProfile } from "../types";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const temporalBundle = {
    client: { workflow: { getHandle: getHandleMock } },
  };
  return {
    signalMock,
    queryMock,
    handleMock,
    getHandleMock,
    temporalBundle,
    getService: vi.fn(() => temporalBundle),
    getProjectId: vi.fn(async () => "project-id"),
    fireSignalAndRefresh: vi.fn(async () => {}),
    getChangeHandle: vi.fn(() => handleMock),
  };
});

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

function makeProfile(
  overrides?: Partial<OpsFollowupProfile>,
): OpsFollowupProfile {
  return {
    kind: "other",
    source: {
      source_change_id: "sourceChange",
      source_kind: "manual",
      source_path: "/tmp/source",
    },
    relationship: "blocks",
    status: "not_started",
    created_at: "2026-06-20T04:00:00.000Z",
    evidence: [],
    ...overrides,
  };
}

function makeChange(overrides?: Partial<Change>): Change {
  return {
    id: "childChange",
    title: "Child change",
    status: "active",
    created_at: "2026-06-20T04:00:00.000Z",
    ops_followup: makeProfile({
      evidence: [
        {
          id: "oee-existing",
          recorded_at: "2026-06-20T04:00:00.000Z",
          env: "prod",
          action: "deploy",
          status: "started",
          summary: "Initial deploy",
        },
      ],
    }),
    ...overrides,
  } as Change;
}

function makeStore(change?: Change): Store {
  const data = change ?? makeChange();
  return {
    paths: { root: "/tmp/project", changes: "/tmp/project/.adv/changes" },
    changes: {
      get: vi.fn(async () => ({ success: true, data })),
      refresh: vi.fn(async () => {}),
    },
  } as unknown as Store;
}

describe("adv_ops_evidence_add", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("appends evidence and updates profile status", async () => {
    const store = makeStore();
    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_evidence_add.execute(
        {
          changeId: "childChange",
          env: "prod",
          action: "db migration",
          status: "partial",
          summary: "Migration partially applied",
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("partial");
    expect(result.entry.status).toBe("partial");
    expect(result.evidence_count).toBe(2);
    expect(result.entry).toMatchObject({
      env: "prod",
      action: "db migration",
      summary: "Migration partially applied",
    });
    expect(result.entry.id).toMatch(/^oee-/);
    expect(result.entry.recorded_at).toMatch(/^\d{4}-/);

    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    const call = mocks.fireSignalAndRefresh.mock.calls[0];
    expect(call[3]).toBe(opsEvidenceAppendedSignal);
    const payload = call[4] as {
      entry: { status: string };
      status: string;
      appendedAt: string;
    };
    expect(payload.status).toBe("partial");
    expect(payload.entry.status).toBe("partial");
  });

  test("maps failed status to entry fail and profile failed", async () => {
    const store = makeStore();
    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_evidence_add.execute(
        {
          changeId: "childChange",
          env: "prod",
          action: "smoke test",
          status: "failed",
          summary: "Smoke suite failed",
        },
        store,
      ),
    );

    expect(result.status).toBe("failed");
    expect(result.entry.status).toBe("fail");

    const payload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      entry: { status: string };
      status: string;
    };
    expect(payload.status).toBe("failed");
    expect(payload.entry.status).toBe("fail");
  });

  test("dry run returns preview without firing signal", async () => {
    const store = makeStore();
    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_evidence_add.execute(
        {
          changeId: "childChange",
          env: "staging",
          action: "deploy",
          status: "complete",
          summary: "Deployed",
          dryRun: true,
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.evidence_count).toBe(1);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects change without ops_followup profile", async () => {
    const store = makeStore(makeChange({ ops_followup: undefined }));
    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_evidence_add.execute(
        {
          changeId: "childChange",
          env: "prod",
          action: "x",
          status: "complete",
          summary: "y",
        },
        store,
      ),
    );

    expect(result.success).toBeUndefined();
    expect(result.error).toMatch(/no ops_followup profile/i);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects change not found", async () => {
    const store = {
      paths: { root: "/tmp/project", changes: "/tmp/project/.adv/changes" },
      changes: {
        get: vi.fn(async () => ({ success: false, error: "not found" })),
        refresh: vi.fn(async () => {}),
      },
    } as unknown as Store;

    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_evidence_add.execute(
        {
          changeId: "missing",
          env: "prod",
          action: "x",
          status: "complete",
          summary: "y",
        },
        store,
      ),
    );

    expect(result.success).toBeUndefined();
    expect(result.error).toMatch(/Change not found/i);
  });

  test("arg schema rejects invalid status", () => {
    const parsed =
      opsEvidenceTools.adv_ops_evidence_add.args.status.safeParse("invalid");
    expect(parsed.success).toBe(false);
  });

  test("arg schema rejects blank required fields", () => {
    for (const field of ["changeId", "env", "action", "status", "summary"]) {
      const schema =
        opsEvidenceTools.adv_ops_evidence_add.args[
          field as keyof typeof opsEvidenceTools.adv_ops_evidence_add.args
        ];
      const parsed = (
        schema as { safeParse: (v: unknown) => { success: boolean } }
      ).safeParse("");
      expect(parsed.success, field).toBe(false);
    }
  });

  test("optional fields are omitted from entry when blank", async () => {
    const store = makeStore();
    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_evidence_add.execute(
        {
          changeId: "childChange",
          env: "prod",
          action: "verify",
          status: "complete",
          summary: "Verified",
        },
        store,
      ),
    );

    expect(result.entry.batch).toBeUndefined();
    expect(result.entry.next_step).toBeUndefined();
    expect(result.entry.completion_signal).toBeUndefined();
  });

  test("includes optional fields in entry when provided", async () => {
    const store = makeStore();
    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_evidence_add.execute(
        {
          changeId: "childChange",
          env: "prod",
          action: "rollback",
          status: "rollback_needed",
          summary: "Rollback required",
          batch: "batch-42",
          next_step: "Run manual rollback playbook",
          completion_signal: "rollback-pr-merged",
        },
        store,
      ),
    );

    expect(result.entry.batch).toBe("batch-42");
    expect(result.entry.next_step).toBe("Run manual rollback playbook");
    expect(result.entry.completion_signal).toBe("rollback-pr-merged");
  });
});
