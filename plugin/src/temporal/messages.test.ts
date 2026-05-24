import { describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/workflow", () => ({
  defineQuery: vi.fn((name: string) => ({ kind: "query", name })),
  defineSignal: vi.fn((name: string) => ({ kind: "signal", name })),
  defineUpdate: vi.fn((name: string) => ({ kind: "update", name })),
}));

import {
  CHANGE_WORKFLOW_QUERY_NAMES,
  CHANGE_WORKFLOW_SIGNAL_NAMES,
} from "./contracts";
import * as messages from "./messages";
import {
  AcceptanceCriteriaSetSignalPayloadSchema,
  AgreementUpdatedSignalPayloadSchema,
  ArchiveRequestedSignalPayloadSchema,
  ChangeCancelledSignalPayloadSchema,
  ConformanceLockedSignalPayloadSchema,
  ConformanceOverriddenSignalPayloadSchema,
  ConformanceVerdictSignalPayloadSchema,
  ContractAmendedSignalPayloadSchema,
  ContractReviewMatrixSetSignalPayloadSchema,
  ContractSetSignalPayloadSchema,
  DesignUpdatedSignalPayloadSchema,
  GateAwaitingApprovalSignalPayloadSchema,
  GateCompletedSignalPayloadSchema,
  GateInProgressSignalPayloadSchema,
  GateReenteredSignalPayloadSchema,
  GateStuckSignalPayloadSchema,
  ProblemStatementUpdatedSignalPayloadSchema,
  ProposalUpdatedSignalPayloadSchema,
  ReflectionRecordedSignalPayloadSchema,
  SubagentReportSubmittedSignalPayloadSchema,
  TaskAddedSignalPayloadSchema,
  TaskAssignedSignalPayloadSchema,
  TaskBlockedSignalPayloadSchema,
  TaskCancelledSignalPayloadSchema,
  TaskCompletedSignalPayloadSchema,
  TaskRemovedSignalPayloadSchema,
  TaskUpdatedSignalPayloadSchema,
  WisdomAddedSignalPayloadSchema,
  WorktreeAttachedSignalPayloadSchema,
  WorktreeAutoManagedSignalPayloadSchema,
  WorktreeCreatedSignalPayloadSchema,
  WorktreeDeletedSignalPayloadSchema,
} from "../types";

const designSignalKeys = [
  "proposalUpdated",
  "problemStatementUpdated",
  "agreementUpdated",
  "designUpdated",
  "acceptanceCriteriaSet",
  "contractSet",
  "contractAmended",
  "contractReviewMatrixSet",
  "taskAdded",
  "taskUpdated",
  "taskRemoved",
  "taskAssigned",
  "taskCompleted",
  "subagentReportSubmitted",
  "taskBlocked",
  "taskCancelled",
  "gateInProgress",
  "gateAwaitingApproval",
  "gateStuck",
  "gateCompleted",
  "gateReentered",
  "wisdomAdded",
  "reflectionRecorded",
  "worktreeCreated",
  "worktreeDeleted",
  "worktreeAutoManaged",
  "worktreeAttached",
  "conformanceLocked",
  "conformanceVerdict",
  "conformanceOverridden",
  "archiveRequested",
  "changeCancelled",
  "updateArtifactMetadata",
  "archiveChange",
  "closeChange",
] as const;

const designQueryKeys = [
  "getState",
  "getTasks",
  "getGateStatus",
  "getWorktrees",
  "getConformanceState",
] as const;

