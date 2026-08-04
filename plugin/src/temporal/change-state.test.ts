import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  acceptanceCriteriaFromContract,
  applyEpicMembershipClearedToState,
  applyEpicMembershipSetToState,
  applySubagentReportSubmittedToState,
  applyContractAmendedToState,
  applyContractReviewMatrixSetToState,
  applyContractSetToState,
  applyDesignConcernDispositionedToState,
  applyVerificationEvidenceDispositionedToState,
  applyGateReenteredToState,
  applyOriginRepairedToState,
  applyProposalUpdatedToState,
  applyTaskAddedToState,
  applyTaskAssignedToState,
  applyTaskCompletedToState,
  applyTestRunRecordedToState,
  applyGateCompletedToState,
  applyArchiveRequestedToState,
  changeSeedStateFromChange,
  changeToWorkflowState,
  completeGateInChangeState,
  createChangeWorkflowState,
  normalizeChangeLifecycleState,
  updateArtifactMetadataInChangeState,
} from "./change-state";
import { createDefaultGates } from "../types";
import type { Change, ChangeOrigin } from "../types";
import { ErrorRecoverySchema } from "../types/tasks";
import { subagentReportKey } from "../types/subagent-reports";
import type { ChangeWorkflowInput } from "./contracts";

const sourcePath = fileURLToPath(new URL("./change-state.ts", import.meta.url));

function makeEngineerReport(
  changeId: string,
  taskId: string,
  attempt = 1,
  implementationCycleId?: string,
) {
  return {
    schema_version: "1.0" as const,
    change_id: changeId,
    task_id: taskId,
    scope: { kind: "task" as const, task_id: taskId },
    attempt,
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
    ...(implementationCycleId
      ? {
          apply_context: {
            implementation_cycle_id: implementationCycleId,
            implementation_provenance: {
              kind: "engineer" as const,
              baseline_head_sha: "abc123",
            },
          },
        }
      : {}),
  };
}

function makeDesignerReport(
  changeId: string,
  taskId: string,
  implementationCycleId: string,
  attempt = 1,
) {
  return {
    schema_version: "1.0" as const,
    change_id: changeId,
    task_id: taskId,
    scope: { kind: "task" as const, task_id: taskId },
    attempt,
    agent: "adv-designer" as const,
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
    required_main_agent_actions: [],
    related_scan: "none",
    workdir_used: "/tmp/worktree",
    context_update_for_adv: {
      what_ads_needs_to_know: "Designer report persisted",
      suggested_next_action: "Continue",
    },
    design_dimensions: {
      component_correctness: "n/a" as const,
      semantic_html_a11y: "n/a" as const,
      responsive_behavior: "n/a" as const,
      visual_polish: "n/a" as const,
      site_design_consistency: "n/a" as const,
      finer_details: "n/a" as const,
      notes: "Workflow-only test",
    },
    neighboring_recommendations: [],
    apply_context: {
      implementation_cycle_id: implementationCycleId,
      implementation_provenance: {
        kind: "inline" as const,
        baseline_head_sha: "abc123",
        diff_ref: "test diff",
      },
    },
  };
}

function makeLegacyDesignerReport(changeId: string, taskId: string) {
  const { apply_context: _applyContext, ...legacyReport } = makeDesignerReport(
    changeId,
    taskId,
    "ic-unclaimed",
  );
  return legacyReport;
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
    architecture_judgement: {
      applicability: "applicable" as const,
      confidence: "high" as const,
      risk: "low" as const,
      tradeoffs: ["Sidecar persistence adds a readback surface."],
      alternatives_considered: [
        {
          option: "Task-scoped researcher report",
          disposition: "rejected" as const,
          rationale: "Researcher reports are change-scoped optimized handoffs.",
        },
      ],
      recommendation: "Persist as change-scoped sidecar report.",
    },
    recommendation: "Persist as change-scoped sidecar report.",
    follow_ups: [],
    workdir_used: "/tmp/worktree",
  };
}

function makeReviewerReport(changeId: string, taskId: string, attempt = 1) {
  return {
    schema_version: "1.0" as const,
    change_id: changeId,
    task_id: taskId,
    scope: { kind: "task" as const, task_id: taskId },
    attempt,
    agent: "adv-reviewer" as const,
    workdir_used: "/tmp/worktree",
    phase: "review" as const,
    verdict: "READY" as const,
    blocking_findings: [],
    nonblocking_findings: [],
    changes_made: [],
    wisdom_candidates: [],
    verification: {
      tests_run: [],
      results: "n/a" as const,
      evidence: "review",
    },
    scope_drift: null,
    risks: [],
    required_main_agent_actions: [],
  };
}

