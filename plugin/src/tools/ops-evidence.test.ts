import { beforeEach, describe, expect, test, vi } from "vitest";
import { opsEvidenceTools } from "./ops-evidence";
import { parseToolOutput } from "../__tests__/setup";
import {
  opsEvidenceAppendedSignal,
  opsRunEvidenceAppendedSignal,
  opsRunUpsertedSignal,
} from "../temporal/messages";
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
    runs: [],
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

describe("ops runbook tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("upserts a production run and defaults unclassified execute steps to approval-required", async () => {
    const store = makeStore();
    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_run_upsert.execute(
        {
          changeId: "childChange",
          runId: "run-1",
          title: "Run prod cleanup",
          env: "prod",
          action: "cleanup temp rows",
          bounds: ["batch=001"],
          evidence_policy: "summary_and_pointer",
          rollback_or_cleanup_plan: "rerun cleanup or restore backup snapshot",
          steps: [
            {
              id: "step-1",
              title: "Execute cleanup",
              kind: "execute",
            },
          ],
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.run.plan.env).toBe("prod");
    expect(result.run.steps[0].approval_policy).toMatchObject({
      mode: "approval_required",
    });
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fireSignalAndRefresh.mock.calls[0][3]).toBe(
      opsRunUpsertedSignal,
    );
  });

  test("rejects bounded autonomous step without bounds", () => {
    const parsed = opsEvidenceTools.adv_ops_run_upsert.args.steps.safeParse([
      {
        id: "step-1",
        title: "Read-only check",
        kind: "execute",
        approval_policy: {
          mode: "bounded_low_risk_autonomous",
          rationale: "allowlisted health read",
          bounds: [],
        },
      },
    ]);

    expect(parsed.success).toBe(false);
  });

  test("rejects approval-required execution evidence without approval", async () => {
    const store = makeStore(
      makeChange({
        ops_followup: makeProfile({
          runs: [
            {
              id: "run-1",
              title: "Run prod cleanup",
              status: "running",
              created_at: "2026-06-20T04:00:00.000Z",
              plan: {
                env: "prod",
                action: "cleanup temp rows",
                bounds: ["batch=001"],
                evidence_policy: "summary_and_pointer",
                rollback_or_cleanup_plan:
                  "rerun cleanup or restore backup snapshot",
              },
              steps: [
                {
                  id: "step-1",
                  title: "Execute cleanup",
                  kind: "execute",
                  status: "pending",
                  approval_policy: { mode: "approval_required" },
                },
              ],
              evidence: [],
            },
          ],
        }),
      }),
    );

    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_run_evidence_add.execute(
        {
          changeId: "childChange",
          runId: "run-1",
          step_id: "step-1",
          step_kind: "execute",
          env: "prod",
          status: "complete",
          summary: "Cleanup complete",
          artifact: { kind: "none", rationale: "No external artifact emitted" },
          next_status: "complete",
        },
        store,
      ),
    );

    expect(result.error).toMatch(/approval/i);
    expect(result.code).toBe("OPS_RUN_APPROVAL_REQUIRED");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("appends secret-safe run evidence and updates status", async () => {
    const store = makeStore(
      makeChange({
        ops_followup: makeProfile({
          runs: [
            {
              id: "run-1",
              title: "Run prod cleanup",
              status: "running",
              created_at: "2026-06-20T04:00:00.000Z",
              plan: {
                env: "prod",
                action: "cleanup temp rows",
                bounds: ["batch=001"],
                evidence_policy: "summary_and_pointer",
                rollback_or_cleanup_plan:
                  "rerun cleanup or restore backup snapshot",
              },
              steps: [
                {
                  id: "step-1",
                  title: "Execute cleanup",
                  kind: "execute",
                  status: "pending",
                  approval_policy: {
                    mode: "approval_required",
                    approval_evidence: "User approved batch=001 cleanup",
                  },
                },
              ],
              evidence: [],
            },
          ],
        }),
      }),
    );

    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_run_evidence_add.execute(
        {
          changeId: "childChange",
          runId: "run-1",
          step_id: "step-1",
          step_kind: "execute",
          env: "prod",
          status: "complete",
          summary: "Cleanup complete",
          artifact: { kind: "none", rationale: "No external artifact emitted" },
          next_status: "complete",
          completion_signal: "cleanup job finished",
          health_verification: "row count is zero",
          rollback_or_cleanup_disposition:
            "cleanup complete; no rollback needed",
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.entry.artifact.kind).toBe("none");
    expect(result.status).toBe("complete");
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fireSignalAndRefresh.mock.calls[0][3]).toBe(
      opsRunEvidenceAppendedSignal,
    );
  });

  test("rejects evidence summaries that look like secret material", async () => {
    const store = makeStore();
    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_run_evidence_add.execute(
        {
          changeId: "childChange",
          runId: "run-1",
          step_kind: "execute",
          env: "prod",
          status: "partial",
          summary: "password=super-secret-value",
          artifact: { kind: "none", rationale: "No external artifact emitted" },
          next_status: "partial",
        },
        store,
      ),
    );

    expect(result.code).toBe("UNSAFE_OPS_EVIDENCE");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects secret-like material in artifact pointers and completion proof fields", async () => {
    const store = makeStore(
      makeChange({
        ops_followup: makeProfile({
          runs: [
            {
              id: "run-1",
              title: "Run prod cleanup",
              status: "running",
              created_at: "2026-06-20T04:00:00.000Z",
              plan: {
                env: "prod",
                action: "cleanup temp rows",
                bounds: ["batch=001"],
                evidence_policy: "summary_and_pointer",
                rollback_or_cleanup_plan:
                  "rerun cleanup or restore backup snapshot",
              },
              steps: [
                {
                  id: "step-1",
                  title: "Execute cleanup",
                  kind: "execute",
                  status: "pending",
                  approval_policy: {
                    mode: "approval_required",
                    approval_evidence: "User approved batch=001 cleanup",
                  },
                },
              ],
              evidence: [],
            },
          ],
        }),
      }),
    );

    const result = parseToolOutput(
      await opsEvidenceTools.adv_ops_run_evidence_add.execute(
        {
          changeId: "childChange",
          runId: "run-1",
          step_id: "step-1",
          step_kind: "execute",
          env: "prod",
          status: "complete",
          summary: "Cleanup complete",
          artifact: {
            kind: "pointer",
            uri: "s3://ops-bucket/cleanup.log?token=super-secret-value",
          },
          next_status: "complete",
          completion_signal: "cleanup job finished",
          health_verification: "row count is zero",
          rollback_or_cleanup_disposition:
            "cleanup complete; no rollback needed",
        },
        store,
      ),
    );

    expect(result.code).toBe("UNSAFE_OPS_EVIDENCE");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });
});
