import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  saveRecoveredArtifactMetadata,
  saveRecoveredChangeStatus,
  saveRecoveredContractReviewMatrix,
  saveRecoveredDesignConcernDisposition,
  saveRecoveredGateCompletion,
  saveRecoveredSubagentReport,
  saveRecoveredTaskAdd,
  saveRecoveredTaskMutation,
  saveRecoveredVerificationEvidenceDisposition,
} from "./_recovery-writers";
import type { Change } from "../types";
import { ChangeSchema } from "../types/changes";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { Store } from "../storage/store-types";

function baseChange(): Change {
  return ChangeSchema.parse({
    id: "test-change",
    title: "Test",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [
      {
        id: "tk-1",
        title: "First task",
        type: "code",
        section: "Implementation",
        status: "pending",
        priority: 0,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "done" },
      release: { status: "pending" },
    },
  });
}

function createStore(changesDir: string): Store {
  return {
    paths: { root: "/tmp/test", changes: changesDir },
    config: null,
    init: async () => {},
    sync: async () => {},
    close: async () => {},
    flush: async () => {},
    changes: {
      get: async () => ({ success: true, data: null }),
      save: async () => {},
      refresh: async () => undefined,
    },
  } as unknown as Store;
}

async function seedProjection(
  changesDir: string,
  change: Change,
): Promise<void> {
  const changeDir = join(changesDir, change.id);
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    join(changeDir, "change.json"),
    JSON.stringify(change, null, 2),
    "utf-8",
  );
}

