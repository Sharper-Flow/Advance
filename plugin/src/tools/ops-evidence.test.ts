import { beforeEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { opsEvidenceTools } from "./ops-evidence";
import { parseToolOutput } from "../__tests__/setup";
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

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return { ...actual, getProjectId: mocks.getProjectId };
});

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
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
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
  const changesDir = "/tmp/project/.adv/changes";
  mkdirSync(join(changesDir, data.id), { recursive: true });
  writeFileSync(join(changesDir, data.id, "change.json"), JSON.stringify(data));
  return {
    paths: { root: "/tmp/project", changes: changesDir },
    changes: {
      get: vi.fn(async () => ({ success: true, data })),
      refresh: vi.fn(async () => {}),
    },
  } as unknown as Store;
}

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