describe("change-state pure mutation helpers", () => {
  it("normalizes legacy open statuses to open lifecycle state", () => {
    expect(normalizeChangeLifecycleState("draft")).toBe("open");
    expect(normalizeChangeLifecycleState("pending")).toBe("open");
    expect(normalizeChangeLifecycleState("active")).toBe("open");
  });

  it("preserves terminal statuses as lifecycle state", () => {
    expect(normalizeChangeLifecycleState("archived")).toBe("archived");
    expect(normalizeChangeLifecycleState("closed")).toBe("closed");
  });

  it("initializes new change workflow state with open lifecycle state", () => {
    const state = createChangeWorkflowState({
      changeId: "lifecycle-init-test",
      title: "Lifecycle init test",
      createdAt: "2026-06-25T00:00:00.000Z",
    });

    expect(state.status).toBe("draft");
    expect(state.lifecycleState).toBe("open");
  });

  it('normalizes legacy stored "active" status to draft when seeding from a change', () => {
    // Legacy/poisoned change records may carry stored "active"/"pending"
    // statuses that no code path writes anymore (open changes are "draft";
    // lifecycle authority is AdvLifecycleState). Seeding must never carry
    // them into workflow state. `as unknown as Change` keeps this fixture
    // valid after the stored-status enum is narrowed.
    const change = {
      id: "legacy-active-change",
      title: "Legacy active change",
      status: "active",
      created_at: "2026-06-25T00:00:00.000Z",
      tasks: [],
      deltas: {},
    } as unknown as Change;

    const seed = changeSeedStateFromChange(change);

    expect(seed.status).toBe("draft");
    expect(seed.lifecycleState).toBe("open");
  });

  it('normalizes legacy stored "pending" status to draft when seeding from a change', () => {
    const change = {
      id: "legacy-pending-change",
      title: "Legacy pending change",
      status: "pending",
      created_at: "2026-06-25T00:00:00.000Z",
      tasks: [],
      deltas: {},
    } as unknown as Change;

    const seed = changeSeedStateFromChange(change);

    expect(seed.status).toBe("draft");
    expect(seed.lifecycleState).toBe("open");
  });

  it("preserves explicit lifecycle state during seed", () => {
    const change = {
      id: "archived-lifecycle-change",
      title: "Archived lifecycle change",
      status: "archived",
      lifecycleState: "archived",
      created_at: "2026-06-25T00:00:00.000Z",
      tasks: [],
      deltas: {},
    } satisfies Change;

    const seed = changeSeedStateFromChange(change);

    expect(seed.lifecycleState).toBe("archived");
  });

  it("carries design-concern dispositions during workflow re-seed", () => {
    const change = {
      id: "design-disposition-change",
      title: "Design disposition change",
      status: "active",
      created_at: "2026-06-25T00:00:00.000Z",
      tasks: [],
      deltas: {},
      design_concern_dispositions: [
        {
          taskId: "tk-design123",
          concernKey: "dimension:site_design_consistency",
          disposition: "rejected_with_evidence",
          evidence: "Legacy page explicitly out of scope.",
          dispositionedAt: "2026-06-25T14:00:00.000Z",
        },
      ],
    } satisfies Change;

    const seed = changeSeedStateFromChange(change);

    expect(seed.design_concern_dispositions).toEqual(
      change.design_concern_dispositions,
    );
  });

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

  it("bounds seenReportIds to 200 IDs with FIFO eviction and cumulative total", () => {
    const state = createChangeWorkflowState({
      changeId: "overflow-test",
      title: "Overflow test",
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

    for (let i = 1; i <= 201; i++) {
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-report",
        report: makeEngineerReport("overflow-test", "tk-report", i),
        submittedAt: `2026-05-06T00:00:${String(i).padStart(2, "0")}.000Z`,
      });
    }

    expect(state.seenReportIds).toHaveLength(200);
    expect(state.seenReportIdsTotal).toBe(201);
    expect(state.seenReportIds?.[0]).toBe(
      "overflow-test|tk-report|adv-engineer|2",
    );
    expect(state.seenReportIds?.at(-1)).toBe(
      "overflow-test|tk-report|adv-engineer|201",
    );
  });

  it("duplicate report does not append, evict, or increment seenReportIdsTotal", () => {
    const state = createChangeWorkflowState({
      changeId: "dup-test",
      title: "Duplicate test",
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
      report: makeEngineerReport("dup-test", "tk-report"),
      submittedAt: "2026-05-06T00:00:02.000Z",
    };

    applySubagentReportSubmittedToState(state, payload);
    applySubagentReportSubmittedToState(state, {
      ...payload,
      submittedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.seenReportIds).toHaveLength(1);
    expect(state.seenReportIdsTotal).toBe(1);
  });

  it("sidecar-backed duplicate protection remains intact after FIFO eviction", () => {
    const state = createChangeWorkflowState({
      changeId: "evict-test",
      title: "Eviction test",
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

    const firstReport = makeEngineerReport("evict-test", "tk-report", 1);
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-report",
      report: firstReport,
      submittedAt: "2026-05-06T00:00:01.000Z",
    });

    for (let i = 2; i <= 201; i++) {
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-report",
        report: makeEngineerReport("evict-test", "tk-report", i),
        submittedAt: `2026-05-06T00:00:${String(i).padStart(2, "0")}.000Z`,
      });
    }

    expect(state.seenReportIds).not.toContain(
      "evict-test|tk-report|adv-engineer|1",
    );
    expect(state.seenReportIds).toHaveLength(200);

    applySubagentReportSubmittedToState(state, {
      taskId: "tk-report",
      report: firstReport,
      submittedAt: "2026-05-06T00:00:04.000Z",
    });

    expect(state.subagent_reports).toHaveLength(201);
    expect(state.seenReportIds).toHaveLength(200);
    expect(state.seenReportIdsTotal).toBe(201);
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

  it("sets Epic membership projection on a child change", () => {
    const state = createChangeWorkflowState({
      changeId: "epic-child",
      title: "Epic child",
      createdAt: "2026-06-25T00:00:00.000Z",
    });

    applyEpicMembershipSetToState(state, {
      membership: {
        epic_id: "productAuthEpic",
        entry_id: "en-001",
        order: 2,
        title: "Add OAuth",
        linked_at: "2026-06-25T00:01:00.000Z",
        epic_project_id: "project-web",
        repo_id: "pokeedge-web",
        source: "link_existing",
      },
      setAt: "2026-06-25T00:01:00.000Z",
    });

    expect(state.epic_membership).toEqual({
      epic_id: "productAuthEpic",
      entry_id: "en-001",
      order: 2,
      title: "Add OAuth",
      linked_at: "2026-06-25T00:01:00.000Z",
      epic_project_id: "project-web",
      repo_id: "pokeedge-web",
      source: "link_existing",
    });
    expect(state.lastSignalAt).toBe("2026-06-25T00:01:00.000Z");
  });

  it("rejects setting a different Epic membership without move evidence", () => {
    const state = createChangeWorkflowState({
      changeId: "epic-child",
      title: "Epic child",
      createdAt: "2026-06-25T00:00:00.000Z",
    });
    state.epic_membership = {
      epic_id: "firstEpic",
      entry_id: "en-first",
      order: 0,
      title: "First",
      linked_at: "2026-06-25T00:01:00.000Z",
    };

    expect(() =>
      applyEpicMembershipSetToState(state, {
        membership: {
          epic_id: "secondEpic",
          entry_id: "en-second",
          order: 1,
          title: "Second",
          linked_at: "2026-06-25T00:02:00.000Z",
          source: "link_existing",
        },
        setAt: "2026-06-25T00:02:00.000Z",
      }),
    ).toThrow(/already belongs to Epic/);
    expect(state.epic_membership.epic_id).toBe("firstEpic");
  });

  it("allows moving Epic membership when expected source matches", () => {
    const state = createChangeWorkflowState({
      changeId: "epic-child",
      title: "Epic child",
      createdAt: "2026-06-25T00:00:00.000Z",
    });
    state.epic_membership = {
      epic_id: "firstEpic",
      entry_id: "en-first",
      order: 0,
      title: "First",
      linked_at: "2026-06-25T00:01:00.000Z",
    };

    applyEpicMembershipSetToState(state, {
      expectedCurrent: { epic_id: "firstEpic", entry_id: "en-first" },
      membership: {
        epic_id: "secondEpic",
        entry_id: "en-second",
        order: 1,
        title: "Second",
        linked_at: "2026-06-25T00:02:00.000Z",
        source: "move",
      },
      setAt: "2026-06-25T00:02:00.000Z",
    });

    expect(state.epic_membership.epic_id).toBe("secondEpic");
    expect(state.epic_membership.source).toBe("move");
  });

  it("clears Epic membership only when expected identity matches", () => {
    const state = createChangeWorkflowState({
      changeId: "epic-child",
      title: "Epic child",
      createdAt: "2026-06-25T00:00:00.000Z",
    });
    state.epic_membership = {
      epic_id: "productAuthEpic",
      entry_id: "en-001",
      order: 2,
      title: "Add OAuth",
      linked_at: "2026-06-25T00:01:00.000Z",
    };

    expect(() =>
      applyEpicMembershipClearedToState(state, {
        expected: { epic_id: "wrongEpic", entry_id: "en-001" },
        clearedAt: "2026-06-25T00:02:00.000Z",
      }),
    ).toThrow(/does not match/);
    expect(state.epic_membership?.epic_id).toBe("productAuthEpic");

    applyEpicMembershipClearedToState(state, {
      expected: { epic_id: "productAuthEpic", entry_id: "en-001" },
      clearedAt: "2026-06-25T00:03:00.000Z",
    });

    expect(state.epic_membership).toBeUndefined();
    expect(state.lastSignalAt).toBe("2026-06-25T00:03:00.000Z");
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

  it("rejects frontend completion without matching designer cycle evidence", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-cycle-guard",
      title: "Frontend cycle guard",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-frontend",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });

    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-frontend",
        verification: "verified",
        summary: "complete",
        filesTouched: [],
        completedAt: "2026-05-06T00:00:03.000Z",
      }),
    ).toThrow(/requires successful adv-designer evidence/);
  });

  it("rejects frontend completion when accepted designer report lacks apply_context and includes binding hint", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-designer-no-apply-context",
      title: "Frontend designer no apply_context",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-frontend",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-frontend",
      report: makeLegacyDesignerReport(
        "frontend-designer-no-apply-context",
        "tk-frontend",
      ),
      submittedAt: "2026-05-06T00:00:03.000Z",
    });

    let thrown: Error | undefined;
    try {
      applyTaskCompletedToState(state, {
        taskId: "tk-frontend",
        verification: "verified",
        summary: "complete",
        filesTouched: [],
        completedAt: "2026-05-06T00:00:04.000Z",
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeDefined();
    expect(thrown?.message).toMatch(
      /TASK_COMPLETION_BLOCKED: frontend task tk-frontend requires successful adv-designer evidence for implementation cycle ic-frontend/,
    );
    expect(thrown?.message).toContain("apply_context.implementation_cycle_id");
    expect(thrown?.message).toContain("implementation_provenance");
    expect(thrown?.message).toContain("report_key");
    expect(state.tasks[0]?.status).not.toBe("done");
  });

  it("permits frontend completion with matching designer cycle evidence", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-cycle-allow",
      title: "Frontend cycle allow",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-frontend",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-frontend",
      report: makeDesignerReport(
        "frontend-cycle-allow",
        "tk-frontend",
        "ic-frontend",
      ),
      submittedAt: "2026-05-06T00:00:03.000Z",
    });

    applyTaskCompletedToState(state, {
      taskId: "tk-frontend",
      verification: "verified",
      summary: "complete",
      filesTouched: [],
      completedAt: "2026-05-06T00:00:04.000Z",
    });

    expect(state.tasks[0]?.status).toBe("done");
  });

  it("AC1: permits frontend completion with designer engineer-report provenance backed by a same-cycle engineer report", () => {
    const changeId = "frontend-receipt-ok";
    const taskId = "tk-frontend";
    const cycleId = "ic-frontend";
    const state = createChangeWorkflowState({
      changeId,
      title: "Frontend receipt ok",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: taskId,
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId,
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: cycleId,
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });

    const engineer = makeEngineerReport(changeId, taskId, 1, cycleId);
    applySubagentReportSubmittedToState(state, {
      taskId,
      report: engineer,
      submittedAt: "2026-05-06T00:00:03.000Z",
    });

    const engineerKey = subagentReportKey({
      changeId,
      taskId,
      agent: "adv-engineer",
      attempt: 1,
      implementationCycleId: cycleId,
    });

    const designer: DesignerSubagentReport = {
      ...makeDesignerReport(changeId, taskId, cycleId),
      apply_context: {
        implementation_cycle_id: cycleId,
        implementation_provenance: {
          kind: "engineer_report",
          report_key: engineerKey,
        },
      },
    };
    applySubagentReportSubmittedToState(state, {
      taskId,
      report: designer,
      submittedAt: "2026-05-06T00:00:04.000Z",
    });

    applyTaskCompletedToState(state, {
      taskId,
      verification: "verified",
      summary: "complete",
      filesTouched: [],
      completedAt: "2026-05-06T00:00:05.000Z",
    });

    expect(state.tasks[0]?.status).toBe("done");
  });

  it("rejects a designer engineer-report receipt without successful same-cycle engineer evidence", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-receipt-guard",
      title: "Frontend receipt guard",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-frontend",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });

    expect(() =>
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-frontend",
        report: {
          ...makeDesignerReport(
            "frontend-receipt-guard",
            "tk-frontend",
            "ic-frontend",
          ),
          apply_context: {
            implementation_cycle_id: "ic-frontend",
            implementation_provenance: {
              kind: "engineer_report",
              report_key: subagentReportKey({
                changeId: "frontend-receipt-guard",
                taskId: "tk-frontend",
                agent: "adv-engineer",
                attempt: 1,
                implementationCycleId: "ic-frontend",
              }),
            },
          },
        },
        submittedAt: "2026-05-06T00:00:03.000Z",
      }),
    ).toThrow(/SUBAGENT_REPORT_PROVENANCE_REJECTED/);
  });

  it("rejects frontend completion when designer evidence matches a different cycle", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-cycle-mismatch",
      title: "Frontend cycle mismatch",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-frontend",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });
    // Cycle-anchored designer evidence claiming a non-active cycle never
    // persists; the completion guard then has no matching evidence to accept.
    expect(() =>
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-frontend",
        report: makeDesignerReport(
          "frontend-cycle-mismatch",
          "tk-frontend",
          "ic-other",
        ),
        submittedAt: "2026-05-06T00:00:03.000Z",
      }),
    ).toThrow(/SUBAGENT_REPORT_ANCHOR_REJECTED/);
    expect(state.subagent_reports ?? []).toHaveLength(0);

    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-frontend",
        verification: "verified",
        summary: "complete",
        filesTouched: [],
        completedAt: "2026-05-06T00:00:04.000Z",
      }),
    ).toThrow(/requires successful adv-designer evidence/);
    expect(state.tasks[0]?.status).not.toBe("done");
  });

  it("rejects frontend completion when designer evidence is from an older cycle", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-cycle-stale",
      title: "Frontend cycle stale",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-old",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-frontend",
      report: makeDesignerReport(
        "frontend-cycle-stale",
        "tk-frontend",
        "ic-old",
      ),
      submittedAt: "2026-05-06T00:00:03.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:04.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-new",
        started_at: "2026-05-06T00:00:04.000Z",
        kind: "retry",
      },
    });

    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-frontend",
        verification: "verified",
        summary: "complete",
        filesTouched: [],
        completedAt: "2026-05-06T00:00:05.000Z",
      }),
    ).toThrow(/requires successful adv-designer evidence/);
    expect(state.tasks[0]?.status).not.toBe("done");
  });

  it("keeps rejecting when a stale-cycle report is resubmitted as a duplicate", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-cycle-stale-duplicate",
      title: "Frontend cycle stale duplicate",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-old",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });
    const staleReport = makeDesignerReport(
      "frontend-cycle-stale-duplicate",
      "tk-frontend",
      "ic-old",
    );
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-frontend",
      report: staleReport,
      submittedAt: "2026-05-06T00:00:03.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:04.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-new",
        started_at: "2026-05-06T00:00:04.000Z",
        kind: "retry",
      },
    });
    // Resubmitting stale-cycle evidence after re-anchoring is rejected at the
    // boundary; the retained original report still cannot satisfy the guard.
    expect(() =>
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-frontend",
        report: staleReport,
        submittedAt: "2026-05-06T00:00:05.000Z",
      }),
    ).toThrow(/SUBAGENT_REPORT_ANCHOR_REJECTED/);

    expect(state.seenReportIdsTotal).toBe(1);
    expect(state.subagent_reports).toHaveLength(1);
    expect(state.tasks[0]?.subagent_reports).toHaveLength(1);
    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-frontend",
        verification: "verified",
        summary: "complete",
        filesTouched: [],
        completedAt: "2026-05-06T00:00:06.000Z",
      }),
    ).toThrow(/requires successful adv-designer evidence/);
    expect(state.tasks[0]?.status).not.toBe("done");
  });

  it("permits frontend completion when a matching report is resubmitted as a duplicate", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-cycle-duplicate-allow",
      title: "Frontend cycle duplicate allow",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-frontend",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });
    const matchingReport = makeDesignerReport(
      "frontend-cycle-duplicate-allow",
      "tk-frontend",
      "ic-frontend",
    );
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-frontend",
      report: matchingReport,
      submittedAt: "2026-05-06T00:00:03.000Z",
    });
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-frontend",
      report: matchingReport,
      submittedAt: "2026-05-06T00:00:04.000Z",
    });

    expect(state.seenReportIdsTotal).toBe(1);
    expect(state.subagent_reports).toHaveLength(1);
    expect(state.tasks[0]?.subagent_reports).toHaveLength(1);
    applyTaskCompletedToState(state, {
      taskId: "tk-frontend",
      verification: "verified",
      summary: "complete",
      filesTouched: [],
      completedAt: "2026-05-06T00:00:05.000Z",
    });
    expect(state.tasks[0]?.status).toBe("done");
  });

  it("rejects frontend completion when the task has no active implementation cycle", () => {
    const state = createChangeWorkflowState({
      changeId: "frontend-cycle-missing",
      title: "Frontend cycle missing",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-frontend",
        verification: "verified",
        summary: "complete",
        filesTouched: [],
        completedAt: "2026-05-06T00:00:03.000Z",
      }),
    ).toThrow(
      /TASK_COMPLETION_BLOCKED: frontend task tk-frontend has no active implementation cycle/,
    );
    expect(state.tasks[0]?.status).not.toBe("done");
  });

  it("rejects a designer report with apply_context when the task has no implementation cycle", () => {
    const state = createChangeWorkflowState({
      changeId: "designer-anchor-missing",
      title: "Designer anchor missing",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(() =>
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-frontend",
        report: makeDesignerReport(
          "designer-anchor-missing",
          "tk-frontend",
          "ic-claimed",
        ),
        submittedAt: "2026-05-06T00:00:03.000Z",
      }),
    ).toThrow(/SUBAGENT_REPORT_ANCHOR_REJECTED/);
    expect(state.subagent_reports ?? []).toHaveLength(0);
    expect(state.seenReportIdsTotal ?? 0).toBe(0);
    expect(state.tasks[0]?.subagent_reports ?? []).toHaveLength(0);
  });

  it("rejects a designer report claiming a cycle that is not the task's active cycle", () => {
    const state = createChangeWorkflowState({
      changeId: "designer-anchor-mismatch",
      title: "Designer anchor mismatch",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-active",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });

    expect(() =>
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-frontend",
        report: makeDesignerReport(
          "designer-anchor-mismatch",
          "tk-frontend",
          "ic-other",
        ),
        submittedAt: "2026-05-06T00:00:03.000Z",
      }),
    ).toThrow(/SUBAGENT_REPORT_ANCHOR_REJECTED/);
    expect(state.subagent_reports ?? []).toHaveLength(0);
    expect(state.seenReportIdsTotal ?? 0).toBe(0);
    expect(state.tasks[0]?.subagent_reports ?? []).toHaveLength(0);
  });

  it("persists a legacy designer report without apply_context", () => {
    const state = createChangeWorkflowState({
      changeId: "designer-anchor-legacy",
      title: "Designer anchor legacy",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-legacy",
        title: "Legacy task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-legacy",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
    });

    applySubagentReportSubmittedToState(state, {
      taskId: "tk-legacy",
      report: makeLegacyDesignerReport("designer-anchor-legacy", "tk-legacy"),
      submittedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.subagent_reports).toHaveLength(1);
    expect(state.seenReportIdsTotal).toBe(1);
    expect(state.tasks[0]?.subagent_reports).toHaveLength(1);
  });

  it("rejects a designer report when the signal taskId conflicts with the report owner task", () => {
    const state = createChangeWorkflowState({
      changeId: "designer-owner-mismatch",
      title: "Designer owner mismatch",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    for (const [id, priority] of [
      ["tk-a", 0],
      ["tk-b", 1],
    ] as const) {
      applyTaskAddedToState(state, {
        task: {
          id,
          title: `Task ${id}`,
          type: "code",
          status: "pending",
          priority,
          created_at: "2026-05-06T00:00:01.000Z",
          metadata: { frontend: "true" },
        },
        addedAt: "2026-05-06T00:00:01.000Z",
      });
    }
    applyTaskAssignedToState(state, {
      taskId: "tk-a",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-a",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-b",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-b",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });

    // The report is owned by tk-b but claims tk-a's active cycle. A payload
    // taskId of tk-a must not anchor cycle validation to tk-a while the
    // evidence persists under tk-b.
    expect(() =>
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-a",
        report: makeDesignerReport("designer-owner-mismatch", "tk-b", "ic-a"),
        submittedAt: "2026-05-06T00:00:03.000Z",
      }),
    ).toThrow(/SUBAGENT_REPORT_OWNER_MISMATCH/);
    expect(state.subagent_reports ?? []).toHaveLength(0);
    expect(state.seenReportIds ?? []).toHaveLength(0);
    expect(state.seenReportIdsTotal ?? 0).toBe(0);
    expect(state.tasks[0]?.subagent_reports ?? []).toHaveLength(0);
    expect(state.tasks[1]?.subagent_reports ?? []).toHaveLength(0);
  });

  it("rejects a task-scoped engineer report when the signal taskId conflicts with the report owner task", () => {
    const state = createChangeWorkflowState({
      changeId: "engineer-owner-mismatch",
      title: "Engineer owner mismatch",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    for (const [id, priority] of [
      ["tk-a", 0],
      ["tk-b", 1],
    ] as const) {
      applyTaskAddedToState(state, {
        task: {
          id,
          title: `Task ${id}`,
          type: "code",
          status: "pending",
          priority,
          created_at: "2026-05-06T00:00:01.000Z",
        },
        addedAt: "2026-05-06T00:00:01.000Z",
      });
    }

    // The ownership boundary is generic to task-scoped reports, not
    // designer-only: a conflicting payload taskId is rejected before any
    // storage even when no apply_context cycle is claimed.
    expect(() =>
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-a",
        report: makeEngineerReport("engineer-owner-mismatch", "tk-b"),
        submittedAt: "2026-05-06T00:00:02.000Z",
      }),
    ).toThrow(/SUBAGENT_REPORT_OWNER_MISMATCH/);
    expect(state.subagent_reports ?? []).toHaveLength(0);
    expect(state.seenReportIds ?? []).toHaveLength(0);
    expect(state.seenReportIdsTotal ?? 0).toBe(0);
    expect(state.tasks[0]?.subagent_reports ?? []).toHaveLength(0);
    expect(state.tasks[1]?.subagent_reports ?? []).toHaveLength(0);
  });

  it("persists a cycle-anchored designer report under the report owner when the signal omits taskId", () => {
    const state = createChangeWorkflowState({
      changeId: "designer-owner-derived",
      title: "Designer owner derived",
      createdAt: "2026-05-06T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-frontend",
        title: "Frontend task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
        metadata: { frontend: "true" },
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskAssignedToState(state, {
      taskId: "tk-frontend",
      sessionId: "agent",
      assignedAt: "2026-05-06T00:00:02.000Z",
      applyCycle: {
        implementation_cycle_id: "ic-frontend",
        started_at: "2026-05-06T00:00:02.000Z",
        kind: "initial",
      },
    });

    applySubagentReportSubmittedToState(state, {
      report: makeDesignerReport(
        "designer-owner-derived",
        "tk-frontend",
        "ic-frontend",
      ),
      submittedAt: "2026-05-06T00:00:03.000Z",
    });

    expect(state.subagent_reports).toHaveLength(1);
    expect(state.seenReportIdsTotal).toBe(1);
    expect(state.tasks[0]?.subagent_reports).toHaveLength(1);
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

  describe("acceptanceReadinessRevision", () => {
    function makeContract() {
      return {
        version: 1 as const,
        rigor: "standard" as const,
        source: {
          artifact: "agreement",
          approvedAt: "2026-05-06T00:00:00.000Z",
        },
        items: [
          {
            id: "AC1",
            kind: "acceptance_criterion" as const,
            text: "Criterion one",
            sourceArtifact: "agreement",
            verificationRequired: true,
            evidencePolicy: "test",
            status: "approved",
          },
        ],
        amendments: [],
      };
    }

    function makeReviewMatrix() {
      return {
        reviewedAt: "2026-05-06T00:00:01.000Z",
        rows: [
          {
            contractId: "AC1",
            kind: "acceptance_criterion" as const,
            status: "pass" as const,
            evidencePolicy: "test",
            evidence: "reviewed",
          },
        ],
      };
    }

    it("initializes to zero", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-init",
        title: "ARR init",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      expect(state.acceptanceReadinessRevision).toBe(0);
    });

    it("advances on contract set", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-contract-set",
        title: "ARR contract set",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      applyContractSetToState(state, {
        contract: makeContract(),
        updatedAt: "2026-05-06T00:00:01.000Z",
      });
      expect(state.acceptanceReadinessRevision).toBe(1);
      expect(state.acceptanceCriteria).toEqual(["Criterion one"]);
    });

    it("advances on every contract amendment and preserves matrix for non-invalidating amendments", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-contract-amend",
        title: "ARR contract amend",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      state.contract = makeContract();
      state.contract.reviewMatrix = makeReviewMatrix();
      state.acceptanceReadinessRevision = 1;

      applyContractAmendedToState(state, {
        amendments: [
          {
            id: "am-1",
            actor: "tester",
            reason: "typo fix",
            approvalEvidence: "approved",
            amendedAt: "2026-05-06T00:00:02.000Z",
            affectedIds: ["AC1"],
            invalidatesReviewMatrix: false,
          },
        ],
        updatedAt: "2026-05-06T00:00:02.000Z",
      });

      expect(state.acceptanceReadinessRevision).toBe(2);
      expect(state.contract.reviewMatrix).toBeDefined();
    });

    it("advances on invalidating contract amendments and removes the review matrix", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-contract-amend-invalidating",
        title: "ARR invalidating amend",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      state.contract = makeContract();
      state.contract.reviewMatrix = makeReviewMatrix();
      state.acceptanceReadinessRevision = 3;

      applyContractAmendedToState(state, {
        amendments: [
          {
            id: "am-2",
            actor: "tester",
            reason: "substantive change",
            approvalEvidence: "approved",
            amendedAt: "2026-05-06T00:00:03.000Z",
            affectedIds: ["AC1"],
            invalidatesReviewMatrix: true,
          },
        ],
        updatedAt: "2026-05-06T00:00:03.000Z",
      });

      expect(state.acceptanceReadinessRevision).toBe(4);
      expect(state.contract.reviewMatrix).toBeUndefined();
    });

    it("advances on review matrix set", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-matrix-set",
        title: "ARR matrix set",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      state.contract = makeContract();
      state.acceptanceReadinessRevision = 4;

      applyContractReviewMatrixSetToState(state, {
        reviewMatrix: makeReviewMatrix(),
        updatedAt: "2026-05-06T00:00:04.000Z",
      });

      expect(state.acceptanceReadinessRevision).toBe(5);
      expect(state.contract.reviewMatrix).toBeDefined();
    });

    it("advances on relevant non-release gate re-entry and removes the review matrix", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-reentry",
        title: "ARR reentry",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      state.contract = makeContract();
      state.contract.reviewMatrix = makeReviewMatrix();
      state.acceptanceReadinessRevision = 5;

      applyGateReenteredToState(state, {
        fromGateId: "execution",
        reason: "scope changed",
        reenteredBy: "tester",
        reenteredAt: "2026-05-06T00:00:05.000Z",
      });

      expect(state.acceptanceReadinessRevision).toBe(6);
      expect(state.contract.reviewMatrix).toBeUndefined();
      expect(state.gates.execution).toMatchObject({ status: "pending" });
    });

    it("does not advance on release gate re-entry", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-release-reentry",
        title: "ARR release reentry",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      state.contract = makeContract();
      state.contract.reviewMatrix = makeReviewMatrix();
      state.acceptanceReadinessRevision = 6;

      applyGateReenteredToState(state, {
        fromGateId: "release",
        reason: "retry release",
        reenteredBy: "tester",
        reenteredAt: "2026-05-06T00:00:06.000Z",
      });

      expect(state.acceptanceReadinessRevision).toBe(6);
      expect(state.contract.reviewMatrix).toBeDefined();
    });

    it("advances on design-concern disposition", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-design-concern",
        title: "ARR design concern",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      state.acceptanceReadinessRevision = 6;

      applyDesignConcernDispositionedToState(state, {
        taskId: "tk-design",
        concernKey: "component_correctness",
        disposition: "fixed",
        evidence: "Re-implemented with a semantic <button>.",
        dispositionedAt: "2026-05-06T00:00:07.000Z",
        mutationReceiptId: "mrec-design",
      });

      expect(state.acceptanceReadinessRevision).toBe(7);
      expect(state.design_concern_dispositions).toHaveLength(1);
    });

    it("advances on verification-evidence disposition", () => {
      const state = createChangeWorkflowState({
        changeId: "arr-verification-evidence",
        title: "ARR verification evidence",
        createdAt: "2026-05-06T00:00:00.000Z",
      });
      state.acceptanceReadinessRevision = 7;

      applyVerificationEvidenceDispositionedToState(state, {
        taskId: "tk-verify",
        concernKey: "verification_mismatch",
        disposition: "fixed",
        evidence: "Re-ran targeted suite; binding now matches.",
        dispositionedAt: "2026-05-06T00:00:08.000Z",
        mutationReceiptId: "mrec-verify",
      });

      expect(state.acceptanceReadinessRevision).toBe(8);
      expect(state.verification_evidence_dispositions).toHaveLength(1);
    });

    it("preserves legacy default zero when seeding from a persisted change without the field", () => {
      const change: Change = {
        id: "arr-legacy",
        title: "Legacy change",
        status: "draft",
        created_at: "2026-05-06T00:00:00.000Z",
        tasks: [],
        subagent_reports: [],
        deltas: {},
        wisdom: [],
        gates: {
          proposal: { status: "pending" },
          discovery: { status: "pending" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        contract: makeContract(),
      };
      const state = changeToWorkflowState({ projectId: "proj", change });
      expect(state.acceptanceReadinessRevision).toBeUndefined();
      applyContractAmendedToState(state, {
        amendments: [
          {
            id: "am-legacy",
            actor: "tester",
            reason: "legacy amendment",
            amendedAt: "2026-05-06T00:00:01.000Z",
            affectedIds: ["AC1"],
            invalidatesReviewMatrix: false,
          },
        ],
        updatedAt: "2026-05-06T00:00:01.000Z",
      });
      expect(state.acceptanceReadinessRevision).toBe(1);
    });
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

  it("applyOriginRepairedToState updates origin and lastSignalAt", () => {
    const state = createChangeWorkflowState({
      changeId: "origin-repair-test",
      title: "Origin repair test",
      createdAt: "2026-05-11T00:00:00.000Z",
    });
    state.origin = { kind: "adhoc" };

    applyOriginRepairedToState(state, {
      origin: { kind: "roadmap", issue_number: 77 },
      repairedBy: "agent",
      repairedAt: "2026-05-11T01:00:00.000Z",
      approvalEvidence: "operator approved",
      reason: "origin was missing issue number",
    });

    expect(state.origin).toEqual({ kind: "roadmap", issue_number: 77 });
    expect(state.lastSignalAt).toBe("2026-05-11T01:00:00.000Z");
  });
});

describe("reviewer-owned evidence reference", () => {
  function stateWithReviewTask(policy: string, plan?: any) {
    const state = createChangeWorkflowState({
      changeId: "reviewer-evidence-test",
      title: "Reviewer evidence test",
      createdAt: "2026-07-17T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-review",
        title: "Review task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-07-17T00:00:01.000Z",
        evidence_policy: policy,
        evidence_plan: plan,
      },
      addedAt: "2026-07-17T00:00:01.000Z",
    });
    return state;
  }

  it("writes review_evidence_ref when a reviewer report is persisted for a non-test behavior-critical task", () => {
    const state = stateWithReviewTask("review", {
      policy: "review",
      proof_target: "Structured review conclusion",
      rationale: "Peer review is sufficient.",
      provenance: "new",
      stage: "stage-v2",
    });

    applySubagentReportSubmittedToState(state, {
      taskId: "tk-review",
      report: makeReviewerReport("reviewer-evidence-test", "tk-review"),
      submittedAt: "2026-07-17T00:00:02.000Z",
    });

    const task = state.tasks[0];
    expect(task.evidence_plan?.review_evidence_ref).toEqual({
      report_key: "reviewer-evidence-test|tk-review|adv-reviewer|1",
    });
  });

  it("creates evidence_plan with review_evidence_ref when task has evidence_policy but no evidence_plan", () => {
    // Regression: tasks created with only task-level evidence_policy (no
    // evidence_plan object) must still get review_evidence_ref auto-linked
    // when a reviewer report is persisted. Previously the truthy guard on
    // task.evidence_plan silently skipped the write, permanently blocking
    // task completion for review-policy tasks.
    const state = stateWithReviewTask("review", undefined);

    applySubagentReportSubmittedToState(state, {
      taskId: "tk-review",
      report: makeReviewerReport("reviewer-evidence-test", "tk-review"),
      submittedAt: "2026-07-17T00:00:02.000Z",
    });

    const task = state.tasks[0];
    expect(task.evidence_plan).toBeDefined();
    expect(task.evidence_plan?.review_evidence_ref).toEqual({
      report_key: "reviewer-evidence-test|tk-review|adv-reviewer|1",
    });
    expect(task.evidence_plan?.provenance).toBe("legacy");
    expect(task.evidence_plan?.policy).toBe("review");
  });

  it("does not write review_evidence_ref for test-route tasks", () => {
    const state = stateWithReviewTask("test", {
      policy: "test",
      proof_target: "Automated tests",
      provenance: "new",
      stage: "stage-v2",
    });

    applySubagentReportSubmittedToState(state, {
      taskId: "tk-review",
      report: makeReviewerReport("reviewer-evidence-test", "tk-review"),
      submittedAt: "2026-07-17T00:00:02.000Z",
    });

    const task = state.tasks[0];
    expect(task.evidence_plan?.review_evidence_ref).toBeUndefined();
  });

  it("does not write review_evidence_ref for non-behavior-critical tasks", () => {
    const state = stateWithReviewTask("review", {
      policy: "review",
      proof_target: "Structured review conclusion",
      provenance: "new",
      stage: "stage-v2",
    });
    state.tasks[0].type = "docs";

    applySubagentReportSubmittedToState(state, {
      taskId: "tk-review",
      report: makeReviewerReport("reviewer-evidence-test", "tk-review"),
      submittedAt: "2026-07-17T00:00:02.000Z",
    });

    const task = state.tasks[0];
    expect(task.evidence_plan?.review_evidence_ref).toBeUndefined();
  });
});

