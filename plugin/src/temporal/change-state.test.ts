import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applySubagentReportSubmittedToState,
  applyContractAmendedToState,
  applyGateReenteredToState,
  applyProposalUpdatedToState,
  applyTaskAddedToState,
  applyTaskCompletedToState,
  applyTestRunRecordedToState,
  changeSeedStateFromChange,
  completeGateInChangeState,
  createChangeWorkflowState,
  updateArtifactMetadataInChangeState,
} from "./change-state";
import type { Change, ChangeOrigin } from "../types";
import type { ChangeWorkflowInput } from "./contracts";

const sourcePath = fileURLToPath(new URL("./change-state.ts", import.meta.url));

function makeEngineerReport(changeId: string, taskId: string) {
  return {
    schema_version: "1.0" as const,
    change_id: changeId,
    task_id: taskId,
    scope: { kind: "task" as const, task_id: taskId },
    attempt: 1,
    agent: "adv-engineer" as const,
    status: "complete" as const,
    files_touched: ["plugin/src/temporal/change-state.ts"],
    verification: [
      {
        command: "pnpm exec vitest run src/temporal/change-state.test.ts",
        exit_code: 0,
        summary: "passed",
      },
    ],
    decisions: [],
    blockers: [],
    follow_ups: [],
    related_scan: "none",
    workdir_used: "/tmp/worktree",
    context_update_for_adv: {
      what_ads_needs_to_know: "Report persisted",
      suggested_next_action: "Continue",
    },
  };
}

function makeResearcherReport(changeId: string) {
  return {
    schema_version: "1.0" as const,
    change_id: changeId,
    scope: { kind: "change" as const, scope_key: "researcher:temporal-docs" },
    attempt: 1,
    agent: "adv-researcher" as const,
    topic: "Temporal docs",
    sources: [
      {
        label: "Temporal docs",
        locator: "https://docs.temporal.io/",
        summary: "Replay-safe signals require deterministic state mutation.",
      },
    ],
    architecture_assessment: "Sidecar persistence avoids task payload bloat.",
    validation: { status: "pass" as const, blockers: [], notes: "ok" },
    recommendation: "Persist as change-scoped sidecar report.",
    follow_ups: [],
    workdir_used: "/tmp/worktree",
  };
}

