import type {
  AcceptanceCriteriaSnapshot,
  Change,
  ChangeClosure,
  ChangeContract,
  ChangeLifecycleState,
  ChangeOrigin,
  ChangeStatus,
  FastFollowOf,
  GateCriterion,
  Gates,
  ReentryHistoryEntry,
  ScopedSubagentReport,
  Task,
  WisdomEntry,
} from "./index";
import type { ArtifactMetadata } from "./artifacts";
import type { PendingWorktreeDelete } from "./worktree-registry";

/** Durable change projection consumed by disk-backed reads and mutations. */
export interface ChangeState {
  id: string;
  projectId: string;
  changeId: string;
  title: string;
  status: ChangeStatus;
  lifecycleState: ChangeLifecycleState;
  initializedAt: string;
  createdAt: string;
  sessionId?: string;
  tasks: Task[];
  subagent_reports?: ScopedSubagentReport[];
  design_concern_dispositions?: Change["design_concern_dispositions"];
  verification_evidence_dispositions?: Change["verification_evidence_dispositions"];
  deltas: Change["deltas"];
  wisdom: WisdomEntry[];
  gates: Gates;
  reentry_history?: ReentryHistoryEntry[];
  artifacts: {
    proposal?: ArtifactMetadata;
    problemStatement?: ArtifactMetadata;
    discovery?: ArtifactMetadata;
    design?: ArtifactMetadata;
    agreement?: ArtifactMetadata;
    executiveSummary?: ArtifactMetadata;
    acceptance?: ArtifactMetadata;
  };
  fast_follow_of?: FastFollowOf;
  affectedProjects?: string[];
  affectedPaths?: string[];
  lastSignalAt?: string;
  pendingCheckpoint?: boolean;
  terminated?: boolean;
  acceptanceCriteria?: string[];
  contract?: ChangeContract;
  acceptanceReadinessRevision?: number;
  state_revision?: number;
  acceptanceCriteriaSnapshot?: AcceptanceCriteriaSnapshot;
  documents?: {
    proposal?: string;
    problemStatement?: string;
    agreement?: string;
    design?: string;
    executiveSummary?: string;
    acceptance?: string;
  };
  reflections?: unknown[];
  worktrees?: Record<
    string,
    {
      branch: string;
      path?: string;
      changeId?: string;
      baseRef?: string;
      headSha?: string;
      materialized?: boolean;
      status: "unmaterialized" | "created" | "setup_failed" | "deleted";
      createdAt?: string;
      lastSeenAt?: string;
      deletedAt?: string;
      deleteReason?: string;
      setupReady?: boolean;
      setupFailureReason?: string;
      cleanupEligible?: boolean;
      cleanupBlockedBy?: string[];
      source?: "tool" | "git_census";
      sourceVersion?: number;
      pendingDelete?: PendingWorktreeDelete;
    }
  >;
  conformance?: {
    lockedSpecs?: string[];
    lockedAt?: string;
    lastVerdict?: {
      verdict: "PASS" | "DRIFT";
      runId: string;
      failed?: Array<
        { rq_id: string; summary: string } & Record<string, unknown>
      >;
      recordedAt: string;
    };
    overrides?: Array<{
      user: string;
      reason: string;
      reVerifyDeadline: string;
      overriddenAt: string;
    }>;
  };
  archiveRequest?: {
    approvalEvidence: string;
    requestedBy: string;
    requestedAt: string;
  };
  phase9_status?: Change["phase9_status"];
  closure?: ChangeClosure;
  origin?: ChangeOrigin;
  epic_membership?: Change["epic_membership"];
  coordination_claim?: Change["coordination_claim"];
  cross_project_origin?: Change["cross_project_origin"];
  cross_project_links?: Change["cross_project_links"];
  external_dependencies?: Change["external_dependencies"];
  same_project_dependencies?: Change["same_project_dependencies"];
  seenReportIds?: string[];
  seenReportIdsTotal?: number;
  worktree_auto_managed?: boolean;
  target_worktree_path?: string | null;
  scope_worktrees?: Record<string, string>;
  signal_rejections?: Change["signal_rejections"];
  signal_rejections_total?: number;
  ops_followup?: Change["ops_followup"];
  ops_followup_links?: Change["ops_followup_links"];
  lightweight_profile?: Change["lightweight_profile"];
  creation_request_hash?: string;
  gateCriteria?: Partial<Record<import("./index").GateId, GateCriterion[]>>;
  testRuns?: Change["test_runs"];
}

export interface ChangeInput {
  projectId: string;
  changeId: string;
  title: string;
  initializedAt: string;
  sessionId?: string;
  archiveProjects?: Array<{ projectPath: string }>;
  seedState?: Partial<ChangeState>;
}