describe("applyTaskCompletedToState evidence plan validation (AC1/AC2/AC3)", () => {
  function baseCodeTask(overrides: any = {}) {
    return {
      id: "tk-code",
      title: "Implement feature",
      type: "code",
      status: "pending" as const,
      priority: 0,
      created_at: "2026-07-17T00:00:00.000Z",
      metadata: { tdd_intent: "inline" },
      ...overrides,
    };
  }

  function makeStateWithTask(task: any) {
    const state = createChangeWorkflowState({
      changeId: "evidence-plan-test",
      title: "Evidence plan test",
      createdAt: "2026-07-17T00:00:00.000Z",
    });
    applyTaskAddedToState(state, { task, addedAt: "2026-07-17T00:00:01.000Z" });
    return state;
  }

  it("rejects completion when code task has not_applicable evidence plan", () => {
    const state = makeStateWithTask(
      baseCodeTask({
        evidence_policy: "not_applicable",
        evidence_plan: {
          policy: "not_applicable",
          proof_target: "No evidence required",
          provenance: "new",
        },
      }),
    );
    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-code",
        verification: "verified",
        summary: "done",
        filesTouched: [],
        completedAt: "2026-07-17T00:00:02.000Z",
      }),
    ).toThrow(/TASK_COMPLETION_BLOCKED.*evidence.*plan|not_applicable/i);
    expect(state.tasks[0]?.status).not.toBe("done");
  });

  it("rejects completion when code task has non-test route without review proof", () => {
    const state = makeStateWithTask(
      baseCodeTask({
        evidence_policy: "review",
        evidence_plan: {
          policy: "review",
          proof_target: "Structured review conclusion",
          rationale: "Peer review is sufficient.",
          provenance: "new",
        },
      }),
    );
    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-code",
        verification: "verified",
        summary: "done",
        filesTouched: [],
        completedAt: "2026-07-17T00:00:02.000Z",
      }),
    ).toThrow(/TASK_COMPLETION_BLOCKED.*review.*conclusion|review proof/i);
    expect(state.tasks[0]?.status).not.toBe("done");
  });

  it("allows completion when code task has non-test route with review evidence ref", () => {
    const state = makeStateWithTask(
      baseCodeTask({
        evidence_policy: "review",
        evidence_plan: {
          policy: "review",
          proof_target: "Structured review conclusion",
          rationale: "Peer review is sufficient.",
          review_evidence_ref: {
            report_key: "test-change|tk-code|adv-reviewer|1",
          },
          provenance: "new",
        },
      }),
    );
    // Seed the matching reviewer report so the ref resolves.
    state.subagent_reports = [
      {
        schema_version: "1.0",
        change_id: "test-change",
        task_id: "tk-code",
        attempt: 1,
        workdir_used: "/tmp/test",
        agent: "adv-reviewer",
        scope: { kind: "task", task_id: "tk-code" },
        phase: "review",
        verdict: "READY",
        blocking_findings: [],
        nonblocking_findings: [],
        changes_made: [],
        wisdom_candidates: [],
        verification: { tests_run: [], results: "n/a", evidence: "review" },
        scope_drift: null,
        risks: [],
        required_main_agent_actions: [],
      },
    ] as any;
    applyTaskCompletedToState(state, {
      taskId: "tk-code",
      verification: "verified",
      summary: "done",
      filesTouched: [],
      completedAt: "2026-07-17T00:00:02.000Z",
    });
    expect(state.tasks[0]?.status).toBe("done");
  });

  it("allows completion for legacy code task with review conclusion", () => {
    const state = makeStateWithTask(
      baseCodeTask({
        evidence_policy: "review",
        evidence_plan: {
          policy: "review",
          proof_target: "Structured review conclusion",
          rationale: "Peer review is sufficient.",
          review_conclusion: "reviewer-verdict-abc",
          provenance: "legacy",
        },
      }),
    );
    applyTaskCompletedToState(state, {
      taskId: "tk-code",
      verification: "verified",
      summary: "done",
      filesTouched: [],
      completedAt: "2026-07-17T00:00:02.000Z",
    });
    expect(state.tasks[0]?.status).toBe("done");
  });

  it("allows completion for legacy code task without evidence plan", () => {
    const state = makeStateWithTask(baseCodeTask());
    applyTaskCompletedToState(state, {
      taskId: "tk-code",
      verification: "verified",
      summary: "done",
      filesTouched: [],
      completedAt: "2026-07-17T00:00:02.000Z",
    });
    expect(state.tasks[0]?.status).toBe("done");
  });

  it("completes a non-code source-citation task without test runs or red/green IDs", () => {
    const state = makeStateWithTask(
      baseCodeTask({
        id: "tk-sources",
        title: "Audit cited sources",
        type: "research",
        metadata: { tdd_intent: "not_applicable" },
        evidence_policy: "source_citation",
        evidence_plan: {
          policy: "source_citation",
          proof_target: "Cited source audit",
          provenance: "new",
          stage: "stage-v2",
        },
      }),
    );

    applyTaskCompletedToState(state, {
      taskId: "tk-sources",
      verification: "Sources cited and audited.",
      summary: "source audit complete",
      filesTouched: [],
      completedAt: "2026-07-17T00:00:02.000Z",
    });

    expect(state.tasks[0]?.status).toBe("done");
    expect(state.testRuns?.["tk-sources"]).toBeUndefined();
  });

  it("keeps behavior-bearing inline code blocked without exact red and green runs", () => {
    const state = makeStateWithTask(
      baseCodeTask({
        evidence_policy: "test",
        evidence_plan: {
          policy: "test",
          proof_target: "Automated red/green tests",
          provenance: "new",
          stage: "stage-v2",
        },
      }),
    );

    expect(() =>
      applyTaskCompletedToState(state, {
        taskId: "tk-code",
        verification: "tests passed",
        summary: "done",
        filesTouched: [],
        completedAt: "2026-07-17T00:00:02.000Z",
        lastRedRunId: "tr-red-missing",
        lastGreenRunId: "tr-green-missing",
      }),
    ).toThrow(/TASK_ORDERING_VIOLATION/);
    expect(state.tasks[0]?.status).toBe("pending");
  });

  it("preserves evidence plan on completed task as typed proof", () => {
    const plan = {
      policy: "test" as const,
      proof_target: "Automated red/green tests",
      provenance: "new" as const,
    };
    const state = makeStateWithTask(baseCodeTask({ evidence_plan: plan }));
    applyTaskCompletedToState(state, {
      taskId: "tk-code",
      verification: "verified",
      summary: "done",
      filesTouched: ["src/foo.ts"],
      completedAt: "2026-07-17T00:00:02.000Z",
    });
    expect(state.tasks[0]?.status).toBe("done");
    expect(state.tasks[0]?.evidence_plan).toMatchObject(plan);
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

describe("applyDesignConcernDispositionedToState", () => {
  function baseState() {
    return createChangeWorkflowState({
      changeId: "addDesignQualityGates",
      title: "Add design quality gates",
      createdAt: "2026-06-25T00:00:00.000Z",
    });
  }

  const disposition = {
    taskId: "tk-design123",
    concernKey: "dimension:site_design_consistency",
    disposition: "rejected_with_evidence" as const,
    evidence: "Legacy page out of scope; fast-follow #123.",
    dispositionedAt: "2026-06-25T14:00:00.000Z",
  };

  it("appends a design-concern disposition to state", () => {
    const state = applyDesignConcernDispositionedToState(
      baseState(),
      disposition,
    );
    expect(state.design_concern_dispositions).toHaveLength(1);
    expect(state.design_concern_dispositions![0].concernKey).toBe(
      "dimension:site_design_consistency",
    );
    expect(state.design_concern_dispositions![0].disposition).toBe(
      "rejected_with_evidence",
    );
  });

  it("latest-wins on the same (taskId, concernKey)", () => {
    let state = applyDesignConcernDispositionedToState(
      baseState(),
      disposition,
    );
    state = applyDesignConcernDispositionedToState(state, {
      ...disposition,
      disposition: "fixed",
      evidence: "Reworked to match site family.",
      dispositionedAt: "2026-06-25T15:00:00.000Z",
    });

    expect(state.design_concern_dispositions).toHaveLength(1);
    expect(state.design_concern_dispositions![0].disposition).toBe("fixed");
    expect(state.design_concern_dispositions![0].dispositionedAt).toBe(
      "2026-06-25T15:00:00.000Z",
    );
  });

  it("keeps distinct (taskId, concernKey) dispositions separate", () => {
    let state = applyDesignConcernDispositionedToState(
      baseState(),
      disposition,
    );
    state = applyDesignConcernDispositionedToState(state, {
      ...disposition,
      concernKey: "neighbor:0",
      disposition: "split",
    });

    expect(state.design_concern_dispositions).toHaveLength(2);
  });
});

describe("applyVerificationEvidenceDispositionedToState", () => {
  function baseState() {
    return createChangeWorkflowState({
      changeId: "strengthenAgentEvidence",
      title: "Strengthen agent evidence",
      createdAt: "2026-06-25T00:00:00.000Z",
    });
  }

  const disposition = {
    taskId: "tk-ver-1",
    concernKey: "verification",
    disposition: "rejected_with_evidence" as const,
    evidence: "adv_run_test evidence captured under run id tr_abc.",
    dispositionedAt: "2026-06-25T14:00:00.000Z",
  };

  it("appends a verification-evidence disposition to state", () => {
    const state = applyVerificationEvidenceDispositionedToState(
      baseState(),
      disposition,
    );
    expect(state.verification_evidence_dispositions).toHaveLength(1);
    expect(state.verification_evidence_dispositions![0].concernKey).toBe(
      "verification",
    );
    expect(state.verification_evidence_dispositions![0].disposition).toBe(
      "rejected_with_evidence",
    );
  });

  it("latest-wins on the same (taskId, concernKey)", () => {
    let state = applyVerificationEvidenceDispositionedToState(
      baseState(),
      disposition,
    );
    state = applyVerificationEvidenceDispositionedToState(state, {
      ...disposition,
      disposition: "fixed",
      evidence: "Verification re-run and captured.",
      dispositionedAt: "2026-06-25T15:00:00.000Z",
    });

    expect(state.verification_evidence_dispositions).toHaveLength(1);
    expect(state.verification_evidence_dispositions![0].disposition).toBe(
      "fixed",
    );
    expect(state.verification_evidence_dispositions![0].dispositionedAt).toBe(
      "2026-06-25T15:00:00.000Z",
    );
  });

  it("keeps distinct taskIds separate", () => {
    let state = applyVerificationEvidenceDispositionedToState(
      baseState(),
      disposition,
    );
    state = applyVerificationEvidenceDispositionedToState(state, {
      ...disposition,
      taskId: "tk-ver-2",
      disposition: "split",
    });

    expect(state.verification_evidence_dispositions).toHaveLength(2);
  });
});

describe("archive convergence split-state invariant", () => {
  function baseState() {
    return createChangeWorkflowState({
      changeId: "archiveConverged",
      title: "Archive convergence",
      createdAt: "2026-07-24T00:00:00.000Z",
      gates: createDefaultGates(),
    });
  }

  const releaseCompletion = {
    gateId: "release" as const,
    completedAt: "2026-07-24T01:00:00.000Z",
    completedBy: "adv-archive",
    approvalEvidence: "shipped via direct merge",
  };

  const phase9Status = {
    status: "done" as const,
    startedAt: "2026-07-24T00:30:00.000Z",
    completedAt: "2026-07-24T01:00:00.000Z",
  };

  it("never leaves status archived without release done and phase9 done", () => {
    const state = baseState();
    applyGateCompletedToState(state, releaseCompletion);
    state.phase9_status = phase9Status;
    applyArchiveRequestedToState(state, {
      requestedAt: "2026-07-24T01:00:00.000Z",
      requestedBy: "adv-archive",
      approvalEvidence: "shipped via direct merge",
    });

    expect(state.status).toBe("archived");
    expect(state.lifecycleState).toBe("archived");
    expect(state.terminated).toBe(true);
    expect(state.gates.release?.status).toBe("done");
    expect(state.phase9_status?.status).toBe("done");
  });
});

// =============================================================================
// AC3 / SC3 — Legacy acceptance-criteria projection from contract
// =============================================================================

describe("AC3/SC3 — acceptanceCriteriaFromContract legacy projection", () => {
  function makeContract(
    items: Array<{ id: string; kind: string; text: string; variant?: unknown }>,
  ) {
    return {
      version: 1 as const,
      rigor: "standard" as const,
      source: {
        artifact: "agreement" as const,
        approvedAt: "2026-05-08T00:00:00.000Z",
      },
      items: items.map((item) => ({
        ...item,
        sourceArtifact: "agreement" as const,
        verificationRequired: true,
        evidencePolicy: "test" as const,
        status: "approved" as const,
      })),
      amendments: [],
    };
  }

  it("AC3: projects only canonical text for flat-text acceptance criteria", () => {
    const contract = makeContract([
      {
        id: "AC1",
        kind: "acceptance_criterion",
        text: "First flat criterion.",
      },
      {
        id: "AC2",
        kind: "acceptance_criterion",
        text: "Second flat criterion.",
      },
    ]);

    expect(acceptanceCriteriaFromContract(contract as any)).toEqual([
      "First flat criterion.",
      "Second flat criterion.",
    ]);
  });

  it("SC3: projects only canonical text for variant-bearing criteria", () => {
    const contract = makeContract([
      {
        id: "AC1",
        kind: "acceptance_criterion",
        text: "Given a request, when valid, then it succeeds.",
        variant: {
          kind: "behavioral",
          context: "a request",
          trigger: "valid",
          outcome: "it succeeds",
        },
      },
      {
        id: "AC2",
        kind: "acceptance_criterion",
        text: "Coverage is proven by passing tests.",
        variant: {
          kind: "evidence",
          subject: "Coverage is proven",
          method: "passing tests",
        },
      },
    ]);

    expect(acceptanceCriteriaFromContract(contract as any)).toEqual([
      "Given a request, when valid, then it succeeds.",
      "Coverage is proven by passing tests.",
    ]);
  });

  it("SC3: ignores non-acceptance-criterion items in the projection", () => {
    const contract = makeContract([
      { id: "SC1", kind: "success_criterion", text: "Success criterion." },
      {
        id: "AC1",
        kind: "acceptance_criterion",
        text: "Acceptance criterion.",
      },
      { id: "C1", kind: "constraint", text: "Constraint." },
      { id: "DONT1", kind: "avoidance", text: "Avoidance." },
    ]);

    expect(acceptanceCriteriaFromContract(contract as any)).toEqual([
      "Acceptance criterion.",
    ]);
  });

  it("AC3: applyContractSetToState preserves the contract and projects text-only acceptanceCriteria", () => {
    const state = createChangeWorkflowState({
      changeId: "ac3-projection",
      title: "AC3 projection",
      createdAt: "2026-05-08T00:00:00.000Z",
    });

    const contract = makeContract([
      {
        id: "AC1",
        kind: "acceptance_criterion",
        text: "Given a signal, when valid, then state updates.",
        variant: {
          kind: "behavioral",
          context: "a signal",
          trigger: "valid",
          outcome: "state updates",
        },
      },
      { id: "C1", kind: "constraint", text: "Preserve compatibility." },
    ]);

    applyContractSetToState(state, {
      contract: contract as any,
      updatedAt: "2026-05-08T00:00:01.000Z",
    });

    expect(state.contract?.items[0].variant).toEqual({
      kind: "behavioral",
      context: "a signal",
      trigger: "valid",
      outcome: "state updates",
    });
    expect(state.acceptanceCriteria).toEqual([
      "Given a signal, when valid, then state updates.",
    ]);
  });
});

// Issue #349: duplicate strategy_label corruption
describe("error_recovery strategy_label deduplication (issue #349)", () => {
  it("produces distinct strategy_labels when the same agent submits blockers twice", () => {
    const state = createChangeWorkflowState({
      changeId: "issue-349-dedup",
      title: "Issue 349 dedup",
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-blocked",
        title: "Blocked task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-07-31T00:00:01.000Z",
      },
      addedAt: "2026-07-31T00:00:01.000Z",
    });

    const blockerReport = {
      schema_version: "1.0" as const,
      change_id: "issue-349-dedup",
      scope: { kind: "task" as const, task_id: "tk-blocked" },
      attempt: 1,
      agent: "adv-reviewer" as const,
      status: "complete" as const,
      evidence_binding_version: "typed-v1" as const,
      files_touched: [],
      verification: [{ command: "pnpm test", exit_code: 0, summary: "pass" }],
      decisions: [],
      blocking_findings: [
        {
          finding: "Test failure in foo",
          contract_ids: ["AC1"],
          scope: "in_scope" as const,
          in_scope_remediation: "Fix foo",
          source: {
            label: "test",
            locator: "test.ts:1",
            summary: "fail",
          },
        },
      ],
      changes_made: [],
      scope_drift: null,
      follow_ups: [],
      required_main_agent_actions: [],
      related_scan: "",
      context_update_for_adv: {
        what_ads_needs_to_know: "",
        suggested_next_action: "",
      },
    };

    // First submission with blocker
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-blocked",
      report: blockerReport,
      submittedAt: "2026-07-31T00:00:02.000Z",
    });

    // Second submission with same blocker (e.g. resubmission after verification_missing)
    applySubagentReportSubmittedToState(state, {
      taskId: "tk-blocked",
      report: { ...blockerReport, attempt: 2 },
      submittedAt: "2026-07-31T00:00:03.000Z",
    });

    const attempts = state.tasks[0]?.error_recovery?.attempts ?? [];
    expect(attempts).toHaveLength(2);
    const labels = attempts.map((a) => a.strategy_label);
    expect(labels[0]).toBe("adv-reviewer-reported-blocker");
    expect(labels[1]).toBe("adv-reviewer-reported-blocker-2");
    expect(new Set(labels).size).toBe(2); // distinct
  });
});