describe("recovery writers via conditional projection commit", () => {
  let tempDir: string;
  let changesDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir("recovery-writers-");
    changesDir = join(tempDir, ".adv", "changes");
    store = createStore(changesDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("saveRecoveredTaskMutation", () => {
    it("mutates an existing task and persists the updated change", async () => {
      await seedProjection(changesDir, baseChange());

      const updated = await saveRecoveredTaskMutation({
        store,
        change: baseChange(),
        taskId: "tk-1",
        mutate: (task) => ({ ...task, status: "done" }),
      });

      expect(updated.tasks[0].status).toBe("done");
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.tasks[0].status).toBe("done");
      expect(disk.projection_revision).toBe(1);
    });

    it("throws when the task is not present", async () => {
      await seedProjection(changesDir, baseChange());

      await expect(
        saveRecoveredTaskMutation({
          store,
          change: baseChange(),
          taskId: "tk-missing",
          mutate: (task) => task,
        }),
      ).rejects.toThrow(/not present in change/);
    });
  });

  describe("saveRecoveredTaskAdd", () => {
    it("appends a new task and persists", async () => {
      await seedProjection(changesDir, baseChange());
      const newTask = {
        id: "tk-2",
        title: "Second",
        type: "code",
        section: "Implementation",
        status: "pending",
        priority: 1,
        created_at: "2026-01-02T00:00:00Z",
      } as Change["tasks"][number];

      const updated = await saveRecoveredTaskAdd({
        store,
        change: baseChange(),
        task: newTask,
      });

      expect(updated.tasks).toHaveLength(2);
      expect(updated.tasks[1].id).toBe("tk-2");
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.tasks).toHaveLength(2);
      expect(disk.projection_revision).toBe(1);
    });

    it("rejects duplicate task IDs", async () => {
      await seedProjection(changesDir, baseChange());
      const change = baseChange();
      await expect(
        saveRecoveredTaskAdd({
          store,
          change,
          task: { ...change.tasks[0] },
        }),
      ).rejects.toThrow(/already present/);
    });
  });

  describe("saveRecoveredGateCompletion", () => {
    it("replaces gate completion fields through conditional commit", async () => {
      await seedProjection(changesDir, baseChange());

      const updated = await saveRecoveredGateCompletion({
        store,
        change: baseChange(),
        authorization: {
          reason: "completed_workflow_release_gate_recovery",
          evidence:
            "WorkflowNotFoundError: workflow execution already completed",
        },
        gateId: "release",
        completion: {
          status: "done",
          completed_at: "2026-05-22T00:00:00Z",
          completed_by: "user:jon",
          approval_evidence: "recovery",
        },
      });

      expect(updated.gates?.release?.status).toBe("done");
      expect(updated.gates?.release?.completed_by).toBe("user:jon");
      expect(updated.gates?.release?.recovery_audit).toMatchObject({
        reason: "completed_workflow_release_gate_recovery",
        evidence: "WorkflowNotFoundError: workflow execution already completed",
      });
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.projection_revision).toBe(1);
      expect(disk.gates.release.status).toBe("done");
    });

    it("requires recovery authorization", async () => {
      await seedProjection(changesDir, baseChange());
      const change = baseChange();

      await expect(
        saveRecoveredGateCompletion({
          store,
          change,
          gateId: "release",
          completion: { status: "done" },
        } as any),
      ).rejects.toThrow(/recovery authorization/);
    });
  });

  describe("saveRecoveredArtifactMetadata", () => {
    it("repairs artifact metadata through conditional commit", async () => {
      await seedProjection(changesDir, baseChange());

      const updated = await saveRecoveredArtifactMetadata({
        store,
        change: baseChange(),
        authorization: {
          reason: "completed_workflow_artifact_metadata_recovery",
          evidence: "WorkflowExecutionAlreadyCompleted",
        },
        kind: "executiveSummary",
        metadata: {
          path: "/tmp/test/.adv/changes/test-change/executive-summary.md",
          updatedAt: "2026-05-22T00:00:00Z",
          contentHash: "a".repeat(64),
        },
      });

      expect(updated.artifacts?.executiveSummary).toMatchObject({
        contentHash: "a".repeat(64),
      });
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.projection_revision).toBe(1);
      expect(disk.artifacts.executiveSummary.contentHash).toBe("a".repeat(64));
    });

    it("requires recovery authorization", async () => {
      await seedProjection(changesDir, baseChange());
      await expect(
        saveRecoveredArtifactMetadata({
          store,
          change: baseChange(),
          kind: "executiveSummary",
          metadata: {
            path: "/tmp/executive-summary.md",
            updatedAt: "2026-05-22T00:00:00Z",
            contentHash: "a".repeat(64),
          },
        } as any),
      ).rejects.toThrow(/recovery authorization/);
    });
  });

  describe("saveRecoveredChangeStatus", () => {
    it("transitions status via conditional commit", async () => {
      await seedProjection(changesDir, baseChange());

      const updated = await saveRecoveredChangeStatus({
        store,
        change: baseChange(),
        authorization: {
          reason: "poisoned_history_status_recovery",
          evidence: "TMPRL1100 nondeterministic workflow history",
        },
        status: "archived",
      });

      expect(updated.status).toBe("archived");
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.projection_revision).toBe(1);
      expect(disk.status).toBe("archived");
    });

    it("writes lifecycleState alongside status when provided", async () => {
      await seedProjection(changesDir, baseChange());
      const change = { ...baseChange(), lifecycleState: "open" } as Change;

      const updated = await saveRecoveredChangeStatus({
        store,
        change,
        authorization: {
          reason: "shipped_terminal_workflow_termination",
          evidence: "adv_change_workflow_terminate completed",
        },
        status: "archived",
        lifecycleState: "archived",
      });

      expect(updated.status).toBe("archived");
      expect(updated.lifecycleState).toBe("archived");
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.lifecycleState).toBe("archived");
    });

    it("requires recovery authorization", async () => {
      await seedProjection(changesDir, baseChange());
      await expect(
        saveRecoveredChangeStatus({
          store,
          change: baseChange(),
          status: "archived",
        } as any),
      ).rejects.toThrow(/recovery authorization/);
    });
  });

  describe("saveRecoveredDesignConcernDisposition", () => {
    it("records latest-wins disposition through conditional commit", async () => {
      await seedProjection(changesDir, baseChange());
      const change = baseChange();

      const updated = await saveRecoveredDesignConcernDisposition({
        store,
        change,
        authorization: {
          reason: "poisoned_history_design_concern_recovery",
          evidence: "TMPRL1100",
        },
        disposition: {
          taskId: "tk-1",
          concernKey: "concern-a",
          disposition: "fixed",
          evidence: "addressed",
          dispositionedAt: "2026-05-22T00:00:00Z",
        },
      });

      expect(updated.design_concern_dispositions).toHaveLength(1);
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.projection_revision).toBe(1);
      expect(disk.design_concern_dispositions[0].disposition).toBe("fixed");
    });

    it("requires recovery authorization", async () => {
      await seedProjection(changesDir, baseChange());
      await expect(
        saveRecoveredDesignConcernDisposition({
          store,
          change: baseChange(),
          disposition: {
            taskId: "tk-1",
            concernKey: "concern-a",
            disposition: "accepted",
            evidence: "addressed",
            dispositionedAt: "2026-05-22T00:00:00Z",
          },
        } as any),
      ).rejects.toThrow(/recovery authorization/);
    });
  });

  describe("saveRecoveredVerificationEvidenceDisposition", () => {
    it("records latest-wins disposition through conditional commit", async () => {
      await seedProjection(changesDir, baseChange());
      const change = baseChange();

      const updated = await saveRecoveredVerificationEvidenceDisposition({
        store,
        change,
        authorization: {
          reason: "poisoned_history_verification_evidence_recovery",
          evidence: "TMPRL1100",
        },
        disposition: {
          taskId: "tk-1",
          concernKey: "verification",
          disposition: "fixed",
          evidence: "reran tests",
          dispositionedAt: "2026-05-22T00:00:00Z",
        },
      });

      expect(updated.verification_evidence_dispositions).toHaveLength(1);
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.projection_revision).toBe(1);
      expect(disk.verification_evidence_dispositions[0].disposition).toBe(
        "fixed",
      );
    });

    it("two serial dispositions on different taskIds both persist", async () => {
      await seedProjection(changesDir, baseChange());
      const change = baseChange();

      const first = {
        taskId: "tk-1",
        concernKey: "verification",
        disposition: "fixed" as const,
        evidence: "reran tests",
        dispositionedAt: "2026-05-22T00:00:00Z",
      };
      await saveRecoveredVerificationEvidenceDisposition({
        store,
        change,
        authorization: {
          reason: "poisoned_history_verification_evidence_recovery",
          evidence: "TMPRL1100",
        },
        disposition: first,
      });

      const secondTask = { ...change.tasks[0], id: "tk-2" };
      await saveRecoveredTaskAdd({
        store,
        change,
        task: secondTask,
      });

      await saveRecoveredVerificationEvidenceDisposition({
        store,
        change,
        authorization: {
          reason: "poisoned_history_verification_evidence_recovery",
          evidence: "TMPRL1100",
        },
        disposition: {
          ...first,
          taskId: "tk-2",
        },
      });

      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.verification_evidence_dispositions).toHaveLength(2);
      expect(disk.projection_revision).toBe(3);
      expect(() => ChangeSchema.parse(disk)).not.toThrow();
    });

    it("requires recovery authorization", async () => {
      await seedProjection(changesDir, baseChange());
      await expect(
        saveRecoveredVerificationEvidenceDisposition({
          store,
          change: baseChange(),
          disposition: {
            taskId: "tk-1",
            concernKey: "verification",
            disposition: "fixed",
            evidence: "reran tests",
            dispositionedAt: "2026-05-22T00:00:00Z",
          },
        } as any),
      ).rejects.toThrow(/recovery authorization/);
    });
  });

  describe("saveRecoveredContractReviewMatrix", () => {
    function changeWithContract(): Change {
      return {
        ...baseChange(),
        contract: {
          version: 1,
          rigor: "standard" as const,
          source: { artifact: "agreement", approvedAt: "2026-05-22T00:00:00Z" },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion" as const,
              text: "Criterion one",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test" as const,
              status: "approved" as const,
            },
          ],
          amendments: [],
        },
      } as Change;
    }

    it("records a review matrix with a recovery_audit marker through conditional commit", async () => {
      const change = changeWithContract();
      await seedProjection(changesDir, change);

      const reviewMatrix = {
        reviewedAt: "2026-05-22T00:00:00Z",
        rows: [
          {
            contractId: "AC1",
            kind: "acceptance_criterion" as const,
            status: "pass" as const,
            evidencePolicy: "test" as const,
            evidence: "reran tests",
          },
        ],
      };

      const updated = await saveRecoveredContractReviewMatrix({
        store,
        change,
        authorization: {
          reason: "poisoned_history_contract_review_matrix_recovery",
          evidence: "TMPRL1100",
        },
        reviewMatrix,
      });

      expect(updated.contract?.reviewMatrix).toMatchObject(reviewMatrix);
      expect(updated.contract?.reviewMatrix?.recovery_audit).toMatchObject({
        reason: "poisoned_history_contract_review_matrix_recovery",
        evidence: "TMPRL1100",
      });
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.projection_revision).toBe(1);
      expect(disk.contract.reviewMatrix.rows).toHaveLength(1);
      expect(disk.contract.reviewMatrix.recovery_audit).toBeDefined();
      expect(() => ChangeSchema.parse(disk)).not.toThrow();
    });

    it("stores recovery authority reason and evidence in projection_commits", async () => {
      const change = changeWithContract();
      await seedProjection(changesDir, change);

      const reviewMatrix = {
        reviewedAt: "2026-05-22T00:00:00Z",
        rows: [
          {
            contractId: "AC1",
            kind: "acceptance_criterion" as const,
            status: "pass" as const,
            evidencePolicy: "test" as const,
            evidence: "reran tests",
          },
        ],
      };

      await saveRecoveredContractReviewMatrix({
        store,
        change,
        authorization: {
          reason: "poisoned_history_contract_review_matrix_recovery",
          evidence: "TMPRL1100",
        },
        reviewMatrix,
      });

      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      const commit = disk.projection_commits?.[0];
      expect(commit).toBeDefined();
      expect(commit.authority_kind).toBe("recovery");
      expect(commit.authority_reason).toBe(
        "poisoned_history_contract_review_matrix_recovery",
      );
      expect(commit.authority_evidence).toBe("TMPRL1100");
      expect(commit.payload).toBeUndefined();
    });

    it("requires recovery authorization", async () => {
      await seedProjection(changesDir, changeWithContract());
      await expect(
        saveRecoveredContractReviewMatrix({
          store,
          change: changeWithContract(),
          reviewMatrix: {
            reviewedAt: "2026-05-22T00:00:00Z",
            rows: [
              {
                contractId: "AC1",
                kind: "acceptance_criterion",
                status: "pass",
                evidencePolicy: "test",
                evidence: "reran tests",
              },
            ],
          },
        } as any),
      ).rejects.toThrow(/recovery authorization/);
    });
  });

  describe("saveRecoveredSubagentReport", () => {
    const report = {
      schema_version: "1.0",
      change_id: "test-change",
      task_id: "tk-1",
      scope: { kind: "task", task_id: "tk-1" },
      attempt: 1,
      agent: "adv-engineer",
      status: "complete",
      files_touched: ["src/foo.ts"],
      verification: [{ command: "pnpm test", exit_code: 0, summary: "pass" }],
      decisions: [],
      blockers: [],
      scope_drift: null,
      follow_ups: [],
      required_main_agent_actions: [],
      related_scan: "none",
      workdir_used: "/tmp/worktree",
      context_update_for_adv: {
        what_ads_needs_to_know: "x",
        suggested_next_action: "y",
      },
    } as unknown as Change["subagent_reports"][number];

    it("writes to the active changes dir for a closed change", async () => {
      await seedProjection(changesDir, baseChange());

      const updated = await saveRecoveredSubagentReport({
        store,
        change: baseChange(),
        report,
        authorization: {
          reason: "completed_workflow_subagent_report_recovery",
          evidence: "WorkflowExecutionAlreadyCompleted",
        },
      });

      expect(updated.tasks[0].subagent_reports).toHaveLength(1);
      const disk = JSON.parse(
        await readFile(join(changesDir, "test-change", "change.json"), "utf-8"),
      );
      expect(disk.projection_revision).toBe(1);
      expect(disk.tasks[0].subagent_reports[0].agent).toBe("adv-engineer");
      expect(
        disk.tasks[0].subagent_reports[0].recovery_audit.persisted_via,
      ).toBe("active-projection");
    });

    it("writes to the archive bundle when a bundle exists", async () => {
      const archiveDir = join(tempDir, ".adv", "archive");
      const bundleDir = join(archiveDir, "2026-01-01-test-change");
      await mkdir(bundleDir, { recursive: true });
      const archivedChange = {
        ...baseChange(),
        status: "archived",
        lifecycleState: "archived",
      } as Change;
      await writeFile(
        join(bundleDir, "change.json"),
        JSON.stringify(archivedChange, null, 2),
        "utf-8",
      );

      const _updated = await saveRecoveredSubagentReport({
        store: {
          ...store,
          paths: { ...store.paths, archive: archiveDir },
        },
        change: baseChange(),
        report,
        authorization: {
          reason: "post_archive_report_persist_race_fallback",
          evidence: "workflow execution already completed",
        },
      });

      const persisted = JSON.parse(
        await readFile(join(bundleDir, "change.json"), "utf-8"),
      );
      const taskReports = persisted.tasks[0].subagent_reports;
      expect(taskReports).toHaveLength(1);
      expect(taskReports[0].recovery_audit.persisted_via).toBe(
        "archive-sidecar",
      );
      expect(() => ChangeSchema.parse(persisted)).not.toThrow();
    });

    it("requires recovery authorization", async () => {
      await seedProjection(changesDir, baseChange());
      await expect(
        saveRecoveredSubagentReport({
          store,
          change: baseChange(),
          report,
        } as any),
      ).rejects.toThrow(/recovery authorization/);
    });
  });
});
