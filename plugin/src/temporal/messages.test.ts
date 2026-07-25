import { describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/workflow", () => ({
  defineQuery: vi.fn((name: string) => ({ kind: "query", name })),
  defineSignal: vi.fn((name: string) => ({ kind: "signal", name })),
  defineUpdate: vi.fn((name: string) => ({ kind: "update", name })),
}));

import {
  CHANGE_WORKFLOW_COMPAT_QUERY_NAMES,
  CHANGE_WORKFLOW_QUERY_NAMES,
  CHANGE_WORKFLOW_SIGNAL_NAMES,
} from "./contracts";
import * as messages from "./messages";
import {
  AcceptanceCriteriaSetSignalPayloadSchema,
  AcceptanceUpdatedSignalPayloadSchema,
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
  EpicMembershipClearedSignalPayloadSchema,
  EpicMembershipSetSignalPayloadSchema,
  ExecutiveSummaryUpdatedSignalPayloadSchema,
  GateAwaitingApprovalSignalPayloadSchema,
  GateCompletedSignalPayloadSchema,
  GateInProgressSignalPayloadSchema,
  GateReenteredSignalPayloadSchema,
  GateStuckSignalPayloadSchema,
  Phase9StatusUpdatedSignalPayloadSchema,
  ProblemStatementUpdatedSignalPayloadSchema,
  ProposalUpdatedSignalPayloadSchema,
  ReflectionRecordedSignalPayloadSchema,
  SpecDeltaAddedSignalPayloadSchema,
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
  WorktreeRegistrationRepairedSignalPayloadSchema,
  WorktreeSetupFailedSignalPayloadSchema,
  OpsEvidenceAppendedSignalPayloadSchema,
  OpsFollowupLinkAddedSignalPayloadSchema,
  OpsFollowupResolutionUpsertedSignalPayloadSchema,
  OpsFollowupSeededSignalPayloadSchema,
  OpsRunEvidenceAppendedSignalPayloadSchema,
  OpsRunUpsertedSignalPayloadSchema,
  LightweightProfileRequestedSignalPayloadSchema,
  LightweightProfileEvaluatedSignalPayloadSchema,
} from "../types";

const designSignalKeys = [
  "proposalUpdated",
  "problemStatementUpdated",
  "agreementUpdated",
  "designUpdated",
  "executiveSummaryUpdated",
  "acceptanceUpdated",
  "acceptanceCriteriaSet",
  "contractSet",
  "contractAmended",
  "contractReviewMatrixSet",
  "taskAdded",
  "taskUpdated",
  "taskRemoved",
  "taskAssigned",
  "taskCompleted",
  "testRunRecorded",
  "subagentReportSubmitted",
  "taskBlocked",
  "taskCancelled",
  "designConcernDispositioned",
  "verificationEvidenceDispositioned",
  "gateInProgress",
  "gateAwaitingApproval",
  "gateStuck",
  "gateCompleted",
  "gateReentered",
  "wisdomAdded",
  "specDeltaAdded",
  "specDeltaModified",
  "specDeltaAmended",
  "specDeltaRetracted",
  "specDeltaRemoved",
  "specDeltaRenamed",
  "reflectionRecorded",
  "worktreeCreated",
  "worktreeRegistrationRepaired",
  "worktreeDeleted",
  "worktreeSetupFailed",
  "worktreeAutoManaged",
  "worktreeAttached",
  "crossProjectCoordinationUpdated",
  "conformanceLocked",
  "conformanceVerdict",
  "conformanceOverridden",
  "archiveRequested",
  "archiveConverged",
  "phase9StatusUpdated",
  "changeCancelled",
  "opsFollowupSeeded",
  "opsFollowupLinkAdded",
  "opsFollowupResolutionUpserted",
  "opsEvidenceAppended",
  "opsRunUpserted",
  "opsRunEvidenceAppended",
  "lightweightProfileRequested",
  "lightweightProfileEvaluated",
  "epicMembershipSet",
  "epicMembershipCleared",
  "updateArtifactMetadata",
  "originRepaired",
  "archiveChange",
  "closeChange",
] as const;