describe("change-state pure mutation helpers", () => {
  it("keeps workflow and I/O imports out of the mutation module", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toContain("@temporalio/");
    expect(source).not.toContain("../storage/");
    expect(source).not.toContain("../tools/");
    expect(source).not.toContain("node:");
  });

  it("uses an exhaustive agent switch for sub-agent blocker summaries", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("function assertNeverSubagentReport");
    expect(source).toContain("switch (report.agent)");
    expect(source).toContain("default:");
  });

  it("records Temporal-only content metadata without empty artifact paths", () => {
    const state = createChangeWorkflowState({
      changeId: "temporal-artifact-metadata",
      title: "Temporal artifact metadata",
      createdAt: "2026-06-15T00:00:00.000Z",
    });

    applyProposalUpdatedToState(state, {
      text: "# Proposal\n\nTemporal-only content.",
      updatedAt: "2026-06-15T00:00:01.000Z",
    });

    expect(state.artifacts.proposal).toEqual(
      expect.objectContaining({
        updatedAt: "2026-06-15T00:00:01.000Z",
        source: "temporal",
        readable: false,
      }),
    );
    expect(state.artifacts.proposal).not.toHaveProperty("path");
  });

  it("normalizes blank artifact metadata paths as unreadable Temporal metadata", () => {
    const state = createChangeWorkflowState({
      changeId: "blank-artifact-path",
      title: "Blank artifact path",
      createdAt: "2026-06-15T00:00:00.000Z",
    });

    updateArtifactMetadataInChangeState(state, "proposal", {
      path: "",
      updatedAt: "2026-06-15T00:00:01.000Z",
      contentHash: "abc123",
    });

    expect(state.artifacts.proposal).toEqual({
      updatedAt: "2026-06-15T00:00:01.000Z",
      contentHash: "abc123",
      source: "temporal",
      readable: false,
    });
  });

  it("persists task-scoped sub-agent reports to sidecar and legacy task storage", () => {
    const state = createChangeWorkflowState({
      changeId: "sidecar-task-report-test",
      title: "Sidecar task report test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-report",
        title: "Report task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });

    applySubagentReportSubmittedToState(state, {
      taskId: "tk-report",
      report: makeEngineerReport("sidecar-task-report-test", "tk-report"),
      submittedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(state.subagent_reports).toHaveLength(1);
    expect(state.subagent_reports?.[0].agent).toBe("adv-engineer");
    expect(state.tasks[0].subagent_reports).toHaveLength(1);
    expect(state.seenReportIds).toEqual([
      "sidecar-task-report-test|tk-report|adv-engineer|1",
    ]);
  });

  it("deduplicates sidecar report persistence with legacy task report keys", () => {
    const state = createChangeWorkflowState({
      changeId: "sidecar-dedupe-test",
      title: "Sidecar dedupe test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-report",
        title: "Report task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    const payload = {
      taskId: "tk-report",
      report: makeEngineerReport("sidecar-dedupe-test", "tk-report"),
      submittedAt: "2026-05-06T00:00:02.000Z",
    };

    applySubagentReportSubmittedToState(state, payload);
    applySubagentReportSubmittedToState(state, {
      ...payload,
      submittedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.subagent_reports).toHaveLength(1);
    expect(state.tasks[0].subagent_reports).toHaveLength(1);
    expect(state.lastSignalAt).toBe("2026-05-06T00:00:03.000Z");
  });

  it("persists change-scoped optimized handoff reports without task storage", () => {
    const state = createChangeWorkflowState({
      changeId: "sidecar-change-report-test",
      title: "Sidecar change report test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applySubagentReportSubmittedToState(state, {
      report: makeResearcherReport("sidecar-change-report-test"),
      submittedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(state.subagent_reports).toHaveLength(1);
    expect(state.subagent_reports?.[0].agent).toBe("adv-researcher");
    expect(state.tasks).toHaveLength(0);
    expect(state.seenReportIds).toEqual([
      "sidecar-change-report-test|change:researcher:temporal-docs|adv-researcher|1",
    ]);
  });

  it("normalizes legacy sub-agent reports when seeding workflow state", () => {
    const seed = changeSeedStateFromChange({
      id: "legacy-seed",
      title: "Legacy seed",
      status: "draft",
      created_at: "2026-05-26T00:00:00.000Z",
      tasks: [
        {
          id: "tk-legacy",
          title: "Legacy task",
          type: "code",
          status: "pending",
          priority: 0,
          created_at: "2026-05-26T00:00:00.000Z",
          subagent_reports: [makeEngineerReport("legacy-seed", "tk-legacy")],
        },
      ],
      subagent_reports: [makeEngineerReport("legacy-seed", "tk-legacy")],
      deltas: {},
      wisdom: [],
      gates: createChangeWorkflowState({
        changeId: "legacy-seed",
        title: "Legacy seed",
        createdAt: "2026-05-26T00:00:00.000Z",
      }).gates,
      reentry_history: [],
    } as unknown as Change);

    expect(seed.tasks[0].subagent_reports?.[0]).toMatchObject({
      scope_drift: null,
      required_main_agent_actions: [],
    });
    expect(seed.subagent_reports?.[0]).toMatchObject({
      scope_drift: null,
      required_main_agent_actions: [],
    });
  });

  it("carries cross-project origin metadata when seeding workflow state", () => {
    const crossProjectOrigin = {
      source_project: "toolbox",
      source_path: "/home/jon/toolbox",
      source_change_id: "sourceChange",
      linked_at: "2026-06-06T20:00:00.000Z",
    };

    const seed = changeSeedStateFromChange({
      id: "target-followup",
      title: "Target followup",
      status: "draft",
      created_at: "2026-06-06T20:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      gates: createChangeWorkflowState({
        changeId: "target-followup",
        title: "Target followup",
        createdAt: "2026-06-06T20:00:00.000Z",
      }).gates,
      reentry_history: [],
      cross_project_origin: crossProjectOrigin,
    } as unknown as Change);

    expect(seed.cross_project_origin).toEqual(crossProjectOrigin);
  });

  it("carries source-side cross-project coordination metadata when seeding workflow state", () => {
    const crossProjectLinks = [
      {
        target_path: "/home/jon/target",
        target_project_id: "target-project-id",
        changeId: "targetFollowup",
        relationship: "follow_up" as const,
        linked_at: "2026-06-06T20:00:00.000Z",
      },
    ];
    const externalDependencies = [
      {
        target_path: "/home/jon/target",
        changeId: "targetFollowup",
        relationship: "requires" as const,
      },
    ];

    const seed = changeSeedStateFromChange({
      id: "source-change",
      title: "Source change",
      status: "active",
      created_at: "2026-06-06T20:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      gates: createChangeWorkflowState({
        changeId: "source-change",
        title: "Source change",
        createdAt: "2026-06-06T20:00:00.000Z",
      }).gates,
      reentry_history: [],
      cross_project_links: crossProjectLinks,
      external_dependencies: externalDependencies,
    } as unknown as Change);

    expect(seed.cross_project_links).toEqual(crossProjectLinks);
    expect(seed.external_dependencies).toEqual(externalDependencies);
  });

  it("carries epic_membership when seeding workflow state", () => {
    const epicMembership = {
      epic_id: "addAuthEpic",
      entry_id: "ent-1",
      order: 0,
      title: "Add auth",
      linked_at: "2026-06-06T20:00:00.000Z",
    };

    const seed = changeSeedStateFromChange({
      id: "epic-child",
      title: "Epic child",
      status: "active",
      created_at: "2026-06-06T20:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      gates: createChangeWorkflowState({
        changeId: "epic-child",
        title: "Epic child",
        createdAt: "2026-06-06T20:00:00.000Z",
      }).gates,
      reentry_history: [],
      epic_membership: epicMembership,
    } as unknown as Change);

    expect(seed.epic_membership).toEqual(epicMembership);
  });

  it("leaves epic_membership undefined when seeding a change without it", () => {
    const seed = changeSeedStateFromChange({
      id: "no-epic",
      title: "No epic",
      status: "active",
      created_at: "2026-06-06T20:00:00.000Z",
      tasks: [],
      deltas: {},
      wisdom: [],
      gates: createChangeWorkflowState({
        changeId: "no-epic",
        title: "No epic",
        createdAt: "2026-06-06T20:00:00.000Z",
      }).gates,
      reentry_history: [],
    } as unknown as Change);

    expect(seed.epic_membership).toBeUndefined();
  });

  it("records task lifecycle mutations without task-run ledger state", () => {
    const state = createChangeWorkflowState({
      changeId: "change-state-test",
      title: "Change state test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "unit verified",
      summary: "done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      completedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      id: "tk-1",
      status: "done",
      verification: "unit verified",
      implementation_summary: "done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
    });
    expect(state).not.toHaveProperty("taskRuns");
    expect(state.lastSignalAt).toBe("2026-05-06T00:00:02.000Z");
  });

  it("preserves checkpoint metadata when a duplicate completion omits checkpointSha", () => {
    const state = createChangeWorkflowState({
      changeId: "checkpoint-sha-guard-test",
      title: "Checkpoint sha guard test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "checkpoint verified",
      summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "weaker duplicate",
      summary: "weaker done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      completedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      status: "done",
      verification: "checkpoint verified",
      implementation_summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    expect(state.lastSignalAt).toBe("2026-05-06T00:00:03.000Z");
  });

  it("preserves checkpoint metadata when a duplicate completion omits filesTouched", () => {
    const state = createChangeWorkflowState({
      changeId: "checkpoint-files-guard-test",
      title: "Checkpoint files guard test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "checkpoint verified",
      summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "weaker duplicate",
      summary: "weaker done",
      filesTouched: [],
      checkpointSha: "def456",
      completedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      verification: "checkpoint verified",
      implementation_summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    expect(state.lastSignalAt).toBe("2026-05-06T00:00:03.000Z");
  });

  it("allows an equally strong duplicate completion to replace checkpoint metadata", () => {
    const state = createChangeWorkflowState({
      changeId: "checkpoint-strong-replace-test",
      title: "Checkpoint strong replace test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "checkpoint verified",
      summary: "checkpoint done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      checkpointSha: "abc123",
      completedAt: "2026-05-06T00:00:02.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "new checkpoint verified",
      summary: "new checkpoint done",
      filesTouched: ["plugin/src/temporal/workflows.ts"],
      checkpointSha: "def456",
      completedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      verification: "new checkpoint verified",
      implementation_summary: "new checkpoint done",
      filesTouched: ["plugin/src/temporal/workflows.ts"],
      checkpointSha: "def456",
      completedAt: "2026-05-06T00:00:03.000Z",
    });
  });

  it("leaves sequential gate enforcement to the tool layer", () => {
    const state = createChangeWorkflowState({
      changeId: "gate-purity-test",
      title: "Gate purity test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    completeGateInChangeState(state, "planning", {
      now: "2026-05-06T00:00:01.000Z",
      completedBy: "tool-layer-after-validation",
    });

    expect(state.gates.planning).toMatchObject({
      status: "done",
      completed_by: "tool-layer-after-validation",
    });
  });

  it("invalidates contract review proof on amendment and downstream re-entry", () => {
    const state = createChangeWorkflowState({
      changeId: "contract-reentry-test",
      title: "Contract reentry test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    state.contract = {
      version: 1,
      rigor: "standard",
      source: { artifact: "agreement", approvedAt: "2026-05-06T00:00:00.000Z" },
      items: [
        {
          id: "AC1",
          kind: "acceptance_criterion",
          text: "Contract proof invalidates",
          sourceArtifact: "agreement",
          verificationRequired: true,
          evidencePolicy: "test",
          status: "approved",
        },
      ],
      reviewMatrix: {
        reviewedAt: "2026-05-06T00:00:01.000Z",
        rows: [
          {
            contractId: "AC1",
            kind: "acceptance_criterion",
            status: "pass",
            evidencePolicy: "test",
            evidence: "old proof",
          },
        ],
      },
      amendments: [],
    };

    applyContractAmendedToState(state, {
      amendments: [
        {
          id: "am-1",
          actor: "tester",
          reason: "substantive AC change",
          approvalEvidence: "approved",
          amendedAt: "2026-05-06T00:00:02.000Z",
          affectedIds: ["AC1"],
          invalidatesReviewMatrix: true,
        },
      ],
      updatedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(state.contract.reviewMatrix).toBeUndefined();

    state.contract.reviewMatrix = {
      reviewedAt: "2026-05-06T00:00:03.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "pass",
          evidencePolicy: "test",
          evidence: "new proof",
        },
      ],
    };

    applyGateReenteredToState(state, {
      fromGateId: "execution",
      reason: "implementation changed",
      scopeDelta: "new behavior evidence needed",
      reenteredBy: "tester",
      reenteredAt: "2026-05-06T00:00:04.000Z",
    });

    expect(state.contract.reviewMatrix).toBeUndefined();
  });

  it("carries optional origin on ChangeWorkflowState (rq-backlogCoord01 prereq)", () => {
    // rq-backlogCoord01 prereq (task A0): ChangeWorkflowState must carry
    // `origin` so `buildChangeSearchAttributes` can populate
    // `AdvBacklogIssueNumber` from `state.origin?.issue_number`.
    const state = createChangeWorkflowState({
      changeId: "origin-state-test",
      title: "Origin state test",
      createdAt: "2026-05-11T00:00:00.000Z",
    });

    const origin: ChangeOrigin = {
      kind: "roadmap",
      issue_number: 42,
    };
    state.origin = origin;

    expect(state.origin).toBeDefined();
    expect(state.origin?.kind).toBe("roadmap");
    expect(state.origin?.issue_number).toBe(42);
  });

  it("accepts origin in ChangeWorkflowInput.seedState pick list (rq-backlogCoord01 prereq)", () => {
    // rq-backlogCoord01 prereq (task A0): callers must be able to pass
    // `origin` through `ChangeWorkflowInput.seedState` so the workflow
    // can seed `state.origin` at start time.
    const input: ChangeWorkflowInput = {
      projectId: "test-project",
      changeId: "origin-seed-test",
      title: "Origin seed test",
      initializedAt: "2026-05-11T00:00:00.000Z",
      seedState: {
        origin: {
          kind: "roadmap",
          issue_number: 51,
        },
      },
    };

    expect(input.seedState?.origin?.issue_number).toBe(51);
  });
});

// rq-TDD009seq: red-then-green ordering enforcement tests
describe("applyTestRunRecordedToState and rq-TDD009seq ordering enforcement", () => {
  function setupStateWithInlineTask(taskId: string) {
    const state = createChangeWorkflowState({
      changeId: "ordering-test",
      title: "Ordering test",
      createdAt: "2026-06-17T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: taskId,
        title: "Implement feature with TDD",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-06-17T00:00:01.000Z",
        metadata: { tdd_intent: "inline" },
      },
      addedAt: "2026-06-17T00:00:01.000Z",
    });
    return state;
  }

  it("stores a test-run record in state.testRuns[taskId]", () => {
    const state = setupStateWithInlineTask("tk-seq1");
    applyTestRunRecordedToState(state, {
      taskId: "tk-seq1",
      runId: "tr_red_001",
      phase: "red",
      exitCode: 1,
      classification: "failed",
      command: "pnpm test -- foo.test.ts",
      durationMs: 500,
      recordedAt: "2026-06-17T00:00:10.000Z",
    });

    expect(state.testRuns?.["tk-seq1"]).toHaveLength(1);
    expect(state.testRuns?.["tk-seq1"]?.[0]).toMatchObject({
      runId: "tr_red_001",
      phase: "red",
      exitCode: 1,
    });
  });

  it("ring-buffers test runs to last 20 per task", () => {
    const state = setupStateWithInlineTask("tk-ring");
    for (let i = 0; i < 25; i++) {
      applyTestRunRecordedToState(state, {
        taskId: "tk-ring",
        runId: `tr_${i}`,
        exitCode: i % 2,
        classification: i % 2 === 0 ? "passed" : "failed",
        command: "pnpm test",
        durationMs: 100,
        recordedAt: `2026-06-17T00:00:${String(i).padStart(2, "0")}.000Z`,
      });
    }
    expect(state.testRuns?.["tk-ring"]).toHaveLength(20);
    expect(state.testRuns?.["tk-ring"]?.[0]?.runId).toBe("tr_5");
    expect(state.testRuns?.["tk-ring"]?.[19]?.runId).toBe("tr_24");
  });

  // AC1: reject inline task without prior red run
  it("AC1: rejects inline task completion with lastGreenRunId but no prior red run", () => {
    const state = setupStateWithInlineTask("tk-ac1");
    // No test runs recorded
    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-ac1",
        verification: "done",
        summary: "completed",
        filesTouched: [],
        completedAt: "2026-06-17T00:01:00.000Z",
        lastRedRunId: "tr_red_missing",
        lastGreenRunId: "tr_green_001",
      }),
    ).toThrow(/TASK_ORDERING_VIOLATION/);
    expect(state.tasks[0].status).toBe("pending");
  });

  // AC2: accept valid red→green sequence
  it("AC2: accepts inline task completion with valid red→green sequence", () => {
    const state = setupStateWithInlineTask("tk-ac2");
    applyTestRunRecordedToState(state, {
      taskId: "tk-ac2",
      runId: "tr_red_ok",
      phase: "red",
      exitCode: 1,
      classification: "failed",
      command: "pnpm test -- foo.test.ts",
      durationMs: 500,
      recordedAt: "2026-06-17T00:00:10.000Z",
    });
    applyTestRunRecordedToState(state, {
      taskId: "tk-ac2",
      runId: "tr_green_ok",
      phase: "green",
      exitCode: 0,
      classification: "passed",
      command: "pnpm test -- foo.test.ts",
      durationMs: 400,
      recordedAt: "2026-06-17T00:00:20.000Z",
    });

    applyTaskCompletedToState(state, {
      taskId: "tk-ac2",
      verification: "red then green verified",
      summary: "completed with TDD",
      filesTouched: ["src/foo.ts"],
      completedAt: "2026-06-17T00:01:00.000Z",
      lastRedRunId: "tr_red_ok",
      lastGreenRunId: "tr_green_ok",
    });

    expect(state.tasks[0].status).toBe("done");
  });

  // AC3: legacy task without lastGreenRunId is grandfathered
  it("AC3: accepts legacy task completion without lastGreenRunId", () => {
    const state = setupStateWithInlineTask("tk-ac3");
    // No test runs, no lastGreenRunId — backward compat
    applyTaskCompletedToState(state, {
      taskId: "tk-ac3",
      verification: "legacy verification",
      summary: "legacy done",
      filesTouched: ["src/foo.ts"],
      completedAt: "2026-06-17T00:01:00.000Z",
    });

    expect(state.tasks[0].status).toBe("done");
  });

  it("rejects when red run has exitCode=0 (was not actually red)", () => {
    const state = setupStateWithInlineTask("tk-fake-red");
    applyTestRunRecordedToState(state, {
      taskId: "tk-fake-red",
      runId: "tr_fake_red",
      phase: "red",
      exitCode: 0,
      classification: "passed",
      command: "pnpm test -- foo.test.ts",
      durationMs: 500,
      recordedAt: "2026-06-17T00:00:10.000Z",
    });
    applyTestRunRecordedToState(state, {
      taskId: "tk-fake-red",
      runId: "tr_green_ok",
      phase: "green",
      exitCode: 0,
      classification: "passed",
      command: "pnpm test -- foo.test.ts",
      durationMs: 400,
      recordedAt: "2026-06-17T00:00:20.000Z",
    });

    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-fake-red",
        verification: "done",
        summary: "completed",
        filesTouched: [],
        completedAt: "2026-06-17T00:01:00.000Z",
        lastRedRunId: "tr_fake_red",
        lastGreenRunId: "tr_green_ok",
      }),
    ).toThrow(/TASK_ORDERING_VIOLATION/);
  });

  it("exempts not_applicable tasks from ordering check", () => {
    const state = createChangeWorkflowState({
      changeId: "na-test",
      title: "NA test",
      createdAt: "2026-06-17T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-na",
        title: "Update docs",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-06-17T00:00:01.000Z",
        metadata: { tdd_intent: "not_applicable" },
      },
      addedAt: "2026-06-17T00:00:01.000Z",
    });
    // Even with lastGreenRunId, not_applicable tasks skip the check
    applyTaskCompletedToState(state, {
      taskId: "tk-na",
      verification: "docs updated",
      summary: "done",
      filesTouched: ["README.md"],
      completedAt: "2026-06-17T00:01:00.000Z",
      lastGreenRunId: "tr_nonexistent",
    });

    expect(state.tasks[0].status).toBe("done");
  });

  it("rejects when red run is after green run (wrong order)", () => {
    const state = setupStateWithInlineTask("tk-order");
    applyTestRunRecordedToState(state, {
      taskId: "tk-order",
      runId: "tr_green_first",
      phase: "green",
      exitCode: 0,
      classification: "passed",
      command: "pnpm test -- foo.test.ts",
      durationMs: 400,
      recordedAt: "2026-06-17T00:00:10.000Z",
    });
    applyTestRunRecordedToState(state, {
      taskId: "tk-order",
      runId: "tr_red_second",
      phase: "red",
      exitCode: 1,
      classification: "failed",
      command: "pnpm test -- foo.test.ts",
      durationMs: 500,
      recordedAt: "2026-06-17T00:00:20.000Z",
    });

    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-order",
        verification: "done",
        summary: "completed",
        filesTouched: [],
        completedAt: "2026-06-17T00:01:00.000Z",
        lastRedRunId: "tr_red_second",
        lastGreenRunId: "tr_green_first",
      }),
    ).toThrow(/TASK_ORDERING_VIOLATION/);
  });
});