describe("error_recovery retry-budget clamp (clampDoomLoopAccumulator)", () => {
  /**
   * Regression: the doom-loop accumulator wrote `retry_count` straight from the
   * monotonic report attempt and appended to `attempts[]` without bound, while
   * `max_retries` was hardcoded to 3. The read-path schema rejects
   * `attempts.length > max_retries` (types/tasks.ts superRefine), so a fourth
   * blocked sub-agent report produced state that ADV itself refuses to read —
   * bricking the change on both the read and write paths.
   *
   * The reducer is the only self-heal site: Temporal rebuilds workflow state by
   * replaying history through it, so a clamped reducer re-derives valid state
   * from unchanged poisoned histories.
   */
  function seedBlockedTask(changeId: string) {
    const state = createChangeWorkflowState({
      changeId,
      title: "Clamp accumulator",
      createdAt: "2026-08-04T00:00:00.000Z",
    });
    applyTaskAddedToState(state, {
      task: {
        id: "tk-blocked",
        title: "Blocked task",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-08-04T00:00:01.000Z",
      },
      addedAt: "2026-08-04T00:00:01.000Z",
    });
    return state;
  }

  function blockerReport(changeId: string, attempt: number) {
    return {
      schema_version: "1.0" as const,
      change_id: changeId,
      scope: { kind: "task" as const, task_id: "tk-blocked" },
      attempt,
      agent: "adv-reviewer" as const,
      status: "complete" as const,
      evidence_binding_version: "typed-v1" as const,
      files_touched: [],
      verification: [{ command: "pnpm test", exit_code: 0, summary: "pass" }],
      decisions: [],
      blocking_findings: [
        {
          finding: `Blocking finding ${attempt}`,
          contract_ids: ["AC1"],
          scope: "in_scope" as const,
          in_scope_remediation: `Fix finding ${attempt}`,
          source: {
            label: "test",
            locator: `test.ts:${attempt}`,
            summary: "fail",
          },
        },
      ],
      changes_made: [],
      scope_drift: null,
      follow_ups: [],
      required_main_agent_actions: [],
      related_scan: "",
      context_update_for_adv: {
        what_ads_needs_to_know: "",
        suggested_next_action: "",
      },
    };
  }

  function submitBlockers(changeId: string, count: number) {
    const state = seedBlockedTask(changeId);
    for (let attempt = 1; attempt <= count; attempt++) {
      applySubagentReportSubmittedToState(state, {
        taskId: "tk-blocked",
        report: blockerReport(changeId, attempt),
        submittedAt: `2026-08-04T00:00:${String(attempt + 1).padStart(2, "0")}.000Z`,
      });
    }
    return state;
  }

  it("bounds attempts[] to max_retries once the budget is exceeded", () => {
    const state = submitBlockers("clamp-bounds-attempts", 4);
    const recovery = state.tasks[0]?.error_recovery;

    expect(recovery).toBeDefined();
    expect(recovery?.attempts).toHaveLength(recovery?.max_retries ?? 0);
  });

  it("retains the most recent attempts and preserves their true attempt_number", () => {
    const state = submitBlockers("clamp-retains-recent", 5);
    const recovery = state.tasks[0]?.error_recovery;
    const numbers = (recovery?.attempts ?? []).map((a) => a.attempt_number);

    // Most recent max_retries entries survive; earlier ones are elided.
    expect(numbers).toEqual([3, 4, 5]);
    // Bounding the window must never renumber history into 1..n — an operator
    // must be able to see that attempts 1 and 2 happened and were dropped.
    expect(numbers).not.toEqual([1, 2, 3]);
  });

  it("clamps retry_count to max_retries rather than the raw report attempt", () => {
    const state = submitBlockers("clamp-retry-count", 6);
    const recovery = state.tasks[0]?.error_recovery;

    expect(recovery?.retry_count).toBe(recovery?.max_retries);
    expect(recovery?.retry_count).not.toBe(6);
  });

  it("keeps error_recovery readable by the read-path schema after 4+ blocked reports", () => {
    const state = submitBlockers("clamp-schema-valid", 4);
    const recovery = state.tasks[0]?.error_recovery;

    // This is the assertion that matters: before the clamp this failed with
    // "retry_count must not exceed max_retries", which is exactly the state
    // that made a whole change unreadable and unwritable.
    const parsed = ErrorRecoverySchema.safeParse(recovery);
    expect(parsed.success).toBe(true);
  });

  it("stays within budget for report counts far beyond max_retries", () => {
    const state = submitBlockers("clamp-far-beyond", 12);
    const recovery = state.tasks[0]?.error_recovery;

    expect(recovery?.attempts).toHaveLength(recovery?.max_retries ?? 0);
    expect(ErrorRecoverySchema.safeParse(recovery).success).toBe(true);
  });

  it("leaves under-budget accumulation untouched", () => {
    const state = submitBlockers("clamp-under-budget", 2);
    const recovery = state.tasks[0]?.error_recovery;

    expect(recovery?.attempts).toHaveLength(2);
    expect(recovery?.retry_count).toBe(2);
    expect((recovery?.attempts ?? []).map((a) => a.attempt_number)).toEqual([
      1, 2,
    ]);
    expect(ErrorRecoverySchema.safeParse(recovery).success).toBe(true);
  });
});