const designQueryKeys = [
  "getState",
  "getTasks",
  "getGateStatus",
  "getGateCriteria",
  "getAcceptanceCriteriaProjection",
  "getWorktrees",
  "getConformanceState",
  "getMutationReceipt",
] as const;

describe("change workflow message contract", () => {
  it("defines the 62 signal surface", () => {
    const surfacedKeys = Object.keys(CHANGE_WORKFLOW_SIGNAL_NAMES);

    expect(surfacedKeys).toEqual([...designSignalKeys]);
    expect(surfacedKeys).toHaveLength(62);

    for (const key of designSignalKeys) {
      expect(CHANGE_WORKFLOW_SIGNAL_NAMES[key]).toBe(`adv.change.${key}`);
      expect(messages[`${key}Signal` as keyof typeof messages]).toBeDefined();
    }
  });

  it("defines the eight design query bindings", () => {
    expect(Object.keys(CHANGE_WORKFLOW_QUERY_NAMES)).toEqual([
      ...designQueryKeys,
    ]);

    for (const key of designQueryKeys) {
      expect(CHANGE_WORKFLOW_QUERY_NAMES[key]).toBe(`adv.change.${key}`);
      expect(messages[`${key}Query` as keyof typeof messages]).toBeDefined();
    }
  });

  it("binds the canonical phase-plan query from the centralized wire name while preserving getDirective", () => {
    // SC1/AC8: one centralized canonical read-query name drives both the
    // client-side binding and the workflow handler registration.
    expect(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getPhasePlan).toBe(
      "adv.change.getPhasePlan",
    );
    expect(messages.getPhasePlanQuery).toEqual({
      kind: "query",
      name: "adv.change.getPhasePlan",
    });
    // SC2/AC6: the legacy directive compat query is preserved unchanged.
    expect(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.getDirective).toBe(
      "adv.change.getDirective",
    );
    expect(messages.getDirectiveQuery).toEqual({
      kind: "query",
      name: "adv.change.getDirective",
    });
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
        ExecutiveSummaryUpdatedSignalPayloadSchema,
        { text: "exec", updatedAt: timestamp },
      ],
      [
        AcceptanceUpdatedSignalPayloadSchema,
        { text: "accept", updatedAt: timestamp },
      ],
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
            scope_drift: null,
            follow_ups: [],
            required_main_agent_actions: [],
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
        SpecDeltaAddedSignalPayloadSchema,
        {
          capability: "collection-dashboard",
          delta: {
            id: "dl-1",
            operation: "add",
            requirement: {
              id: "rq-specDelta01",
              title: "Spec delta writer",
              body: "Record change-scoped add deltas durably.",
              priority: "must",
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
          },
          addedAt: timestamp,
          addedBy: "agent",
        },
      ],
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
        WorktreeRegistrationRepairedSignalPayloadSchema,
        {
          branch: "change/x",
          path: "/repo-x",
          baseRef: "existing",
          headSha: "abc",
          repairedAt: timestamp,
        },
      ],
      [
        WorktreeDeletedSignalPayloadSchema,
        { branch: "change/x", reason: "merged", deletedAt: timestamp },
      ],
      [
        WorktreeSetupFailedSignalPayloadSchema,
        {
          branch: "change/x",
          path: "/repo-x",
          baseRef: "main",
          headSha: "abc",
          setupFailureReason: "git worktree add failed",
          failedAt: timestamp,
          stage: "git_failed",
        },
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
        Phase9StatusUpdatedSignalPayloadSchema,
        {
          phase9_status: { status: "pending", startedAt: timestamp },
          updatedAt: timestamp,
        },
      ],
      [
        OpsFollowupSeededSignalPayloadSchema,
        {
          profile: {
            kind: "migration",
            source: {
              source_change_id: "parent-1",
              source_kind: "required_follow_up",
            },
            relationship: "follows_release",
            status: "not_started",
            created_at: timestamp,
            evidence: [],
          },
          seededAt: timestamp,
        },
      ],
      [
        OpsFollowupLinkAddedSignalPayloadSchema,
        {
          link: {
            id: "ofl-1",
            changeId: "child-1",
            relationship: "follows_release",
            status: "not_started",
            linked_at: timestamp,
          },
          addedAt: timestamp,
        },
      ],
      [
        OpsFollowupResolutionUpsertedSignalPayloadSchema,
        {
          linkId: "ofl-1",
          resolution: {
            status: "complete",
            verified_at: timestamp,
            child_updated_at: timestamp,
            resolution_reason: "verified",
            source: "child_profile",
            completion_signal: "deploy finished",
            health_verification: "smoke passed",
            rollback_or_cleanup_disposition: "no rollback needed",
          },
          upsertedAt: timestamp,
        },
      ],
      [
        OpsEvidenceAppendedSignalPayloadSchema,
        {
          entry: {
            id: "ev-1",
            recorded_at: timestamp,
            env: "prod",
            action: "run migration",
            status: "started",
            summary: "migration started",
          },
          appendedAt: timestamp,
        },
      ],
      [
        OpsRunUpsertedSignalPayloadSchema,
        {
          run: {
            id: "run-1",
            title: "Run prod cleanup",
            status: "planned",
            created_at: timestamp,
            plan: {
              env: "prod",
              action: "cleanup temp rows",
              bounds: ["batch=001"],
              evidence_policy: "summary_and_pointer",
              rollback_or_cleanup_plan:
                "rerun cleanup or restore backup snapshot",
            },
          },
          upsertedAt: timestamp,
        },
      ],
      [
        OpsRunEvidenceAppendedSignalPayloadSchema,
        {
          runId: "run-1",
          entry: {
            id: "run-ev-1",
            recorded_at: timestamp,
            step_kind: "execute",
            env: "prod",
            status: "complete",
            summary: "cleanup complete",
            artifact: {
              kind: "none",
              rationale: "No external artifact emitted",
            },
            next_status: "complete",
          },
          appendedAt: timestamp,
        },
      ],
      [
        LightweightProfileRequestedSignalPayloadSchema,
        {
          request: {
            requestId: "req-1",
            baselineRevision: "base-abc",
            requestedAt: timestamp,
            requestedBy: "agent",
          },
          omissionPolicy: {
            omitDeepScans: true,
            omitGenericExternalResearch: true,
            omitOpportunityScouting: true,
            omitDefaultSpecialistDelegation: true,
          },
          requestedAt: timestamp,
        },
      ],
      [
        LightweightProfileEvaluatedSignalPayloadSchema,
        {
          evaluation: {
            evaluationKey: "req-1:initial:fp-1",
            phase: "initial",
            result: "qualified",
            criteria: [
              {
                criterion: "implementation_task_count",
                status: "satisfied",
                reason: "One implementation task",
              },
              {
                criterion: "changed_file_count",
                status: "satisfied",
                reason: "One path",
              },
              {
                criterion: "spec_delta",
                status: "satisfied",
                reason: "No spec delta",
              },
              {
                criterion: "dependency_change",
                status: "satisfied",
                reason: "No dependency change",
              },
              {
                criterion: "api_compatibility",
                status: "satisfied",
                reason: "Proven private",
              },
              {
                criterion: "repository_scope",
                status: "satisfied",
                reason: "Current project only",
              },
            ],
            evidenceFingerprint: "fp-1",
            observedRevision: "head-abc",
            evaluatedAt: timestamp,
          },
          evaluatedAt: timestamp,
        },
      ],
      [
        EpicMembershipSetSignalPayloadSchema,
        {
          membership: {
            epic_id: "productAuthEpic",
            entry_id: "en-001",
            order: 0,
            title: "Add OAuth",
            linked_at: timestamp,
            epic_project_id: "project-web",
            repo_id: "pokeedge-web",
            source: "link_existing",
          },
          setAt: timestamp,
        },
      ],
      [
        EpicMembershipClearedSignalPayloadSchema,
        {
          expected: { epic_id: "productAuthEpic", entry_id: "en-001" },
          clearedAt: timestamp,
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