describe("change workflow message contract", () => {
  it("defines the 35 signal surface", () => {
    const surfacedKeys = Object.keys(CHANGE_WORKFLOW_SIGNAL_NAMES);

    expect(surfacedKeys).toEqual([...designSignalKeys]);
    expect(surfacedKeys).toHaveLength(35);

    for (const key of designSignalKeys) {
      expect(CHANGE_WORKFLOW_SIGNAL_NAMES[key]).toBe(`adv.change.${key}`);
      expect(messages[`${key}Signal` as keyof typeof messages]).toBeDefined();
    }
  });

  it("defines the six design query bindings", () => {
    expect(Object.keys(CHANGE_WORKFLOW_QUERY_NAMES)).toEqual([
      ...designQueryKeys,
    ]);

    for (const key of designQueryKeys) {
      expect(CHANGE_WORKFLOW_QUERY_NAMES[key]).toBe(`adv.change.${key}`);
      expect(messages[`${key}Query` as keyof typeof messages]).toBeDefined();
    }
  });

  it("validates representative payloads for every design signal schema", () => {
    const timestamp = "2026-05-06T00:00:00.000Z";
    const task = {
      id: "tk-1",
      title: "Task",
      type: "code",
      status: "pending",
      priority: 1,
      created_at: timestamp,
    };
    const wisdom = {
      id: "ws-1",
      type: "pattern",
      content: "Use signals for workflow mutations.",
      source_task: "tk-1",
      recorded_at: timestamp,
    };

    const cases = [
      [ProposalUpdatedSignalPayloadSchema, { text: "p", updatedAt: timestamp }],
      [
        ProblemStatementUpdatedSignalPayloadSchema,
        { text: "problem", updatedAt: timestamp },
      ],
      [
        AgreementUpdatedSignalPayloadSchema,
        { text: "a", updatedAt: timestamp },
      ],
      [DesignUpdatedSignalPayloadSchema, { text: "d", updatedAt: timestamp }],
      [
        AcceptanceCriteriaSetSignalPayloadSchema,
        { criteria: ["c"], setAt: timestamp },
      ],
      [
        ContractSetSignalPayloadSchema,
        {
          contract: {
            version: 1,
            rigor: "standard",
            source: { artifact: "agreement", approvedAt: timestamp },
            items: [
              {
                id: "AC1",
                kind: "acceptance_criterion",
                text: "Contract signal payload validates.",
                sourceArtifact: "agreement",
                verificationRequired: true,
                evidencePolicy: "test",
                status: "approved",
              },
            ],
            amendments: [],
          },
          updatedAt: timestamp,
        },
      ],
      [
        ContractAmendedSignalPayloadSchema,
        {
          amendments: [
            {
              id: "am-1",
              actor: "agent",
              reason: "clarified",
              amendedAt: timestamp,
              affectedIds: ["AC1"],
            },
          ],
          updatedAt: timestamp,
        },
      ],
      [
        ContractReviewMatrixSetSignalPayloadSchema,
        {
          reviewMatrix: {
            reviewedAt: timestamp,
            rows: [
              {
                contractId: "AC1",
                kind: "acceptance_criterion",
                status: "pass",
                evidencePolicy: "test",
                evidence: "message payload test",
              },
            ],
          },
          updatedAt: timestamp,
        },
      ],
      [TaskAddedSignalPayloadSchema, { task, addedAt: timestamp }],
      [
        TaskUpdatedSignalPayloadSchema,
        { taskId: "tk-1", partial: { status: "done" }, updatedAt: timestamp },
      ],
      [
        TaskRemovedSignalPayloadSchema,
        { taskId: "tk-1", removedAt: timestamp },
      ],
      [
        TaskAssignedSignalPayloadSchema,
        { taskId: "tk-1", sessionId: "sess-1", assignedAt: timestamp },
      ],
      [
        TaskCompletedSignalPayloadSchema,
        {
          taskId: "tk-1",
          verification: "tests pass",
          summary: "done",
          completedAt: timestamp,
        },
      ],
      [
        SubagentReportSubmittedSignalPayloadSchema,
        {
          taskId: "tk-1",
          submittedAt: timestamp,
          report: {
            schema_version: "1.0",
            change_id: "change-1",
            task_id: "tk-1",
            attempt: 1,
            agent: "adv-engineer",
            scope: "Add typed report",
            status: "complete",
            files_touched: ["plugin/src/types/subagent-reports.ts"],
            verification: [
              {
                command: "pnpm test",
                exit_code: 0,
                summary: "tests pass",
              },
            ],
            decisions: [],
            blockers: [],
            follow_ups: [],
            related_scan: "none",
            workdir_used: "/tmp/worktree",
            context_update_for_adv: {
              what_ads_needs_to_know: "report persisted",
              suggested_next_action: "continue",
            },
          },
        },
      ],
      [
        TaskBlockedSignalPayloadSchema,
        { taskId: "tk-1", reason: "blocked", blockedAt: timestamp },
      ],
      [
        TaskCancelledSignalPayloadSchema,
        {
          taskId: "tk-1",
          approvalEvidence: "yes",
          reason: "cancel",
          cancelledAt: timestamp,
        },
      ],
      [
        GateInProgressSignalPayloadSchema,
        { gateId: "execution", triggeredAt: timestamp },
      ],
      [
        GateAwaitingApprovalSignalPayloadSchema,
        { gateId: "acceptance", evidence: "ready", triggeredAt: timestamp },
      ],
      [
        GateStuckSignalPayloadSchema,
        { gateId: "execution", reason: "stuck", triggeredAt: timestamp },
      ],
      [
        GateCompletedSignalPayloadSchema,
        { gateId: "execution", completedBy: "agent", completedAt: timestamp },
      ],
      [
        GateReenteredSignalPayloadSchema,
        {
          fromGateId: "design",
          reason: "scope",
          reenteredBy: "agent",
          reenteredAt: timestamp,
        },
      ],
      [WisdomAddedSignalPayloadSchema, { entry: wisdom, addedAt: timestamp }],
      [
        ReflectionRecordedSignalPayloadSchema,
        { report: { ok: true }, recordedAt: timestamp },
      ],
      [
        WorktreeCreatedSignalPayloadSchema,
        {
          branch: "change/x",
          path: "/repo-x",
          baseRef: "main",
          headSha: "abc",
          createdAt: timestamp,
        },
      ],
      [
        WorktreeDeletedSignalPayloadSchema,
        { branch: "change/x", reason: "merged", deletedAt: timestamp },
      ],
      [
        WorktreeAutoManagedSignalPayloadSchema,
        { value: true, source: "create", recordedAt: timestamp },
      ],
      [
        WorktreeAttachedSignalPayloadSchema,
        { role: "target", path: "/abs/target", recordedAt: timestamp },
      ],
      [
        ConformanceLockedSignalPayloadSchema,
        { specs: ["advance-delivery"], lockedAt: timestamp },
      ],
      [
        ConformanceVerdictSignalPayloadSchema,
        { verdict: "PASS", runId: "run-1", recordedAt: timestamp },
      ],
      [
        ConformanceOverriddenSignalPayloadSchema,
        {
          user: "user",
          reason: "accepted",
          reVerifyDeadline: "2026-06-01",
          overriddenAt: timestamp,
        },
      ],
      [
        ArchiveRequestedSignalPayloadSchema,
        {
          approvalEvidence: "ship it",
          requestedBy: "user",
          requestedAt: timestamp,
        },
      ],
      [
        ChangeCancelledSignalPayloadSchema,
        {
          approvalEvidence: "stop",
          reason: "cancel",
          cancelledBy: "user",
          cancelledAt: timestamp,
        },
      ],
    ] as const;

    for (const [schema, payload] of cases) {
      expect(schema.safeParse(payload).success).toBe(true);
    }
  });
});
