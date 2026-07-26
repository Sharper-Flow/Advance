import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { createDefaultGates, type Change } from "../types";
import type { Store } from "../storage/store-types";
import type { ChangeWorkflowState } from "../temporal/contracts";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../temporal/contracts";
import { evaluateGateReadiness } from "../temporal/gate-readiness";
import { changeToWorkflowState } from "../temporal/change-state";
import { loadChange } from "../storage/json";

const workflowHandle = vi.hoisted(() => ({
  signal: vi.fn(),
  query: vi.fn(),
  describe: vi.fn(),
}));

vi.mock("../temporal/service", () => ({
  getService: () => ({
    client: { workflow: { getHandle: () => workflowHandle } },
  }),
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: async () => "project-1",
}));

import { contractTools } from "./contract";
import { verificationEvidenceTools } from "./verification-evidence";

const approvedAt = "2026-05-21T05:21:11.743Z";
const changeId = "pairRaceChange";
const taskId = "tk-pair-1";
const contractItemId = "AC-PAIR-1";

function parse(output: string): Record<string, any> {
  return JSON.parse(output) as Record<string, any>;
}

function baseChange(): Change {
  return {
    id: changeId,
    title: "Pair race change",
    status: "draft",
    created_at: "2026-05-21T00:00:00.000Z",
    tasks: [
      {
        id: taskId,
        title: "Pair task",
        section: "Core",
        status: "done",
        priority: 0,
        deps: [],
        created_at: "2026-05-21T00:00:00.000Z",
        evidence_policy: "test" as never,
      },
    ],
    deltas: {},
    wisdom: [],
    gates: {
      ...createDefaultGates(),
      proposal: {
        status: "done",
        completed_at: approvedAt,
        completed_by: "agent",
      },
      discovery: {
        status: "done",
        completed_at: approvedAt,
        completed_by: "agent",
      },
      design: {
        status: "done",
        completed_at: approvedAt,
        completed_by: "agent",
      },
      planning: {
        status: "done",
        completed_at: approvedAt,
        completed_by: "agent",
      },
      execution: {
        status: "done",
        completed_at: approvedAt,
        completed_by: "agent",
      },
    },
    contract: {
      version: 1,
      rigor: "standard",
      source: { artifact: "agreement", approvedAt },
      items: [
        {
          id: contractItemId,
          kind: "acceptance_criterion",
          text: "Pair criterion",
          sourceArtifact: "agreement",
          verificationRequired: true,
          evidencePolicy: "test",
          status: "approved",
        },
      ],
      amendments: [],
    },
    subagent_reports: [
      {
        schema_version: "1.0",
        change_id: changeId,
        task_id: taskId,
        scope: { kind: "task", task_id: taskId },
        attempt: 1,
        agent: "adv-engineer",
        status: "complete",
        files_touched: ["src/foo.ts"],
        verification: [{ command: "pnpm test", exit_code: 0, summary: "pass" }],
        decisions: [],
        blockers: [],
        consumer_warnings: [
          {
            kind: "verification_missing",
            message:
              "No adv_run_test evidence found for reported command: pnpm test",
          },
        ],
        scope_drift: null,
        follow_ups: [],
        required_main_agent_actions: [],
        related_scan: "none",
        workdir_used: "/tmp/worktree",
        context_update_for_adv: {
          what_ads_needs_to_know: "x",
          suggested_next_action: "y",
        },
      } as unknown as Change["subagent_reports"][number],
    ],
  } as Change;
}

function createStore(change: Change, changesDir: string): Store {
  return {
    paths: { root: "/repo", changes: changesDir } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    changes: {
      get: vi.fn(async () => ({ success: true, data: change })),
      save: vi.fn(),
      refresh: vi.fn(async () => undefined),
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

function makeGetState(change: Change): ChangeWorkflowState {
  return changeToWorkflowState({
    projectId: "project-1",
    change,
  });
}

describe("incident-pair-migration", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    tempDir = undefined;
    workflowHandle.describe.mockReset();
    workflowHandle.signal.mockReset();
    workflowHandle.query.mockReset();
    workflowHandle.describe.mockResolvedValue({});
    workflowHandle.signal.mockRejectedValue(
      new Error("workflow execution already completed"),
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  test("concurrent contract matrix + verification disposition survive 100 iterations", async () => {
    for (let i = 0; i < 100; i++) {
      tempDir = await createTempDir("adv-pair-race-");
      const changesDir = join(tempDir, ".adv", "changes");
      const change = baseChange();
      await seedProjection(changesDir, change);
      const store = createStore(change, changesDir);

      // Each iteration simulates a captured base; the first getState call sees
      // the seeded state, and subsequent recovery reads see the latest disk
      // projection via commitChangeProjection.
      workflowHandle.query.mockImplementation(
        (queryName: string, receiptId?: string) => {
          if (
            queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt ||
            (typeof queryName === "object" &&
              queryName.name === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt)
          ) {
            return Promise.resolve(receiptId ? { id: receiptId } : undefined);
          }
          return Promise.resolve(makeGetState(change));
        },
      );

      const matrixPromise =
        contractTools.adv_contract_review_matrix_set.execute(
          {
            changeId,
            reviewedAt: approvedAt,
            rows: [
              {
                contractId: contractItemId,
                kind: "acceptance_criterion",
                status: "pass",
                evidencePolicy: "test",
                evidence: "reviewed",
              },
            ],
          },
          store,
        );

      const dispositionPromise =
        verificationEvidenceTools.adv_verification_evidence_disposition.execute(
          {
            changeId,
            taskId,
            concernKey: "verification",
            disposition: "fixed",
            evidence: "Rerun pnpm test passed",
          },
          store,
        );

      const [matrixOutputRaw, dispositionOutputRaw] = await Promise.all([
        matrixPromise,
        dispositionPromise,
      ]);

      const matrixOutput = parse(matrixOutputRaw);
      const dispositionOutput = parse(dispositionOutputRaw);

      expect(matrixOutput.success).toBe(true);
      expect(dispositionOutput.success).toBe(true);
      expect(matrixOutput.error).toBeUndefined();
      expect(dispositionOutput.error).toBeUndefined();

      const diskResult = await loadChange(changesDir, changeId);
      expect(diskResult.success).toBe(true);
      const disk = diskResult.data!;
      expect(disk.projection_revision).toBe(2);
      expect(disk.contract?.reviewMatrix?.rows).toHaveLength(1);
      expect(disk.contract?.reviewMatrix?.rows[0].status).toBe("pass");
      expect(disk.verification_evidence_dispositions).toHaveLength(1);
      expect(disk.verification_evidence_dispositions?.[0].disposition).toBe(
        "fixed",
      );

      // Downstream acceptance readiness must not report review-matrix or
      // verification-evidence blockers once both fields are present.
      const finalState = makeGetState(disk);
      const readiness = evaluateGateReadiness(finalState, "acceptance");
      const codes = readiness.blockers.map((b) => b.code);
      expect(codes).not.toContain("ACCEPTANCE_REVIEW_MATRIX_MISSING");
      expect(codes).not.toContain("ACCEPTANCE_REVIEW_MATRIX_INVALID");
      expect(codes).not.toContain("VERIFICATION_EVIDENCE_MISSING");

      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  }, 120000);
});
